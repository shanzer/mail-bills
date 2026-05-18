# iOS App UI Refresh Design

Date: 2026-05-17
Scope: Visual redesign of the existing iPhone app UI in `ios/MailBillsScan` without changing pairing, scanning, upload, or outbox behavior.

## Goal

Improve the current iOS app UI from a basic prototype into a cleaner, utility-focused interface. The redesign should preserve the current workflow:

- Pair with the Mac intake receiver
- Scan one mail item
- Upload immediately
- Save failed uploads for retry

The updated UI should feel operational, dependable, and intentionally styled, with the scan action visually dominant.

## Direction

The selected direction is an action-first utility UI with style cues borrowed from `/Users/shanzer/src/foobar-style/DESIGN.md`.

The app should borrow:

- Charcoal and linen as the primary surface contrast
- Amber as the single primary-action accent
- Conservative corner radii
- Serif reserved for major headings only
- Monospace reserved for technical accents and labels
- Depth expressed through dark/light layering and fine borders rather than heavy shadows

The app should not become a literal port of the Foobar site design. It remains a scanning tool first.

## Visual System

### Color

- `charcoal` is the primary dark work surface color
- `linen` or a nearby warm off-white is the default screen background
- `amber` is reserved for the main CTA on each screen and small accent labels
- `forest` is reserved for positive/success states only
- red should only appear for hard failures, and only in contained feedback components

Color hierarchy:

- Charcoal for operational surfaces and strong text
- Amber for one dominant action and selected highlights
- Slate or muted blue-gray for secondary UI framing
- Forest for success
- Linen for background and light panels

### Typography

- Major screen headings may use the Georgia serif stack
- All operational copy uses the iOS system sans stack
- Technical accents such as batch IDs, pairing indicators, and compact labels may use monospace
- Small uppercase labels use tight tracking and restrained sizing

Typography roles must stay strict:

- serif for titles only
- sans for body and controls
- monospace for technical accents only

### Shape and Elevation

- Buttons and fields use tight radii around 4px
- Cards and information blocks use 6px to 8px radii
- Avoid pill buttons
- Avoid glossy shadows
- Use borders, contrast, and panel stacking for separation

## Screen Hierarchy

The app hierarchy should be blunt and obvious.

On the scan screen:

- the primary scan action is the first and strongest element
- current readiness and paired-machine context sit above or near it
- batch metrics and pending upload count remain visible but secondary
- label and note inputs are clearly subordinate setup controls
- retry, new batch, and forget pairing are lower-priority controls grouped below the main action area

## Pairing Screen

`PairingView` should feel like a setup console rather than a plain form.

### Structure

- A compact product mark or title at the top
- A short explanation that the app pairs to the Mac intake receiver
- One main dark setup card as the visual work surface
- `Scan Pairing QR` as the primary action inside that card
- Manual endpoint and token fields below as the fallback path
- Pairing JSON behind a disclosure section as a recovery path, not part of the default happy path

### Interaction Intent

- QR pairing should feel like the preferred path
- Manual pairing remains available and clear
- Successful pairing should transition directly into the scan screen without additional friction
- Invalid endpoint/token/JSON states should appear in styled inline feedback rather than raw text

## Scan Screen

`ScanView` should become an action-first utility screen.

### Structure

- Compact paired-machine indicator and readiness status near the top
- Large amber `Scan Mail Item` button as the dominant element
- A compact operational strip or panel with:
  - batch ID
  - scanned count
  - pending upload count
  - currently selected label
- A subordinate section for the label picker and optional note
- A lower section for retry pending uploads and start new batch
- Forget pairing visually isolated as the destructive action

### Hierarchy Rules

- The scan button must remain visually stronger than every other control
- Metrics must be easy to read without competing with the scan action
- Editing controls should read as setup for the next scan, not as dashboard peers

## Supporting States

Supporting states are in scope for the redesign.

### Success

- Successful upload should show a contained positive confirmation on the work surface
- Success can use a forest accent
- Example tone: `Uploaded 20260517-05`

### Retry-Saved Failure

- If upload fails but the item is saved locally, present a calm warning state
- Use amber or slate treatment rather than catastrophic red
- The message should explain that the item was saved and can be retried later

### Hard Failure

- Hard failures should appear in a contained error panel
- Avoid dropping unstyled red text into the form
- Error presentation should stay operational and readable

### Empty Outbox

- Zero pending uploads should read as an explicit reassuring state such as `No pending uploads`
- Do not rely on a bare metric value alone

### Scanner Framing

- The scanner sheet title and cancel affordance should feel visually aligned with the rest of the app
- The scanner flow should not feel like a detached utility bolted onto a plain form

## Implementation Boundaries

This is a behavior-preserving redesign.

Do not change:

- pairing storage behavior
- upload request behavior
- outbox semantics
- scanner integration behavior
- document metadata generation
- app routing in `ContentView`

Allowed changes:

- SwiftUI layout composition
- styling tokens and shared UI constants
- extraction of small reusable UI components
- clearer state presentation
- better grouping and hierarchy

Any refactoring should be in service of view clarity and consistent styling only.

## Expected Implementation Shape

The redesign should likely introduce a small shared design layer inside the iOS app, such as:

- local palette constants
- typography helpers
- reusable status/metric/action sections
- reusable feedback banner or panel components

Primary view targets:

- `ios/MailBillsScan/MailBillsScan/Views/PairingView.swift`
- `ios/MailBillsScan/MailBillsScan/Views/ScanView.swift`

Potential supporting updates:

- scanner sheet framing from `ContentView` / `PairingView`
- alert and feedback presentation consistency

## Verification

Behavior must be manually verified after the UI pass:

- pair successfully with valid data
- reject invalid pairing input cleanly
- scan and upload successfully
- fail upload and save to outbox
- retry pending uploads
- start a new batch
- forget pairing

Basic accessibility checks:

- strong contrast for the main CTA and status text
- clear labels for major buttons
- scan action remains obvious at a glance

## Non-Goals

- No workflow redesign
- No navigation restructure
- No data model changes
- No backend or API changes
- No expansion into broader iOS feature work
