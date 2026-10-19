---
name: Crux
description: Omnichain execution, shown with real Base Sepolia data on an obsidian page where lime marks only actions and outcomes.
colors:
  void: "#08090b"
  panel: "#111215"
  panel-2: "#16171b"
  line: "#1c1e22"
  line-2: "#2a2d33"
  acid: "#d0f77a"
  acid-lift: "#dcfa98"
  chrome: "#f3f3f0"
  steel: "#80848d"
  muted: "#8f939b"
  dim: "#767a84"
  up: "#c4ec74"
  down: "#ff7a6b"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, sans-serif"
    fontSize: "clamp(2.4rem, 5.4vw, 5.1rem)"
    fontWeight: 600
    lineHeight: 0.95
    letterSpacing: "-0.04em"
    fontVariation: "'wdth' 112"
  headline:
    fontFamily: "Archivo, ui-sans-serif, sans-serif"
    fontSize: "clamp(2.2rem, 3.6vw, 3.5rem)"
    fontWeight: 600
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
    fontFamily: "Archivo, ui-sans-serif, sans-serif"
    fontSize: "15.5px"
    fontWeight: 400
    lineHeight: 1.625
  body-sm:
    fontFamily: "Archivo, ui-sans-serif, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Archivo, ui-sans-serif, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.4
  numeric:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "11.5px"
    fontWeight: 400
    fontFeature: "'tnum' 1"
  numeric-instrument:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "44px"
    fontWeight: 400
    lineHeight: 1
    fontFeature: "'tnum' 1"
rounded:
  sm: "4px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  full: "999px"
spacing:
  gutter-sm: "16px"
  gutter-md: "32px"
  gutter-lg: "48px"
  panel: "20px"
  section: "96px"
  section-lg: "128px"
components:
  button-primary:
    backgroundColor: "{colors.acid}"
    textColor: "{colors.void}"
    rounded: "{rounded.full}"
    padding: "0 24px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.acid-lift}"
    textColor: "{colors.void}"
  button-primary-sm:
    backgroundColor: "{colors.acid}"
    textColor: "{colors.void}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "36px"
  button-outline:
    textColor: "{colors.chrome}"
    rounded: "{rounded.full}"
    padding: "0 24px"
    height: "48px"
  button-ghost:
    textColor: "{colors.muted}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "36px"
  panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.2xl}"
    padding: "{spacing.panel}"
  diagram:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.xl}"
    padding: "{spacing.panel}"
  input-field:
    textColor: "{colors.chrome}"
    rounded: "{rounded.lg}"
    padding: "10px 12px"
  status-pill:
    textColor: "{colors.muted}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
---

# Design System: Crux

## Overview

**Creative North Star: "Quiet Power"**

Crux sits on an obsidian page and proves its mechanism instead of performing it. Negative space and 1px hairlines carry the structure. Surfaces are graphite panels, set apart from the ground by tone alone. There is no WebGL, no ambient loop and no simulated feed. The hero's right column shows the newest real events from the Crux contracts on Base Sepolia. Every mechanic is a static diagram with real contract names and an honest status: "Live on Base Sepolia testnet" or "Planned".

Lettering is soft white in solid values. Headlines are Archivo set wide: 112% width, or 108% where a two-line break has to hold in a narrow column. The claim is in bright and the answering line is in steel. Lime is kept for signals only: the primary action, a live or outcome marker, and the one bar that crosses a diagram. JetBrains Mono is used only for numbers, addresses and countdowns, so data reads as data at a glance.

The marketing chapters are sparse. The terminal and launch views are denser, with the same tokens packed tighter into an app. Motion appears only where it does a job: one short entrance, and a bar loader while a wallet signs. The page reads fully with motion off, and the headline paints with the first frame.

**Key Characteristics:**
- Obsidian ground, graphite panels, hairline structure; depth by tone, never by glow.
- Lime is a signal: primary actions, live/outcome markers, a single crossing bar. It never fills an area.
- Two-tone extended headlines: bright claim, steel answer.
- Mono only for numbers, addresses and countdowns; every word is Archivo.
- Every number is real Base Sepolia data, labelled testnet, or clearly marked simulated, demo or planned.
- Functional motion only; static diagrams instead of animated scenes.

