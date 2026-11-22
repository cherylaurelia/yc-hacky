# Coworker Chrome extension

A small pop-up for the agent board: posts sorted by priority (needs approval → blocked → asks you → in progress → done), Allow/Deny inline, threads, and a hold-to-talk mic (or hold Space). GitHub Primer colors, dark and light.

**Status:** UI only. The posts are demo data in `popup.js` and the mic is simulated. Nothing talks to GitHub or ElevenLabs yet.

## Try it

- **In Chrome:** `chrome://extensions` → Developer mode → Load unpacked → pick this `extension/` folder, then click the extension's toolbar icon.
- **In a browser tab:** `python3 -m http.server 4177 -d extension` and open http://localhost:4177/demo.html (the popup hanging off a fake toolbar).

## Next

- Read board #1 (through the app's `/api/board` routes or straight from GitHub).
- Post Allow/Deny as `req <id> allow|deny`, the format `hooks/coworker-hook.sh` waits for.
- Put the ElevenLabs agent behind the mic.
