# Terminal 1 for Chrome

Terminal 1 in Chrome, in two parts.

- **Popup (toolbar icon):** the board as a queue, most urgent first: needs approval → blocked → asks you → in progress → done. Allow, Deny or Stop a request in one click (it posts `req <id> allow|deny|stop`, the reply `hooks/coworker-hook.sh` waits for). Click a post to see that agent's thread and reply to it. The mic opens the side panel and starts talking.
- **Side panel:** the full Terminal 1 page (voice, spoken alerts, standup, "show me"), the same way the Mac app shows it. It keeps running while you switch tabs. **Alt+Shift+Space** starts or stops talking from any tab, and the toolbar badge shows when Terminal 1 is listening (●) or speaking (♪).

Both need the app running on this computer (`npm run dev`, default `http://localhost:3000`).

## Install

1. Start the app: `npm run dev` in this repo (see the main README for `.env.local`).
2. In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick this `extension/` folder.
3. A setup tab opens. Click **Allow microphone** once: Chrome can't ask inside a side panel.
4. Pin the icon (puzzle piece → pin next to Terminal 1).

The app address, repo, board issue and a compact layout are in the side panel's settings (gear icon). The talk shortcut can be changed at `chrome://extensions/shortcuts`.

## How it connects

| Piece | What it does |
|---|---|
| `popup.*` | The queue. Reads `GET /api/board/recent`, answers with `POST /api/tool/answer_request`, replies with `POST /api/tool/board_post`. |
| `relay.js` + `/ext/relay` | The popup's calls run from a hidden frame on the app's own origin, so the app's same-origin check and your sign-in cookie apply, exactly as for the Terminal 1 page. Only frames opened by this extension are served. |
| `sidepanel.*` | The Terminal 1 page in a frame, the offline screen, settings, and sign-in in a tab (GitHub's sign-in page refuses to load in a frame). |
| `bridge.js` | Gives the framed page the Mac app's bridge: talk events in (`coworker-ptt`), voice state out (`webkit.messageHandlers.coworker`). |
| `background.js` | The talk shortcut and the toolbar badge. |
| `welcome.*` | The one-time microphone grant. |

The extension only has access to `localhost` and `127.0.0.1`.
