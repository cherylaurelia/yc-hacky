---
name: Terminal 1
description: Dictate anywhere and answer your coding agents out loud, on warm paper with ink, one deep green, and amber only for "waiting on you".
colors:
  paper: "#fdfcf6"
  card: "#f6f4ea"
  chip: "#efeddf"
  ink: "#1f1d18"
  soft: "#4f4b43"
  faint: "#6f6b61"
  rule: "#e2ddcd"
  line: "#e5e1d3"
  sheet: "#ffffff"
  sheet-chip: "#f3f1e7"
  sheet-dim: "#5c584f"
  sheet-rule: "#ece8dc"
  sheet-edge: "#d9d4c5"
  brand: "#0f4a3f"
  sage: "#e8edd2"
  wash-sage: "#edf1dc"
  wash-lavender: "#efe9fb"
  wash-ground: "#f8f7f0"
  band-dim: "#d4e0d6"
  band-faint: "#a9c1b3"
  pill-dim: "#d9d5c7"
  pill-faint: "#aaa596"
  standby: "#b7791f"
  standby-ink: "#8a5a12"
  stuck: "#c0492f"
  stop: "#a3382a"
  done: "#2e7d4f"
  add: "#2e6542"
  add-tint: "#e3ede0"
  stop-tint: "#f6e2da"
  voice-roger: "#2f6f6a"
  voice-sarah: "#a4473f"
  voice-charlie: "#5e6a2a"
  voice-alice: "#3d5f8a"
  voice-george: "#7a5a2e"
  voice-jessica: "#7a4f86"
  voice-roger-on-pill: "#8fd1c9"
  voice-sarah-on-pill: "#f2a89e"
  voice-charlie-on-pill: "#c9d38e"
  voice-alice-on-pill: "#a9c4ea"
  voice-jessica-on-pill: "#d2b2dc"
typography:
  display:
    fontFamily: "EB Garamond, ui-serif, Georgia, serif"
    fontSize: "72px"
    fontWeight: 450
    lineHeight: 1
    letterSpacing: "-0.03em"
  display-close:
    fontFamily: "EB Garamond, ui-serif, Georgia, serif"
    fontSize: "56px"
    fontWeight: 450
    lineHeight: 1.04
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "EB Garamond, ui-serif, Georgia, serif"
    fontSize: "44px"
    fontWeight: 450
    lineHeight: 1.04
    letterSpacing: "-0.025em"
  headline-card:
    fontFamily: "EB Garamond, ui-serif, Georgia, serif"
    fontSize: "2rem"
    fontWeight: 450
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title:
    fontFamily: "EB Garamond, ui-serif, Georgia, serif"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  wordmark-footer:
    fontFamily: "EB Garamond, ui-serif, Georgia, serif"
    fontSize: "clamp(88px, 19vw, 280px)"
    fontWeight: 450
    lineHeight: 0.78
    letterSpacing: "-0.04em"
  lede:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.6
  body:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
    fontFeature: "tnum"
  body-small:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15.5px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  caption:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  key: "5px"
  sm: "8px"
  cmd: "9px"
  btn: "10px"
  plate: "12px"
  lg: "14px"
  xl: "16px"
  wash: "28px"
  full: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "20px"
  lg: "32px"
  xl: "56px"
  section: "128px"
  wrap: "1180px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.btn}"
    height: "46px"
    padding: "0 20px"
  button-primary-hover:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.paper}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.btn}"
    height: "46px"
    padding: "0 18px"
  button-quiet-hover:
    backgroundColor: "{colors.card}"
  button-on-band:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.btn}"
    height: "46px"
    padding: "0 20px"
  button-on-band-hover:
    backgroundColor: "{colors.sage}"
  button-app:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.btn}"
    height: "48px"
    padding: "0 28px"
  button-stop:
    backgroundColor: "{colors.stop}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.btn}"
    height: "48px"
    padding: "0 28px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.btn}"
    height: "40px"
    padding: "0 16px"
  lit-sheet:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px 32px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "28px"
  command-well:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
    typography: "{typography.mono}"
    rounded: "{rounded.plate}"
    padding: "6px 12px"
  diff-well:
    backgroundColor: "{colors.card}"
    textColor: "{colors.sheet-dim}"
    typography: "{typography.mono}"
    rounded: "{rounded.btn}"
    padding: "8px 0"
  painting-mount:
    backgroundColor: "{colors.sheet}"
    padding: "10px"
  command-plate:
    backgroundColor: "{colors.chip}"
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.cmd}"
    padding: "12px 14px"
  talk-pill:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.full}"
    height: "48px"
    padding: "0 20px 0 10px"
  keycap:
    backgroundColor: "{colors.chip}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.key}"
    padding: "2px 8px"
  agent-row-waiting:
    backgroundColor: "{colors.chip}"
    textColor: "{colors.ink}"
    rounded: "{rounded.btn}"
    padding: "10px 12px"
  band-green:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.paper}"
    padding: "112px 0"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.soft}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  nav-link-hover:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
