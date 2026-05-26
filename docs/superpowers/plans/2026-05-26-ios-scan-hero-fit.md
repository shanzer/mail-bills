# iOS Scan Hero Fit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the full `ScanView` hero block fit in the initial iPhone 16 viewport without scrolling while preserving the approved full-screen utility styling and all existing scan behavior.

**Architecture:** Keep the fix local to the iOS SwiftUI presentation layer. Tighten `ScanView` composition so the hero carries the screen introduction, and make only the smallest shared-component adjustments needed to support a denser one-row metric strip and less inset framing.

**Tech Stack:** SwiftUI, VisionKit, Xcode project at `ios/MailBillsScan/MailBillsScan.xcodeproj`

---

## File Structure

Planned files and responsibilities:

- Modify: `ios/MailBillsScan/MailBillsScan/Views/ScanView.swift`
  Purpose: remove the extra body heading, move the serif readiness line into the hero, tighten spacing, and keep the first charcoal block within the initial viewport.
- Modify: `ios/MailBillsScan/MailBillsScan/UI/AppComponents.swift`
  Purpose: support a denser hero surface and metrics presentation without changing scan behavior.

Constraints discovered during planning:

- The iOS target in this repo does not have an existing XCTest or snapshot-test target for SwiftUI layout verification.
- Adding a new UI test harness is out of scope for this bugfix, so verification is build-based plus simulator/manual viewport checks.

### Task 1: Tighten Shared Hero Components

**Files:**
- Modify: `ios/MailBillsScan/MailBillsScan/UI/AppComponents.swift`

- [ ] **Step 1: Adjust `WorkSurface` and `MetricStrip` APIs for the compact scan hero**

```swift
struct WorkSurface<Content: View>: View {
    let spacing: CGFloat
    let padding: CGFloat
    let cornerRadius: CGFloat
    let content: Content

    init(
        spacing: CGFloat = AppTheme.Spacing.sm,
        padding: CGFloat = AppTheme.Spacing.sm,
        cornerRadius: CGFloat = AppTheme.CornerRadius.panel,
        @ViewBuilder content: () -> Content
    ) {
        self.spacing = spacing
        self.padding = padding
        self.cornerRadius = cornerRadius
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: spacing) {
            content
        }
        .padding(padding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.ColorPalette.charcoal)
        .foregroundStyle(AppTheme.ColorPalette.linen)
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }
}

struct MetricStrip: View {
    let items: [MetricItem]
    var spacing: CGFloat = AppTheme.Spacing.sm

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: spacing) {
                ForEach(items) { item in
                    metricView(for: item)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            VStack(alignment: .leading, spacing: spacing) {
                ForEach(items) { item in
                    metricView(for: item)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }
}
```

- [ ] **Step 2: Keep the primary button compact enough for the viewport budget**

```swift
struct PrimaryUtilityButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(backgroundColor(isPressed: configuration.isPressed))
            .foregroundStyle(foregroundColor)
            .opacity(isEnabled ? 1 : 0.7)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.control, style: .continuous))
    }
}
```

- [ ] **Step 3: Build the iOS target to confirm the shared component changes compile**

Run: `xcodebuild -project ios/MailBillsScan/MailBillsScan.xcodeproj -scheme MailBillsScan -sdk iphonesimulator build`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 4: Commit the shared component adjustment**

```bash
git add ios/MailBillsScan/MailBillsScan/UI/AppComponents.swift
git commit -m "Tighten MailBillsScan hero layout components"
```

### Task 2: Recompose ScanView for First-Screen Fit

**Files:**
- Modify: `ios/MailBillsScan/MailBillsScan/Views/ScanView.swift`

- [ ] **Step 1: Remove the extra body heading and make the hero introduce the screen**

```swift
var body: some View {
    NavigationStack {
        ScrollView {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                scanHero
                nextItemDetailsSection
                feedbackSection
                secondaryActionsSection
            }
            .padding(.horizontal, AppTheme.Spacing.sm)
            .padding(.top, AppTheme.Spacing.xs)
            .padding(.bottom, AppTheme.Spacing.sm)
        }
        .background(AppTheme.ColorPalette.linen.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
    }
}
```