## Colors

A near-black neutral ramp with one lime signal, plus coral for loss and cancellation.

### Primary
- **Signal Lime** (acid): fill of the primary pill button; live and outcome dots (filled intent, settled launch, open auction); the clearing-price line in the batch diagram; the threshold bar in the syndication chart; the deposit progress bar; the active wayfinding numeral in the header; the focus ring, caret and text selection.
- **Lifted Lime** (acid-lift): the primary button's hover state only. It lightens; it never glows.

### Neutral
- **Obsidian** (void): page ground, header bar at 80% with blur once scrolled, button text on lime.
- **Graphite** (panel): every raised surface: activity card, terminal, diagrams, launch instrument, modals.
- **Graphite Raised** (panel-2): popovers and tooltips that sit above a panel.
- **Hairline** (line): the default 1px divider, section top rules, panel borders, skeleton bars.
- **Hairline Strong** (line-2): interactive outlines (outline buttons, pills, chips), diagram stems and tracks, dashed borders on planned diagrams, scrollbar thumb.
- **Soft White** (chrome): all primary lettering; body copy runs at 60-70% opacity (`chrome/65`, `chrome/70`), list items at 80-85%.
- **Steel** (steel): the answering line of a two-line headline and the name after a ticker. 5.6:1 on obsidian.
- **Muted** (muted): captions, secondary detail, status-pill text, field labels.
- **Dim** (dim): timestamps, denominators ("/ $5,000"), contract event names, copyright line.

### Semantic
- **Up** (up): positive change in terminal data.
- **Down** (down): losses, cancelled launches, invalid fields (borders at 40-60%, the cancelled progress bar).

### Named Rules
**The Signal Not Surface Rule.** Lime never fills a panel, section or decorative shape. It appears as a button fill, a 6px dot, a 1px line, a single bar or numeral, or a small status chip. If lime covers more than a button's worth of area on a screen, something is wrong.

**The No Halo Rule.** No glows, colored shadows or colored halos anywhere. Lime emphasis is a solid fill or a line, never light.

## Typography

**Display Font:** Archivo (variable width axis), with ui-sans-serif fallback
**Body Font:** Archivo
**Label/Mono Font:** JetBrains Mono, with ui-monospace fallback, tabular figures

**Character:** One family sets every word, and its width axis gives it an architectural feel. The mono is a second voice kept for data.

### Hierarchy
- **Display** (600, 112% width, -0.04em, line-height 0.95): statement headlines. Hero `clamp(2.4rem, 5.4vw, 5.1rem)`, Borderless `clamp(2.8rem, 5.4vw, 5rem)`, Token `clamp(2.6rem, 5vw, 4.6rem)`. The large stage figures and the $37M+ figure range from `clamp(2.2rem, 3.2vw, 3rem)` to `clamp(2.6rem, 4vw, 3.6rem)`.
- **Headline** (600, 108% width, line-height 0.95): mechanics chapters `clamp(2.2rem, 3.6vw, 3.5rem)` and Experience `clamp(2.5rem, 4vw, 3.8rem)`. The launch page h1 is `clamp(2rem, 5vw, 3.4rem)` in the medium display style (108%, -0.03em).
- **Title** (600, 108% width, -0.03em): modal and launch-step headings at 22px, notice headings at 28px, launch card ticker at 26px, mobile nav rows at 24px.
- **Body** (400, line-height 1.625): section copy at 15.5px (15px in Experience, 16px under the hero headline), capped at 26-30rem.
- **Small body** (400): 13, 13.5 and 14px for diagram copy, notices and list items. Card titles are 15px medium; the latest-launch ticker is 17px.
- **Label** (400): 11.5, 12 and 12.5px for captions, field labels, panel footers and status lines. Status pills are 11px; compact chips and the launch badge are 10-10.5px.
- **Numeric** (JetBrains Mono, tabular): 11-11.5px for timestamps, addresses and axis ticks; 13-14px for raised amounts; 18-30px for terminal balances and amounts; 44px for the auction countdown; 52px light for the 4 / 1 / 0 equation.

The ramp in use is 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 15.5, 16, 17, 22, 26 and 28px, plus the display clamps above. All of these are on-system. The half-pixel steps are deliberate tuning for Archivo at small sizes.