---

# Design System: Terminal 1

## Overview

**Creative North Star: "Someone Leaning Over Your Shoulder"**

You are writing, and someone leans in to ask a question. The whole product (the marketing site and the app at /app) lives on warm cream paper with near-black ink, like a sketchbook or letter-writing desk, not a dark dashboard. The one thing that needs you on a screen is lifted off that paper as a white sheet. Everything else stays flat and quiet: hairline rules, tinted wells, and generous space between sections.

Headings are set in a book serif at regular weight, usually with one phrase in italic. Everything you read or click is in a plain, friendly sans. Monospace appears only for machine text. Color is rationed. Ink does the work. One deep green paces the long scroll and carries focus. Amber means exactly one thing: an agent is waiting on you. A few hand-made marks give the page warmth: a dry-brush sage stroke behind the headline, the one painting mounted like a print on a white border, a soft sage-to-lavender wash behind the product demo, and the giant serif wordmark sinking off the footer.

The reference sites (Aristotle's editorial calm, Wispr Flow's dark talk pill and fn-key story, Willow's soft hero wash) inspired the mood. None of their tokens were copied; every value below comes from this build.

**Key Characteristics:**
- Warm paper ground, ink type, white lit sheet for the one thing that needs you.
- EB Garamond headings at weight 450 with one italic phrase; Figtree for everything else.
- One brand green (the single color band, focus, selection, primary hover); amber reserved for "waiting on you".
- A dark ink talk pill with waveform and fn keycap, the same on the site and in the app.
- Hand-made marks used once each: brush stroke, mounted painting, wash, footer wordmark.
- One 10px corner for every button, input and select; only the pill and small round marks are fully round.
- Shadows only on the lit sheet, the pill and the painting mount.

## Colors

A warm, low-chroma paper-and-ink palette with one deep green and a small set of state and voice colors.

### Primary
- **Ink** (ink): body text, headings, the primary button, the command well on a lit sheet, and the talk pill. In this system ink, not a hue, is the color of action.
- **Writing-Desk Green** (brand): the one color band on the page (privacy), focus rings, the text caret, selection tint (18% mix), and the hover state of the primary button. It never fills cards or decorates.

### Secondary
- **Dry Sage** (sage): the brush stroke behind the hero headline (painted at 45 to 75% opacity) and the hover of the paper button inside the green band.
- **Wash fields** (wash-sage, wash-lavender on wash-ground): the two radial fields behind the product demo. Used only in the wash.

### State
- **Standby Amber** (standby): the filled lamp and other non-text marks for an agent waiting on you. **Standby Ink** (standby-ink) is the amber used for text ("waiting on you · 0:21").
- **Stuck** (stuck): the filled lamp of an agent in a failing loop. **Stop** (stop) is its text and button color, and is also the deleted-line ink in diffs.
- **Done** (done): the filled lamp when an agent finishes.
- **Add / Delete** (add on add-tint, stop on stop-tint): diff rows.

### Voices
One mapping across the site and the app, keyed by the voice an agent speaks in (lib/voices assigns the voice), so a poster keeps one color everywhere: Roger teal, Sarah brick, Charlie olive, Alice slate blue, George umber, Jessica plum. The demo's agents follow it (Sam's Claude is Jessica plum, Sam's Codex is Charlie olive, Sam's Cursor is Sarah brick). These earthy colors are for names and avatars on paper or a sheet; avatars set a white initial on the voice color. Only inside the dark pill do voices switch to their lighter **on-pill** variants (voice-*-on-pill). A dictated span in the demo is highlighted with Alice at a 22% mix.

