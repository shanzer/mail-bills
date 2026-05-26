# iOS App Icon And Branch Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the missing `MailBillsScan` app icon, keep the intentional pending `ScanView` fix, and leave the `ios-app-ui-refresh` branch in a clean handoff state.

**Architecture:** Keep the work local to the iOS target. Create a deterministic macOS Swift renderer that produces a single 1024px master icon in the approved style, generate the required `AppIcon.appiconset` PNGs from that master, wire the asset catalog into the Xcode project explicitly, and retain the existing `ScanView` behavior tweak without reopening the broader UI redesign.

**Tech Stack:** SwiftUI app target, Xcode project file editing, AppKit-based Swift asset renderer, `sips`, `xcodebuild`

---

## File Structure

Planned files and responsibilities:

- Create: `ios/MailBillsScan/tools/render_app_icon.swift`
  Purpose: deterministic renderer for the approved charcoal/linen/amber `MB` icon art at 1024x1024.
- Create: `ios/MailBillsScan/MailBillsScan/Resources/Assets.xcassets/Contents.json`
  Purpose: root asset-catalog manifest.
- Create: `ios/MailBillsScan/MailBillsScan/Resources/Assets.xcassets/AppIcon.appiconset/Contents.json`
  Purpose: declare the icon slots Xcode expects for the iPhone app target.
- Create: `ios/MailBillsScan/MailBillsScan/Resources/Assets.xcassets/AppIcon.appiconset/*.png`
  Purpose: generated icon PNG files for the app icon set.
- Modify: `ios/MailBillsScan/MailBillsScan.xcodeproj/project.pbxproj`
  Purpose: add the asset-catalog file reference, include it in the resources build phase, and declare `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon`.
- Modify: `ios/MailBillsScan/MailBillsScan/Views/ScanView.swift`
  Purpose: preserve the intentional host truncation and improved upload/outbox error reporting currently left uncommitted in the branch.

Constraints discovered during planning:

- The iOS target currently has no `Assets.xcassets` entry in the project file and no `ASSETCATALOG_COMPILER_APPICON_NAME` build setting, so both file creation and project wiring are required.
- There is no existing XCTest or snapshot-test target for icon verification, so validation is asset inspection plus `xcodebuild`.

### Task 1: Render The Master Icon Artwork

**Files:**
- Create: `ios/MailBillsScan/tools/render_app_icon.swift`

- [ ] **Step 1: Create the deterministic Swift icon renderer**

```swift
import AppKit
import Foundation

let outputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let size = CGSize(width: 1024, height: 1024)

let charcoal = NSColor(calibratedRed: 0.14, green: 0.14, blue: 0.13, alpha: 1)
let linen = NSColor(calibratedRed: 0.95, green: 0.92, blue: 0.86, alpha: 1)
let amber = NSColor(calibratedRed: 0.82, green: 0.58, blue: 0.22, alpha: 1)

let image = NSImage(size: size)
image.lockFocus()

let backgroundRect = NSRect(origin: .zero, size: size)
let backgroundPath = NSBezierPath(
    roundedRect: backgroundRect,
    xRadius: 224,
    yRadius: 224
)
charcoal.setFill()
backgroundPath.fill()

let bracketInset: CGFloat = 180
let bracketLength: CGFloat = 92
let bracketWidth: CGFloat = 16
let bracketPath = NSBezierPath()
bracketPath.lineCapStyle = .round
bracketPath.lineWidth = bracketWidth

func addBracket(x: CGFloat, y: CGFloat, dx: CGFloat, dy: CGFloat) {
    bracketPath.move(to: NSPoint(x: x + dx * bracketLength, y: y))
    bracketPath.line(to: NSPoint(x: x, y: y))
    bracketPath.line(to: NSPoint(x: x, y: y + dy * bracketLength))
}

linen.withAlphaComponent(0.18).setStroke()
addBracket(x: bracketInset, y: size.height - bracketInset, dx: 1, dy: -1)
addBracket(x: size.width - bracketInset, y: size.height - bracketInset, dx: -1, dy: -1)
addBracket(x: bracketInset, y: bracketInset, dx: 1, dy: 1)
addBracket(x: size.width - bracketInset, y: bracketInset, dx: -1, dy: 1)
bracketPath.stroke()

let paragraph = NSMutableParagraphStyle()
paragraph.alignment = .center

let mbRect = NSRect(x: 0, y: 282, width: size.width, height: 420)
let mbAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.monospacedSystemFont(ofSize: 360, weight: .bold),
    .foregroundColor: linen,
    .paragraphStyle: paragraph
]
("MB" as NSString).draw(in: mbRect, withAttributes: mbAttributes)

let accentRect = NSRect(x: 648, y: 308, width: 84, height: 84)
let accentPath = NSBezierPath(ovalIn: accentRect)
amber.setFill()
accentPath.fill()

image.unlockFocus()

guard
    let tiffData = image.tiffRepresentation,
    let bitmap = NSBitmapImageRep(data: tiffData),
    let pngData = bitmap.representation(using: .png, properties: [:])
else {
    fatalError("Could not encode icon PNG.")
}

try pngData.write(to: outputURL)
```

