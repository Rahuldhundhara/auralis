package com.auralis.music;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Environment;
import android.util.Log;

import com.yausername.ffmpeg.FFmpeg;
import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import com.yausername.youtubedl_android.YoutubeDLResponse;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Owns the bundled yt-dlp/Python runtime and turns it into a small, process-safe
 * API for the WebView. All network access happens inside yt-dlp, so playback
 * links are obtained exactly the same way as on the desktop build.
 */
public final class YtDlpManager {
    private static final String TAG = "AuralisYtDlp";
    private static final String BUNDLED_VERSION = "2026.10.21";
    private static final String[] ALLOWED_PROTOCOLS = {"http://", "https://"};
    private static final long RESOLVE_CACHE_TTL_MS = 45 * 60_000L;
    private static final int RESOLVE_CACHE_MAX = 80;

    private static volatile YtDlpManager instance;

    private final Context context;
    private final ExecutorService workers = Executors.newCachedThreadPool();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
    private final Map<String, DownloadState> downloads = new ConcurrentHashMap<>();
    private final Map<String, String> processIds = new ConcurrentHashMap<>();
    private final Map<String, CachedStream> resolvedStreams = new ConcurrentHashMap<>();
    private final Set<String> activeResolveIds = ConcurrentHashMap.newKeySet();
    private final AtomicBoolean initializing = new AtomicBoolean(false);
    private volatile String latestResolveId;
    private volatile boolean initialized = false;
    private volatile String initError;
    private volatile String cachedVersion = BUNDLED_VERSION + " (bundled)";

    private static final class CachedStream {
        final String url;
        final long at;

        CachedStream(String url, long at) {
            this.url = url;
            this.at = at;
        }
    }

    public static YtDlpManager get(Context context) {
        if (instance == null) {
            synchronized (YtDlpManager.class) {
                if (instance == null) instance = new YtDlpManager(context.getApplicationContext());
            }
        }
        return instance;
    }

    private YtDlpManager(Context context) {
        this.context = context;
        workers.execute(this::initialize);
    }

    public static final class DownloadState {
        public String id;
        public volatile float progress = 0f;
        public volatile String status = "queued";
        public volatile String path = "";
        public volatile String error;
        public volatile long size;
        public volatile long createdAt = System.currentTimeMillis();

        JSONObject toJson() throws Exception {
            JSONObject json = new JSONObject();
            json.put("id", id);
            json.put("progress", progress);
            json.put("status", status);
            json.put("path", path == null ? "" : path);
            json.put("size", size);
            if (error != null) json.put("error", error);
            return json;
        }
    }

    public boolean isInitialized() {
        return initialized;
    }

    public String initializationError() {
        return initError;
    }

    public void initialize() {
        if (initialized) return;
        if (!initializing.compareAndSet(false, true)) return;
        try {
            seedBundledYtDlp();
            YoutubeDL.getInstance().init(context);
            try {
                FFmpeg.getInstance().init(context);
            } catch (Throwable error) {
                Log.w(TAG, "ffmpeg initialization failed", error);
            }
            cleanupTemp();
            cacheResolvedVersion();
            initialized = true;
            Log.i(TAG, "yt-dlp initialized, bundled " + BUNDLED_VERSION);
        } catch (Throwable error) {
            initError = error.getMessage() == null ? error.toString() : error.getMessage();
            Log.e(TAG, "yt-dlp initialization failed", error);
        } finally {
            initializing.set(false);
        }
    }

    private void waitUntilReady() throws Exception {
        if (initialized) return;
        initialize();
        long deadline = System.currentTimeMillis() + 120_000;
        while (!initialized && initError == null && System.currentTimeMillis() < deadline) {
            Thread.sleep(120);
        }
        if (!initialized) {
            throw new Exception(initError != null ? initError : "yt-dlp did not finish initializing.");
        }
    }