### Neutral
- **Cream Paper** (paper): the page ground everywhere.
- **Card** (card): a raised surface on paper: the agent board, free and team plan cells, nav hover, quiet button hover.
- **Chip / Well** (chip): a well inside a card: command plates, keycaps, the highlighted waiting row, app chips. On a lit sheet the well is sheet-chip.
- **Soft** (soft) and **Faint** (faint): secondary text and tertiary text (captions, sample-data labels, notes). On a white sheet, secondary text is sheet-dim.
- **Rule** (rule) / **Line** (line): hairlines on the site and in the app respectively; sheet-rule and sheet-edge are the hairline and button outline on white.
- **Lit Sheet White** (sheet): the one sheet per screen that needs you.
- **Band and pill text** (band-dim, band-faint, pill-dim, pill-faint): secondary and tertiary text after the tokens flip to paper inside the green band or the pill.

### Named Rules
**The One Band Rule.** A page has exactly one color band, and it is Writing-Desk Green. Green otherwise appears only as focus, caret, selection and the primary hover. It is never a card fill, an icon tint or a text accent.

**The Amber Means You Rule.** Amber is used only for an agent waiting on you. Never use it for warnings, highlights, pricing or decoration. Amber text uses standby-ink; the brighter standby is for lamps and dots only.

**The Tokens Flip Rule.** Inside the green band or the pill, text tokens flip to paper (text, dim, faint, rule, voices). Components are not restyled one by one; they inherit from the surface.

**The Voice Is the Color Rule.** An agent's color comes from its voice, through one mapping shared by the site and the app. Lighter variants exist only inside the dark pill.

## Typography

**Display Font:** EB Garamond (normal and italic), with ui-serif and Georgia as fallbacks
**Body Font:** Figtree, with ui-sans-serif and system-ui as fallbacks
**Mono Font:** JetBrains Mono, with ui-monospace as a fallback

**Character:** A literary serif at book weight sits over a warm, round sans. The serif carries the voice and the sans carries the work.

