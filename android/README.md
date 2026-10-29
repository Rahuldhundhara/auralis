# Auralis for Android

The Android app reuses the Auralis React renderer inside a native WebView shell. The
shell serves the renderer from a local NanoHTTPD server on port `47653`, proxies
network and media requests, and keeps playback alive with a foreground service.

The current release is:

| Property | Value |
| --- | --- |
| Package | `com.auralis.music` |
| Version | `1.0.3` (`versionCode` `10003`) |
| Min SDK | 24 |
| Target SDK | 34 |
| ABIs | `arm64-v8a`, `armeabi-v7a` |

## Requirements

- Node.js 22 or newer (Node 24 recommended)
- JDK 21
- Android SDK 35 and build-tools 35.0.0
- An Android device or emulator

`ANDROID_HOME` (or `ANDROID_SDK_ROOT`) must point at the SDK. The project also reads
the SDK from `android/local.properties` when present.

## Build the renderer and web assets

From the repository root:

```powershell
npm install
npm run build:android
```

`build:android` does two things:

1. builds the shared React renderer into `dist/`
2. copies it to `android/app/src/main/assets/www/` and bundles the Android API shim
   from `src/android/api-entry.ts` into `android-api.js`

The generated `assets/www/` directory is committed so a fresh checkout can be opened
in Android Studio without running Node first. Regenerate it whenever renderer code,
`src/android/`, or the shared styles change.

## Build the APK

```powershell
cd android

# ARM release (default)
.\gradlew.bat :app:assembleRelease

# x86_64 debug build for the emulator
.\gradlew.bat :app:assembleDebug -Pauralis.abis=x86_64
```

The release APK is written to:

```text
android/app/build/outputs/apk/release/app-release.apk
```

Release builds are ARM-only by default so the APK stays small. To build a different
ABI set, pass `-Pauralis.abis=arm64-v8a,armeabi-v7a,x86_64`.

## Signing

The release build reads `android/keystore.properties` when the file exists:

```properties
storeFile=keystore/auralis-release.jks
storePassword=...
keyAlias=auralis
keyPassword=...
```

The keystore, `keystore.properties` and all APK/AAB outputs are deliberately ignored
by Git. Keep a secure backup of the signing key: Android updates must be signed with
the same certificate.

Without `keystore.properties`, Gradle still builds a release APK, but it is unsigned
and cannot be installed over an existing Auralis installation.

## Architecture

| Path | Purpose |
| --- | --- |
| `android/app/src/main/java/com/auralis/music/MainActivity.java` | WebView shell, back handling, bridge registration, server lifecycle |
| `android/app/src/main/java/com/auralis/music/LocalServer.java` | Local renderer server plus `/__fetch`, `/media` and yt-dlp endpoints |
| `android/app/src/main/java/com/auralis/music/YtDlpManager.java` | Bundled yt-dlp/Python/FFmpeg lifecycle, stream resolution, downloads |
| `android/app/src/main/java/com/auralis/music/PlaybackService.java` | Foreground media playback notification and lock-screen controls |
| `src/android/` | Renderer-side replacement for the Electron preload API |
| `src/lib/platform.ts` | Runtime platform detection used for Android-only UI |
| `scripts/build-android.mjs` | Copies the renderer and builds the Android API bundle |

The renderer and native shell use the same `window.auralis` contract as the Windows
app. Differences are limited to platform-gated copy, layout and media integration, so
the desktop experience is unchanged.

## Notes

- The `arm64-v8a`/`armeabi-v7a` release cannot be installed on an x86_64 emulator;
  use the x86_64 debug build for emulator testing.
- YouTube may show bot-check responses without cookies. Failures are handled
  gracefully, but a signed-in cookie session may be required for reliable playback.
- The bundled `assets/yt-dlp` file is required at runtime. Keep it in place when
  packaging, or update it deliberately as part of an Android release.
