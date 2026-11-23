---
version: 1
slug: "app-site-page-tsx"
primary_target: "app/(site)/page.tsx"
related_targets: ["app/(site)/pricing/page.tsx","app/(site)/download/page.tsx","app/(site)/docs/page.tsx","components/site/Stage.tsx"]
---

Scope: marketing site for Terminal 1 (/, /download, /pricing, /docs, /privacy, /terms). Mode: Persuade for / and /pricing; Read for /docs, /privacy, /terms; /download is Operate.
Audience: developers who run several coding agents (Claude Code, Codex, Cursor) and write all day. Action: download the free Mac app; upgrade to Pro for voice and dictation. Proof: the product shown working (labeled demo data); no invented customers, numbers or quotes. Constraints: inherit DESIGN.md (The Calling Desk) for these routes only; the app at /app is untouched.

## Direction contract

THESIS: Your work and your agents' work share one desk, split at a seam where the talk pill lives. Refuses the centered hero over a grid of feature cards.

OWN-WORLD: Wings navy ground. Your half is a lit page (page white, page-ink text) holding a real sentence; the agents' half is the navy board: round lamps, tape-colored agent names, fixed columns. The near-black talk pill with a live waveform straddles the seam. Amber appears only on the one agent waiting on you. Archivo at 87.5% width for headings; JetBrains Mono only for commands.

STORY: In seconds the visitor sees two things: dictation lands in whatever they are writing, and their agents ask them things that they answer by voice without switching windows. They believe it is calm (it speaks only when needed) and private (a local relay on their Mac). They download the free app, then pick Pro for voice.

FIRST VIEWPORT: A split stage under a slim nav (wordmark; Download, Pricing, Docs; Open web app). The stage is min(52vh, 440px), not 70vh: at 70vh the primary action falls below a 900px-tall first viewport. Left 55%: the lit page, a draft message typing. Right 45%: the board with three agents (Claude editing, Codex waiting in amber with its failing command, Cursor idle). The pill sits on the seam near the bottom. Below the stage, one left-aligned column: headline "Write anywhere. Answer your agents without leaving it.", one line of support, the primary action "Download for Mac" with "Free · macOS 13.3 or later" beside it; before the first release (public/releases.json latest null) the primary action is "Try the web app" with "Mac app coming soon", and install steps carry a note that they apply once the app ships. On phones the column comes before the stage so the action stays in the first viewport.

FORM: split-desk stage with a scripted, scroll-and-time-driven exchange (signature interaction: the waiting agent's question crosses the seam into the pill, the pill speaks it, the fn keycap goes down, "retry" is answered, the lamp returns to working, then the dictated sentence types into the page). One orchestrated loop, exponential ease-out, a static settled state under prefers-reduced-motion. Position 3 of 7 on my ordered list. seed:789d0f8ee93d4c51

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
