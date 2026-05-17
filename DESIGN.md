---
version: alpha
name: Foobar Consulting
description: Brand design system for Foobar Consulting LLC — practical application security consultancy.

colors:
  charcoal: "#1B2535"
  charcoal-mid: "#243040"
  slate: "#334E68"
  amber: "#E09B2D"
  amber-dark: "#C07818"
  amber-light: "#F5C46A"
  forest: "#2A7A5E"
  forest-light: "#3A9A76"
  linen: "#F5F1EB"
  linen-dark: "#EDE8E0"
  linen-border: "#DDD9D0"
  mid-gray: "#6B7A8D"
  light-on-dark: "#A8BDD0"
  body-text: "#2C3E50"

typography:
  display:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "32px"
    fontWeight: "400"
    lineHeight: "1.2"
    letterSpacing: "-0.5px"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: "400"
    lineHeight: "1.7"
  mono:
    fontFamily: "'Courier New', Courier, monospace"
    fontSize: "14px"
    fontWeight: "400"
    lineHeight: "1.8"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "10px"
    fontWeight: "600"
    lineHeight: "1"
    letterSpacing: "2.5px"
    fontFeature: "all-small-caps"

spacing:
  xs: "8px"
  sm: "16px"
  md: "24px"
  lg: "40px"
  xl: "64px"
  xxl: "96px"
  content-max: "860px"

rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"

components:
  nav:
    backgroundColor: "{colors.charcoal}"
    height: "64px"
    padding: "0 40px"
    borderBottom: "1px solid rgba(255,255,255,0.06)"

  nav-mark:
    typography: "{typography.mono}"
    fontSize: "20px"
    fontWeight: "600"
    textColor: "{colors.linen}"
    bracketColor: "{colors.amber}"

  btn-primary:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.charcoal}"
    typography: "{typography.body}"
    fontSize: "15px"
    fontWeight: "600"
    padding: "14px 28px"
    rounded: "{rounded.sm}"

  btn-primary-hover:
    backgroundColor: "{colors.amber-light}"

  btn-nav:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.charcoal}"
    fontSize: "13px"
    fontWeight: "600"
    padding: "8px 20px"
    rounded: "{rounded.sm}"

  wordmark:
    fontFamily: "'Courier New', Courier, monospace"
    fontSize: "30px"
    fontWeight: "600"
    letterSpacing: "-0.5px"
    textColor: "{colors.linen}"
    bracketColor: "{colors.amber}"

  wordmark-light:
    textColor: "{colors.charcoal}"
    bracketColor: "{colors.amber-dark}"
    backgroundColor: "{colors.linen}"

  footer:
    backgroundColor: "{colors.charcoal}"
    padding: "40px"
    contentMax: "{spacing.content-max}"

  section-label:
    typography: "{typography.label}"
    letterSpacing: "3px"
    textColor: "{colors.amber-dark}"
    borderBottom: "1px solid {colors.linen-border}"
    paddingBottom: "10px"
---

## Overview

Foobar Consulting is a practical application security firm. The brand positions as the **trusted practitioner** — not the compliance auditor, not the fear-monger. The visual system reflects that: serious but approachable, technically credible without resorting to the hacker-black aesthetic common in the security industry.

**Primary audience:** Security teams at mid-size companies; engineering-led founders and CTOs at startups who need expertise without a full-time hire. Emotional state: overwhelmed, compliance-pressured, worried about shipping something embarrassing.

**Core differentiator:** Decades of hands-on experience across diverse organization types. No-nonsense, practical attitude. Security as a solvable engineering problem.

**Tagline (preferred):** "Security without the theater."

## Colors

The palette is built around warmth and credibility, deliberately avoiding the extremes — no pure black, no alarm red, no corporate blue.

**Charcoal (`#1B2535`)** anchors all primary surfaces and the nav/footer. It reads as serious without being threatening. Use it for dark backgrounds and text on light surfaces.

**Amber (`#E09B2D`)** is the single accent color — used sparingly for CTAs, brand mark brackets, and key highlights only. Its warmth signals approachability, not danger. `amber-dark` (`#C07818`) is used for amber on light/linen backgrounds where the full amber would lack contrast.

**Slate (`#334E68`)** is a secondary UI color for depth and layering. It is not used for brand expression — keep it in supporting roles only.