- [ ] **Step 2: Run the renderer to generate the 1024px master asset**

Run:
`mkdir -p ios/MailBillsScan/build`
`swift ios/MailBillsScan/tools/render_app_icon.swift ios/MailBillsScan/build/app-icon-1024.png`

Expected:
- `ios/MailBillsScan/build/app-icon-1024.png` exists
- the image is a 1024x1024 PNG with charcoal background, linen `MB`, amber accent, and subtle scan-corner brackets

- [ ] **Step 3: Inspect the generated master file metadata**

Run: `sips -g pixelWidth -g pixelHeight ios/MailBillsScan/build/app-icon-1024.png`
Expected:

```text
pixelWidth: 1024
pixelHeight: 1024
```

- [ ] **Step 4: Commit the renderer and master-art generation step**

```bash
git add ios/MailBillsScan/tools/render_app_icon.swift
git commit -m "Add MailBillsScan app icon renderer"
```

### Task 2: Create The Asset Catalog And Wire It Into Xcode

**Files:**
- Create: `ios/MailBillsScan/MailBillsScan/Resources/Assets.xcassets/Contents.json`
- Create: `ios/MailBillsScan/MailBillsScan/Resources/Assets.xcassets/AppIcon.appiconset/Contents.json`
- Create: `ios/MailBillsScan/MailBillsScan/Resources/Assets.xcassets/AppIcon.appiconset/Icon-*.png`
- Modify: `ios/MailBillsScan/MailBillsScan.xcodeproj/project.pbxproj`

- [ ] **Step 1: Create the asset-catalog directory structure and root manifest**

```json
{
  "info": {
    "author": "xcode",
    "version": 1
  }
}
```

Create directories:

```text
ios/MailBillsScan/MailBillsScan/Resources/Assets.xcassets/
ios/MailBillsScan/MailBillsScan/Resources/Assets.xcassets/AppIcon.appiconset/
```

- [ ] **Step 2: Create the `AppIcon.appiconset/Contents.json` for the iPhone target**

```json
{
  "images": [
    { "filename": "Icon-20@2x.png", "idiom": "iphone", "scale": "2x", "size": "20x20" },
    { "filename": "Icon-20@3x.png", "idiom": "iphone", "scale": "3x", "size": "20x20" },
    { "filename": "Icon-29@2x.png", "idiom": "iphone", "scale": "2x", "size": "29x29" },
    { "filename": "Icon-29@3x.png", "idiom": "iphone", "scale": "3x", "size": "29x29" },
    { "filename": "Icon-40@2x.png", "idiom": "iphone", "scale": "2x", "size": "40x40" },
    { "filename": "Icon-40@3x.png", "idiom": "iphone", "scale": "3x", "size": "40x40" },
    { "filename": "Icon-60@2x.png", "idiom": "iphone", "scale": "2x", "size": "60x60" },
    { "filename": "Icon-60@3x.png", "idiom": "iphone", "scale": "3x", "size": "60x60" },
    { "filename": "Icon-1024.png", "idiom": "ios-marketing", "scale": "1x", "size": "1024x1024" }
  ],
  "info": {
    "author": "xcode",
    "version": 1
  }
}
```

- [ ] **Step 3: Generate the icon PNG sizes from the 1024px master**

Run:

```bash
mkdir -p ios/MailBillsScan/MailBillsScan/Resources/Assets.xcassets/AppIcon.appiconset
sips -z 40 40 ios/MailBillsScan/build/app-icon-1024.png --out ios/MailBillsScan/MailBillsScan/Resources/Assets.xcassets/AppIcon.appiconset/Icon-20@2x.png
sips -z 60 60 ios/MailBillsScan/build/app-icon-1024.png --out ios/MailBillsScan/MailBillsScan/Resources/Assets.xcassets/AppIcon.appiconset/Icon-20@3x.png
sips -z 58 58 ios/MailBillsScan/build/app-icon-1024.png --out ios/MailBillsScan/MailBillsScan/Resources/Assets.xcassets/AppIcon.appiconset/Icon-29@2x.png
sips -z 87 87 ios/MailBillsScan/build/app-icon-1024.png --out ios/MailBillsScan/MailBillsScan/Resources/Assets.xcassets/AppIcon.appiconset/Icon-29@3x.png
sips -z 80 80 ios/MailBillsScan/build/app-icon-1024.png --out ios/MailBillsScan/MailBillsScan/Resources/Assets.xcassets/AppIcon.appiconset/Icon-40@2x.png
sips -z 120 120 ios/MailBillsScan/build/app-icon-1024.png --out ios/MailBillsScan/MailBillsScan/Resources/Assets.xcassets/AppIcon.appiconset/Icon-40@3x.png
sips -z 120 120 ios/MailBillsScan/build/app-icon-1024.png --out ios/MailBillsScan/MailBillsScan/Resources/Assets.xcassets/AppIcon.appiconset/Icon-60@2x.png
sips -z 180 180 ios/MailBillsScan/build/app-icon-1024.png --out ios/MailBillsScan/MailBillsScan/Resources/Assets.xcassets/AppIcon.appiconset/Icon-60@3x.png
cp ios/MailBillsScan/build/app-icon-1024.png ios/MailBillsScan/MailBillsScan/Resources/Assets.xcassets/AppIcon.appiconset/Icon-1024.png
```

