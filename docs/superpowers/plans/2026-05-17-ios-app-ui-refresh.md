# iOS App UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the `MailBillsScan` iPhone app UI so the existing pairing and scan/upload workflow feels like a polished action-first utility without changing behavior.

**Architecture:** Keep `ContentView` as the routing switch and preserve all existing upload/pairing logic. Add a small shared SwiftUI design layer for colors, typography, and reusable status/action sections, then rebuild `PairingView` and `ScanView` on top of that shared layer.

**Tech Stack:** SwiftUI, UIKit/VisionKit integration already in the app, Xcode project at `ios/MailBillsScan/MailBillsScan.xcodeproj`

---

## File Structure

Planned files and responsibilities:

- Create: `ios/MailBillsScan/MailBillsScan/UI/AppTheme.swift`
  Purpose: shared palette, spacing, corner radius, and typography helpers for the UI refresh
- Create: `ios/MailBillsScan/MailBillsScan/UI/AppComponents.swift`
  Purpose: reusable SwiftUI pieces for work surfaces, metric strips, section labels, feedback banners, and action buttons
- Modify: `ios/MailBillsScan/MailBillsScan/Views/PairingView.swift`
  Purpose: replace the plain setup form with the approved setup-console layout while keeping pairing behavior intact
- Modify: `ios/MailBillsScan/MailBillsScan/Views/ScanView.swift`
  Purpose: replace the `Form` layout with the approved action-first scan screen and supporting state treatments
- Modify: `ios/MailBillsScan/MailBillsScan/ContentView.swift`
  Purpose: align any app-level alert/background framing with the new UI language if needed
- Modify: `ios/MailBillsScan/MailBillsScan.xcodeproj/project.pbxproj`
  Purpose: register any new shared UI source files with the app target

Constraints discovered during planning:

- The Xcode project currently has a single app target and no XCTest target
- Verification for this work is manual unless a test target is added separately, which is out of scope for this pass

### Task 1: Add Shared UI Theme Tokens

**Files:**
- Create: `ios/MailBillsScan/MailBillsScan/UI/AppTheme.swift`
- Modify: `ios/MailBillsScan/MailBillsScan.xcodeproj/project.pbxproj`

- [ ] **Step 1: Create the shared theme file**

```swift
import SwiftUI

enum AppTheme {
    enum ColorPalette {
        static let linen = Color(red: 245 / 255, green: 241 / 255, blue: 235 / 255)
        static let linenDark = Color(red: 237 / 255, green: 232 / 255, blue: 224 / 255)
        static let linenBorder = Color(red: 221 / 255, green: 217 / 255, blue: 208 / 255)
        static let charcoal = Color(red: 27 / 255, green: 37 / 255, blue: 53 / 255)
        static let charcoalMid = Color(red: 36 / 255, green: 48 / 255, blue: 64 / 255)
        static let slate = Color(red: 51 / 255, green: 78 / 255, blue: 104 / 255)
        static let amber = Color(red: 224 / 255, green: 155 / 255, blue: 45 / 255)
        static let amberDark = Color(red: 192 / 255, green: 120 / 255, blue: 24 / 255)
        static let forest = Color(red: 42 / 255, green: 122 / 255, blue: 94 / 255)
        static let lightOnDark = Color(red: 168 / 255, green: 189 / 255, blue: 208 / 255)
        static let bodyText = Color(red: 44 / 255, green: 62 / 255, blue: 80 / 255)
        static let error = Color(red: 140 / 255, green: 45 / 255, blue: 45 / 255)
    }

    enum CornerRadius {
        static let control: CGFloat = 4
        static let card: CGFloat = 6
        static let panel: CGFloat = 8
    }

    enum Spacing {
        static let xs: CGFloat = 8
        static let sm: CGFloat = 16
        static let md: CGFloat = 24
        static let lg: CGFloat = 40
    }
}

extension Font {
    static let appDisplay = Font.custom("Georgia", size: 30, relativeTo: .title)
    static let appSectionLabel = Font.system(size: 10, weight: .semibold, design: .default)
    static let appBody = Font.system(size: 16, weight: .regular, design: .default)
    static let appMono = Font.system(size: 14, weight: .medium, design: .monospaced)
}
```

