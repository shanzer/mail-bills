# iOS App Full-Screen Refinement Design

Date: 2026-05-19
Scope: Refine the in-progress `MailBillsScan` iPhone UI refresh so the screens feel full-screen rather than inset, keep the app identity in fixed chrome instead of the scroll body, and add a matching app icon.

## Goal

Adjust the approved UI refresh so it feels more like a dedicated utility app and less like content cards floating on a page.

This refinement should:

- reduce the inset/board feeling
- keep the app identity fixed in top chrome instead of inside scrolling content
- prevent the title/brand from visually colliding with scrolling sections
- add a simple app icon that matches the approved palette and typography

The existing pairing, scanning, upload, retry, and outbox behavior must remain unchanged.

## Layout Direction

The selected direction is a full-screen utility layout.

### Core changes

- Both `PairingView` and `ScanView` should feel full-screen rather than carded.
- The linen page background can remain, but the main charcoal work surfaces should span the body width more assertively instead of reading like centered floating boards.
- The app identity should live in fixed top chrome rather than inside the scroll body.

### Top chrome

Both primary screens should use a fixed top bar:

- charcoal background
- monospace `{ mail bills }` mark on the left
- compact contextual label on the right, such as `Pairing` or `Scanner`

This top bar should remain outside the scrolling content so the app identity does not scroll through or overlap the screen content.

## Pairing Screen Refinement

`PairingView` should keep the existing setup-console hierarchy but change the framing.

### Required changes

- Move the app mark out of the scrolling body and into fixed top chrome.
- Keep the serif screen heading in the body below the fixed bar.
- Make the preferred-path action area feel broader and more structural, not like a floating card with excessive inset.
- Keep the manual pairing section in the body below the action area.

### Behavior constraints

- QR pairing remains the preferred path.
- Manual endpoint/token pairing still behaves the same.
- JSON paste flow remains unchanged.
- Error handling remains inline near the manual action path.

## Scan Screen Refinement

`ScanView` should keep the action-first hierarchy but use the same fixed top chrome treatment.

### Required changes

- Move `Mail Bills Scan` out of the scrolling body and into fixed top chrome.
- Keep the main body below the fixed bar.
- Make the charcoal hero area feel like an anchored full-width operational surface rather than an inset board.
- Preserve the dominant scan CTA, paired-machine context, metrics, and subordinate detail/operations sections.

### First-screen fit requirement

On iPhone 16, the entire first charcoal scan block must fit in the initial viewport without scrolling.

That means the first screenful must show:

- the paired-machine/status row
- the hero readiness line
- the pending-upload line
- the full `Scan Mail Item` button
- the three-item metrics row

This requirement is specific to `ScanView` and takes priority over keeping a separate large body heading above the hero.

### Selected fit direction

The selected correction is the tighter `B` direction from the visual review: the scan hero itself becomes the screen introduction.

This means:

- keep the fixed top chrome
- remove the extra serif heading above the scan hero in the scroll body
- move the short serif readiness line into the charcoal hero
- tighten the vertical spacing inside the hero instead of globally shrinking the whole app
- prefer a denser one-row metrics presentation before wrapping

The goal is to reclaim vertical space by simplifying the scan screen composition, not by making the controls feel undersized.

### Behavior constraints

- Do not change scan, upload, retry, new-batch, or forget-pairing behavior.
- Do not regress the status-state fixes already made in the current worktree.

## Visual Rules

The previous palette and typography decisions still apply:

- charcoal for operational surfaces and top chrome
- linen for background
- amber for the single primary action and the icon accent
- serif only for major body headings
- monospace for the app mark and technical accents

This refinement should push the interface toward a more dedicated-tool feel, not a softer consumer card layout.

## App Icon

The selected icon direction is `A`: the wordmark-initial icon.

### Icon design

- charcoal rounded-square background
- minimal monospace `{m}` mark centered in the icon
- linen braces
- amber `m`

### Icon goals

- simple and legible at small sizes
- visually consistent with the fixed top-bar wordmark
- restrained and tool-like rather than illustrative

### Constraints

- Stay within the approved palette
- Avoid adding document illustrations, scan-frame graphics, or multiple symbols
- Keep the mark centered and bold enough for small icon sizes

## Implementation Boundaries

Allowed changes:

- `PairingView` and `ScanView` framing/layout adjustments
- small shared UI helpers needed to support fixed chrome or full-width sections
- app icon asset creation and Xcode asset registration

Do not change:

- pairing logic
- upload logic
- outbox behavior
- scanner behavior
- app routing

## Verification

After implementation, verify:

- `PairingView` and `ScanView` both keep the app mark fixed outside scrolling content
- the main operational sections feel full-screen rather than carded
- the scroll body no longer collides visually with the app identity
- on iPhone 16, the full scan hero fits in the initial viewport without scrolling
- the app icon appears correctly in the Xcode app target
- existing app behavior still works as before

Manual verification remains important for:

- scanner presentation
- paired/manual flow
- scroll behavior on smaller phones
- icon appearance in the app target and simulator