Expected:
- all referenced filenames exist under `AppIcon.appiconset/`
- the generated PNG dimensions match the slot sizes in `Contents.json`

- [ ] **Step 4: Add the asset catalog to the Xcode project and declare the app icon name**

Add a file reference and resources build entry similar to:

```pbxproj
100000000000000000000213 /* Assets.xcassets */ = {
	isa = PBXFileReference;
	lastKnownFileType = folder.assetcatalog;
	path = Assets.xcassets;
	sourceTree = "<group>";
};

100000000000000000000112 /* Assets.xcassets in Resources */ = {
	isa = PBXBuildFile;
	fileRef = 100000000000000000000213 /* Assets.xcassets */;
};
```

Update the `Resources` group and `PBXResourcesBuildPhase`:

```pbxproj
100000000000000000000407 /* Resources */ = {
	isa = PBXGroup;
	children = (
		10000000000000000000020E /* Info.plist */,
		100000000000000000000213 /* Assets.xcassets */,
	);
	path = Resources;
	sourceTree = "<group>";
};

100000000000000000000702 /* Resources */ = {
	isa = PBXResourcesBuildPhase;
	buildActionMask = 2147483647;
	files = (
		100000000000000000000112 /* Assets.xcassets in Resources */,
	);
	runOnlyForDeploymentPostprocessing = 0;
};
```

Set the native-target build setting in both `Debug` and `Release`:

```pbxproj
ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;
```

- [ ] **Step 5: Build the iOS target to verify the asset catalog is wired correctly**

Run: `xcodebuild -project ios/MailBillsScan/MailBillsScan.xcodeproj -scheme MailBillsScan -sdk iphonesimulator build`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 6: Commit the app icon asset-catalog integration**

```bash
git add ios/MailBillsScan/tools/render_app_icon.swift \
  ios/MailBillsScan/MailBillsScan/Resources/Assets.xcassets \
  ios/MailBillsScan/MailBillsScan.xcodeproj/project.pbxproj
git commit -m "Add MailBillsScan app icon assets"
```

### Task 3: Preserve The Pending ScanView Fix And Re-Verify The Branch

**Files:**
- Modify: `ios/MailBillsScan/MailBillsScan/Views/ScanView.swift`

- [ ] **Step 1: Keep the host truncation in the tightened hero**

```swift
Text(pairing.endpoint.host ?? pairing.endpoint.absoluteString)
    .font(.headline)
    .lineLimit(1)
    .truncationMode(.middle)
```

- [ ] **Step 2: Keep the improved upload/outbox error reporting**

```swift
} catch {
    let uploadErrorMessage = error.localizedDescription
    do {
        try outboxStore.save(documentId: documentId, pdf: pdf, sidecar: sidecarData)
        itemCount = nextCount
        note = ""
        refreshOutboxCount()
        lastError = "Upload failed: \(uploadErrorMessage). The document was saved locally for retry."
        statusText = "Saved pending upload"
    } catch let saveError {
        lastError = "Upload failed and the document could not be saved for retry: \(saveError.localizedDescription)"
        statusText = "Upload failed"
    }
}
```

- [ ] **Step 3: Run a final iOS build with the retained `ScanView` diff and icon assets**

Run: `xcodebuild -project ios/MailBillsScan/MailBillsScan.xcodeproj -scheme MailBillsScan -sdk iphonesimulator build`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 4: Inspect the worktree status for only intentional changes**

Run: `git status --short`
Expected:
- tracked changes limited to the icon assets, project wiring, and `ScanView.swift`
- untracked planning folders may remain, but no regenerated Xcode user-data noise should reappear

- [ ] **Step 5: Commit the retained `ScanView` fix if it is still uncommitted**

```bash
git add ios/MailBillsScan/MailBillsScan/Views/ScanView.swift
git commit -m "Preserve MailBillsScan upload status details"
```

## Self-Review

Spec coverage:
- The plan adds the missing app icon in the approved charcoal/linen/amber `MB` direction with subtle scan brackets.
- It explicitly wires the asset catalog into the Xcode target rather than assuming Xcode will pick it up automatically.
- It preserves the intentional `ScanView` cleanup instead of dropping that pending work.
- It includes final verification for build integration and branch cleanliness.

Placeholder scan:
- No `TODO`, `TBD`, or implicit “wire this somehow” steps remain.
- Asset filenames, directories, project-file edits, and commands are explicit.

Type consistency:
- The plan uses a single renderer script path: `ios/MailBillsScan/tools/render_app_icon.swift`.
- The asset-catalog path is consistent across creation, generation, and project wiring steps.
- The `ScanView` snippets match the currently pending diff in the worktree.
