# Coworker for Mac

A menu-bar app that hosts the Coworker web page and adds push-to-talk with a global key. Hold the key anywhere, talk, let go.

On screen it is a tiny capsule (44x8) 8 pt above the bottom of your display, above the Dock. Hover it for 300 ms to see the talk key (Hold Right Option). While you hold the key it grows to the pill with a level meter, and the same pill shows Thinking and Speaking. When an agent posts an alert, it expands to `<agent>: <text>`, then shrinks back after you answer or after 8 s (the alert stays in the panel). With Reduce Motion on, the size changes instantly. Click the pill, or pick Show Panel in the menu-bar menu, to open the full page. Closing the panel does not end the session.

## Install (from Coworker.zip)

1. Unzip it and drag Coworker.app to Applications.
2. The app is ad-hoc signed, not notarized, so a double-click is refused. Right-click Coworker.app, choose Open, then Open again. You only do this once.
   If macOS still blocks it: `xattr -dr com.apple.quarantine /Applications/Coworker.app`.
3. Allow these when asked (System Settings > Privacy & Security):
   - Microphone: so the page can hear you.
   - Notifications: so an alert reaches you when you are not looking at Coworker.
   - Input Monitoring and Accessibility: so the app can see the talk key while another app is in front. Turn Coworker on in both, then quit and reopen it once. Without them the key only works while Coworker is the front app.
4. Menu bar > Set URL... and paste the address of your Coworker page, for example `http://localhost:3000/?repo=owner/name&embed=1`.

## Talk key

Menu bar > Talk key. The default is fn, or Right Option when Wispr Flow is installed (Wispr uses fn). A hold under 150 ms, or a hold that another key joins (key+arrow, key+shift), is dropped instead of sent.

## Build

`macos/build.sh` needs only the Xcode Command Line Tools. It writes `macos/build/Coworker.app` (arm64 and x86_64) and `macos/build/Coworker.zip`, then unzips the zip into a temp folder and verifies the signature.

`macos/test.sh` checks the talk-key and pill state machines. It needs no keyboard or microphone.

## Page contract

The page sends `window.webkit.messageHandlers.coworker.postMessage(msg)`, where `msg` is:

- `{state: "idle" | "listening" | "thinking" | "speaking"}` drives the menu-bar icon and the pill.
- `{alert: {agent, text, id?}}` expands the pill and posts one macOS notification ("<agent> needs you"). Clicking it opens the panel. The same alert (same `id`, or same agent and text when there is none) notifies once until it is cleared, answered or expires, and not at all while the panel is open. Send `{alert: null}` to clear it. A real hold (not a tap) also clears it, and so does 2 minutes of nothing.

The app dispatches `coworker-ptt` (`{down, cancelled}`) and `coworker-ptt-key` (`{key}`) on `window`.

## Debugging

Launch args (`open -n Coworker.app --args ...`):

- `-coworkerURL <url>` points the app at a page for this launch only.
- `-debug 1` shows "Simulate talk key hold" in the menu. `-simulateAfter 5 -simulateSeconds 3` runs one hold on a timer.
- `-pillSnapshots /tmp/dir` walks idle, hover, hold and alert and saves each state's pixels as PNGs (no Screen Recording access needed; use `-coworkerURL about:blank` so the page does not drive the state).
- `-simulateAlertAfter 5` posts one fake alert on a timer; the menu has "Simulate alert" with `-debug 1`. Notifications need the app launched as `open build/Coworker.app`, not the raw binary.
- `-showPanel 1` opens the full panel at launch.
- `-probe 1` appends the page's mic track state (enabled or muted) and the pill state to `/tmp/coworker-probe.log`.

`macos/test/ptt-test.html` is a static page that posts states and an alert (`?demo=1` walks through them). `macos/test/post-fn.swift` posts real key events to the running app.
