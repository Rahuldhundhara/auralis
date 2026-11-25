package com.auralis.music;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;

/**
 * Google deliberately does not support OAuth inside a WebView. This screen uses
 * the regular account web flow and harvests the resulting YouTube cookies, which
 * is the same session format the desktop app accepts.
 */
public class LoginActivity extends AppCompatActivity {
    public static final String EXTRA_COOKIE = "cookie";
    private static final String DESKTOP_UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
    private WebView webView;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        getWindow().setStatusBarColor(Color.rgb(11, 11, 15));
        getWindow().setNavigationBarColor(Color.rgb(11, 11, 15));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(11, 11, 15));

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(16), 0, dp(8), 0);
        bar.setBackgroundColor(Color.rgb(18, 18, 24));

        TextView title = new TextView(this);
        title.setText("Sign in to YouTube Music");
        title.setTextColor(Color.rgb(232, 234, 237));
        title.setTextSize(16);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0, dp(52), 1f);
        bar.addView(title, titleParams);

        TextView close = new TextView(this);
        close.setText("\u2715");
        close.setTextColor(Color.rgb(232, 234, 237));
        close.setTextSize(22);
        close.setGravity(Gravity.CENTER);
        close.setContentDescription("Cancel");
        close.setOnClickListener(view -> finish());
        bar.addView(close, new LinearLayout.LayoutParams(dp(48), dp(52)));
        root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(11, 11, 15));
        root.addView(webView, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);

        configure();
        webView.loadUrl("https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fmusic.youtube.com%2F");
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configure() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setUserAgentString(DESKTOP_UA);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                Uri uri = Uri.parse(url);
                String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
                if (host.equals("music.youtube.com") && (uri.getPath() == null || uri.getPath().equals("/"))) {
                    finishWithCookies();
                }
            }
        });
    }

    private void finishWithCookies() {
        CookieManager manager = CookieManager.getInstance();
        manager.flush();
        String music = manager.getCookie("https://music.youtube.com");
        String youtube = manager.getCookie("https://www.youtube.com");
        StringBuilder combined = new StringBuilder();
        appendCookies(combined, music);
        appendCookies(combined, youtube);
        String cookie = combined.toString();
        if (cookie.isEmpty() || !hasLoginCookie(cookie)) {
            return;
        }
        Intent result = new Intent();
        result.putExtra(EXTRA_COOKIE, cookie);
        setResult(RESULT_OK, result);
        finish();
    }

    private static boolean hasLoginCookie(String cookie) {
        return cookie.contains("SAPISID=")
                || cookie.contains("__Secure-3PAPISID=")
                || cookie.contains("SID=")
                || cookie.contains("__Secure-1PSID=");
    }

    private static void appendCookies(StringBuilder builder, String value) {
        if (value == null || value.trim().isEmpty()) return;
        if (builder.length() > 0) builder.append("; ");
        builder.append(value.trim());
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else finish();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
