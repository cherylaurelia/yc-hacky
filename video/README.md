# Terminal 1 videos (Remotion)

The product is now called Terminal 1. The composition id `CoworkerDemo` and the file names `out/coworker-*.mp4` keep the old name so paths do not move. Two leftovers from the old name, both on purpose:

- The screenshots in `public/screens/` still show the old wordmark top left. `Screen` in `src/Launch.tsx` covers it with a patch in the page's own background colour. Delete the patch after retaking the screens with the new name.
- The board scene shows two real posts that say "Coworker" (the `[Cheryl's Coworker]` relay tag on issue 4, and "Coworker's spoken blocker alerts" in Eithan's Codex post on issue 1). They are shown as `[Cheryl's Terminal 1]` and `[Terminal 1]'s`. The posts on GitHub still say Coworker.

Two videos, one project. The app does not depend on anything here.

| Composition | What | Length | Output |
|---|---|---|---|
| `Launch` | Launch clip for the submission form and YouTube. Four real screens, one caption each, end card. | 22.5 s | `out/coworker-launch.mp4`, `out/poster.png` |
| `CoworkerDemo` | The narrated demo. Seven scenes, each as long as its ElevenLabs narration. | about 80 s | `out/coworker-demo.mp4` |

Both are 1920x1080 at 30 fps. Edit order, timing and captions in the array at the top of `src/Launch.tsx` (`SHOTS`) and `src/Demo.tsx` (`SCENES`).

## Preview and render

```
cd video
npm install
npm run studio        # live preview, pick Launch or CoworkerDemo
npm run render        # out/coworker-launch.mp4
npm run still         # out/poster.png (frame 300 of Launch)
npm run render:demo   # out/coworker-demo.mp4
npm run typecheck
```

Each render takes about 10 s (Launch) and 20 s (CoworkerDemo) on an M-series Mac. Fonts (Newsreader, Hanken Grotesk, JetBrains Mono) load from Google Fonts at render time, so you need a network.

## End card

Both videos end on the same card: "Coworker", "Your agents tap you on the shoulder.", a big "Try it" with the live URL and its QR code, and the GitHub link small underneath. `LIVE_URL` and `GITHUB` are the first lines of `src/Launch.tsx`; the QR code is drawn from `LIVE_URL` (npm `qrcode`, video/ only), so changing the URL changes the code. Check that a rendered video still scans:

```
ffmpeg -ss 21.5 -i out/coworker-launch.mp4 -frames:v 1 /tmp/end.png   # demo: -ss 79
node scripts/check-qr.mjs /tmp/end.png https://40984690-ad84-41e4-86fe-718bb67011bb.mtm.sh
```

## Retake the screens

`public/screens/` holds four real screenshots of the app (1400x900 at 1.5x). The app must be a production build, so the Next.js dev indicator is not in the shot. No paid keys are involved: the server runs with an empty environment, so voice, text to speech and tracing fail closed.

One command retakes all four. Run from the repo root:

```
npm ci && npm run build
video/scripts/serve.sh          # terminal 1: app on http://localhost:3800, only GITHUB_TOKEN, WRITE_REPOS and DEMO_REPOS
node video/scripts/capture.mjs  # terminal 2: writes video/public/screens/01..04
```

The same thing by hand, per screen. Alerts only show for posts that arrive after the page loads, so load first, then post.

1. `01-calm.png`. Open `http://localhost:3800/?repo=cherylaurelia/yc-hacky&board=4`, wait until "Your agents are working." shows and the first `/api/board/new` call has returned, wait 1 s, screenshot.
2. `02-approval.png`. With the page still open, post a copy of `scripts/fixtures/approval-post.md` to issue 4 with a new 6-hex request id (replace the old id everywhere, in the text and in the `<!-- coworker:{...} -->` block). That fixture is a real post from today's demo run (`[Eithan's Claude] needs approval`). Its context had no diff, so the script also sets `file` to `db/schema.sql` and `diff` to `scripts/fixtures/schema.diff`, the real `git diff` of the schema change that same run made. The card appears within 15 s (the poll interval). Screenshot.
3. `03-diff.png`. Click "Show me the change", wait for the diff to unfold, screenshot. Then delete the post you made.
4. `04-stuck.png`. Reload the page (so the first card is not queued behind it), post a copy of `scripts/fixtures/stuck-post.md` (real `[Aidan's Claude] stuck:` post, new request id), wait for the red card, screenshot, delete the post.

Delete a post with `gh api -X DELETE repos/cherylaurelia/yc-hacky/issues/comments/<id>`. Never click Allow, Deny or Stop: that writes an answer to the board.

The board is shared. If someone else posts during a take, the card shows "1 more waiting". `capture.mjs` notices and retries. `demo/reset.sh` deletes posts that name a demo repo, so run captures while no demo is being reset.

## What in the demo is real

- Narration: `public/narration/narr-01..07.mp3`, ElevenLabs, text in `public/narration/script.tsv`. Captions are that text. When you swap a file, put its length in `audioSeconds` in `SCENES` (`ffprobe -v error -show_entries format=duration -of csv=p=0 public/narration/narr-03.mp3`) and the cut re-times itself.
- Terminal panels (`APPROVED`, `STOPPED` in `src/Demo.tsx`): lines copied verbatim from live Claude Code sessions in the demo repos. Approval: lines 12-13 and 22-25 of the `terminal-approval-allowed` capture. Stuck: lines 28-35 of `terminal-stuck-stopped`. The line after "hook stopped Claude" is left out on purpose.
- Board scene: post text is verbatim from issue 1 (comments 7082407684, 7082420234) and issue 4 (7082045860, 7082047602, 7082054603). The voice names next to each agent are what `lib/voices.ts` assigns.
- Partner row: plain wordmarks, no logos.

## Not in the videos

- The "Listening" pill. It only appears with a live ElevenLabs session, which is a paid call. Not faked.
- A screenshot of pull request #5. The repo is private and a screenshot needs a signed-in browser. The board scene shows the `done: ... PR #5` post instead.