    private void seedBundledYtDlp() throws IOException {
        SharedPreferences prefs = context.getSharedPreferences("auralis", Context.MODE_PRIVATE);
        File dir = new File(context.getNoBackupFilesDir(), "youtubedl-android/yt-dlp");
        File binary = new File(dir, "yt-dlp");
        if (!dir.exists()) dir.mkdirs();
        boolean seeded = prefs.getBoolean("bundled_ytdlp_seeded", false);
        if (!binary.exists() || !seeded) {
            try (InputStream in = context.getAssets().open("yt-dlp");
                 FileOutputStream out = new FileOutputStream(binary)) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = in.read(buffer)) > 0) out.write(buffer, 0, read);
            }
            binary.setReadable(true, true);
            prefs.edit().putBoolean("bundled_ytdlp_seeded", true).apply();
        }
    }

    public File downloadsDir() {
        File base = context.getExternalFilesDir(Environment.DIRECTORY_MUSIC);
        if (base == null) base = new File(context.getFilesDir(), "Music");
        File dir = new File(base, "Auralis");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    public File cacheDir(String child) {
        File dir = new File(context.getCacheDir(), child);
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    public String appInfoJson() {
        JSONObject json = new JSONObject();
        try {
            json.put("name", "Auralis");
            json.put("version", BuildConfig.VERSION_NAME);
            json.put("electron", "Android WebView");
            json.put("chrome", android.webkit.WebSettings.getDefaultUserAgent(context));
            json.put("platform", "android");
            json.put("userData", context.getFilesDir().getAbsolutePath());
            json.put("downloadsDir", downloadsDir().getAbsolutePath());
            json.put("ytDlpVersion", version());
            json.put("ffmpegAvailable", true);
        } catch (Exception ignored) {
        }
        return json.toString();
    }

    public String version() {
        // Never run yt-dlp synchronously from the UI/HTTP path. The version is
        // refreshed on the background initialization worker instead.
        return cachedVersion;
    }

    private void cacheResolvedVersion() {
        try {
            String value = YoutubeDL.getInstance().version(context);
            if (value != null && !value.isEmpty()) cachedVersion = value;
        } catch (Throwable ignored) {
        }
    }

    public String resolve(String videoId, String quality, String cookie, String proxy) throws Exception {
        return resolve(videoId, quality, cookie, proxy, false);
    }

    public String resolve(String videoId, String quality, String cookie, String proxy, boolean video) throws Exception {
        String cacheKey = resolveCacheKey(videoId, quality + (video ? "|video" : ""), cookie, proxy);
        CachedStream cached = resolvedStreams.get(cacheKey);
        if (cached != null) {
            if (System.currentTimeMillis() - cached.at < RESOLVE_CACHE_TTL_MS) {
                return cached.url;
            }
            resolvedStreams.remove(cacheKey);
        }
        waitUntilReady();
        // Rapid taps supersede each other. Waiting briefly avoids spawning a
        // Python process for a request that will be cancelled milliseconds later.
        Thread.sleep(120);
        File cookieFile = cookieFile(cookie);
        String processId = beginResolve();
        try {
            YoutubeDLRequest request = baseRequest(videoId, cookieFile, proxy);
            request.addOption("-f", video ? videoFormat() : qualityFormat(quality));
            request.addOption("-g");
            ScheduledFuture<?> timeout = scheduler.schedule(
                    () -> YoutubeDL.getInstance().destroyProcessById(processId),
                    45, TimeUnit.SECONDS);
            YoutubeDLResponse response;
            try {
                ensureCurrentResolve(processId);
                response = YoutubeDL.getInstance().execute(request, processId, null);
            } finally {
                timeout.cancel(false);
            }
            for (String line : response.getOut().split("\\r?\\n")) {
                String value = line.trim();
                for (String protocol : ALLOWED_PROTOCOLS) {
                    if (value.startsWith(protocol)) {
                        rememberResolvedStream(cacheKey, value);
                        return value;
                    }
                }
            }
            throw new Exception(tail(response.getErr(), "yt-dlp did not return a playable audio URL."));
        } finally {
            retireResolve(processId);
            deleteQuietly(cookieFile);
        }
    }

    private String resolveCacheKey(String videoId, String quality, String cookie, String proxy) {
        String safeCookie = cookie == null ? "" : cookie;
        String safeProxy = proxy == null ? "" : proxy.trim();
        return videoId + "|" + quality + "|" + safeCookie.length() + ":" + safeCookie.hashCode()
                + "|" + safeProxy.length() + ":" + safeProxy.hashCode();
    }

    private void rememberResolvedStream(String key, String url) {
        long now = System.currentTimeMillis();
        resolvedStreams.put(key, new CachedStream(url, now));
        if (resolvedStreams.size() <= RESOLVE_CACHE_MAX) return;
        // Drop expired entries first, then the oldest entries over the cap.
        resolvedStreams.entrySet().removeIf(entry ->
                now - entry.getValue().at >= RESOLVE_CACHE_TTL_MS);
        while (resolvedStreams.size() > RESOLVE_CACHE_MAX) {
            String oldestKey = null;
            long oldestAt = Long.MAX_VALUE;
            for (Map.Entry<String, CachedStream> entry : resolvedStreams.entrySet()) {
                if (entry.getValue().at < oldestAt) {
                    oldestAt = entry.getValue().at;
                    oldestKey = entry.getKey();
                }
            }
            if (oldestKey == null) break;
            resolvedStreams.remove(oldestKey);
        }
    }

    public void invalidateStream(String videoId) {
        if (videoId == null || videoId.isEmpty()) return;
        resolvedStreams.keySet().removeIf(key -> key.startsWith(videoId + "|"));
    }

    /**
     * Only the newest playback request matters. Starting a new resolve kills
     * superseded yt-dlp/Python processes instead of letting them pile up while
     * the user taps quickly through songs.
     */
    private String beginResolve() {
        String processId = "resolve-" + UUID.randomUUID();
        latestResolveId = processId;
        activeResolveIds.add(processId);
        for (String other : activeResolveIds) {
            if (!other.equals(processId) && activeResolveIds.remove(other)) {
                destroyResolveProcess(other, true);
            }
        }
        return processId;
    }

    private void destroyResolveProcess(String processId, boolean retry) {
        try {
            YoutubeDL.getInstance().destroyProcessById(processId);
            Log.d(TAG, "cancelled superseded resolve " + processId);
        } catch (Throwable ignored) {
        }
        if (retry) {
            // A process can register itself a few milliseconds after the first
            // destroy call. Retry once so that race cannot leave Python alive.
            scheduler.schedule(() -> {
                if (!processId.equals(latestResolveId)) {
                    try {
                        YoutubeDL.getInstance().destroyProcessById(processId);
                    } catch (Throwable ignored) {
                    }
                }
            }, 2, TimeUnit.SECONDS);
        }
    }

    private void ensureCurrentResolve(String processId) throws Exception {
        if (!processId.equals(latestResolveId)) {
            throw new Exception("Playback request was superseded.");
        }
    }

    private void retireResolve(String processId) {
        activeResolveIds.remove(processId);
        if (processId.equals(latestResolveId)) latestResolveId = null;
    }

    public void cancelResolves() {
        latestResolveId = null;
        for (String processId : activeResolveIds) {
            if (!activeResolveIds.remove(processId)) continue;
            destroyResolveProcess(processId, true);
        }
    }

    public String startDownload(String trackId, String quality, String cookie, String proxy) throws Exception {
        waitUntilReady();
        DownloadState state = new DownloadState();
        state.id = "dl_" + System.currentTimeMillis() + "_" + UUID.randomUUID().toString().substring(0, 8);
        downloads.put(state.id, state);
        workers.execute(() -> runDownload(state, trackId, quality, cookie, proxy));
        return state.id;
    }

    private void runDownload(DownloadState state, String trackId, String quality, String cookie, String proxy) {
        File cookieFile = null;
        String processId = "download-" + state.id;
        try {
            state.status = "downloading";
            cookieFile = cookieFile(cookie);
            File dir = downloadsDir();
            File old = findDownloadedFile(dir, trackId);
            if (old != null && old.length() > 0) {
                state.path = old.getAbsolutePath();
                state.size = old.length();
                state.progress = 100f;
                state.status = "done";
                return;
            }
            YoutubeDLRequest request = baseRequest(trackId, cookieFile, proxy);
            request.addOption("--newline");
            request.addOption("-f", qualityFormat(quality));
            request.addOption("-o", new File(dir, trackId + ".%(ext)s").getAbsolutePath());
            processIds.put(state.id, processId);
            YoutubeDL.getInstance().execute(request, processId, (progress, eta, line) -> {
                if (progress >= 0) state.progress = progress;
                return kotlin.Unit.INSTANCE;
            });
            File file = findDownloadedFile(dir, trackId);
            if (file == null) throw new Exception("yt-dlp finished but no audio file was found.");
            state.path = file.getAbsolutePath();
            state.size = file.length();
            state.progress = 100f;
            state.status = "done";
        } catch (Throwable error) {
            if (!"cancelled".equals(state.status)) {
                state.status = "error";
                state.error = readableError(error);
            }
        } finally {
            processIds.remove(state.id);
            deleteQuietly(cookieFile);
        }
    }

    private File findDownloadedFile(File dir, String trackId) {
        File[] files = dir.listFiles();
        if (files == null) return null;
        File best = null;
        for (File file : files) {
            if (!file.isFile() || !file.getName().startsWith(trackId + ".")) continue;
            String name = file.getName().toLowerCase(Locale.ROOT);
            if (name.endsWith(".part") || name.endsWith(".ytdl")) continue;
            if (best == null || file.length() > best.length()) best = file;
        }
        return best;
    }

    public JSONObject progress(String id) throws Exception {
        DownloadState state = downloads.get(id);
        if (state == null) throw new Exception("Unknown download.");
        return state.toJson();
    }

    public void cancel(String id) {
        String processId = processIds.remove(id);
        if (processId != null) {
            try {
                YoutubeDL.getInstance().destroyProcessById(processId);
            } catch (Throwable ignored) {
            }
        }
        DownloadState state = downloads.get(id);
        if (state != null && !"done".equals(state.status)) {
            state.status = "cancelled";
            state.error = "Download cancelled.";
        }
    }

    public String update() throws Exception {
        waitUntilReady();
        YoutubeDL.UpdateStatus status = YoutubeDL.getInstance().updateYoutubeDL(
                context, YoutubeDL.UpdateChannel._STABLE);
        cacheResolvedVersion();
        resolvedStreams.clear();
        if (status == YoutubeDL.UpdateStatus.ALREADY_UP_TO_DATE) {
            return "yt-dlp is already up to date (" + version() + ").";
        }
        return "yt-dlp updated to " + version() + ".";
    }

    /** Downloads a short, full audio file used by Shazam-style recognition. */
    public String sampleVideo(String videoId, String cookie) throws Exception {
        waitUntilReady();
        File cookieFile = cookieFile(cookie);
        File dir = cacheDir("recognition");
        try {
            File[] old = dir.listFiles();
            if (old != null) {
                for (File file : old) {
                    if (file.getName().startsWith(videoId + ".")) file.delete();
                }
            }
            YoutubeDLRequest request = baseRequest(videoId, cookieFile, null);
            request.addOption("-f", "bestaudio[ext=m4a]/bestaudio");
            request.addOption("--download-sections", "*0:10-0:22");
            request.addOption("--force-keyframes-at-cuts");
            request.addOption("-o", new File(dir, videoId + ".%(ext)s").getAbsolutePath());
            YoutubeDL.getInstance().execute(request, "recognize-" + UUID.randomUUID(), null);
            File file = findDownloadedFile(dir, videoId);
            if (file == null) throw new Exception("Could not download a sample for recognition.");
            return file.getAbsolutePath();
        } finally {
            deleteQuietly(cookieFile);
        }
    }

    public String subtitles(String videoId, String cookie) throws Exception {
        waitUntilReady();
        File cookieFile = cookieFile(cookie);
        File dir = cacheDir("subtitles/" + videoId);
        try {
            YoutubeDLRequest request = baseRequest(videoId, cookieFile, null);
            request.addOption("--skip-download");
            request.addOption("--write-subs");
            request.addOption("--write-auto-subs");
            request.addOption("--sub-langs", "en.*,en,hi.*,hi");
            request.addOption("--sub-format", "vtt");
            request.addOption("-o", new File(dir, "%(id)s.%(ext)s").getAbsolutePath());
            YoutubeDL.getInstance().execute(request, "subs-" + UUID.randomUUID(), null);
            File[] files = dir.listFiles();
            if (files == null) return null;
            for (File file : files) {
                if (!file.getName().endsWith(".vtt")) continue;
                StringBuilder builder = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                        new java.io.FileInputStream(file), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) builder.append(line).append('\n');
                }
                return builder.toString();
            }
            return null;
        } finally {
            deleteQuietly(cookieFile);
        }
    }

    private YoutubeDLRequest baseRequest(String videoId, File cookieFile, String proxy) {
        String url = "https://music.youtube.com/watch?v=" + videoId;
        YoutubeDLRequest request = new YoutubeDLRequest(url);
        request.addOption("--no-warnings");
        request.addOption("--no-playlist");
        request.addOption("--no-check-certificates");
        request.addOption("--cache-dir", cacheDir("yt-dlp").getAbsolutePath());
        request.addOption("--socket-timeout", "25");
        if (cookieFile != null) request.addOption("--cookies", cookieFile.getAbsolutePath());
        if (proxy != null && !proxy.trim().isEmpty()) request.addOption("--proxy", proxy.trim());
        return request;
    }

    private File cookieFile(String cookie) throws IOException {
        if (cookie == null || cookie.trim().isEmpty()) return null;
        File file = new File(context.getCacheDir(), "auralis-cookies-" + UUID.randomUUID() + ".txt");
        StringBuilder text = new StringBuilder("# Netscape HTTP Cookie File\n# Generated by Auralis\n");
        long expires = System.currentTimeMillis() / 1000 + 86400;
        for (String part : cookie.split(";")) {
            int index = part.indexOf('=');
            if (index <= 0) continue;
            String name = part.substring(0, index).trim();
            String value = part.substring(index + 1).trim();
            if (name.isEmpty() || value.contains("\n") || value.contains("\r")) continue;
            text.append(".youtube.com\tTRUE\t/\tTRUE\t").append(expires).append('\t')
                    .append(name).append('\t').append(value).append('\n');
        }
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(text.toString().getBytes(StandardCharsets.UTF_8));
        }
        return file;
    }

    public static String qualityFormat(String quality) {
        if ("high".equals(quality)) return "bestaudio[abr<=256]/bestaudio[ext=m4a]/bestaudio";
        if ("medium".equals(quality)) return "bestaudio[abr<=192]/bestaudio[ext=m4a]";
        if ("low".equals(quality)) return "worstaudio[ext=m4a]/worstaudio";
        if ("best".equals(quality)) return "bestaudio/best";
        return "bestaudio[ext=m4a]/bestaudio";
    }

    /**
     * Progressive formats only: yt-dlp returns a single URL for `-g`, so
     * separate video/audio DASH streams cannot be muxed here. 480p keeps the
     * optional preview light on mobile data while remaining legible.
     */
    public static String videoFormat() {
        return "best[height<=720][ext=mp4][acodec!=none][vcodec!=none]"
                + "/best[height<=720][acodec!=none][vcodec!=none]"
                + "/best[acodec!=none][vcodec!=none]";
    }

    private void cleanupTemp() {
        File[] files = context.getCacheDir().listFiles();
        if (files == null) return;
        long now = System.currentTimeMillis();
        for (File file : files) {
            if (file.getName().startsWith("auralis-cookies-") || file.getName().startsWith("auralis-subs-")) {
                if (now - file.lastModified() > 6L * 60L * 60L * 1000L) deleteQuietly(file);
            }
        }
    }

    private static String tail(String text, String fallback) {
        if (text == null) return fallback;
        String[] lines = text.trim().split("\\r?\\n");
        StringBuilder builder = new StringBuilder();
        int start = Math.max(0, lines.length - 3);
        for (int i = start; i < lines.length; i++) {
            if (builder.length() > 0) builder.append(' ');
            builder.append(lines[i]);
        }
        return builder.length() == 0 ? fallback : builder.toString();
    }

    private static String readableError(Throwable error) {
        String message = error.getMessage();
        if (message == null || message.trim().isEmpty()) message = error.toString();
        message = message.replaceAll("\\u001B\\[[;\\d]*m", "").trim();
        String[] lines = message.split("\\r?\\n");
        return tail(message, lines.length == 0 ? "yt-dlp failed." : lines[lines.length - 1]);
    }

    private static void deleteQuietly(File file) {
        if (file == null) return;
        try {
            if (file.isDirectory()) {
                File[] children = file.listFiles();
                if (children != null) for (File child : children) deleteQuietly(child);
            }
            file.delete();
        } catch (Throwable ignored) {
        }
    }
}