- [ ] **Step 2: Register the new file in the Xcode project**

```pbxproj
/* Add a PBXFileReference for AppTheme.swift in the UI group. */
100000000000000000000211 /* AppTheme.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = UI/AppTheme.swift; sourceTree = "<group>"; };

/* Add a PBXBuildFile entry and include it in Sources. */
100000000000000000000110 /* AppTheme.swift in Sources */ = {isa = PBXBuildFile; fileRef = 100000000000000000000211 /* AppTheme.swift */; };
```

Run: none yet
Expected: `AppTheme.swift` is available to the app target

- [ ] **Step 3: Commit the theme scaffolding**

```bash
git add ios/MailBillsScan/MailBillsScan/UI/AppTheme.swift ios/MailBillsScan/MailBillsScan.xcodeproj/project.pbxproj
git commit -m "Add MailBillsScan shared UI theme"
```

### Task 2: Add Reusable Utility UI Components

**Files:**
- Create: `ios/MailBillsScan/MailBillsScan/UI/AppComponents.swift`
- Modify: `ios/MailBillsScan/MailBillsScan.xcodeproj/project.pbxproj`

- [ ] **Step 1: Create the shared component file**

```swift
import SwiftUI

struct WorkSurface<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            content
        }
        .padding(AppTheme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.ColorPalette.charcoal)
        .foregroundStyle(AppTheme.ColorPalette.linen)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.panel, style: .continuous))
    }
}

struct SectionLabel: View {
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            Text(text.uppercased())
                .font(.appSectionLabel)
                .tracking(3)
                .foregroundStyle(AppTheme.ColorPalette.amberDark)
            Rectangle()
                .fill(AppTheme.ColorPalette.linenBorder)
                .frame(height: 1)
        }
    }
}

struct FeedbackBanner: View {
    enum Tone {
        case success
        case warning
        case error
        case neutral
    }

    let title: String
    let message: String
    let tone: Tone

    var accent: Color {
        switch tone {
        case .success: AppTheme.ColorPalette.forest
        case .warning: AppTheme.ColorPalette.amberDark
        case .error: AppTheme.ColorPalette.error
        case .neutral: AppTheme.ColorPalette.slate
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.headline)
            Text(message)
                .font(.subheadline)
        }
        .padding(AppTheme.Spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(accent.opacity(0.12))
        .overlay(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.card, style: .continuous)
                .stroke(accent, lineWidth: 1),
            alignment: .center
        )
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.card, style: .continuous))
    }
}
```

- [ ] **Step 2: Add utility-specific metric and action components**

```swift
struct MetricStrip: View {
    let items: [(label: String, value: String)]

    var body: some View {
        HStack(spacing: AppTheme.Spacing.sm) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.label.uppercased())
                        .font(.appSectionLabel)
                        .tracking(2.5)
                        .foregroundStyle(AppTheme.ColorPalette.lightOnDark)
                    Text(item.value)
                        .font(.appMono)
                        .foregroundStyle(AppTheme.ColorPalette.linen)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

struct PrimaryUtilityButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(configuration.isPressed ? AppTheme.ColorPalette.amberDark : AppTheme.ColorPalette.amber)
            .foregroundStyle(AppTheme.ColorPalette.charcoal)
            .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.control, style: .continuous))
    }
}
```

- [ ] **Step 3: Register the new component file in the Xcode project**

```pbxproj
/* Add a PBXFileReference for AppComponents.swift in the UI group. */
100000000000000000000212 /* AppComponents.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = UI/AppComponents.swift; sourceTree = "<group>"; };

/* Add a PBXBuildFile entry and include it in Sources. */
100000000000000000000111 /* AppComponents.swift in Sources */ = {isa = PBXBuildFile; fileRef = 100000000000000000000212 /* AppComponents.swift */; };
```

Run: none yet
Expected: shared components compile into the app target

- [ ] **Step 4: Commit the shared components**

