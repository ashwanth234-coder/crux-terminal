---
name: Crux
description: Omnichain execution protocol; a void-black instrument that runs on a 60-second batch clock.
colors:
  acid: "#d4f933"
  acid-deep: "#a9c81f"
  void: "#050505"
  void-2: "#0a0a0a"
  panel: "#0c0d0f"
  panel-2: "#111215"
  line: "#1e2024"
  line-2: "#2a2d33"
  chrome: "#e0e2ec"
  bright: "#f1f2f6"
  steel: "#7b808a"
  muted: "#8a8f98"
  dim: "#5b6069"
  up: "#b6e83a"
  down: "#ff6b5b"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, sans-serif"
    fontSize: "clamp(2.25rem, 5.9vw, 5.6rem)"
    fontWeight: 700
    lineHeight: 0.92
    letterSpacing: "-0.04em"
    fontVariation: "'wdth' 122"
  headline:
    fontFamily: "Archivo, ui-sans-serif, sans-serif"
    fontSize: "clamp(2.2rem, 3.7vw, 3.8rem)"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "-0.04em"
    fontVariation: "'wdth' 108"
  title:
    fontFamily: "Archivo, ui-sans-serif, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-0.03em"
    fontVariation: "'wdth' 108"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  numeric:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "'tnum' 1"
  numeric-instrument:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: 1
    fontFeature: "'tnum' 1"
rounded:
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  pill: "999px"
spacing:
  gutter-mobile: "16px"
  gutter-tablet: "32px"
  gutter-desktop: "48px"
  header: "72px"
  section-y: "96px"
  section-y-lg: "128px"
  container: "1440px"
components:
  button-primary:
    backgroundColor: "{colors.acid}"
    textColor: "{colors.void}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "#e2ff5c"
    textColor: "{colors.void}"
  button-primary-sm:
    backgroundColor: "{colors.acid}"
    textColor: "{colors.void}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "36px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.chrome}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "48px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "36px"
  batch-instrument:
    backgroundColor: "{colors.void}"
    textColor: "{colors.chrome}"
    rounded: "{rounded.xl}"
    padding: "12px 16px"
  terminal-card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.chrome}"
    rounded: "{rounded.2xl}"
  input-field:
    backgroundColor: "transparent"
    textColor: "{colors.chrome}"
    typography: "{typography.numeric}"
    rounded: "{rounded.lg}"
    padding: "10px 12px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "4px 8px"
---

# Design System: Crux

## Overview

**Creative North Star: "The Clearing Room"**

Crux is a dark trading floor seen through one instrument. Everything sits on void black, divided by hairlines rather than boxes, and the page keeps time on the protocol's own 60-second batch clock: a heartbeat line under the nav fills across each window, a batch instrument counts down, and a simulated intent tape scrolls fills. When a batch clears, every clock-bound surface flares acid together for one second, then falls quiet. That single synchronized beat is the system's signature; the rest of the page stays restrained so it can land.

Lettering is titanium chrome in solid values, never gradient. Emphasis comes from two tones of the same chrome (bright for the claim, steel for its counterweight line) and from Archivo's width axis: headlines are set extended, so the voice reads engineered and wide rather than loud. Numbers are the only thing in JetBrains Mono, which makes every price, count, address and countdown read as data at a glance.

Depth is cinematic and physical, not decorative: chrome WebGL objects lit by a procedural softbox studio, sitting in radial key-light falloffs that bleed off-canvas. Interface surfaces stay nearly flat, layered by tone and hairline. Density is low in marketing sections and high inside the terminal card, where the same tokens compress into an app.

