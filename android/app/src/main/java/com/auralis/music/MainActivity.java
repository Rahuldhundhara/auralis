package com.auralis.music;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.Settings;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import org.json.JSONObject;

import java.io.File;

public class MainActivity extends AppCompatActivity {
    private static final String TAG = "AuralisMain";
    private static final String LOCAL_HOST = "127.0.0.1";

    private WebView webView;
    private FrameLayout root;
    private LocalServer server;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest pendingPermissionRequest;
    private ActivityResultLauncher<Intent> filePicker;
    private ActivityResultLauncher<Intent> loginLauncher;
    private ActivityResultLauncher<String> microphonePermission;
    private BroadcastReceiver mediaReceiver;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        applySystemBars();

        server = new LocalServer(this);
        Exception startupError = null;
        for (int attempt = 0; attempt < 4; attempt += 1) {
            try {
                server.start();
                startupError = null;
                break;
            } catch (Exception error) {
                startupError = error;
                try {
                    server.stop();
                } catch (Throwable ignored) {
                }
                if (attempt < 3) {
                    try {
                        Thread.sleep(180);
                    } catch (InterruptedException interrupted) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                    server = new LocalServer(this);
                }
            }
        }
        if (startupError != null) {
            Toast.makeText(this, "Auralis could not start its local player: " + startupError.getMessage(), Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        webView = new WebView(this);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webView.setBackgroundColor(Color.rgb(11, 11, 15));
        configureWebView();
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(11, 11, 15));
        root.addView(webView);
        setContentView(root);
        this.root = root;

        registerLaunchers();
        registerMediaReceiver();
        webView.loadUrl(server.origin() + "/index.html");
        YtDlpManager.get(this).initialize();
    }