```bash
git add ios/MailBillsScan/MailBillsScan/UI/AppComponents.swift ios/MailBillsScan/MailBillsScan.xcodeproj/project.pbxproj
git commit -m "Add MailBillsScan utility UI components"
```

### Task 3: Rebuild PairingView as a Setup Console

**Files:**
- Modify: `ios/MailBillsScan/MailBillsScan/Views/PairingView.swift`

- [ ] **Step 1: Replace the plain stack layout with the approved screen hierarchy**

```swift
var body: some View {
    NavigationStack {
        ScrollView {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                    Text("{ mail bills }")
                        .font(.appMono)
                        .foregroundStyle(AppTheme.ColorPalette.charcoal)
                    Text("Pair to your Mac intake receiver")
                        .font(.appDisplay)
                        .foregroundStyle(AppTheme.ColorPalette.charcoal)
                    Text("Scan the pairing QR first. Manual endpoint and token entry remain available as a fallback.")
                        .font(.appBody)
                        .foregroundStyle(AppTheme.ColorPalette.bodyText)
                }

                WorkSurface {
                    Text("Setup Console")
                        .font(.headline)
                    Text("Preferred path")
                        .font(.appSectionLabel)
                        .tracking(3)
                        .foregroundStyle(AppTheme.ColorPalette.lightOnDark)
                    Button("Scan Pairing QR") {
                        showingQRScanner = true
                    }
                    .buttonStyle(PrimaryUtilityButtonStyle())
                }

                SectionLabel(text: "Manual Pairing")
                manualPairingSection

                if let message {
                    FeedbackBanner(title: "Pairing issue", message: message, tone: .error)
                }
            }
            .padding(AppTheme.Spacing.sm)
        }
        .background(AppTheme.ColorPalette.linen.ignoresSafeArea())
    }
}
```

- [ ] **Step 2: Extract a manual-pairing section that preserves the current behavior**

```swift
private var manualPairingSection: some View {
    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
        TextField("http://yoyodyne:8765/api/mail-bills/intake", text: $endpoint)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .keyboardType(.URL)
            .padding(12)
            .background(Color.white)
            .overlay(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.control, style: .continuous).stroke(AppTheme.ColorPalette.linenBorder, lineWidth: 1))

        SecureField("Bearer token", text: $token)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .padding(12)
            .background(Color.white)
            .overlay(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.control, style: .continuous).stroke(AppTheme.ColorPalette.linenBorder, lineWidth: 1))

        DisclosureGroup("Paste pairing JSON instead") {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                TextEditor(text: $pairingJSON)
                    .frame(minHeight: 120)
                    .padding(8)
                    .background(Color.white)
                    .overlay(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.card, style: .continuous).stroke(AppTheme.ColorPalette.linenBorder, lineWidth: 1))

                Button("Fill Fields from JSON") {
                    fillFromJSON()
                }
                .buttonStyle(.bordered)
            }
            .padding(.top, AppTheme.Spacing.xs)
        }

        Button("Pair with Mac") {
            pairFromFields()
        }
        .buttonStyle(PrimaryUtilityButtonStyle())
        .disabled(endpoint.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }
}
```

- [ ] **Step 3: Restyle the QR sheet framing without changing scan behavior**

```swift
.sheet(isPresented: $showingQRScanner) {
    NavigationStack {
        PairingQRScannerView { scannedText in
            showingQRScanner = false
            pairFromScannedText(scannedText)
        }
        .background(AppTheme.ColorPalette.charcoal.ignoresSafeArea())
        .navigationTitle("Scan Pairing QR")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") {
                    showingQRScanner = false
                }
            }
        }
    }
    .tint(AppTheme.ColorPalette.amberDark)
}
```

- [ ] **Step 4: Build the app target and fix any compile issues immediately**

Run: `xcodebuild -project ios/MailBillsScan/MailBillsScan.xcodeproj -scheme MailBillsScan -sdk iphonesimulator build`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 5: Commit the pairing-screen redesign**

```bash
git add ios/MailBillsScan/MailBillsScan/Views/PairingView.swift
git commit -m "Redesign MailBillsScan pairing screen"
```

