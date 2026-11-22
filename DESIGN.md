---
name: Coworker
description: A voice coworker for a team's coding agents, laid out like a stage manager's calling desk.
colors:
  wings: "oklch(0.205 0.045 264)"
  wings-raise: "oklch(0.24 0.05 264)"
  wings-hi: "oklch(0.285 0.058 264)"
  rule: "oklch(0.335 0.05 264)"
  text: "oklch(0.97 0.008 264)"
  dim: "oklch(0.8 0.03 264)"
  faint: "oklch(0.7 0.035 264)"
  page: "oklch(0.985 0.004 264)"
  page-ink: "oklch(0.21 0.035 264)"
  page-dim: "oklch(0.46 0.03 264)"
  page-rule: "oklch(0.905 0.01 264)"
  page-well: "oklch(0.955 0.008 264)"
  standby: "oklch(0.84 0.155 80)"
  stuck: "oklch(0.68 0.2 27)"
  done: "oklch(0.8 0.15 155)"
  stuck-text: "oklch(0.76 0.16 27)"
  standby-ink: "oklch(0.52 0.13 70)"
  page-edge: "oklch(0.82 0.015 264)"
  stop-edge: "oklch(0.86 0.05 27)"
  tape-roger: "oklch(0.83 0.12 192)"
  tape-sarah: "oklch(0.76 0.17 356)"
  tape-charlie: "oklch(0.89 0.17 125)"
  tape-alice: "oklch(0.8 0.11 238)"
  tape-george: "oklch(0.95 0.015 264)"
  tape-jessica: "oklch(0.76 0.14 296)"
  add-bg: "oklch(0.95 0.05 152)"
  add-ink: "oklch(0.42 0.12 152)"
  del-bg: "oklch(0.955 0.035 27)"
  del-ink: "oklch(0.48 0.16 27)"
  pill: "oklch(0.13 0.025 264)"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "44px"
    fontWeight: 650
    lineHeight: 1.05
    letterSpacing: "-0.025em"
    fontVariation: "'wdth' 87.5"
  headline:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 87.5"
  title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16.5px"
    fontWeight: 400
    lineHeight: 1.45
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    letterSpacing: "0.01em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "14px"
    fontWeight: 400
rounded:
  tape: "1.5px"
  key: "5px"
  sm: "8px"
  cmd: "9px"
  md: "10px"
  lg: "12px"
  page: "14px"
  full: "999px"
spacing:
  xs: "8px"
  sm: "14px"
  md: "20px"
  lg: "32px"
  xl: "40px"
components:
  button-go:
    backgroundColor: "{colors.page-ink}"
    textColor: "{colors.page}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 16px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.page-ink}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 16px"
  button-stop:
    backgroundColor: "transparent"
    textColor: "{colors.del-ink}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 16px"
  button-dark:
    backgroundColor: "{colors.wings-raise}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 14px"
  lit-page:
    backgroundColor: "{colors.page}"
    textColor: "{colors.page-ink}"
    rounded: "{rounded.page}"
    padding: "20px 22px 18px"
  command:
    backgroundColor: "{colors.page-ink}"
    textColor: "{colors.page}"
    typography: "{typography.mono}"
    rounded: "{rounded.cmd}"
    padding: "12px 14px"
  board:
    backgroundColor: "{colors.wings-raise}"
    textColor: "{colors.text}"
    rounded: "{rounded.page}"
    padding: "14px 20px"
  talk-pill:
    backgroundColor: "{colors.pill}"
    textColor: "{colors.text}"
    rounded: "{rounded.full}"
    height: "48px"
    padding: "0 18px 0 16px"
  keycap:
    backgroundColor: "oklch(1 0 0 / 0.08)"
    textColor: "{colors.text}"
    rounded: "{rounded.key}"
    height: "20px"
    padding: "0 6px"
---

# Design System: Coworker

## Overview

**Creative North Star: "The Calling Desk"**

The room is backstage: a running-light navy ground where everything is low and quiet, and one lit white page carries the single decision in front of you. The person is the stage manager; agents are crew standing by. State is shown by cue lamps, identity by colored spike tape, and the eye goes to the light, never to a field of equal cards.

Density is tight and tabular: fixed columns, numbers in tabular figures, rows ranked by how long someone has waited. Colour is scarce on the navy and reserved for meaning (lamps, tape, the one amber count). The page is the only bright, high-contrast surface on a screen. The same system scales down unchanged to the 360x520 Mac panel.