**Forest (`#2A7A5E`)** signals trust and success. Use it exclusively for positive states, locked decisions, and trust signals. Never use it as a primary color.

**Linen (`#F5F1EB`)** replaces pure white on all light backgrounds. It keeps warmth in layouts and prevents the sterile clinical feel that pure white introduces.

**Color hierarchy:** Charcoal → Amber (sparingly) → Slate (UI) → Forest (trust signals) → Linen (surfaces).

## Typography

Three typeface roles, strictly separated:

**Display / Headings** use the serif stack (Georgia). Used for hero headlines and major section headers. Weight 400 — the elegance comes from the face itself, not from bolding. The contrast between a refined serif headline and the monospace mark creates the brand's typographic tension.

**Body** uses the system sans-serif stack. 16px / 1.7 line-height for comfortable reading of consultancy copy. Avoid web fonts — the system stack loads instantly, which suits a trust-focused brand.

**Accent / Technical / Wordmark** uses Courier New monospace. Used for the brand mark, service lists, code context, technical callouts, footers, and labels. Monospace is the brand's insider signal to technical audiences — it echoes the wordmark throughout the system.

All-caps tracking labels (section labels, eyebrows) use the body sans at 10px / 600 weight / 2.5–3px letter-spacing. Never use this treatment at sizes above 13px.

## Layout

The content column is capped at **860px** for all page content. This narrower-than-typical cap keeps the reader close to the text and prevents the sprawling emptiness of wide containers on large screens.

Page padding is **40px** at the sides on desktop. Hero sections use **100px top / 96px bottom** for breathing room.

Section rhythm uses the spacing scale. Major sections are separated by 64px. Within sections, subsections use 36px gaps.

## Elevation & Depth

Elevation is expressed through **color, not shadow**. Dark sections (charcoal) sit "above" light sections (linen) in visual weight. Box shadows are avoided — they read as corporate gloss.

Hairline rules use `rgba(255,255,255,0.06)` on dark backgrounds and `{colors.linen-border}` (`#DDD9D0`) on light backgrounds.

Cards on dark backgrounds use `rgba(255,255,255,0.04)` fill — barely visible, enough to separate.

## Shapes

Border-radius is conservative:
- **4px** — buttons, input fields
- **6px** — cards, swatches, info blocks
- **8px** — larger cards only

Do not use pill-shaped buttons (large radius). They read as consumer-app, not practitioner-grade.

## Components

**Wordmark** — `{ foobar }` in Courier New, 600 weight, amber brackets mandatory. Always include the thin-space (`&thinsp;`) padding inside brackets. "consulting" renders below in 10px / 5px tracking / uppercase / subdued color — never in amber. Minimum rendered size: 24px mark height.

Two approved variants: dark (linen text, amber brackets, charcoal background) and light (charcoal text, amber-dark brackets, linen background). The dark variant is preferred.

**Primary Button** — amber fill, charcoal text, 4px radius, 14px/28px padding. Used for the Calendly CTA ("Book a free call"). One per visible viewport maximum.

**Nav** — sticky, charcoal, 64px tall. Wordmark left at 20px; nav links right at 13px in `light-on-dark`; "Book a call" CTA as `btn-nav` rightmost. Active link renders in amber.

**Section Labels** — 10px / 600 / 3px tracking / uppercase / amber-dark. Always followed by a linen-border bottom rule. Used to introduce major sections (e.g., "01 — Brand Foundation").

**Tagline Items** — left-border accent cards (3px amber left border, linen background, 0 6px 6px 0 radius). The "preferred" item uses amber left border and a slightly warmer fill (`#FDF6EA`).

## Do's and Don'ts

**Do:**
- Render the wordmark in monospace at every appearance
- Use amber sparingly — one dominant CTA per section
- Use linen instead of white for warm-background contexts
- Use forest exclusively for trust/success states
- Use serif only for display text and major headers
- Keep "consulting" subdued — never let it compete with the mark

**Don't:**
- Render the wordmark in a single color — amber brackets are mandatory
- Use dark/hacker aesthetic: no green-on-black, no neon, no skull motifs
- Use amber as a text color on body copy — only for marks, CTAs, and accent labels
- Use round/pill buttons — they undercut the practitioner credibility
- Use fear-based copy ("hackers are coming for you") — lead with problem-solving
- Omit the thin-space inside brackets in HTML contexts
- Place the wordmark on a low-contrast or patterned background
