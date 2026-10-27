package com.auralis.music;

import android.content.Context;
import android.util.Base64;
import android.util.Log;

import org.json.JSONObject;

import fi.iki.elonen.NanoHTTPD;
import fi.iki.elonen.NanoHTTPD.IHTTPSession;
import fi.iki.elonen.NanoHTTPD.Response;
import fi.iki.elonen.NanoHTTPD.Response.Status;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import okhttp3.Headers;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.ResponseBody;

/**
 * The renderer is served from a private loopback HTTP origin. That gives the
 * existing UI a normal same-origin context (fetch, images, Web Audio, CORS) and
 * lets us expose native features as small local endpoints.
 */
public final class LocalServer extends NanoHTTPD {
    private static final String TAG = "AuralisServer";
    private static final int MAX_BODY = 32 * 1024 * 1024;
    private static final Set<String> SKIP_REQUEST_HEADERS = new HashSet<>();
    private static final Set<String> ALLOWED_EXTERNAL = new HashSet<>();

    static {
        SKIP_REQUEST_HEADERS.add("host");
        SKIP_REQUEST_HEADERS.add("content-length");
        SKIP_REQUEST_HEADERS.add("connection");
        SKIP_REQUEST_HEADERS.add("keep-alive");
        SKIP_REQUEST_HEADERS.add("proxy-connection");
        SKIP_REQUEST_HEADERS.add("transfer-encoding");
        SKIP_REQUEST_HEADERS.add("upgrade");
        SKIP_REQUEST_HEADERS.add("te");
        SKIP_REQUEST_HEADERS.add("trailer");
        SKIP_REQUEST_HEADERS.add("accept-encoding");
        ALLOWED_EXTERNAL.add("http");
        ALLOWED_EXTERNAL.add("https");
    }

    private final Context context;
    private final YtDlpManager ytDlp;
    private final OkHttpClient apiClient;
    private final OkHttpClient mediaClient;
    private final Map<String, byte[]> assetCache = new ConcurrentHashMap<>();

    // A stable port is required: localStorage (settings, library, session) is
    // scoped to the page origin, so a random port would make every launch look
    // like a fresh install.
    public static final int PORT = 47653;