### Named Rules
**The Numbers Only Rule.** JetBrains Mono carries counts, prices, amounts, addresses, tickers inside data chips, and countdowns. Every word, including the label beside a number, is Archivo.

**The Two-Tone Headline Rule.** Multi-line headlines put the claim in bright and the answer in steel ("One balance." / "Every chain."). One break, two values, no third tone, never gradient text.

**The Width Rule.** Display type is always extended: 112% for statement headlines, 108% for chapter headlines and titles. Never set display type at default width.

## Layout

The container is 1440px wide, with 16px gutters, 32px from 640px and 48px from 1024px. Each section is a full-width band with a single hairline on top. From `lg` it uses a 12-column grid: copy takes 4-7 columns and the evidence (activity card, terminal, diagram) takes the rest. Section padding is 80-96px on small screens and 96-144px on large ones; the hero gets 56-96px below a 72px fixed header. Panels pad 20px, rising to 24px from `sm` on diagrams and the launch instrument. The mechanics are stacked chapters, each its own band, with no pinned or scrubbed sequence. The token pipeline is a vertical track on phones and a four-column horizontal track from 640px.

**The Hairline Structure Rule.** Space is divided by 1px lines and negative space, not by boxes in boxes. Within a panel, regions split with `line` borders; lists use `divide-y` hairlines.

## Elevation & Depth

Flat by default. Surfaces stand off the obsidian ground by tone (void, then panel, then panel-2) and a 1px hairline border. The only shadows are neutral black drop shadows on elements that float above the page: modals, the pay-with popover and tooltips. The header takes an 80% obsidian fill and a backdrop blur only after the page scrolls.

### Shadow Vocabulary
- **Modal lift** (`box-shadow: 0 40px 120px -30px rgba(0,0,0,0.95), inset 0 1px 0 rgba(255,255,255,0.05)`): the modal panel.
- **Popover lift** (`box-shadow: 0 24px 60px -20px rgba(0,0,0,0.9)`): the pay-with dropdown.
- **Tooltip lift** (`box-shadow: 0 12px 32px -12px rgba(0,0,0,0.9)`): form help tooltips.

### Named Rules
**The Tone Not Light Rule.** Depth comes from tone and hairlines. Any shadow is neutral black and sits only on an element floating above the page. Nothing at rest gives off light.

## Shapes

Soft rectangles and full pills. Panels and cards use a 16px radius; diagrams and the latest-launch tracker use 12px. Inner rows and fields use 8px, skeleton bars 4px and chart bars 2px. Buttons, pills, chips, dots and the menu toggle are full pills. Borders are always 1px. A dashed `line-2` border marks a diagram of something planned but not yet deployed. The Crux mark is a wireframe four-point star. The footer closes on the CRUX wordmark at full page width, drawn as an outline: a 1px `line-2` stroke on obsidian at 125% width.

## Components

### Buttons
Flat, quiet pills that never glow.
- **Shape:** full pill (999px).
- **Primary:** lime fill, obsidian text, Archivo 500. Medium is 48px high with 24px padding at 14px; small is 36px with 16px padding at 13px. The header button is 40px high with 20px padding.
- **Hover / Focus:** hover lightens to Lifted Lime over 200ms. Press scales to 0.98. Focus is a 2px lime outline offset 2px. Trailing arrows nudge 2px on hover.
- **Outline:** transparent with a 1px `line-2` border and chrome text. Hover lifts the border to chrome at 60% and adds a 4% white wash. Used for per-chapter CTAs and secondary actions.
- **Ghost:** muted text that turns chrome on hover.

### Chips / Status pills
- **Style:** 1px `line-2` border, full pill, muted text at 11px ("Testnet", "Base Sepolia testnet"). Ticker chips are mono 10px.
- **State:** live states get a lime dot and a lime border at 40-50%. Graduated is the one solid lime chip. Cancelled uses a coral dot. Planned uses a hollow dot outlined in chrome at 40%.

