---
name: Crux
description: Markets without borders. High-contrast institutional fintech on pure black (or pure white), one type family, where Electric Orange #FF5500 carries primary actions, active states and critical figures.
colors:
  # dark (default) / light (data-theme="light")
  void: "#000000 / #ffffff"
  void-2: "#050505 / #fafafa"
  panel: "#0a0a0a / #ffffff"
  panel-2: "#111111 / #f4f4f4"
  line: "#1f1f1f / #e5e5e5"
  line-2: "#2e2e2e / #d0d0d0"
  signal: "#ff5500"
  signal-lift: "#ff7733 / #e64d00"
  on-signal: "#000000"
  chrome: "#ffffff / #000000"
  muted: "#a3a3a3 / #4a4a4a"
  dim: "#7a7a7a / #6b6b6b"
  tint: "#ffffff / #000000"
  up: "#22c55e / #15803d"
  down: "#ef4444 / #dc2626"
  glow: "0 0 15px rgba(255,85,0,0.4) (0.35 in light)"
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
    backgroundColor: "{colors.signal}"
    textColor: "{colors.on-signal}"
    shadow: "{colors.glow}"
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

**Creative North Star: "Markets without borders."** Institutional, architectural, high contrast, precision, restraint. The page should feel trustworthy through composition, one type family and negative space, not effects. Few things per screen; say each thing once. Real responsive UI, never a flattened image.

The home page opens on pure black: "Markets / without borders." in white Archivo, one supporting line, the orange Enter Crux button with a quiet View launches link, and on the right the CRUX mark in liquid chrome inside a glass disc. Below the fold, three parts only: Live markets (the real launch table), How Crux works (four hairline rows, each live today), and a short close. No section numbers or kickers above headings.

The terminal, launch and pro views use the same tokens, packed tighter.

## Colors

- **Two grounds, one accent.** Dark (default) is pure black (void #000000) with #050505 / #111111 cards and pure white text; light is pure white with black text. A sun/moon toggle beside the language switcher flips `data-theme` on `<html>`, saved in localStorage (`crux.theme`) and applied before paint; the chart recolours live.
- **Electric Orange** (signal, #FF5500, the same in both themes) is for primary actions, active states (selected chip, language, nav) and critical figures such as fees locked. It is not for headlines, section fills or decoration.
- **Text on orange is always pure black** (on-signal), in both themes.
- **Glow**: a soft orange glow (`.glow-signal`, 0 0 15px rgba(255,85,0,0.4)) on primary buttons, and on inputs while focused (`.glow-focus`). Nowhere else.
- **Actions** are orange (primary) or outline. Trades carry their direction: **buy green (up), sell red (down)**.
- **chrome** for headlines and primary information; **muted** for secondary text; **dim** for timestamps and table heads. **tint** (white on dark, black on light) for translucent washes (`bg-tint/[0.04]`), never raw white.
- **Borders** (line) for every hairline; line-2 for interactive outlines.
- **up / down** mark price direction only. Network colours appear only on network marks (Base blue, etc.).

## Typography

- **Archivo** for everything with words: `.font-display` (500, -0.035em) for statements and `.font-display-md` (600, -0.02em) for titles inside the app, sentence case. One family keeps the site in one voice.
- Archivo for all UI words too. Nav, buttons and small labels are uppercase with 0.16-0.18em tracking.
- **JetBrains Mono** with tabular figures for every number, address and countdown, and for chapter labels.

## Brand mark

One geometric four-point mark (`CRUX_MARK_PATH` in components/site/Logo.tsx): four equal tapered arms meeting at a waist, so it reads as a convergence point, not a cross.
- Flat Electric Orange on black: favicon (app/icon.svg), app icon and splash (public/), OG image.
- Single colour (`CruxMark`, currentColor): legible at 16px, no glow, works on any ground.
- Glass and liquid chrome (`CruxEmblem`): the hero version. The mark in banded liquid chrome with a horizon sheen and a thin specular edge, floating in a glass disc (faint tinted body, lit rim, inner rim, a specular arc top left and its faint reflection bottom right), one orange core of light where the arms meet, one orange point on the rim and one hairline axis. Static SVG, gradients only (no filters, no script); the glass is drawn in the theme tint so it works on black and white.
- Wordmark: CRUX in Archivo 500, chrome, 0.42em tracking.

## Components

- **Header**: 64px, void with a subtle border; mark + wordmark + TESTNET tag left, the routes centred (from xl), language switcher, theme toggle, LOG IN and CONNECT WALLET ↗ (outline) right. App headers drop Protocol and Docs; the token search submits on Enter. Below xl, a menu button opens an accessible full-height list (Escape closes it).
- **Status tags** (`components/ui/StatusTag.tsx`): LIVE (orange dot), TESTNET (titanium), DEMO (dashed), PLANNED (dashed, hollow dot). Use these words consistently; never show a simulated number as live.
- **Chapters** (`components/site/Chapter.tsx`): hairline on top, Archivo headline with a short titanium intro beside it, then the evidence. No numbers or labels above the headline.
- **Tables and lists** use hairline rows rather than boxed cards.
- **Balances** are never sampled: with no wallet the terminal shows "$—" and asks you to connect.

## Motion

Hover and focus feedback (200ms), the modal entrance, the wallet "kinetic" bars while work is in progress, and real transaction-state changes. No parallax, particles, carousels, simulated activity or ambient loops; the emblem is static. `prefers-reduced-motion` collapses animations and transitions.

## Don'ts

- No acid lime, purple or blue glows, multicolour gradients, or orange section fills; orange fills are for primary buttons only.
- No glow beyond primary buttons and focused inputs. No Base-blue rebrand.
- No fabricated stats, countdowns, balances or fills. Testnet data is labelled testnet; nothing implies mainnet.
- No WebGL or heavy 3D for the emblem.
