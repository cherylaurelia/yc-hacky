# Terminal 1 for Mac

A menu-bar app that hosts the Terminal 1 web page and adds push-to-talk with a global key. Hold the key anywhere, talk, let go: your words are typed into the app in front of you (dictation). While an agent is waiting on you, the same hold talks to your agents instead.

On screen it is a tiny capsule (44x8) 8 pt above the bottom of your display, above the Dock. Hover it for 300 ms to see the talk key (Hold Right Option). While you hold the key it grows to the pill with a level meter, and the same pill shows Thinking and Speaking. When an agent posts an alert, it expands to `<agent>: <text>`, then shrinks back after you answer or after 8 s (the alert stays in the panel). With Reduce Motion on, the size changes instantly. Click the pill, or pick Show Panel in the menu-bar menu, to open the full page. Closing the panel does not end the session.

## Install

1. Open Terminal-1.dmg and drag Terminal 1 to Applications. (The zip, Terminal-1.zip, holds the same app.)
2. A notarized build opens with a double-click. An ad-hoc build (the default of `macos/build.sh`) is refused: right-click Terminal 1, choose Open, then Open again. You only do this once.
   If macOS still blocks it: `xattr -dr com.apple.quarantine "/Applications/Terminal 1.app"`.
3. Allow these when asked (System Settings > Privacy & Security):
   - Microphone: so the page can hear you.
   - Notifications: so an alert reaches you when you are not looking at Terminal 1.
   - Input Monitoring and Accessibility: so the app can see the talk key while another app is in front. Turn Terminal 1 on in both, then quit and reopen it once. Without them the key only works while Terminal 1 is the front app.
4. A first-launch window walks through these permissions, the talk key and connecting agents (`coworker install claude|codex|cursor`). The `coworker` command and `~/.coworker` keep their names.

The app opens the hosted Terminal 1 page (the `/app` page of the site). To use another one (your own deployment), menu bar > Set URL....

## Updates

On launch and every 24 hours the app asks `<page origin>/api/version` for the latest version. When it is newer than the app's own, the menu shows "Update available: <version>..." and opens the site's `/download` page. The site serves `public/releases.json`, which `scripts/release.sh` writes.

## Talk key

Menu bar > Talk key. The default is fn, or Right Option when Wispr Flow is installed (Wispr uses fn). A hold under 150 ms, or a hold that another key joins (key+arrow, key+shift), is dropped instead of sent.

## Dictation

Holding the talk key streams your voice to ElevenLabs Scribe and pastes the text into the focused app when you let go, then puts your clipboard back. The app gets a single-use token from `POST <page origin>/api/scribe-token` (expects `{token}`), so the ElevenLabs key stays on the server. Pasting needs Accessibility. Menu bar > Settings... sets the talk key, the dictation language, agent alerts, their sound and launch at login.

## Agents

The app runs a local relay on 127.0.0.1 (a random port and token, written to `~/.coworker/relay.json`, or under `$COWORKER_HOME`). Agents post events (`approval`, `question`, `blocked`, `stuck`, `done`) and long-poll for your answer: `POST /v1/events`, `GET /v1/events/<id>/answer?wait=N`, `POST /v1/events/<id>/answer`. Each event shows on the pill and as a notification with Allow, Deny, Stop or Reply buttons, and goes to the page. The menu bar menu shows the app version.

## Build

`macos/build.sh` needs only the Xcode Command Line Tools. It writes `macos/build/Terminal 1.app` (arm64 and x86_64), `macos/build/Terminal-1.zip` and `macos/build/Terminal-1.dmg`, then unzips the zip into a temp folder and verifies the signature. The bundle id is `com.terminal1.app` and the executable is `Terminal1`. It prints which signing path ran.

- Default: ad-hoc signed, not notarized.
- `DEVELOPER_ID="Developer ID Application: Name (TEAMID)" macos/build.sh` signs with that identity, the hardened runtime and `macos/Terminal1.entitlements` (microphone, network), and signs the DMG too.
- Add `NOTARY_PROFILE=<profile>` (made once with `xcrun notarytool store-credentials`) and it also runs `xcrun notarytool submit --wait` on the DMG, then `xcrun stapler staple`. A rejected submission fails the build.

`scripts/release.sh` publishes `Terminal-1.dmg` as a GitHub release and writes `public/releases.json`. Run it without arguments first: it builds and prints what `--publish` would do. It refuses a dirty git tree or an existing `v<version>` tag. The version comes from `macos/VERSION`.

`macos/test.sh` checks the talk-key and pill state machines and the update check's version logic. It needs no keyboard or microphone.

## Page contract

The page sends `window.webkit.messageHandlers.coworker.postMessage(msg)`, where `msg` is:

- `{state: "idle" | "listening" | "thinking" | "speaking"}` drives the menu-bar icon and the pill.
- `{alert: {agent, text, id?}}` expands the pill and posts one macOS notification ("<agent> needs you"). Clicking it opens the panel. The same alert (same `id`, or same agent and text when there is none) notifies once until it is cleared, answered or expires, and not at all while the panel is open. Send `{alert: null}` to clear it. A real hold (not a tap) also clears it, and so does 2 minutes of nothing.

- `{answer: {id, text}}` answers an agent's relay event.

The app dispatches `coworker-ptt` (`{down, cancelled}`; only for holds that talk to agents, not dictation), `coworker-ptt-key` (`{key}`) and `coworker-relay` (the agent's event: `{id, agent, kind, text, ...}`) on `window`.

## Debugging

Launch args (`open -n "Terminal 1.app" --args ...`):

- `-coworkerURL <url>` points the app at a page for this launch only.
- `-debug 1` shows "Simulate talk key hold" in the menu. `-simulateAfter 5 -simulateSeconds 3` runs one hold on a timer.
- `-pillSnapshots /tmp/dir` walks idle, hover, hold and alert and saves each state's pixels as PNGs (no Screen Recording access needed; use `-coworkerURL about:blank` so the page does not drive the state).
- `-simulateAlertAfter 5` posts one fake alert on a timer; the menu has "Simulate alert" with `-debug 1`. Notifications need the app launched as `open "build/Terminal 1.app"`, not the raw binary.
- `-showPanel 1` opens the full panel at launch. `-onboardingCompleted NO` shows the first-launch window again.
- `-probe 1` appends the page's mic track state (enabled or muted) and the pill state to `/tmp/coworker-probe.log`.

`macos/test/ptt-test.html` is a static page that posts states and an alert (`?demo=1` walks through them). `macos/test/post-fn.swift` posts real key events to the running app.