**Key Characteristics:**
- Dark navy wings, one lit page per screen.
- Round lamps mean state; rectangular tape means who.
- Amber is reserved for "waiting on you".
- Archivo throughout, headings narrowed to 87.5% width; JetBrains Mono only for commands and diffs.
- A small black talk pill, bottom center, is the voice surface.

## Colors

A cool navy ground with one near-white page and a small set of fully saturated signal colors, all on hue 264 except the signals.

### Primary
- **Prompt-Book White** (page): the lit page that holds the current decision. One per screen.
- **Page Ink** (page-ink): text on the page, and the fill of the primary Allow button and the command plate (the reversed plate).

### Secondary
- **Standby Amber** (standby): lamp and count for an agent waiting on you. Pulses gently (2.4s). On the lit page its text form darkens to stay legible.
- **Stuck Red** (stuck): lamp for an agent looping or failing; also the recording dot.
- **Done Green** (done): lamp for finished agents and the "watching" dot.

### Tertiary
- **Spike Tape** (tape-roger, tape-sarah, tape-charlie, tape-alice, tape-george, tape-jessica): one fluorescent color per voice. Worn by the tape chip, the pill waveform, transcript names, the live caret and standup strip segments. Alice blue doubles as the focus ring and selection tint.
- **Diff** (add-bg/add-ink, del-bg/del-ink): additions and deletions on the lit page only; del-ink also colors the Stop button.

### Neutral
- **Wings** (wings): page background, board header row.
- **Wings Raise / Wings High** (wings-raise, wings-hi): board body and dark buttons; hover and focused row.
- **Rule** (rule): every hairline and dashed queue border on navy.
- **Text / Dim / Faint** (text, dim, faint): three steps of ink on navy.
- **Page Dim / Page Rule / Page Well** (page-dim, page-rule, page-well): secondary ink, hairlines and inset wells on the lit page.
- **Pill Black** (pill): the talk pill only.

### Named Rules
**The Standby Rule.** Amber means "an agent is waiting on you" and nothing else. No amber for warnings, highlights, brand or hover.

**The Lamp and Tape Rule.** State is a round lamp (10px, hollow ring when working, filled when standby, stuck or done). Identity is a rectangular tape chip (14x9px, slightly skewed). Never swap the shapes.

**The One Light Rule.** Only one lit page per screen. Everything else stays on the navy.

## Typography

**Display Font:** Archivo (variable, wdth 62-125, wght 400-700), with ui-sans-serif, system-ui
**Body Font:** Archivo
**Label/Mono Font:** JetBrains Mono (400-600), for commands and diffs only

**Character:** A sturdy grotesk narrowed for headings, like a cue sheet header; mono appears only where the agent's literal words are shown.

### Hierarchy
- **Display** (650, 44px, 1.05, -0.025em, width 87.5%): the screen's one headline, e.g. how many agents are waiting. Balanced wrap.
- **Headline** (650, 24px, 1.15, -0.02em, width 87.5%): the question on the lit page. The wordmark (700, 16px) and panel heading (17px) use the same 87.5% width.
- **Title** (400, 16.5px, 1.45): transcript lines, max 62ch.
- **Body** (400, 15px, 1.45, tabular figures): default; row messages at 14px, page explanation at 14.5px, max 60-75ch.
- **Label** (600, 13px, 0.01em, sentence case): section headings in dim ink, name labels, buttons at 14.5px. Column heads at 12px, 500, faint.
- **Mono** (14px command, 12.5px diff at 1.6 line height): commands and diffs only.

### Named Rules
**The Narrow Heading Rule.** Every heading sets `font-stretch: 87.5%` on Archivo; body copy stays at normal width.

**The Mono Is Evidence Rule.** JetBrains Mono appears only for commands, paths and diffs: things an agent literally wrote or will run.

## Layout

Main screen: a 60px top bar (wordmark, repo, standup, account), then a two-column grid, flexible left and a fixed 540px right column, 40px gutter, 32px side padding, 36px top and 104px bottom padding to clear the pill, max width 1440px. Left holds the headline, the agent board and the waiting line; right holds the lit page and the transcript, which fades in from the top.

The board uses fixed columns (196 / 148 / flexible / 72 / 64px), 20px column gap, rows 14px x 20px, ranked by wait, with time and dollar columns right-aligned. The waiting line is a stack of 8px-gapped rows with dashed borders.

