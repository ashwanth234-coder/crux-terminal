---
name: Crux
description: Markets without borders. Minimal, cinematic, editorial fintech on coal black, where Signal Orange marks only the mark, actions, selection and live state.
colors:
  void: "#0a0b0d"
  void-2: "#0e0f12"
  panel: "#141518"
  panel-2: "#1a1b1f"
  line: "#292b2f"
  line-2: "#3a3d42"
  signal: "#ff642d"
  signal-lift: "#ff7c4d"
  chrome: "#f5f3ee"
  muted: "#a7adb5"
  dim: "#868c94"
  up: "#5cc08c"
  down: "#e5484d"
typography:
  display:
    fontFamily: "Bodoni Moda (opsz), ui-serif, Georgia, serif"
    fontSize: "clamp(2.6rem, 12.8vw, 5.75rem); md 7.4vw; xl min(7.4vw, 7.25rem)"
    fontWeight: 400
    lineHeight: 0.9
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Bodoni Moda"
    fontSize: "clamp(2.5rem, 5.4vw, 4.9rem)"
    fontWeight: 400
    lineHeight: 0.95
  title:
    fontFamily: "Bodoni Moda"
    fontSize: "22-28px"
    fontWeight: 500
    lineHeight: 1.05
  body:
    fontFamily: "Archivo, ui-sans-serif, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.625
  nav:
    fontFamily: "Archivo"
    fontSize: "11.5px"
    fontWeight: 500
    letterSpacing: "0.18em"
    textTransform: uppercase
  label:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "10.5px"
    letterSpacing: "0.18em"
    textTransform: uppercase
  numeric:
    fontFamily: "JetBrains Mono"
    fontSize: "11.5-30px"
    fontFeature: "'tnum' 1"
rounded:
  tag: "3px"
  control: "4-6px"
  panel: "8px"
  circle: "999px (the ENTER CRUX ring and dots only)"
spacing:
  gutter: "16px / 32px from 640 / 48px from 1024"
  section: "80px; 128px from 1024"
  header: "64px"
components:
  button-primary:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.void}"
    rounded: "6px"
    height: "48px (md) / 36px (sm)"
  connect-wallet:
    border: "1px {colors.signal} at 80%"
    textColor: "{colors.signal}"
    rounded: "4px"
    height: "36px"
  enter-crux:
    ring: "56px circle, 1px {colors.signal} at 70%"
    label: "uppercase, 0.32em tracking, warm white"
  status-tag:
    font: "JetBrains Mono 9.5px uppercase, 0.16em"
    rounded: "3px"
---

# Design System: Crux

## Overview

**Creative North Star: "Markets without borders."** Editorial, architectural, obsidian, titanium, precision, restraint. The page should feel expensive through composition, type and negative space, not effects. Real responsive UI, never a flattened image.

The home page opens on plain coal black: a serif MARKETS / WITHOUT / BORDERS. (WITHOUT in Signal Orange), one supporting line, one ENTER CRUX link, and on the right one monumental chrome CRUX mark on a single circle and axis. Below the fold, numbered editorial chapters (01 Discover, 02 Fair launch, 03 Execution, 04 Liquidity, 05 Token economics) show real Base Sepolia data, then the close repeats the promise.

The terminal, launch and pro views use the same tokens, packed tighter.

## Colors

- **Coal Black** (void) dominates every page. **Graphite** (panel) separates layers by tone; no glows, no gradients.
- **Signal Orange** (signal) is the only accent: the mark, primary actions, the selected nav item, LIVE state and active indicators, chapter numbers, and one rare headline word. It never fills a section, and the page is never orange.
- **Warm White** (chrome) for headlines and primary information. **Titanium** (muted) for secondary text, annotations and chart detail; **dim** for timestamps and table heads (still 4.5:1 on graphite).
- **Borders** (line, #292B2F) for every hairline; line-2 for interactive outlines.
- **up / down** mark price direction only. Network colours appear only on network marks (Base blue, etc.).

## Typography

- **Bodoni Moda** (optical size axis) for display and titles: `.font-display` (400) and `.font-display-md` (500). Uppercase only in the hero.
- **Archivo** for all UI words. Nav, buttons and small labels are uppercase with 0.16-0.18em tracking.
- **JetBrains Mono** with tabular figures for every number, address and countdown, and for chapter labels.

## Brand mark

One geometric four-point mark (`CRUX_MARK_PATH` in components/site/Logo.tsx): four equal tapered arms meeting at a waist, so it reads as a convergence point, not a cross.
- Flat Signal Orange: favicon (app/icon.svg), app icon and splash (public/), OG image.
- Single colour (`CruxMark`, currentColor): legible at 16px, no glow, works on any ground.
- Chrome (`CruxEmblem`): the hero version, static SVG with linear/radial gradients only (no filters, no script), one small orange light at the centre, one circle, one horizontal axis, two alignment lines, three orange control points. Below md the guides drop away.
- Wordmark: CRUX in Archivo 500, warm white, 0.42em tracking.

## Components

- **Header**: 64px, coal with a subtle border; mark + wordmark + TESTNET tag left, the five routes centred (from lg), CONNECT WALLET ↗ right. Below lg, a menu button opens an accessible full-height list (Escape closes it).
- **Status tags** (`components/ui/StatusTag.tsx`): LIVE (orange dot), TESTNET (titanium), DEMO (dashed), PLANNED (dashed, hollow dot). Use these words consistently; never show a simulated number as live.
- **Chapters** (`components/site/Chapter.tsx`): hairline on top, `01 / NAME` label, serif headline, short titanium intro, then the evidence.
- **Tables and lists** use hairline rows rather than boxed cards.
- **Balances** are never sampled: with no wallet the terminal shows "$—" and asks you to connect.

## Motion

Hover and focus feedback (200ms), the modal entrance, the wallet "kinetic" bars while work is in progress, and real transaction-state changes. No parallax, particles, carousels, simulated activity or ambient loops; the emblem is static. `prefers-reduced-motion` collapses animations and transitions.

## Don'ts

- No acid lime, purple or blue glows, multicolour gradients, or orange backgrounds.
- No fabricated stats, countdowns, balances or fills. Testnet data is labelled testnet; nothing implies mainnet.
- No WebGL or heavy 3D for the emblem.
