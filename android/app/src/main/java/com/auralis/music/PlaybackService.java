package com.auralis.music;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.IBinder;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;

import okhttp3.Call;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

/**
 * Keeps the WebView process alive while audio is playing and mirrors the
 * renderer's transport state to the Android media session/notification.
 */
public class PlaybackService extends Service {
    private static final String TAG = "AuralisPlayback";
    private static final String CHANNEL_ID = "auralis_playback";
    private static final int NOTIFICATION_ID = 4141;
    private static volatile boolean active;
    public static final String ACTION_UPDATE = "com.auralis.music.PLAYBACK_UPDATE";
    public static final String ACTION_MEDIA = "com.auralis.music.MEDIA_ACTION";
    public static final String EXTRA_PLAYING = "playing";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_ARTIST = "artist";
    public static final String EXTRA_ARTWORK = "artwork";
    public static final String EXTRA_ACTION = "action";

    private MediaSessionCompat session;
    private Bitmap artwork;
    private String artworkUrl = "";
    private String title = "Auralis";
    private String artist = "Music";
    private boolean playing = true;
    private volatile boolean foregroundStarted;
    private volatile Call artworkCall;
    private final ExecutorService artworkExecutor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "auralis-artwork");
        thread.setDaemon(true);
        return thread;
    });
    private final OkHttpClient client = new OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(25, TimeUnit.SECONDS)
            .build();

    public static void update(Context context, boolean playing, String title, String artist, String artwork) {
        Intent intent = new Intent(context, PlaybackService.class);
        intent.setAction(ACTION_UPDATE);
        intent.putExtra(EXTRA_PLAYING, playing);
        intent.putExtra(EXTRA_TITLE, title == null ? "" : title);
        intent.putExtra(EXTRA_ARTIST, artist == null ? "" : artist);
        intent.putExtra(EXTRA_ARTWORK, artwork == null ? "" : artwork);
        if (active) {
            try {
                context.startService(intent);
                return;
            } catch (Throwable error) {
                Log.w(TAG, "could not update running playback service", error);
            }
        }
        try {
            ContextCompat.startForegroundService(context, intent);
        } catch (Throwable error) {
            // Android 12+ can reject a foreground-service start while the app
            // is in the background. Playback itself must never crash for this.
            Log.w(TAG, "could not start foreground service", error);
            try {
                context.startService(intent);
            } catch (Throwable ignored) {
                // No running service to update.
            }
        }
    }

    public static void stop(Context context) {
        try {
            context.stopService(new Intent(context, PlaybackService.class));
        } catch (Throwable ignored) {
            // The service is not running.
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        active = true;
        createChannel();
        try {
            session = new MediaSessionCompat(this, "Auralis");
            session.setCallback(new MediaSessionCompat.Callback() {
                @Override
                public void onPlay() {
                    sendMedia("play-pause");
                }

                @Override
                public void onPause() {
                    sendMedia("play-pause");
                }

                @Override
                public void onSkipToNext() {
                    sendMedia("next");
                }

                @Override
                public void onSkipToPrevious() {
                    sendMedia("previous");
                }

                @Override
                public void onStop() {
                    sendMedia("stop");
                    stopSelf();
                }
            });
            session.setActive(true);
        } catch (Throwable error) {
            Log.w(TAG, "media session creation failed", error);
        }
        if (!startForegroundSafely()) {
            stopSelf();
        }
    }

    private boolean startForegroundSafely() {
        if (foregroundStarted) return true;
        try {
            Notification notification = buildNotification();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ServiceCompat.startForeground(this, NOTIFICATION_ID, notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            foregroundStarted = true;
            return true;
        } catch (Throwable error) {
            Log.e(TAG, "startForeground failed", error);
            return false;
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!foregroundStarted && !startForegroundSafely()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (intent != null && ACTION_MEDIA.equals(intent.getAction())) {
            String action = intent.getStringExtra(EXTRA_ACTION);
            if (action != null) sendMedia(action);
            if ("stop".equals(action)) stopSelf();
            return START_NOT_STICKY;
        }
        if (intent != null && ACTION_UPDATE.equals(intent.getAction())) {
            playing = intent.getBooleanExtra(EXTRA_PLAYING, true);
            title = value(intent.getStringExtra(EXTRA_TITLE), "Auralis");
            artist = value(intent.getStringExtra(EXTRA_ARTIST), "Music");
            String nextArtwork = value(intent.getStringExtra(EXTRA_ARTWORK), "");
            if (!nextArtwork.equals(artworkUrl)) {
                artworkUrl = nextArtwork;
                artwork = null;
                loadArtwork(nextArtwork);
            }
            updateSession();
            updateNotification();
        }
        // Audio lives in the WebView. If the process dies there is nothing to
        // resume, so do not let Android recreate a stale notification.
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        try {
            Call call = artworkCall;
            if (call != null) call.cancel();
            artworkExecutor.shutdownNow();
        } catch (Throwable ignored) {
        }
        try {
            if (session != null) {
                session.setActive(false);
                session.release();
                session = null;
            }
        } catch (Throwable error) {
            Log.w(TAG, "media session release failed", error);
        }
        try {
            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (manager != null) manager.cancel(NOTIFICATION_ID);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
        } catch (Throwable ignored) {
        }
        foregroundStarted = false;
        active = false;
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void updateSession() {
        if (session == null) return;
        try {
            MediaMetadataCompat.Builder metadata = new MediaMetadataCompat.Builder()
                    .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                    .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist);
            if (artwork != null) metadata.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, artwork);
            session.setMetadata(metadata.build());
            int state = playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED;
            session.setPlaybackState(new PlaybackStateCompat.Builder()
                    .setActions(PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE
                            | PlaybackStateCompat.ACTION_PLAY_PAUSE | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
                            | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS | PlaybackStateCompat.ACTION_STOP)
                    .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, playing ? 1f : 0f)
                    .build());
        } catch (Throwable error) {
            Log.w(TAG, "media session update failed", error);
        }
    }

    private void updateNotification() {
        if (!foregroundStarted) return;
        try {
            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification());
        } catch (Throwable error) {
            Log.w(TAG, "notification update failed", error);
        }
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content = PendingIntent.getActivity(this, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Action previous = new NotificationCompat.Action(
                android.R.drawable.ic_media_previous, "Previous",
                mediaPending("previous", 1));
        NotificationCompat.Action toggle = new NotificationCompat.Action(
                playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                playing ? "Pause" : "Play", mediaPending("play-pause", 2));
        NotificationCompat.Action next = new NotificationCompat.Action(
                android.R.drawable.ic_media_next, "Next",
                mediaPending("next", 3));

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_music_note)
                .setContentTitle(title)
                .setContentText(artist)
                .setContentIntent(content)
                .setOngoing(playing)
                .setOnlyAlertOnce(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                .setShowWhen(false)
                .addAction(previous)
                .addAction(toggle)
                .addAction(next);
        if (artwork != null) builder.setLargeIcon(artwork);
        if (session != null) {
            builder.setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                    .setMediaSession(session.getSessionToken())
                    .setShowActionsInCompactView(0, 1, 2));
        }
        return builder.build();
    }

    private PendingIntent mediaPending(String action, int requestCode) {
        Intent intent = new Intent(this, PlaybackService.class);
        intent.setAction(ACTION_MEDIA);
        intent.putExtra(EXTRA_ACTION, action);
        return PendingIntent.getService(this, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void sendMedia(String action) {
        Intent intent = new Intent(ACTION_MEDIA);
        intent.setPackage(getPackageName());
        intent.putExtra(EXTRA_ACTION, action);
        sendBroadcast(intent);
    }

    private void loadArtwork(String url) {
        if (url == null || url.isEmpty()) return;
        Call previous = artworkCall;
        if (previous != null) previous.cancel();
        final String requested = url;
        try {
            artworkExecutor.execute(() -> {
                if (!requested.equals(artworkUrl)) return;
                Call call = client.newCall(new Request.Builder().url(requested).build());
                artworkCall = call;
                try (Response response = call.execute()) {
                    if (!response.isSuccessful() || response.body() == null) return;
                    if (!requested.equals(artworkUrl)) return;
                    long length = response.body().contentLength();
                    if (length > 8L * 1024 * 1024) return;
                    byte[] data = response.body().bytes();
                    if (data.length > 8 * 1024 * 1024) return;
                    if (!requested.equals(artworkUrl)) return;

                    BitmapFactory.Options bounds = new BitmapFactory.Options();
                    bounds.inJustDecodeBounds = true;
                    BitmapFactory.decodeByteArray(data, 0, data.length, bounds);
                    int sample = 1;
                    int largest = Math.max(bounds.outWidth, bounds.outHeight);
                    while (largest / (sample * 2) >= 512) sample *= 2;
                    BitmapFactory.Options options = new BitmapFactory.Options();
                    options.inSampleSize = sample;
                    Bitmap bitmap = BitmapFactory.decodeByteArray(data, 0, data.length, options);
                    if (bitmap == null) return;
                    int width = bitmap.getWidth();
                    int height = bitmap.getHeight();
                    if (Math.max(width, height) > 640) {
                        float scale = 640f / Math.max(width, height);
                        Bitmap scaled = Bitmap.createScaledBitmap(
                                bitmap,
                                Math.max(1, Math.round(width * scale)),
                                Math.max(1, Math.round(height * scale)),
                                true);
                        if (scaled != bitmap) bitmap.recycle();
                        bitmap = scaled;
                    }
                    if (!requested.equals(artworkUrl)) {
                        bitmap.recycle();
                        return;
                    }
                    artwork = bitmap;
                    updateSession();
                    updateNotification();
                } catch (Throwable error) {
                    if (!call.isCanceled()) Log.w(TAG, "artwork load failed", error);
                } finally {
                    if (artworkCall == call) artworkCall = null;
                }
            });
        } catch (RejectedExecutionException ignored) {
            // Service is shutting down.
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        try {
            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (manager == null) return;
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Playback", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Auralis playback controls");
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
        } catch (Throwable error) {
            Log.w(TAG, "notification channel creation failed", error);
        }
    }

    private static String value(String value, String fallback) {
        return value == null || value.trim().isEmpty() ? fallback : value;
    }
}