- [ ] **Step 2: Add a compact `scanHero` view with the full first-screen content**

```swift
private var scanHero: some View {
    WorkSurface(spacing: 12, padding: 14, cornerRadius: AppTheme.CornerRadius.panel) {
        HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Paired Mac")
                    .font(.appSectionLabel)
                    .tracking(3)
                    .foregroundStyle(AppTheme.ColorPalette.lightOnDark)
                Text(pairing.endpoint.host ?? pairing.endpoint.absoluteString)
                    .font(.headline)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                Text("State")
                    .font(.appSectionLabel)
                    .tracking(3)
                    .foregroundStyle(AppTheme.ColorPalette.lightOnDark)
                Text(statusHeadline)
                    .font(.headline)
            }
        }

        Text(scanHeroTitle)
            .font(.appDisplay)
            .foregroundStyle(AppTheme.ColorPalette.linen)
            .lineLimit(2)
            .minimumScaleFactor(0.92)

        Text(outboxCount == 0 ? "Pending uploads: none" : "Pending uploads: \(outboxCount)")
            .font(.appBody)
            .foregroundStyle(AppTheme.ColorPalette.lightOnDark)

        Button(isUploading ? "Uploading..." : "Scan Mail Item") {
            isShowingScanner = true
        }
        .buttonStyle(PrimaryUtilityButtonStyle())
        .disabled(isUploading || isRetryingOutbox || !VNDocumentCameraViewController.isSupported)

        MetricStrip(
            items: [
                .init(label: "Batch", value: batchId),
                .init(label: "Scanned", value: "\(itemCount)"),
                .init(label: "Label", value: selectedCategory.label),
            ],
            spacing: 10
        )
    }
}
```

- [ ] **Step 3: Derive short hero copy from the existing status state instead of changing behavior**

```swift
private var scanHeroTitle: String {
    switch statusText {
    case let value where value.hasPrefix("Uploaded "):
        return "Scan the next item"
    case "Saved pending upload":
        return "Saved for retry"
    case "Retry stopped":
        return "Check pending uploads"
    case "Upload failed", "Scan failed", "Outbox unavailable":
        return "Attention needed"
    default:
        return "Scan the next item"
    }
}

private var statusHeadline: String {
    if isUploading {
        return "Uploading"
    }
    if isRetryingOutbox {
        return "Retrying"
    }
    return lastError == nil ? "Ready" : "Needs review"
}
```

- [ ] **Step 4: Build the iOS target again and manually verify the viewport requirement**

Run: `xcodebuild -project ios/MailBillsScan/MailBillsScan.xcodeproj -scheme MailBillsScan -sdk iphonesimulator build`
Expected: `** BUILD SUCCEEDED **`

Manual check in Simulator:
- Launch `MailBillsScan` on an iPhone 16 simulator.
- Confirm the first screenful shows the paired-machine row, serif hero title, pending-upload line, full `Scan Mail Item` button, and metrics row without scrolling.
- Confirm `Next Item Details` begins below the fold.
- Confirm scan, retry, new batch, and forget pairing actions still behave the same.

- [ ] **Step 5: Commit the scan fit fix**

```bash
git add ios/MailBillsScan/MailBillsScan/Views/ScanView.swift ios/MailBillsScan/MailBillsScan/UI/AppComponents.swift
git commit -m "Fit MailBillsScan hero within first viewport"
```

## Self-Review

Spec coverage:
- Fixed top chrome remains untouched by this plan because the current bug is about viewport fit below the chrome.
- The plan implements the approved `B` direction by removing the extra scan heading and moving the hero title into the charcoal block.
- The plan covers the explicit iPhone 16 requirement that the full hero fit without scrolling.

Placeholder scan:
- No `TODO`, `TBD`, or deferred implementation markers remain.
- Commands, files, and manual verification steps are explicit.

Type consistency:
- `WorkSurface` and `MetricStrip` changes are defined before `ScanView` consumes them.
- `scanHeroTitle` and `statusHeadline` are local computed properties referenced only from `ScanView`.