### Hierarchy
- **Display** (450, 72px, 46px on mobile, line height 1): the hero headline, balanced, max about 13ch.
- **Display close** (450, 56px, 40px on mobile): the closing call to action, set on paper.
- **Headline** (450, 44px, 34px on mobile, line height 1.04): section headings, 12 to 20ch wide.
- **Headline card** (450, 2rem in the app, 28px in the landing's sample alert): the serif sentence on an alert card.
- **Title** (500, 20px): step and FAQ headings.
- **Lede** (Figtree 400, 19px, 17px on mobile, line height 1.6): the one support paragraph under a headline, about 46ch.
- **Body** (Figtree 400, 17px, line height 1.6, tabular numbers): paragraphs at 46 to 62ch. Body small (15.5px) for column and plan copy.
- **Label** (Figtree 600, 13px): sheet headers, agent names, state words.
- **Caption** (Figtree 400, 12.5px, faint): painting credit and sample-data labels.
- **Mono** (JetBrains Mono 14px, 12.5 to 13px in diffs): commands, file paths, test output and diffs only.

### Named Rules
**The One Italic Phrase Rule.** A serif heading may set one phrase in italic (`<em>`) for the emphasis a voice would give it ("*Answer your agents*", "*You answer out loud.*"). Never more than one per heading, and many headings carry none.

**The Machine Text Rule.** Mono is only for text a machine reads or prints: commands, file paths, terminal output, diffs. Labels, numbers, nav and buttons stay in Figtree.

**The Book Weight Rule.** Serif headings stay at weight 450 (500 for small titles). Never bold the serif.

## Layout

The page content sits in a 1180px wrap with 20px gutters (32px from the sm breakpoint). Sections are separated by large, even gaps (128px; 144px before the closing call to action) instead of dividers. The hero is an editorial split (copy at 1.05fr, painting at 1fr) that stacks on mobile. Text-plus-proof sections use a 1fr / 1.1fr split. Lists are ruled rows (a top and bottom hairline per row), not card grids. Three-up content (privacy points, install steps) uses a plain three-column grid, each item headed by a hairline or a numbered keycap.

The product stage is a split desk: the lit document at 55% and the agent board at 45%, with the pill floating at the seam near the bottom. It stacks on mobile. The wash frame is a wider 1260px rounded field so the stage reads as the thing to look at. The app centers one lit card with up to two stack layers behind it, and the pill docked below.

## Elevation & Depth

The system is flat. Depth comes from the paper-card-chip tonal steps and from one white sheet. Only three things cast shadows.

### Shadow Vocabulary
- **Lit sheet** (`0 1px 2px rgb(31 29 24 / 0.06), 0 24px 48px -24px rgb(31 29 24 / 0.28)`): the one sheet that needs you.
- **Pill** (`0 12px 28px -12px rgb(31 29 24 / 0.55)`; live: `0 16px 34px -12px rgb(31 29 24 / 0.6)` with scale 1.04): the talk pill.
- **Painting mount** (`0 1px 2px rgb(31 29 24 / 0.08), 0 24px 48px -28px rgb(31 29 24 / 0.35)` on a 10px white border): the hero painting, hung like a print.
- Hairline rings (`inset 0 0 0 1px` in rule or sheet-edge) outline quiet buttons, the web-app nav button, command plates and keycaps. These are borders, not elevation.

### Named Rules
**The One Lifted Sheet Rule.** Only one lit sheet per view: the thing that needs you (the draft in the demo, the sample alert, the Pro plan, the app's current card). Queued cards behind it are flat stack layers with no shadow. Boards, rows and cards never get shadows.

## Shapes

Gentle, consistent rounding. One button radius (btn, 10px, the `--radius-btn` custom property) is used by every button, input and select on the site and in the app, and by board rows and diff wells. Keycaps are 5px, nav links 8px, command wells 9px (12px for the inline command chip on an alert), sheets and cards 14px, app panels 16px, the wash frame 28px. Only the talk pill, avatars, status chips, radio dots, lamps and meter bars are fully round. The painting is a plain rectangle on a white mount. The brush stroke (public/site/brush.svg, generated by scripts/site-art.py) is the one irregular shape: a loose, multi-stroke sage smear.

## Components

### Buttons
Ink and confident, with one hover color.
- **Shape:** one softly rounded corner (btn) on the site and in the app. Never pill-shaped.
- **Primary:** ink fill with paper text, Figtree 600, 46px tall. It turns Writing-Desk Green on hover and drops 1px when pressed. Optional leading download icon (inline SVG, 16px).
- **Quiet:** transparent with an inset hairline in sheet-edge, ink text. It fills with card on hover. Disabled shows faint text and no pointer.
- **In the green band:** flips to paper fill with ink text and hovers to sage.
- **App:** the same btn corner, 48px tall (40px when embedded): an ink primary (Allow, Done) with a quiet transparent partner (Deny, Let it run) that fills with paper on hover. Stuck requests swap the primary for a stop-red "Stop it". Press scales to 0.98.
- **Inputs and selects:** paper fill, line hairline, btn corner, 40px tall.

### Lit Sheet
White, 14px corners, the lit-sheet shadow. In the demo stage it holds the draft being written, headed by a label row over a sheet-rule hairline.

### Alert Card
The app's request card, and the landing's sample approval, which uses the same anatomy so the page shows the real product. On a lit sheet, top to bottom: the poster's avatar (round, white initial on its voice color) and the time in sheet-dim; one serif sentence saying what the agent wants ("Sam's Claude wants to run a command."); the command in a dark ink plate with mono text; a "Show me the change" underlined link beside the file path in mono; the diff in a card-colored well with add and stop tinted rows; then Allow (ink, btn corner) and a quiet Deny. Queued alerts sit behind it as flat stack layers.

### Talk Pill
The dark ink pill, fully round, 44 to 48px tall. From left: an fn keycap (translucent paper fill with a translucent ring, pressing down 1px when held), a waveform of 3px bars (2.5px in the app's VoiceMeter) in paper, then one line of text: "hold to talk", the speaking agent's name in its on-pill voice color plus its words, or the sent reply. It lifts and scales slightly while the mic or a voice is live.

### Lamps
10px status dots. Working is a hollow ring in faint; idle is a hollow ring in rule; waiting, done and stuck are filled with standby, done and stuck. Color changes ease over 300ms. A waiting agent's whole row also sits on a chip-colored well.

### Agent Board
A card-colored panel headed "Your agents" with a count ("1 waiting" in amber). Each row has a lamp, the agent's name in its voice color (600), a state word, and a one-line summary in soft. Test output appears in a chip command plate with a hairline ring, failures in stop.

### Bands
- **Green band:** full-bleed brand fill, 80 to 112px vertical padding, paper text with band-dim and band-faint for secondary text and paper-at-18% hairlines, and the primary button inverted to paper. Used once, for the privacy section. It is the only color band; the closing call to action sits on plain paper with the ink primary button.

### Wash
The product demo's frame: two radial fields (sage at top left, lavender at bottom right) on a pale ground, rounded 28px. Only the stage sits on it.

### Hand-made Marks
- **Brush stroke:** behind the hero headline only, extending past the text on every side.
- **Painting mount:** the one painting (ter Borch, *Curiosity*, public domain) on a 10px white border with the mount shadow, like a hung print, with a right-aligned caption credit.
- **Footer wordmark:** "Terminal 1" in EB Garamond at clamp(88px, 19vw, 280px), line height 0.78, in chip on paper, clipped so it sinks off the bottom of the page. Decorative and aria-hidden.

### Navigation
A slim 80px header: the wordmark (an ink rounded square with paper waveform bars, then "Terminal 1" in the serif) on the left; Download, Pricing and Docs as soft 15px links that fill with card on hover; then "Open web app" as a link outlined with a rule hairline (8px corners, hidden on mobile). The footer repeats the links in soft above the sinking wordmark.

### Command Plates
Two treatments, both mono: an **ink plate** (ink fill, white text) for the command on a lit sheet or alert, and a **chip plate** (chip fill, ink text, rule ring, 9px corners, 12 by 14px padding) on paper or a card, as in install docs and test output.

### Pre-release Download Fallback
Before the first release, every download button becomes the primary "Try the web app" link with "Mac app coming soon" in faint beside it, the download note disappears, and install steps get a faint note that they apply once the app ships. Pricing shows a quiet "Checkout opens soon" plate in place of unconfigured checkout links. Never show a dead download button.

### Sample-data Labels
Every staged exchange, dictation list and reply list carries a faint 12.5px caption beneath it ("Sample exchange.", "Sample dictation.", "Sample replies.", "Demo with sample agents, not a recording.").

## Do's and Don'ts

### Do:
- **Do** keep the ground paper (#fdfcf6) and lift only the one thing that needs you onto a white sheet with the lit-sheet shadow.
- **Do** set headings in EB Garamond at 450, with at most one italic phrase per heading.
- **Do** use the ink primary button with the green hover, and invert it to paper inside the green band.
- **Do** give every button, input and select the one btn corner (10px).
- **Do** flip text tokens on dark surfaces (the green band, the pill) instead of restyling each child, and use the on-pill voice variants only inside the pill.
- **Do** color an agent by its voice, the same on the site and in the app.
- **Do** draw any sample approval with the app alert's anatomy.
- **Do** use standby-ink (#8a5a12) for any amber text and keep bright standby for lamps.
- **Do** label every staged demo and example with a faint "Sample ..." caption.
- **Do** fall back to "Try the web app" plus "Mac app coming soon" when there is no release.
- **Do** separate sections with space (128px) and list items with hairline rules.

### Don't:
- **Don't** use amber for anything except an agent waiting on you.
- **Don't** add a second color band (ink or otherwise), or use green as a card fill, icon tint or text accent.
- **Don't** make buttons pill-shaped; full rounding belongs to the talk pill, avatars, status chips and small marks.
- **Don't** put shadows on boards, rows, cards or queued stack layers.
- **Don't** use mono for labels, numbers, navigation or buttons.
- **Don't** bold the serif or stack several italic phrases in one heading.
- **Don't** reuse the brush stroke, painting mount or wash as general decoration; each marks one place.
- **Don't** bring back the navy "Calling Desk" palette or a dark dashboard ground.
- **Don't** add eyebrows or kickers above headings, or invented customers, numbers or quotes.