**Key Characteristics:**
- Void black field, hairline structure (#1e2024 / #2a2d33), no card grids or stat tiles.
- Acid lime is a signal, not a palette: actions, live markers, and the clearing pulse.
- Two-tone chrome headlines (bright over steel) at extended width.
- Mono strictly for numerals; all words in Archivo.
- One synchronized clearing beat across header, instrument, tape and 3D.
- Chrome 3D under procedural studio light; everything live-looking is labelled simulated.

## Colors

A near-monochrome void-and-chrome palette with one electric accent held in reserve.

### Primary
- **Acid Lime** (acid): the primary action fill (Launch App, Explore, Launch the app), the clearing pulse, the heartbeat fill line, live-status dots, the active wayfinding numeral, BUY side on the tape, text selection, caret and focus ring. Also an accent Lightformer ring in the 3D studio so chrome objects catch a lime glint.
- **Pressed Acid** (acid-deep): darker acid reserved for depressed or secondary acid states; hover goes lighter (#e2ff5c), never darker.

### Neutral
- **Void** (void): page and section background, the color text sits on inside acid buttons. Also the browser theme color.
- **Void Raised** (void-2), **Panel** (panel), **Panel Raised** (panel-2): tonal steps for terminal surfaces; panel carries a faint top sheen (white 3.5% to 0 over 40%), panel-2 backs segmented controls.
- **Hairline** (line): the default divider: section top borders, header baseline, tape borders, internal card splits.
- **Hairline Strong** (line-2): interactive outlines (outline buttons, icon buttons, chips, modal frame) and resting node rings.
- **Titanium Chrome** (chrome): body text color; used at 55-85% opacity for supporting copy (subcopy at 65-70%).
- **Bright Chrome** (bright): the first, claiming line of every headline and hero figures.
- **Steel** (steel): the second, answering line of a two-line headline.
- **Muted** (muted): secondary labels, captions, ghost button text.
- **Dim** (dim): tertiary metadata (wallet stubs, timings, inactive rail steps, copyright).

### Semantic
- **Up** (up) and **Down** (down): price change and validation only. Down marks SELL on the tape and over-budget amounts.

### Named Rules
**The Signal Not Surface Rule.** Acid never fills a panel, section or decorative shape. It appears as a primary button fill, a 1-6px live marker, a hairline, a glow, or a single active numeral. If acid covers more than a button's worth of area on a screen, something is wrong.

**The One Beat Rule.** The clearing second (clock.left <= 1) is one synchronized moment: header heartbeat glows, batch instrument border goes acid/70 with an acid shadow, tape border goes acid/50 and its label reads "Batch clearing", the hero knot filament and monolith beam flare. New clock-bound surfaces join this beat; they never pulse on their own schedule.

**The Solid Chrome Rule.** Lettering is always a solid value. Emphasis is bright vs steel, never gradient text.

## Typography

**Display Font:** Archivo variable with the width axis (fallback ui-sans-serif, sans-serif)
**Body Font:** Archivo (fallback ui-sans-serif, system-ui)
**Numeric Font:** JetBrains Mono, tabular figures (fallback ui-monospace, SFMono-Regular)

**Character:** An extended grotesque that reads as machined titanium, paired with a monospace that only ever carries numbers, so data and language never blur.

### Hierarchy
- **Display** (700, clamp(2.25rem, 5.9vw, 5.6rem) in the hero; clamp(2.6rem, 5vw, 5.2rem) for token and borderless; line-height 0.92-0.95, tracking -0.04em, width 122%): hero, token and borderless headlines. Balanced wrap, lines revealed upward from a clipped mask.
- **Headline** (700, clamp(2.2rem, 3.7vw, 3.8rem), line-height 0.95, width 108%): mechanics h3 and Experience h2, narrowed so their forced two-line breaks hold in a 5/12 column.
- **Title** (600, 22-24px, line-height 1.02, tracking -0.03em, width 108%): modal titles, mobile nav links.
- **Body** (400, 15px / 16px hero, line-height 1.625, max 26-29rem): section copy in chrome at 65-70%.
- **Label** (400, 11-13px): nav links (13px chrome/70), captions (12px muted), instrument labels (11px muted). Sentence case.
- **Numeric** (JetBrains Mono, tabular): 11px on the tape and wayfinding numerals, 22px in the trade amount field, 24px for the batch countdown, 56px light for the Experience equation figures.

### Named Rules
**The Numbers Only Rule.** JetBrains Mono carries counts, prices, quantities, addresses, chain-agnostic tickers in data rows, and countdowns. Every word, including labels beside those numbers, is Archivo.

**The Two-Tone Headline Rule.** Multi-line headlines put the claim in bright and the answer in steel ("One balance." / "Every chain."). One break, two values, no third tone.

**The Width Rule.** Headline width is a system choice: 122% for statement headlines, 108% where a two-line break must hold in a narrow column. Do not set display type at default width.

## Layout

A 1440px max container with horizontal gutters of 16px (mobile), 32px (sm) and 48px (lg), on a 12-column grid from lg. The fixed header is 72px tall; sections open with a hairline top border and 96px top padding (128px from lg). The hero fills the small viewport height: copy in 6-7 columns on the left, the chrome knot absolutely positioned to bleed 24% off the right edge, and the intent tape running full-bleed along the bottom (on phones the tape moves to the top so the live feed is in the first viewport, and the knot drops below the copy at 360-460px tall).

Faint 12-column vertical hairlines (white 2.8%) sit behind the hero, masked out by 80% height. Mechanics run as a pinned horizontal track on desktop (one 100vw panel per mechanic, 5:7 copy-to-visual split, snapping to whole panels) and stack vertically on mobile or under reduced motion. Copy columns are narrow (max-w-sm to 29rem); sections place copy and visual asymmetrically rather than in equal halves.

## Elevation & Depth

Interface surfaces are flat and layered by tone and hairline; shadows serve two jobs only. Dark ambient drops (long, heavily negative-spread black shadows plus a 1px inset top highlight) lift the terminal card and modal off the void like glass on a desk. Acid glows are signal: they appear on primary-button hover, on the clearing beat, and on the burn node. Real depth comes from WebGL chrome objects under a procedural Lightformer studio and from radial key-light gradients (#1b1d22 falling to void) placed behind them.

### Shadow Vocabulary
- **Glass lift** (`box-shadow: 0 40px 120px -40px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.04)`): terminal card; modal uses the -30px / 0.95 / 0.05 variant.
- **Acid hover glow** (`box-shadow: 0 0 32px -4px rgba(212,249,51,0.55)`): primary button hover only.
- **Clearing glow** (`box-shadow: 0 8px 40px -12px rgba(212,249,51,0.55)`): batch instrument during the clearing second; header heartbeat uses `0 0 14px 2px rgba(212,249,51,0.8)`.
- **Signal trail** (`box-shadow: 0 0 12px rgba(212,249,51,0.7)`): the value pulse travelling the token pipeline.

### Named Rules
**The Flat Until Live Rule.** Interface surfaces carry no colored shadow at rest. Acid light appears only in response to hover on an action or to the batch clock.

**The Studio Light Rule.** 3D chrome is lit by the shared procedural softbox environment (overhead box, strip glints, cool floor bounce, one acid ring), baked once to a 256px cube map. No downloaded HDRs.

## Shapes

Two shape families: pills for anything you press or tag (buttons, icon buttons, chips, search field, live dots), and modest rounded rectangles for containers (8px for fields and segmented controls, 12px for the batch instrument and trade widget, 16px for the terminal card and modal). Structure between regions is drawn with 1px hairlines and border-l / border-y splits, not boxes. The focus ring is a 2px acid outline offset 3px with a 6px radius. The closing CRUX wordmark is hollow: near-void fill (#0f1012) with a 1px line-2 stroke, lit from above by a faint chrome radial.

## Components

### Buttons
Confident pills; the only filled acid objects on the page.
- **Shape:** fully rounded (999px).
- **Primary:** acid fill, void text, 14px medium, 48px tall with 24px sides (sm: 36-40px tall, 13px). Trailing arrow-up-right glyph nudges up-right on hover.
- **Hover / Focus:** fill lightens to #e2ff5c with the acid hover glow; 300ms ease-out; active scales to 0.98; focus is the 2px acid outline.
- **Outline:** transparent with a line-2 border and chrome text; hover lifts the border to chrome/60 and adds a white 4% wash. Used for secondary actions and every per-section "learn more".
- **Ghost:** muted text that brightens to chrome; no frame.

### Chips
- **Style:** pill, line-2 border, mono 10px muted text (token ticker inside the amount field), or 8px icon-button circles in the same border.

### Cards / Containers
- **Corner Style:** 16px for the terminal card and modal, 12px for nested widgets.
- **Background:** panel with the top sheen; nested widgets use void at 60% with backdrop blur.
- **Shadow Strategy:** glass lift (see Elevation).
- **Border:** 1px line; internal regions split by line hairlines.
- **Internal Padding:** 12-20px.

### Inputs / Fields
- **Style:** 8px radius, 1px line border, transparent fill, 22px mono value, dim placeholder, acid caret.
- **Focus:** border steps from line to line-2 (focus-within); keyboard focus also shows the acid outline.
- **Error:** the dependent figure turns down (#ff6b5b); no red frames.

### Navigation
- **Header:** fixed, transparent over the hero, void/80 with a heavy backdrop blur once scrolled past 24px. Links are 13px chrome/70, brightening to chrome with a 1px acid underline drawn from the left on hover. Right side: chapter chip ("06 / 07 Token", acid mono numeral, dim mono total, chrome label) shown only outside the mechanics run, then the small acid Launch App pill.
- **Heartbeat:** a 1px line baseline under the header with an acid fill scaling across each 60s window; glows on clearing and snaps back as the next batch opens.
- **Mobile:** 40px pill menu button with a three-line hamburger morphing to a cross; links listed as 24px title-weight rows divided by hairlines.
- **Mechanics rail:** 56px tab rail with mono numerals (acid when active) and 13px labels; a chrome/50 hairline beneath tracks scroll progress.

### Batch Instrument (signature)
A 12px-radius void/60 blurred capsule with two cells split by a hairline: left, a pinging acid dot, "Batch #N" (mono count) and "One uniform price · simulated"; right, "Clears in" over a 24px acid mono countdown. A 1px acid line along the bottom fills with the window. On clearing it joins the One Beat.

### Intent Tape (signature)
A full-bleed strip bordered top and bottom in line, void/70 with blur. A fixed left cell reads "Simulated feed" beside a soft-pulsing acid dot; the feed scrolls at 70s per loop with edge fade masks: dim wallet stub, acid BUY or down SELL, chrome quantity and ticker, muted route, dim timing, all mono 11px.

### Value Pipeline (signature)
A hairline track (vertical on phones, horizontal from sm) with small line-2 node rings that pulse acid in sequence, a lime trail travelling the line, and a heavy 28px acid-ringed node for the burn sink.

## Do's and Don'ts

### Do:
- **Do** keep acid to primary actions, live markers, the active wayfinding numeral and the clearing beat.
- **Do** bind any new live-looking element to the shared batch clock and flare it on the clearing second only.
- **Do** label every live-looking feed, count or clock "simulated" in visible copy and in its accessible name.
- **Do** set statement headlines in Archivo at 122% width, two-line headlines in narrow columns at 108%, bright over steel.
- **Do** set every numeral (price, count, address, countdown) in JetBrains Mono with tabular figures, and every word in Archivo.
- **Do** divide space with 1px hairlines (line by default, line-2 for interactive outlines).
- **Do** light 3D chrome with the shared procedural studio; mount canvases lazily near the viewport, pause offscreen, instance repeated meshes, and track labels with an HTML overlay rather than in-scene HTML.
- **Do** collapse pinned or scrubbed motion to plain stacked scroll under prefers-reduced-motion and on mobile.

### Don't:
- **Don't** use gradient text; lettering is a solid value.
- **Don't** fill panels, sections or decorative shapes with acid, or give a resting surface an acid glow.
- **Don't** build grids of equal cards or rows of stat tiles; show the mechanism (clock, tape, pipeline, equation) instead.
- **Don't** put kicker or eyebrow labels above headings; section numbers appear only as wayfinding (header chapter chip, mechanics rail).
- **Don't** set words in the monospace or numerals for data in Archivo body text.
- **Don't** let a clock-bound element pulse on its own timer, out of step with the batch.