The Mac panel (360x520) stacks the lit page, a compact 38px-row agent list, the latest caption and a full-width pill, with 12px padding and 10px gaps. Spacing runs on 8 / 14 / 20 / 32 / 40px steps.

## Elevation & Depth

Flat navy surfaces, separated by tone (wings, raise, high) and 1px rules. Only two things lift: the lit page and the talk pill, both with deep navy-tinted shadows, so light reads as the only thing above the stage.

### Shadow Vocabulary
- **Page lift** (`box-shadow: 0 1px 0 oklch(1 0 0 / 0.6) inset, 0 18px 40px -12px oklch(0.08 0.04 264 / 0.7), 0 2px 6px oklch(0.08 0.04 264 / 0.35)`): the lit page.
- **Pill float** (`box-shadow: 0 14px 34px -10px oklch(0.05 0.03 264 / 0.8), 0 2px 6px oklch(0.05 0.03 264 / 0.5)`): the talk pill.
- **Keycap** (`box-shadow: inset 0 -1px 0 oklch(1 0 0 / 0.08), 0 0 0 1px oklch(1 0 0 / 0.14)`): key hints; on the page, a page-rule version.
- **Focused row** (`box-shadow: inset 0 0 0 1px oklch(0.45 0.06 264)`): the board row whose request is on the page.

### Named Rules
**The Only Light Lifts Rule.** Board, rows and buttons on navy never carry drop shadows.

## Shapes

Soft rectangles: 14px on the page and board, 12px on queue rows and panel containers, 10px buttons, 9px command and diff plates, 8px small controls, 5px keycaps. Full rounds are reserved for lamps, the account disc and the talk pill. Tape chips are the one deliberately rough shape: 1.5px corners and a slight skewed clip.

## Components

### Buttons
- **Shape:** gently rounded (10px), 40px tall, 16px sides, 600 weight, 14.5px; background and border ease over 160ms.
- **Go (Allow):** page-ink fill with page text; hover lightens toward navy.
- **Quiet (Deny):** transparent with a light gray border on the page; hover fills page-well.
- **Stop:** transparent, del-ink text, pale red border; hover fills del-bg.
- **Dark:** on navy, wings-raise with a rule border, 36px tall; hover goes to wings-high.
- **Focus:** 2px tape-alice outline, 2px offset; inside the page the outline turns page-ink.

### Agent Board
- Bordered navy table (wings-raise, rule hairlines, 14px corners). Each row: tape and name with voice beneath, lamp and state, two-line clamped message, wait time, cost. Hot wait and cost go bold; stuck cost turns red. Hover and the focused row use wings-high.

### Lit Page
- Meta line (who, state, wait), narrow headline question, dim explanation, the command plate, an optional diff behind a "Show me" toggle, then Allow / Deny / Stop and a "say" hint with keycaps and quoted voice words.

### Command and Diff
- **Command:** a reversed page-ink plate, mono 14px, 9px corners, prompt glyph in tape-alice, cwd right-aligned.
- **Diff:** page-rule bordered, 9px corners, file header in page-well, line-number gutter, green and red line fills.

### Talk Pill
- Black pill (48px, fully round) floating bottom center. Shows a key hint when idle, a waveform in the speaker's tape color when speaking or listening, and dots when thinking. Width eases over 260ms.

### Tape, Lamp, Keycap, Standup Strip
- Tape chip 14x9px; lamp 10px (8px in the panel); keycap 20px tall, 11.5px bold; standup strip 64x6px, 2px gaps, one segment per voice in its tape color.

## Do's and Don'ts

### Do:
- **Do** keep standby amber for "waiting on you" alone, on the lamp, the waiting count and the waiting state label.
- **Do** give every agent voice its tape color everywhere it appears: chip, waveform, transcript name, standup segment.
- **Do** set headings in Archivo at 87.5% width and use JetBrains Mono only for commands and diffs.
- **Do** rank agent rows by wait and keep columns fixed so state changes in place.
- **Do** keep exactly one lit page per screen, with the command as its reversed plate.
- **Do** honor reduced motion: the waveform, thinking dots and standby pulse stop.

### Don't:
- **Don't** use amber for warnings, emphasis, hover or branding.
- **Don't** make tape chips round or lamps rectangular.
- **Don't** lay agents out as a grid of equal cards, and don't make a giant mic button; voice lives in the small pill.
- **Don't** put drop shadows on navy surfaces; only the page and pill lift.
- **Don't** use mono for labels, numbers or UI chrome.