### Cards / Containers
- **Corner Style:** 16px for panels and launch cards, 12px for diagrams.
- **Background:** graphite (panel); fields inside the terminal sit on obsidian at 60%.
- **Shadow Strategy:** none at rest (see Elevation & Depth).
- **Border:** 1px `line`; hover moves a launch card to `line-2`.
- **Internal Padding:** 20px. Header and footer strips use 14-16px vertical padding and are split off by hairlines.

### Inputs / Fields
- **Style:** 1px `line` border, 8px radius, obsidian at 60%, 10-12px padding. Text is 14px Archivo, or 22px mono for amounts. Placeholders are dim and the caret is lime.
- **Focus:** the border moves to lime at 60% in forms, or to `line-2` in the terminal amount field. No glow.
- **Error / Disabled:** invalid fields take a coral border at 60%; disabled controls drop to 50% opacity and stop pointer events.

### Navigation
- **Style:** a fixed 72px bar with one `line` hairline beneath. It is transparent at the top and becomes obsidian at 80% with blur once the page scrolls. Links are 13px chrome at 70%. On hover they turn full chrome and a 1px lime underline draws in from the left.
- **Wayfinding:** from 1280px, a chapter readout shows the active section: a lime mono numeral, "/ 07" in dim mono, then the chapter name.
- **Mobile:** a pill menu toggle opens a stacked list of 24px headline rows divided by hairlines.

### Testnet Activity (signature)
The hero's evidence card shows the newest real events from the Crux contracts on Base Sepolia. Each row has a 6px dot (lime for an outcome, chrome at 35% otherwise), a 13.5px title, a 12.5px muted detail and a mono relative time. Rows link to the launch or to Basescan. The card has explicit loading (skeleton rows), error ("Couldn't reach Base Sepolia. Retrying every 30 seconds."), empty and unconfigured states, and a footer linking the settler address.

### Mechanism Diagrams (signature)
Static figures on graphite. The execution diagram is a four-step grid split by 1px gaps. The batch window shows bid stems dropping to one lime clearing line. Planned mechanics get dashed-border diagrams with a "Planned" caption. Real contract names and addresses appear in mono with an outbound arrow.

### Batch Instrument
Used in the launch view and the latest-launch tracker. It shows a mono countdown (44px on the launch page) and the raised amount over the target. A 4px progress bar is lime, coral when cancelled; the time bar is chrome at 60%. The uniform price is in mono.

### Motion
- **Rise** (0.7s, cubic-bezier(0.16, 1, 0.3, 1)): the one entrance, a 10px lift from near-zero opacity, used when a modal opens. It is never applied to the hero headline.
- **Kinetic** (0.9s ease-in-out): four 3px bars while a wallet signs or routes. It is the only repeating animation, and it shows only while work is in progress.
- **State** (200-300ms ease-out): color, border and transform transitions on hover.
- Reduced motion collapses every animation to a single near-instant iteration and turns off smooth scrolling.

## Do's and Don'ts

### Do:
- **Do** keep lime to primary actions, live and outcome markers, the active wayfinding numeral and a single crossing bar or line per diagram.
- **Do** show real Base Sepolia data, and label anything else in visible copy as testnet, simulated, demo or planned.
- **Do** give every data surface honest loading, error, empty and unconfigured states.
- **Do** set statement headlines in Archivo at 112% width and chapter headlines at 108%, bright over steel.
- **Do** set every number, address and countdown in JetBrains Mono with tabular figures, and every word in Archivo.
- **Do** divide space with 1px hairlines (`line` by default, `line-2` for interactive outlines and diagram tracks) and generous negative space.
- **Do** mark planned mechanisms with a dashed `line-2` border and a "Planned" caption.
- **Do** keep the page fully legible with motion off, and paint the headline with the first frame.

### Don't:
- **Don't** add glows, colored shadows or halos, including on button hover.
- **Don't** fill panels, sections or decorative shapes with lime.
- **Don't** use WebGL, ambient loops, tickers or scrolling feeds; show mechanisms as static diagrams.
- **Don't** present a simulated or illustrative number as live.
- **Don't** use gradient text; lettering is a solid value.
- **Don't** put kicker or eyebrow labels above headings; numbered chapters appear only as header wayfinding.
- **Don't** set words in the monospace, or numbers for data in Archivo.
- **Don't** hide or delay the hero headline behind an entrance animation.
