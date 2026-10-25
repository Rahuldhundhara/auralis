# Feature parity

Auralis targets the day-to-day feature set of the reference Android YouTube Music client, rebuilt for Windows. Platform-specific Android features are replaced by native desktop equivalents rather than removed. Most of the matrix is implemented; the five reference features still missing from 1.0.2 are listed under [Remaining gaps](#remaining-gaps-in-102).

**Status key**

| Status | Meaning |
| --- | --- |
| **Verified** | Exercised against the live YouTube Music service and through the real UI in this build. |
| **Ready** | Fully implemented end to end, but needs a signed-in account, API credentials or a specific media sample to verify live. |
| **Desktop** | Windows equivalent of an Android-only feature. |
| **N/A** | Android platform feature with no desktop equivalent or no user-facing purpose on Windows. |

## Discovery and catalogue

| Feature | Status | Evidence / notes |
| --- | --- | --- |
| Anonymous home feed | **Verified** | Live shelves, quick picks and playable cards; anonymous sessions are supplemented from Explore when the personalised feed is thin. |
| Personalised home with account | **Ready** | The same feed request carries the signed-in cookie set; account-specific ordering cannot be verified without a real session. |
| Explore page | **Verified** | Live "New albums & singles", "Popular episodes", "Trending" and "New music videos" shelves. |
| Charts | **Verified** | Video charts, language charts and top artists parsed and rendered. |
| New releases | **Verified** | 133 live releases returned by the new-releases browse endpoint. |
| Moods and genres | **Verified** | 49 navigation tiles in two shelves; opening "Chill" loads 13 live category shelves. Added in the final QA pass. |
| Search suggestions | **Verified** | Live suggestion endpoint with keyboard navigation. |
| Search filters | **Verified** | Songs, videos, albums, artists, playlists and podcasts each use their own YouTube Music filter. |
| Search continuation | **Verified** | Additional result pages are merged by id, including deduplication across shelves. |
| Album pages | **Verified** | Header, artwork, year, track count, full track list, save action, playback and related shelves. |
| Single/EP pages | **Verified** | Share the album detail flow. |
| Playlist pages | **Verified** | Header, track list, owner, duration, save-as-local-copy and playback. |
| Artist pages | **Verified** | Top songs, albums, singles, related artists, subscribe control and artwork. |
| Podcast pages | **Verified** | Episode list parsed from multi-row shelf items, with durations, artwork and 20-episode continuation. |
| Episode playback | **Verified** | Episodes use the same audio resolver as songs and play in the main queue. |
| Home/Explore continuation | **Verified** | Continuation tokens are followed and shelves merged without duplicates. |
| Region and language | **Verified** | Locale is applied to every Innertube request; changing it changes the live catalogue response. |

## Playback

| Feature | Status | Evidence / notes |
| --- | --- | --- |
| Live audio streaming | **Verified** | Bundled `yt-dlp` resolves a direct audio URL; real playback and progress verified in the packaged and unpackaged app. |
| Play / pause / seek / volume | **Verified** | HTML5 audio pipeline, range-capable media protocol and player bar controls. |
| Next / previous | **Verified** | Queue navigation and media-key handlers. |
| Shuffle and repeat | **Verified** | Shuffle, repeat-one and repeat-all modes. |
| Queue view | **Verified** | Queue panel, jump to track, reorder, remove track and clear queue. |
| Play next / add to queue | **Verified** | Track context menu and detail-page actions. |
| Radio / automix | **Verified** | Track radio uses the `RDAMVM<videoId>` playlist and follows continuation tokens for further pages of live recommendations. |
| Related autoplay | **Verified** | Search picks start a station from the picked song instead of queuing the other search rows. Albums, playlists and one-off queues seed a station from the last track when they end. A Hindi seed produced a 50-track Hindi station; clearing upcoming and pressing Next started `Apna Bana Le` with 49 related rows. |
| Gapless prefetch | **Verified** | The next track resolves while the current track is playing. |
| Playback speed | **Verified** | 0.5x–2x, applied live and persisted. |
| 10-band equalizer | **Verified** | Web Audio peaking filters, preamp, presets and bypass; verified through the real UI. |
| Loudness normalisation | **Verified** | Dynamics compressor stage in the Web Audio graph. |
| Lyrics | **Verified** | Eight providers with fallback; LRCLIB and YouTube Music lyrics verified live, including synced highlighting. |
| Lyrics auto-translation | **Ready** | OpenAI and DeepL providers implemented; needs an API key to exercise the network call. |
| YouTube captions fallback | **Ready** | yt-dlp VTT-to-LRC fallback implemented; the official transcript endpoint currently returns HTTP 400, so this path needs a known captioned video to verify. |
| Sleep timer | **Verified** | 5/10/15/30/45/60-minute timers plus end-of-track; countdown in the player bar, automatic pause and clear. |
| Session restore | **Verified** | Queue, current track, position, repeat mode and volume survive a restart. |
| Windows media keys | **Desktop** | Play/pause, next, previous and stop are registered globally. |
| System tray | **Desktop** | Playback controls, navigation and quit; close-to-tray is configurable. |
| Background playback | **Desktop** | Audio continues when minimised or hidden in the tray. |
| Keyboard shortcuts | **Desktop** | Space, arrows, search, navigation and player shortcuts. |
| Android Auto / widgets / share sheet | **N/A** | Replaced by tray controls, media keys and native window shortcuts. |

## Library and downloads

| Feature | Status | Evidence / notes |
| --- | --- | --- |
| Like / unlike songs | **Verified** | Local likes persist and appear in Liked Songs and Library. |
| Local playlists | **Verified** | Create, add tracks, reorder, remove tracks, rename, delete and play. |
| Saved albums | **Verified** | Save and remove from album pages and Library. |
| Saved artists | **Verified** | Follow and unfollow locally, with an artist grid in Library. |
| Recently played | **Verified** | Ordered history with track metadata and play counts. |
| Listening history | **Verified** | Play events include completion state, duration and timestamps. |
| Search history | **Verified** | Local suggestions and clear-history action. |
| Downloads | **Verified** | Real 3 MB `.m4a` download completed with live progress; file exists on disk and is registered in Library. |
| Download cancel / retry / delete | **Verified** | Process cancellation, error state, delete from disk and clear-all. |
| Auto-download liked songs | **Verified** | Optional background download when a song is liked. |
| Offline playback | **Verified** | Downloaded files resolve through `auralis-media://local/...` without a network request. |
| Download folder selection | **Verified** | Native folder picker and persistence; default is `%USERPROFILE%\Music\Auralis`. |
| YouTube Music cloud library | **Ready** | Library shelves, liked music, uploads, playlists and history are parsed; needs a signed-in account. |
| Remote like / rating | **Ready** | Like, dislike and neutral rating calls implemented; needs a signed-in account. |
| Remote playlist editing | **Ready** | Create, rename, delete, add and remove YouTube Music playlist items; needs a signed-in account. |
| Subscribe / unsubscribe artist | **Ready** | Subscribe endpoint wired into artist pages; needs a signed-in account. |

## Account and integrations

| Feature | Status | Evidence / notes |
| --- | --- | --- |
| Google sign-in window | **Ready** | Embedded Google flow in an isolated `persist:auralis-login` partition; cookie capture completes when YouTube Music redirects. |
| Manual cookie import | **Ready** | Accepts a `Cookie` header string, validates YouTube cookies and stores it encrypted. |
| Cookie encryption | **Verified** | `safeStorage`/DPAPI encryption path; cookies are never written in plain text when encryption is available. |
| Last.fm authentication | **Ready** | Browser-token flow, signing, now-playing and scrobbling implemented; needs the user's own API key/secret. |
| Last.fm love / unlove | **Ready** | Track menu action maps to the Last.fm love API. |
| Scrobble threshold | **Ready** | Configurable 25/50/75% threshold and now-playing updates. |
| Discord Rich Presence | **Ready** | Rich Presence with artwork, title, artist, timestamps and optional buttons; needs a Discord application id. |
| Shazam recognition | **Ready** | TypeScript fingerprint port with FFmpeg PCM input, live lookup and YouTube match; needs a sample or microphone capture. |
| Account page | **Ready** | Shows name, avatar, plan badge and local library totals; empty state offers sign-in. |
| Sign out | **Ready** | Clears encrypted cookies and account metadata without touching local likes, playlists or downloads. |

## Desktop, appearance and settings

| Feature | Status | Evidence / notes |
| --- | --- | --- |
| Frameless window | **Verified** | Custom title bar, drag region and minimise/maximise/close controls. |
| Dark / Black / Light / System themes | **Verified** | All four modes checked through the real UI; system mode follows Windows. |
| Dynamic accent colours | **Verified** | Eight original accents applied across controls, focus rings and highlights. |
| Start page | **Verified** | Home, Explore or Library. |
| Hardware acceleration toggle | **Verified** | Applied before Electron ready, with a restart action. |
| Proxy | **Verified** | Passed to yt-dlp for streams, downloads and captions. |
| Settings reset | **Verified** | Restores defaults and reapplies theme and tray state. |
| Error boundary and recovery | **Verified** | Renderer errors show a recoverable screen instead of a blank window. |
| Crash reporting / telemetry | **N/A** | Auralis sends no telemetry and has no account server. |

## Platform differences

| Android feature | Auralis behaviour |
| --- | --- |
| Android Auto | Not applicable; desktop playback plus media keys and tray controls. |
| Home-screen widgets | Not applicable; the app window and tray provide the same quick access. |
| Android share sheet | Not applicable; copy link and open in browser are available instead. |
| Mobile downloads directory | Uses the Windows Music library, configurable in Settings. |
| Android equalizer / audio effects | Replaced by a 10-band Web Audio equalizer with preamp and loudness normalisation. |
| Android notification controls | Replaced by Windows SMTC/media keys and the tray menu. |

## Remaining gaps in 1.0.2

These reference-client features are not implemented in the Windows build. They are not hidden behind a disabled setting or faked in the UI.

| Feature | Status | Reason |
| --- | --- | --- |
| Skip silence | **Not implemented** | Needs silence detection and automatic seeking on top of the single HTML5 audio pipeline. |
| Crossfade | **Not implemented** | Overlapping tracks would require a dual-audio mixer; Auralis uses one audio element. |
| Independent pitch | **Not implemented** | Playback speed uses the browser's pitch-preserving rate; a separate pitch control is not exposed. |
| Playlist import by URL | **Not implemented** | Opening a public playlist and saving it as a local copy works, but pasting an arbitrary playlist URL into the local library is not built. |
| Listen Together | **Not implemented** | Needs a realtime relay service and a shared-session protocol; Auralis has no backend. |

## Verification caveats

The following features are implemented but cannot be proven end to end without credentials or a target sample:

1. Google login and every YouTube Music account mutation (like, playlist edit, subscribe, cloud library).
2. Last.fm authentication and scrobbling with a real account.
3. Discord Rich Presence with a real Discord client.
4. Lyrics translation with an OpenAI or DeepL key.
5. Shazam recognition with a known audio sample or microphone input.
6. yt-dlp caption extraction against a video known to expose captions.

These are credential-bound, not mocked: the buttons call the real services and surface real errors. A signed-in session is required to finish their live verification.

## Live verification snapshot

| Check | Result |
| --- | --- |
| Full `qa-full` end-to-end pass | 21/21 checks |
| Anonymous home, search, album, artist, playlist | Pass |
| Playback, seek, queue, lyrics, sleep timer | Pass |
| 10-band EQ, themes, settings | Pass |
| Download + offline file | Pass (4,338,550-byte M4A) |
| Local playlist create/add/reorder/remove | Pass |
| Podcast "The Daily" episodes | Pass (20 episodes, 9h 50m total) |
| Moods & genres | Pass (49 tiles, category page with 13 shelves) |
| Search filters and continuation | Pass |
| TypeScript + production build | Pass |
| NSIS installer and portable EXE | Built successfully; both packaged builds launched |
| Portable EXE cold start | Pass (home feed, bundled yt-dlp/FFmpeg, 122 cards) |
| Related radio and queue-end autoplay | Pass (5 search rows -> 50-track Hindi station; auto-continue kept 49 related rows) |
| Silent install / uninstall | Pass (1.0.2 installed app launched with bundled tools, then removed cleanly) |