### Task 4: Rebuild ScanView as an Action-First Utility Screen

**Files:**
- Modify: `ios/MailBillsScan/MailBillsScan/Views/ScanView.swift`

- [ ] **Step 1: Replace the `Form` with a custom scroll layout and dominant scan CTA**

```swift
var body: some View {
    NavigationStack {
        ScrollView {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
                WorkSurface {
                    HStack {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Paired Mac")
                                .font(.appSectionLabel)
                                .tracking(3)
                                .foregroundStyle(AppTheme.ColorPalette.lightOnDark)
                            Text(pairing.endpoint.host ?? pairing.endpoint.absoluteString)
                                .font(.headline)
                        }
                        Spacer()
                        Text(outboxCount == 0 ? "No pending uploads" : "\(outboxCount) pending")
                            .font(.appMono)
                            .foregroundStyle(AppTheme.ColorPalette.lightOnDark)
                    }

                    Text(statusText)
                        .font(.appDisplay)
                        .foregroundStyle(AppTheme.ColorPalette.linen)

                    Button(isUploading ? "Uploading..." : "Scan Mail Item") {
                        isShowingScanner = true
                    }
                    .buttonStyle(PrimaryUtilityButtonStyle())
                    .disabled(isUploading || isRetryingOutbox || !VNDocumentCameraViewController.isSupported)

                    MetricStrip(items: [
                        ("Batch", batchId),
                        ("Scanned", "\(itemCount)"),
                        ("Label", selectedCategory.label)
                    ])
                }

                nextItemDetailsSection
                feedbackSection
                secondaryActionsSection
            }
            .padding(AppTheme.Spacing.sm)
        }
        .background(AppTheme.ColorPalette.linen.ignoresSafeArea())
        .navigationTitle("Mail Bills Scan")
    }
}
```

- [ ] **Step 2: Extract subordinate details and feedback sections**

```swift
private var nextItemDetailsSection: some View {
    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
        SectionLabel(text: "Next Item Details")
        Picker("Label", selection: $selectedCategory) {
            ForEach(MailCategory.allCases) { category in
                Text(category.label).tag(category)
            }
        }
        .pickerStyle(.menu)

        TextField("Optional note", text: $note, axis: .vertical)
            .lineLimit(2...4)
            .padding(12)
            .background(Color.white)
            .overlay(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.control, style: .continuous).stroke(AppTheme.ColorPalette.linenBorder, lineWidth: 1))
    }
}

@ViewBuilder
private var feedbackSection: some View {
    if let lastError {
        FeedbackBanner(title: "Attention needed", message: lastError, tone: .warning)
    } else if statusText.hasPrefix("Uploaded ") {
        FeedbackBanner(title: "Upload complete", message: statusText, tone: .success)
    } else if statusText == "Saved pending upload" {
        FeedbackBanner(title: "Saved for retry", message: "The document stayed on the phone and can be retried later.", tone: .warning)
    } else {
        FeedbackBanner(title: "Ready", message: "No pending issues. Scan the next mail item when ready.", tone: .neutral)
    }
}
```

- [ ] **Step 3: Extract secondary actions and keep the destructive action isolated**

```swift
private var secondaryActionsSection: some View {
    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
        SectionLabel(text: "Operations")

        Button(isRetryingOutbox ? "Retrying..." : "Retry Pending Uploads") {
            Task { await retryOutbox() }
        }
        .buttonStyle(.bordered)
        .disabled(isUploading || isRetryingOutbox || outboxCount == 0)

        Button("Start New Batch") {
            batchId = BatchClock.makeBatchId()
            itemCount = 0
            statusText = "Ready"
            lastError = nil
        }
        .buttonStyle(.bordered)

        Button("Forget Pairing", role: .destructive) {
            onResetPairing()
        }
        .buttonStyle(.bordered)
    }
}
```

- [ ] **Step 4: Keep upload and retry state messages aligned with the new UI semantics**