    public LocalServer(Context context) {
        super("127.0.0.1", PORT);
        this.context = context.getApplicationContext();
        this.ytDlp = YtDlpManager.get(context);
        setAsyncRunner(new BoundedAsyncRunner());
        this.apiClient = new OkHttpClient.Builder()
                .connectTimeout(25, TimeUnit.SECONDS)
                .writeTimeout(40, TimeUnit.SECONDS)
                .readTimeout(75, TimeUnit.SECONDS)
                .followRedirects(true)
                .followSslRedirects(true)
                .build();
        this.mediaClient = new OkHttpClient.Builder()
                .connectTimeout(20, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .followRedirects(true)
                .followSslRedirects(true)
                .build();
    }

    public int port() {
        return getListeningPort();
    }

    public String origin() {
        return "http://127.0.0.1:" + port();
    }

    @Override
    public Response serve(IHTTPSession session) {
        String path = session.getUri();
        try {
            if (path == null || path.isEmpty()) path = "/";
            if (session.getMethod() == Method.OPTIONS) return empty(Status.OK);
            if (path.equals("/__ping")) {
                return text(Status.OK, "ok");
            }
            if (path.equals("/__fetch")) {
                if (session.getMethod() == Method.OPTIONS) return empty(Status.OK);
                if (session.getMethod() != Method.POST) return text(Status.METHOD_NOT_ALLOWED, "POST required");
                return proxyFetch(readBody(session));
            }
            if (path.equals("/media") || path.equals("/local")) {
                String key = path.equals("/media") ? "u" : "p";
                String value = query(session, key);
                if (value == null || value.isEmpty()) return text(Status.BAD_REQUEST, "Missing media path");
                if (path.equals("/local")) return serveFile(new File(value), session);
                return proxyMedia(value, session);
            }
            if (path.startsWith("/__ytdlp/")) {
                return ytDlpEndpoint(path.substring("/__ytdlp/".length()), readBody(session));
            }
            if (path.equals("/__native/appinfo")) {
                return json(Status.OK, ytDlp.appInfoJson());
            }
            if (path.equals("/__native/downloadsdir")) {
                JSONObject json = new JSONObject();
                json.put("path", ytDlp.downloadsDir().getAbsolutePath());
                return json(Status.OK, json.toString());
            }
            if (path.equals("/__native/delete")) {
                JSONObject body = new JSONObject(readBody(session));
                String target = body.optString("path", "");
                File file = new File(target);
                if (isAllowedFile(file)) {
                    deleteRecursively(file);
                    JSONObject json = new JSONObject();
                    json.put("ok", true);
                    return json(Status.OK, json.toString());
                }
                return text(Status.FORBIDDEN, "Not allowed");
            }
            return serveStatic(path);
        } catch (Throwable error) {
            Log.e(TAG, "request failed: " + path, error);
            return text(Status.INTERNAL_ERROR, readable(error));
        }
    }

    private Response serveStatic(String path) throws IOException {
        if (path.contains("..") || path.indexOf('\0') >= 0) return text(Status.FORBIDDEN, "Bad path");
        String clean = path;
        if (clean.equals("/")) clean = "/index.html";
        if (!clean.startsWith("/")) clean = "/" + clean;
        if (clean.endsWith("/")) clean += "index.html";
        String asset = "www" + clean;
        byte[] bytes = assetCache.get(asset);
        if (bytes == null) {
            try (InputStream input = context.getAssets().open(asset)) {
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = input.read(buffer)) > 0) output.write(buffer, 0, read);
                bytes = output.toByteArray();
                assetCache.put(asset, bytes);
            } catch (IOException missing) {
                if (!clean.contains(".")) {
                    try (InputStream input = context.getAssets().open("www/index.html")) {
                        ByteArrayOutputStream output = new ByteArrayOutputStream();
                        byte[] buffer = new byte[64 * 1024];
                        int read;
                        while ((read = input.read(buffer)) > 0) output.write(buffer, 0, read);
                        bytes = output.toByteArray();
                    } catch (IOException ignored) {
                        return text(Status.NOT_FOUND, "Not found");
                    }
                } else {
                    return text(Status.NOT_FOUND, "Not found");
                }
            }
        }
        Response response = newFixedLengthResponse(Status.OK, mime(clean), new ByteArrayInputStream(bytes), bytes.length);
        response.addHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        response.addHeader("Pragma", "no-cache");
        return response;
    }

    private Response proxyFetch(String rawBody) {
        try {
            JSONObject request = new JSONObject(rawBody);
            String url = request.optString("url", "");
            if (!isHttpUrl(url)) return text(Status.BAD_REQUEST, "Unsupported URL");
            String method = request.optString("method", "GET").toUpperCase(Locale.ROOT);
            JSONObject headersJson = request.optJSONObject("headers");
            Headers.Builder headers = new Headers.Builder();
            if (headersJson != null) {
                for (java.util.Iterator<String> iterator = headersJson.keys(); iterator.hasNext(); ) {
                    String name = iterator.next();
                    String lower = name.toLowerCase(Locale.ROOT);
                    if (SKIP_REQUEST_HEADERS.contains(lower)) continue;
                    String value = headersJson.optString(name, "");
                    if (value.contains("\r") || value.contains("\n")) continue;
                    try {
                        headers.add(name, value);
                    } catch (Throwable ignored) {
                    }
                }
            }
            RequestBody body = null;
            if (!method.equals("GET") && !method.equals("HEAD")) {
                String requestBody = request.optString("body", "");
                MediaType type = MediaType.parse(headers.get("content-type") != null
                        ? headers.get("content-type") : "application/json");
                body = RequestBody.create(requestBody, type);
            }
            Request outgoing = new Request.Builder()
                    .url(url)
                    .headers(headers.build())
                    .method(method, body)
                    .build();
            okhttp3.Response upstream = apiClient.newCall(outgoing).execute();
            ResponseBody responseBody = upstream.body();
            byte[] bytes = responseBody == null ? new byte[0] : responseBody.bytes();
            Response response = newFixedLengthResponse(
                    httpStatus(upstream.code()), contentType(responseBody), new ByteArrayInputStream(bytes), bytes.length);
            copyApiHeaders(upstream.headers(), response);
            response.addHeader("Access-Control-Allow-Origin", "*");
            upstream.close();
            return response;
        } catch (Throwable error) {
            JSONObject json = new JSONObject();
            try {
                json.put("error", readable(error));
            } catch (Exception ignored) {
            }
            return text(Status.INTERNAL_ERROR, json.toString());
        }
    }

    private void copyApiHeaders(Headers headers, Response response) {
        for (String name : new String[]{"content-language", "cache-control", "expires", "etag", "last-modified"}) {
            String value = headers.get(name);
            if (value != null) response.addHeader(name, value);
        }
    }

    private Response proxyMedia(String encoded, IHTTPSession session) {
        try {
            String remote;
            try {
                remote = new String(Base64.decode(encoded, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP), StandardCharsets.UTF_8);
            } catch (Throwable bad) {
                remote = URLDecoder.decode(encoded, "UTF-8");
            }
            if (!isHttpUrl(remote)) return text(Status.BAD_REQUEST, "Bad media URL");
            Request.Builder builder = new Request.Builder()
                    .url(remote)
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36")
                    .header("Referer", "https://music.youtube.com/")
                    .header("Origin", "https://music.youtube.com");
            String range = session.getHeaders().get("range");
            if (range != null && !range.isEmpty()) builder.header("Range", range);
            boolean head = session.getMethod() == Method.HEAD;
            okhttp3.Response upstream = mediaClient.newCall(builder.get().build()).execute();
            ResponseBody body = upstream.body();
            long length = body == null ? 0 : body.contentLength();
            InputStream stream = body == null ? new ByteArrayInputStream(new byte[0]) : body.byteStream();
            Response.IStatus status = httpStatus(upstream.code());
            String type = contentType(body);
            Response response;
            if (length >= 0) {
                response = newFixedLengthResponse(status, type, stream, length);
            } else {
                response = newChunkedResponse(status, type, stream);
            }
            for (String name : new String[]{"content-range", "accept-ranges", "cache-control", "expires", "last-modified"}) {
                String value = upstream.header(name);
                if (value != null) response.addHeader(name, value);
            }
            response.addHeader("Accept-Ranges", "bytes");
            response.addHeader("Access-Control-Allow-Origin", "*");
            response.addHeader("Access-Control-Allow-Headers", "Range");
            response.addHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
            if (head) {
                upstream.close();
            }
            return response;
        } catch (Throwable error) {
            return text(Status.INTERNAL_ERROR, readable(error));
        }
    }

    private Response serveFile(File file, IHTTPSession session) {
        try {
            if (!isAllowedFile(file) || !file.isFile()) return text(Status.NOT_FOUND, "Not found");
            long total = file.length();
            String rangeHeader = session.getHeaders().get("range");
            long start = 0;
            long end = total - 1;
            boolean partial = false;
            if (rangeHeader != null && rangeHeader.startsWith("bytes=")) {
                String spec = rangeHeader.substring(6).split(",")[0].trim();
                int dash = spec.indexOf('-');
                if (dash >= 0) {
                    String from = spec.substring(0, dash).trim();
                    String to = spec.substring(dash + 1).trim();
                    try {
                        if (!from.isEmpty()) start = Long.parseLong(from);
                        if (!to.isEmpty()) end = Long.parseLong(to);
                        if (from.isEmpty() && !to.isEmpty()) {
                            start = Math.max(0, total - Long.parseLong(to));
                            end = total - 1;
                        }
                    } catch (NumberFormatException ignored) {
                    }
                    if (start < 0) start = 0;
                    if (end >= total) end = total - 1;
                    if (start > end || start >= total) {
                        Response response = text(Status.RANGE_NOT_SATISFIABLE, "Range not satisfiable");
                        response.addHeader("Content-Range", "bytes */" + total);
                        return response;
                    }
                    partial = true;
                }
            }
            long length = end - start + 1;
            FileInputStream input = new FileInputStream(file);
            skipFully(input, start);
            Response response = newFixedLengthResponse(
                    partial ? Status.PARTIAL_CONTENT : Status.OK,
                    mime(file.getName()),
                    new LimitedInputStream(input, length),
                    length);
            response.addHeader("Accept-Ranges", "bytes");
            if (partial) response.addHeader("Content-Range", "bytes " + start + "-" + end + "/" + total);
            response.addHeader("Access-Control-Allow-Origin", "*");
            response.addHeader("Access-Control-Allow-Headers", "Range");
            response.addHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
            return response;
        } catch (Throwable error) {
            return text(Status.INTERNAL_ERROR, readable(error));
        }
    }

    private Response ytDlpEndpoint(String endpoint, String rawBody) throws Exception {
        if (endpoint.equals("version")) {
            JSONObject json = new JSONObject();
            json.put("version", ytDlp.version());
            return json(Status.OK, json.toString());
        }
        if (endpoint.equals("resolve")) {
            JSONObject body = new JSONObject(rawBody);
            String videoId = body.getString("videoId");
            String url = ytDlp.resolve(videoId, body.optString("quality", "auto"),
                    body.optString("cookie", ""), body.optString("proxy", ""));
            JSONObject json = new JSONObject();
            json.put("url", url);
            return json(Status.OK, json.toString());
        }
        if (endpoint.equals("invalidate")) {
            JSONObject body = new JSONObject(rawBody);
            ytDlp.invalidateStream(body.optString("videoId", ""));
            return json(Status.OK, "{\"ok\":true}");
        }
        if (endpoint.equals("download/start")) {
            JSONObject body = new JSONObject(rawBody);
            String id = ytDlp.startDownload(body.getString("videoId"),
                    body.optString("quality", "best"),
                    body.optString("cookie", ""),
                    body.optString("proxy", ""));
            JSONObject json = new JSONObject();
            json.put("id", id);
            return json(Status.OK, json.toString());
        }
        if (endpoint.equals("download/progress")) {
            JSONObject body = new JSONObject(rawBody);
            return json(Status.OK, ytDlp.progress(body.getString("id")).toString());
        }
        if (endpoint.equals("download/cancel")) {
            JSONObject body = new JSONObject(rawBody);
            ytDlp.cancel(body.getString("id"));
            return json(Status.OK, "{\"ok\":true}");
        }
        if (endpoint.equals("update")) {
            String message = ytDlp.update();
            JSONObject json = new JSONObject();
            json.put("message", message);
            return json(Status.OK, json.toString());
        }
        if (endpoint.equals("sample")) {
            JSONObject body = new JSONObject(rawBody);
            String path = ytDlp.sampleVideo(body.getString("videoId"), body.optString("cookie", ""));
            JSONObject json = new JSONObject();
            json.put("path", path);
            return json(Status.OK, json.toString());
        }
        if (endpoint.equals("subtitles")) {
            JSONObject body = new JSONObject(rawBody);
            String vtt = ytDlp.subtitles(body.getString("videoId"), body.optString("cookie", ""));
            JSONObject json = new JSONObject();
            json.put("vtt", vtt == null ? JSONObject.NULL : vtt);
            return json(Status.OK, json.toString());
        }
        return text(Status.NOT_FOUND, "Unknown yt-dlp endpoint");
    }

    private String readBody(IHTTPSession session) throws IOException {
        String lengthHeader = session.getHeaders().get("content-length");
        int length = 0;
        if (lengthHeader != null) {
            try {
                length = Integer.parseInt(lengthHeader);
            } catch (NumberFormatException ignored) {
            }
        }
        if (length > MAX_BODY) throw new IOException("Request body is too large.");
        if (length <= 0) return "";
        byte[] data = new byte[length];
        DataInputStream input = new DataInputStream(session.getInputStream());
        input.readFully(data);
        return new String(data, StandardCharsets.UTF_8);
    }

    private String query(IHTTPSession session, String name) {
        Map<String, java.util.List<String>> params = session.getParameters();
        java.util.List<String> values = params.get(name);
        return values == null || values.isEmpty() ? null : values.get(0);
    }

    private boolean isHttpUrl(String value) {
        if (value == null || value.isEmpty()) return false;
        try {
            java.net.URI uri = java.net.URI.create(value);
            return ALLOWED_EXTERNAL.contains(uri.getScheme()) && uri.getHost() != null;
        } catch (Throwable ignored) {
            return false;
        }
    }

    private boolean isAllowedFile(File file) {
        try {
            String path = file.getCanonicalPath();
            File[] roots = new File[]{
                    ytDlp.downloadsDir(),
                    context.getFilesDir(),
                    context.getCacheDir(),
                    context.getExternalFilesDir(null),
                    context.getExternalCacheDir()
            };
            for (File root : roots) {
                if (root == null) continue;
                String rootPath = root.getCanonicalPath();
                if (path.equals(rootPath) || path.startsWith(rootPath + File.separator)) return true;
            }
        } catch (Throwable ignored) {
        }
        return false;
    }

    private static void deleteRecursively(File file) {
        if (file == null) return;
        try {
            if (file.isDirectory()) {
                File[] children = file.listFiles();
                if (children != null) for (File child : children) deleteRecursively(child);
            }
            file.delete();
        } catch (Throwable ignored) {
        }
    }

    private static void skipFully(InputStream input, long count) throws IOException {
        long remaining = count;
        while (remaining > 0) {
            long skipped = input.skip(remaining);
            if (skipped <= 0) {
                if (input.read() < 0) break;
                remaining--;
            } else {
                remaining -= skipped;
            }
        }
    }

    private static String contentType(ResponseBody body) {
        if (body == null || body.contentType() == null) return "application/octet-stream";
        return body.contentType().toString();
    }

    /**
     * NanoHTTPD 2.3.1 only knows a subset of HTTP status codes. YouTube's CDN
     * can return codes such as 308 (Permanent Redirect), and Status.lookup()
     * returns null for those. Passing a null status into a response makes
     * NanoHTTPD throw from its worker thread, which kills the whole app. Keep
     * the upstream code instead.
     */
    private static Response.IStatus httpStatus(int code) {
        Status known = Status.lookup(code);
        if (known != null) return known;
        if (code < 100 || code > 599) {
            Log.w(TAG, "invalid upstream HTTP status " + code);
            return Status.INTERNAL_ERROR;
        }
        Log.w(TAG, "non-standard upstream HTTP status " + code);
        return new RawStatus(code);
    }

    private static final class RawStatus implements Response.IStatus {
        private final int code;
        private final String description;

        RawStatus(int code) {
            this.code = code;
            // NanoHTTPD writes getDescription() as the whole status line, so it
            // must include the numeric code (for example "308 Permanent Redirect").
            this.description = code + " " + reason(code);
        }

        @Override
        public int getRequestStatus() {
            return code;
        }

        @Override
        public String getDescription() {
            return description;
        }

        private static String reason(int code) {
            switch (code) {
                case 308: return "Permanent Redirect";
                case 402: return "Payment Required";
                case 418: return "I'm a Teapot";
                case 421: return "Misdirected Request";
                case 422: return "Unprocessable Entity";
                case 425: return "Too Early";
                case 426: return "Upgrade Required";
                case 428: return "Precondition Required";
                case 431: return "Request Header Fields Too Large";
                case 451: return "Unavailable For Legal Reasons";
                default: return "Upstream Status";
            }
        }
    }

    private static String mime(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".html")) return "text/html; charset=utf-8";
        if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
        if (lower.endsWith(".mjs")) return "application/javascript; charset=utf-8";
        if (lower.endsWith(".css")) return "text/css; charset=utf-8";
        if (lower.endsWith(".json")) return "application/json; charset=utf-8";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".m4a")) return "audio/mp4";
        if (lower.endsWith(".aac")) return "audio/aac";
        if (lower.endsWith(".opus")) return "audio/opus";
        if (lower.endsWith(".webm")) return "audio/webm";
        if (lower.endsWith(".wav")) return "audio/wav";
        if (lower.endsWith(".vtt")) return "text/vtt; charset=utf-8";
        return "application/octet-stream";
    }

    private static Response text(Status status, String value) {
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        Response response = newFixedLengthResponse(status, "text/plain; charset=utf-8", new ByteArrayInputStream(bytes), bytes.length);
        response.addHeader("Access-Control-Allow-Origin", "*");
        return response;
    }

    private static Response json(Status status, String value) {
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        Response response = newFixedLengthResponse(status, "application/json; charset=utf-8", new ByteArrayInputStream(bytes), bytes.length);
        response.addHeader("Access-Control-Allow-Origin", "*");
        return response;
    }

    private static Response empty(Status status) {
        Response response = newFixedLengthResponse(status, "text/plain", "");
        response.addHeader("Access-Control-Allow-Origin", "*");
        response.addHeader("Access-Control-Allow-Headers", "Range, Content-Type");
        response.addHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
        response.addHeader("Access-Control-Max-Age", "86400");
        return response;
    }

    private static String readable(Throwable error) {
        String message = error.getMessage();
        if (message == null || message.trim().isEmpty()) message = error.toString();
        return message.length() > 800 ? message.substring(0, 800) : message;
    }

    /** Never lets NanoHTTPD read past the slice we advertised. */
    private static final class LimitedInputStream extends InputStream {
        private final InputStream delegate;
        private long remaining;

        LimitedInputStream(InputStream delegate, long limit) {
            this.delegate = delegate;
            this.remaining = limit;
        }

        @Override
        public int read() throws IOException {
            if (remaining <= 0) return -1;
            int value = delegate.read();
            if (value >= 0) remaining--;
            return value;
        }

        @Override
        public int read(byte[] buffer, int offset, int length) throws IOException {
            if (remaining <= 0) return -1;
            int read = delegate.read(buffer, offset, (int) Math.min(length, remaining));
            if (read > 0) remaining -= read;
            return read;
        }

        @Override
        public void close() throws IOException {
            delegate.close();
        }
    }

    /**
     * NanoHTTPD's default runner creates an unbounded thread for every request.
     * A short burst of taps can otherwise leave dozens of threads behind even
     * after the matching yt-dlp process has been cancelled.
     */
    private static final class BoundedAsyncRunner implements NanoHTTPD.AsyncRunner {
        private static final int MAX_WORKERS = 20;
        private final AtomicInteger threadNumber = new AtomicInteger();
        private final ExecutorService executor;
        private final Set<ClientHandler> running = ConcurrentHashMap.newKeySet();

        BoundedAsyncRunner() {
            ThreadFactory factory = runnable -> {
                Thread thread = new Thread(runnable, "auralis-http-" + threadNumber.incrementAndGet());
                thread.setDaemon(true);
                return thread;
            };
            executor = Executors.newFixedThreadPool(MAX_WORKERS, factory);
        }

        @Override
        public void closeAll() {
            for (ClientHandler handler : running) {
                try {
                    handler.close();
                } catch (Throwable ignored) {
                }
            }
            running.clear();
            executor.shutdownNow();
        }

        @Override
        public void closed(ClientHandler handler) {
            running.remove(handler);
        }

        @Override
        public void exec(ClientHandler handler) {
            running.add(handler);
            try {
                executor.execute(handler);
            } catch (RejectedExecutionException rejected) {
                running.remove(handler);
                try {
                    handler.close();
                } catch (Throwable ignored) {
                }
            }
        }
    }
}
