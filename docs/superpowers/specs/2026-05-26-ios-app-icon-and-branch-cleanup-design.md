# iOS App Icon And Branch Cleanup Design

Date: 2026-05-26
Scope: Add the missing `MailBillsScan` app icon in the `ios-app-ui-refresh` worktree, keep the intentional pending `ScanView` behavior fix, and leave the branch in a clean handoff state.

## Goal

Finish the missing visual asset work that was previously approved but never implemented.

This pass should:

- add a real iOS app icon to the `MailBillsScan` target
- match the approved UI language already used in the refreshed app
- preserve the intentional pending `ScanView` fixes now left uncommitted in the branch
- avoid reintroducing local Xcode account or bundle-identifier drift

This is not a new UI redesign pass. It is a targeted asset and branch-cleanup pass on top of the existing `ios-app-ui-refresh` worktree.

## Current Branch State

At the start of this pass:

- the branch already contains the approved pairing/scan UI redesign work
- the worktree has been cleaned of local Xcode project noise
- the only intentional tracked code diff still pending is in `ScanView.swift`
- there is currently no asset catalog or `AppIcon.appiconset` in the target tree

That means the app icon work is still missing, and this pass should add it explicitly rather than assuming it already exists.

## App Icon Direction

The selected icon direction is a close match to the approved UI language:

- charcoal rounded-square background
- high-legibility off-white `MB` letterforms
- restrained amber accent
- subtle scan-corner brackets behind or around the letters

### Rationale

The icon should optimize for home-screen legibility first. `MB` is clearer than `{m}` at small sizes and better reflects the product name without requiring the full wordmark. The scan-corner cue should stay minimal so the icon still feels restrained and tool-like rather than illustrative.

## Asset Implementation

The icon should be added as a standard Xcode asset catalog resource under the app target.

### Required work

- add an `Assets.xcassets` catalog if the target does not already have one
- add an `AppIcon.appiconset`
- generate the required icon PNG sizes for the iOS target
- add a correct `Contents.json`
- wire the asset catalog into the Xcode project so the icon is bundled normally

### Constraints

- do not change the app display name
- do not change the bundle identifier
- do not add personal development-team settings
- do not introduce unrelated theme or layout edits as part of the icon pass

## Branch Cleanup Scope

This pass should keep the current intentional `ScanView` diff.

That pending diff does three useful things:

- truncates long paired-host text in the tightened hero
- preserves the underlying upload error message when retry-save succeeds
- reports the correct nested save failure when the outbox fallback also fails

Those changes should remain part of the branch and should be committed with the icon work unless a review finds a regression.

This pass should leave unrelated untracked planning folders alone unless they directly interfere with the build.

## Verification

After implementation, verify:

- the iOS target still builds with `xcodebuild -project ios/MailBillsScan/MailBillsScan.xcodeproj -scheme MailBillsScan -sdk iphonesimulator build`
- the asset catalog and `AppIcon.appiconset` are present in the worktree
- the icon set contains the expected generated image files and `Contents.json`
- the branch contains only intentional changes

Manual review is still needed for final visual judgment on the home screen or simulator, but build integration and asset completeness should be verified in this pass.

## Out Of Scope

This pass does not include:

- another layout redesign of `PairingView` or `ScanView`
- logic changes outside the current pending `ScanView` fix
- device-side visual tuning after simulator review
- packaging, merge, or PR work