```swift
do {
    try await uploadClient.upload(pdf: pdf, sidecar: sidecarData, pairing: pairing)
    itemCount = nextCount
    note = ""
    statusText = "Uploaded \(documentId)"
} catch {
    do {
        try outboxStore.save(documentId: documentId, pdf: pdf, sidecar: sidecarData)
        itemCount = nextCount
        note = ""
        refreshOutboxCount()
        lastError = "Upload failed on the network, but the document was saved locally for retry."
        statusText = "Saved pending upload"
    } catch {
        lastError = "Upload failed and the document could not be saved for retry: \(error.localizedDescription)"
        statusText = "Upload failed"
    }
}
```

- [ ] **Step 5: Build the app target and fix any compile issues immediately**

Run: `xcodebuild -project ios/MailBillsScan/MailBillsScan.xcodeproj -scheme MailBillsScan -sdk iphonesimulator build`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 6: Commit the scan-screen redesign**

```bash
git add ios/MailBillsScan/MailBillsScan/Views/ScanView.swift
git commit -m "Redesign MailBillsScan scan screen"
```

### Task 5: Align App-Level Framing and Final Verification

**Files:**
- Modify: `ios/MailBillsScan/MailBillsScan/ContentView.swift`

- [ ] **Step 1: Restyle any remaining app-level error framing only if it still clashes**

```swift
var body: some View {
    Group {
        if let pairing {
            ScanView(pairing: pairing) {
                resetPairing()
            }
        } else {
            PairingView { payload in
                try store.save(payload)
                pairing = payload
            }
        }
    }
    .background(AppTheme.ColorPalette.linen.ignoresSafeArea())
    .alert("Mail Bills Scan", isPresented: Binding(get: { errorText != nil }, set: { if !$0 { errorText = nil } })) {
        Button("OK", role: .cancel) {}
    } message: {
        Text(errorText ?? "")
    }
}
```

- [ ] **Step 2: Build the app target one final time**

Run: `xcodebuild -project ios/MailBillsScan/MailBillsScan.xcodeproj -scheme MailBillsScan -sdk iphonesimulator build`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 3: Run the manual verification checklist on the simulator or device**

Run: `open ios/MailBillsScan/MailBillsScan.xcodeproj`
Expected: Xcode opens the project for simulator/device verification

Manual checklist:

- Pair successfully with valid QR or manual endpoint/token
- Enter invalid endpoint data and confirm styled inline feedback appears
- Scan and upload a test document successfully
- Force an upload failure and confirm the app reports local retry save calmly
- Retry pending uploads and confirm the pending count/status update
- Start a new batch and confirm counters/status reset
- Forget pairing and confirm the app returns to the pairing screen
- Check that the main scan action is visually dominant in both light and dark device conditions

- [ ] **Step 4: Commit any final app-level polish**

```bash
git add ios/MailBillsScan/MailBillsScan/ContentView.swift ios/MailBillsScan/MailBillsScan/Views/PairingView.swift ios/MailBillsScan/MailBillsScan/Views/ScanView.swift ios/MailBillsScan/MailBillsScan/UI/AppTheme.swift ios/MailBillsScan/MailBillsScan/UI/AppComponents.swift ios/MailBillsScan/MailBillsScan.xcodeproj/project.pbxproj
git commit -m "Finish MailBillsScan UI refresh"
```

## Self-Review

Spec coverage check:

- Visual system is covered by Task 1 and Task 2
- `PairingView` setup-console redesign is covered by Task 3
- `ScanView` action-first hierarchy is covered by Task 4
- Supporting states and scanner framing are covered by Task 3 and Task 4
- App-level framing and manual verification are covered by Task 5

Placeholder scan:

- No `TBD`, `TODO`, or deferred references remain in this plan
- Every task lists exact files and concrete commands

Type consistency check:

- Shared UI names stay consistent across tasks: `AppTheme`, `WorkSurface`, `SectionLabel`, `FeedbackBanner`, `MetricStrip`, `PrimaryUtilityButtonStyle`
- Primary view names and existing state properties match the current codebase: `PairingView`, `ScanView`, `statusText`, `lastError`, `selectedCategory`, `batchId`, `itemCount`
