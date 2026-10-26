---
name: Crux
description: Markets without borders. Minimal, institutional fintech on coal black, one type family, where Signal Orange marks only the mark, selection and live state.
colors:
  void: "#0a0b0d"
  void-2: "#0e0f12"
  panel: "#141518"
  panel-2: "#1a1b1f"
  line: "#292b2f"
  line-2: "#3a3d42"
  signal: "#e35d2b"
  signal-lift: "#ee7444"
  chrome: "#f5f3ee"
  muted: "#a7adb5"
  dim: "#868c94"
  up: "#5cc08c"
  down: "#e5484d"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, sans-serif"
    fontSize: "clamp(2.9rem, 9.5vw, 4.5rem); md 6vw; xl min(6vw, 6rem)"
    fontWeight: 500
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Archivo"
    fontSize: "clamp(2.1rem, 4vw, 3.4rem)"
    fontWeight: 500
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Archivo"
    fontSize: "22-28px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
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
  circle: "999px (status dots only)"
spacing:
  gutter: "16px / 32px from 640 / 48px from 1024"
  section: "80px; 128px from 1024"
  header: "64px"
components:
  button-primary:
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.void}"
    rounded: "6px"
    height: "48px (md) / 36px (sm)"
  button-buy:
    backgroundColor: "{colors.up}"
    textColor: "{colors.void}"
  button-sell:
    backgroundColor: "{colors.down}"
    textColor: "{colors.void}"
  connect-wallet:
    border: "1px {colors.chrome} at 70%"
    textColor: "{colors.chrome}"
    rounded: "4px"
    height: "36px"
  status-tag:
    font: "JetBrains Mono 9.5px uppercase, 0.16em"
    rounded: "3px"
---

# Design System: Crux

## Overview

**Creative North Star: "Markets without borders."** Institutional, architectural, obsidian, titanium, precision, restraint. The page should feel trustworthy through composition, one type family and negative space, not effects. Few things per screen; say each thing once. Real responsive UI, never a flattened image.

The home page opens on plain coal black: "Markets / without borders." in warm-white Archivo, one supporting line, the warm-white Enter Crux button with a quiet View launches link, and on the right the chrome CRUX mark on a single circle and axis. Below the fold, three parts only: Live markets (the real launch table), How Crux works (four hairline rows, each live today), and a short close. No section numbers or kickers above headings.

The terminal, launch and pro views use the same tokens, packed tighter.

## Colors

- **Coal Black** (void) dominates every page. **Graphite** (panel) separates layers by tone; no glows, no gradients.
- **Signal Orange** (signal, #E35D2B: toned down from #FF642D in 2026-10) is the only accent: the mark, the selected nav item or control, LIVE state and active indicators. It is never a button fill, never a headline word, never a section fill.
- **Actions** are warm white (primary) or outline. Trades carry their direction: **buy green (up), sell red (down)**, so an action never shares a hue with the down colour.
- **Warm White** (chrome) for headlines and primary information. **Titanium** (muted) for secondary text, annotations and chart detail; **dim** for timestamps and table heads (still 4.5:1 on graphite).
- **Borders** (line, #292B2F) for every hairline; line-2 for interactive outlines.
- **up / down** mark price direction only. Network colours appear only on network marks (Base blue, etc.).

## Typography

- **Archivo** for everything with words: `.font-display` (500, -0.035em) for statements and `.font-display-md` (600, -0.02em) for titles inside the app, sentence case. One family keeps the site in one voice.
- Archivo for all UI words too. Nav, buttons and small labels are uppercase with 0.16-0.18em tracking.
- **JetBrains Mono** with tabular figures for every number, address and countdown, and for chapter labels.

## Brand mark

One geometric four-point mark (`CRUX_MARK_PATH` in components/site/Logo.tsx): four equal tapered arms meeting at a waist, so it reads as a convergence point, not a cross.
- Flat Signal Orange: favicon (app/icon.svg), app icon and splash (public/), OG image.
- Single colour (`CruxMark`, currentColor): legible at 16px, no glow, works on any ground.
- Chrome (`CruxEmblem`): the hero version, static SVG with linear/radial gradients only (no filters, no script), one small orange light at the centre, one circle, one horizontal axis, two alignment lines, three orange control points. Below md the guides drop away.
- Wordmark: CRUX in Archivo 500, warm white, 0.42em tracking.

## Components

- **Header**: 64px, coal with a subtle border; mark + wordmark + TESTNET tag left, the routes centred (from lg), LOG IN and CONNECT WALLET ↗ (warm-white outline) right. App headers drop Protocol and Docs; the token search submits on Enter. Below lg, a menu button opens an accessible full-height list (Escape closes it).
- **Status tags** (`components/ui/StatusTag.tsx`): LIVE (orange dot), TESTNET (titanium), DEMO (dashed), PLANNED (dashed, hollow dot). Use these words consistently; never show a simulated number as live.
- **Chapters** (`components/site/Chapter.tsx`): hairline on top, Archivo headline with a short titanium intro beside it, then the evidence. No numbers or labels above the headline.
- **Tables and lists** use hairline rows rather than boxed cards.
- **Balances** are never sampled: with no wallet the terminal shows "$—" and asks you to connect.

## Motion

Hover and focus feedback (200ms), the modal entrance, the wallet "kinetic" bars while work is in progress, and real transaction-state changes. No parallax, particles, carousels, simulated activity or ambient loops; the emblem is static. `prefers-reduced-motion` collapses animations and transitions.

## Don'ts

- No acid lime, purple or blue glows, multicolour gradients, or orange backgrounds.
- No fabricated stats, countdowns, balances or fills. Testnet data is labelled testnet; nothing implies mainnet.
- No WebGL or heavy 3D for the emblem.