    private void registerMediaReceiver() {
        mediaReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (webView == null) return;
                String action = intent.getStringExtra(PlaybackService.EXTRA_ACTION);
                if (action == null) return;
                String script = "window.__auralisNativeEvent && window.__auralisNativeEvent('media-key',"
                        + JSONObject.quote(action) + ");";
                webView.evaluateJavascript(script, null);
            }
        };
        IntentFilter filter = new IntentFilter(PlaybackService.ACTION_MEDIA);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(mediaReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(mediaReceiver, filter);
        }
    }

    private void registerLaunchers() {
        filePicker = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
            if (fileCallback == null) return;
            Uri[] uris = null;
            if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
                Intent data = result.getData();
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    uris = new Uri[count];
                    for (int i = 0; i < count; i++) uris[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    uris = new Uri[]{data.getData()};
                }
            }
            fileCallback.onReceiveValue(uris);
            fileCallback = null;
        });

        loginLauncher = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
            String cookie = result.getResultCode() == Activity.RESULT_OK && result.getData() != null
                    ? result.getData().getStringExtra(LoginActivity.EXTRA_COOKIE) : "";
            dispatchLoginResult(cookie == null ? "" : cookie);
        });

        microphonePermission = registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
            if (pendingPermissionRequest != null) {
                if (granted) pendingPermissionRequest.grant(pendingPermissionRequest.getResources());
                else pendingPermissionRequest.deny();
                pendingPermissionRequest = null;
            }
        });
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setBlockNetworkImage(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString());
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(false);
        }
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true);

        webView.addJavascriptInterface(new NativeBridge(), "AuralisNative");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleNavigation(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleNavigation(Uri.parse(url));
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                Log.e(TAG, "WebView renderer gone, crashed=" + (detail != null && detail.didCrash()));
                if (webView == view) {
                    webView = null;
                    if (root != null) root.removeView(view);
                    view.destroy();
                    if (root != null) {
                        root.post(() -> {
                            if (!isFinishing() && !isDestroyed()) recreate();
                        });
                    } else if (!isFinishing() && !isDestroyed()) {
                        recreate();
                    }
                }
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage message) {
                Log.d(TAG, message.message() + " @" + message.sourceId() + ":" + message.lineNumber());
                return true;
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                boolean wantsAudio = false;
                for (String resource : request.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) wantsAudio = true;
                }
                if (!wantsAudio) {
                    request.deny();
                    return;
                }
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(request.getResources());
                } else {
                    pendingPermissionRequest = request;
                    microphonePermission.launch(Manifest.permission.RECORD_AUDIO);
                }
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                String[] accept = params.getAcceptTypes();
                String type = "*/*";
                if (accept != null && accept.length > 0 && accept[0] != null && !accept[0].isEmpty()) {
                    type = accept[0].split(",")[0].trim();
                }
                intent.setType(type);
                try {
                    filePicker.launch(intent);
                } catch (ActivityNotFoundException error) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });
    }

    private boolean handleNavigation(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
            if (LOCAL_HOST.equals(host) || "localhost".equalsIgnoreCase(host)) return false;
            openExternal(uri.toString());
            return true;
        }
        if ("mailto".equalsIgnoreCase(scheme) || "tel".equalsIgnoreCase(scheme)) {
            openExternal(uri.toString());
            return true;
        }
        return false;
    }

    private void applySystemBars() {
        Window window = getWindow();
        window.setStatusBarColor(Color.rgb(11, 11, 15));
        window.setNavigationBarColor(Color.rgb(11, 11, 15));
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);
    }

    private void openExternal(String raw) {
        try {
            Uri uri = Uri.parse(raw);
            String scheme = uri.getScheme();
            if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)
                    && !"mailto".equalsIgnoreCase(scheme) && !"tel".equalsIgnoreCase(scheme)) return;
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Throwable error) {
            Log.w(TAG, "Could not open " + raw, error);
        }
    }

    private void openLocalFile(String path) {
        File file = new File(path);
        if (!file.exists()) {
            Toast.makeText(this, "That file is no longer available.", Toast.LENGTH_SHORT).show();
            return;
        }
        if (file.isDirectory()) {
            openLocalFolder(file);
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".files", file);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, mimeOf(file.getName()));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Throwable error) {
            Toast.makeText(this, "The file is stored at " + path, Toast.LENGTH_LONG).show();
        }
    }

    private void showLocalFolder(String path) {
        File file = new File(path);
        File folder = file.isDirectory() ? file : file.getParentFile();
        if (folder == null || !folder.exists() || !folder.isDirectory()) {
            Toast.makeText(this, "That folder is no longer available.", Toast.LENGTH_SHORT).show();
            return;
        }
        openLocalFolder(folder);
    }

    private void openLocalFolder(File folder) {
        try {
            File external = Environment.getExternalStorageDirectory();
            String externalPath = external.getCanonicalPath();
            String folderPath = folder.getCanonicalPath();
            if (folderPath.equals(externalPath)) {
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(DocumentsContract.buildRootUri(
                        "com.android.externalstorage.documents", "primary"),
                        DocumentsContract.Document.MIME_TYPE_DIR);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
                return;
            }
            if (folderPath.startsWith(externalPath + File.separator)) {
                String relative = folderPath.substring(externalPath.length() + 1);
                // Uri.Builder leaves slashes in document IDs unescaped, which
                // makes DocumentsUI truncate the path. Encode the full doc ID
                // so it opens the exact folder.
                Uri uri = Uri.parse("content://com.android.externalstorage.documents/document/"
                        + Uri.encode("primary:" + relative));
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, DocumentsContract.Document.MIME_TYPE_DIR);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
                return;
            }
            Toast.makeText(this, "Folder: " + folderPath, Toast.LENGTH_LONG).show();
        } catch (ActivityNotFoundException missing) {
            Toast.makeText(this, "No file manager is available. Folder: " + folder.getAbsolutePath(),
                    Toast.LENGTH_LONG).show();
        } catch (Throwable error) {
            Toast.makeText(this, "Folder: " + folder.getAbsolutePath(), Toast.LENGTH_LONG).show();
        }
    }

    private static String mimeOf(String name) {
        String lower = name.toLowerCase(java.util.Locale.ROOT);
        if (lower.endsWith(".m4a")) return "audio/mp4";
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".opus")) return "audio/opus";
        if (lower.endsWith(".webm")) return "audio/webm";
        if (lower.endsWith(".wav")) return "audio/wav";
        return "*/*";
    }

    private void dispatchLoginResult(String cookie) {
        if (webView == null) return;
        try {
            JSONObject payload = new JSONObject();
            payload.put("cookie", cookie);
            String script = "window.__auralisNativeEvent && window.__auralisNativeEvent('login',"
                    + JSONObject.quote(payload.toString()) + ");";
            webView.evaluateJavascript(script, null);
        } catch (Throwable error) {
            Log.w(TAG, "login result dispatch failed", error);
        }
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 912);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            moveTaskToBack(true);
            return;
        }
        String script = "(function(){"
                + "var overlay=document.querySelector('.modal-layer,.now-playing,.queue-drawer,.context-menu');"
                + "if(overlay){window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));return true;}"
                + "var search=document.querySelector('.search-popover');"
                + "if(search){var input=document.querySelector('.top-search input');"
                + "if(input){input.focus();input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));}return true;}"
                + "if(window.__auralisAndroidBack&&window.__auralisAndroidBack())return true;"
                + "return false;})()";
        webView.evaluateJavascript(script, value -> {
            if (!"true".equals(value)) moveTaskToBack(true);
        });
    }

    @Override
    protected void onDestroy() {
        // The WebView (and therefore the audio element) is destroyed with this
        // activity, so no playback notification should outlive it.
        PlaybackService.stop(this);
        if (mediaReceiver != null) {
            try {
                unregisterReceiver(mediaReceiver);
            } catch (Throwable ignored) {
            }
            mediaReceiver = null;
        }
        if (server != null) server.stop();
        YtDlpManager.get(this).cancelResolves();
        if (webView != null) {
            webView.removeJavascriptInterface("AuralisNative");
            webView.destroy();
            webView = null;
        }
        root = null;
        super.onDestroy();
    }

    /** Methods exposed to the renderer. Only this WebView can call them. */
    public final class NativeBridge {
        @android.webkit.JavascriptInterface
        public String downloadsDir() {
            return YtDlpManager.get(MainActivity.this).downloadsDir().getAbsolutePath();
        }

        @android.webkit.JavascriptInterface
        public String appInfo() {
            return YtDlpManager.get(MainActivity.this).appInfoJson();
        }

        @android.webkit.JavascriptInterface
        public void openExternalUrl(String url) {
            runOnUiThread(() -> openExternal(url));
        }

        @android.webkit.JavascriptInterface
        public void openFile(String path) {
            runOnUiThread(() -> openLocalFile(path));
        }

        @android.webkit.JavascriptInterface
        public void showInFolder(String path) {
            runOnUiThread(() -> showLocalFolder(path));
        }

        @android.webkit.JavascriptInterface
        public void showMessage(String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show());
        }

        @android.webkit.JavascriptInterface
        public void closeApp() {
            runOnUiThread(() -> finishAffinity());
        }

        @android.webkit.JavascriptInterface
        public void relaunch() {
            // Recreate this activity instead of killing the process: the local
            // server must release its fixed port before the new instance binds it.
            runOnUiThread(MainActivity.this::recreate);
        }

        @android.webkit.JavascriptInterface
        public void login() {
            runOnUiThread(() -> {
                Intent intent = new Intent(MainActivity.this, LoginActivity.class);
                loginLauncher.launch(intent);
            });
        }

        @android.webkit.JavascriptInterface
        public void setTheme(boolean dark) {
            runOnUiThread(MainActivity.this::applySystemBars);
        }

        @android.webkit.JavascriptInterface
        public void setPlayback(boolean playing, String title, String artist, String artwork) {
            runOnUiThread(() -> {
                if (playing) requestNotificationPermissionIfNeeded();
                PlaybackService.update(MainActivity.this, playing, title, artist, artwork);
            });
        }

        @android.webkit.JavascriptInterface
        public void stopPlayback() {
            runOnUiThread(() -> {
                PlaybackService.stop(MainActivity.this);
            });
        }

        @android.webkit.JavascriptInterface
        public void openAppSettings() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            });
        }
    }
}
