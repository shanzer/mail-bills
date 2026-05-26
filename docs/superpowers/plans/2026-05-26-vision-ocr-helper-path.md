# Vision OCR Helper Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Vision OCR helper to `utils/vision_ocr.swift`, standardize the default runtime helper binary at `dist/utils/vision_ocr`, document the manual build flow, and verify the compiled helper runs against a sample PDF.

**Architecture:** Keep the change local to the OCR helper boundary. Add a small pure helper-path resolver in `src/ocr.ts`, update `runVisionOcr()` to execute the compiled binary directly, move the Swift source into `utils/`, and document the build-and-run workflow in `README.md`. Leave `bootstrap` untouched so it remains directory-only setup.

**Tech Stack:** TypeScript, Vitest, Node.js, Swift/AppKit/PDFKit/Vision, macOS `swiftc`, repo build output under `dist/`

---

## File Structure

Planned files and responsibilities:

- Create: `tests/ocr.test.ts`
  Purpose: lock down the default Vision helper path and compiled-binary execution contract in `src/ocr.ts`
- Create: `utils/vision_ocr.swift`
  Purpose: canonical source location for the macOS Vision OCR helper
- Modify: `src/ocr.ts`
  Purpose: resolve the default helper path to `dist/utils/vision_ocr` and execute the compiled binary directly
- Modify: `README.md`
  Purpose: document the helper build command, runtime expectation, and manual verification flow
- Delete: `scripts/mail_bills/vision_ocr.swift`
  Purpose: remove the retired source location so there is only one maintained helper source file

Constraints discovered during planning:

- `bootstrap` is already pure directory setup in `src/bootstrap.ts`; this plan intentionally leaves it unchanged.
- The repo has no existing OCR test file, so this plan adds a focused Vitest file rather than a broader harness.
- The helper is macOS-specific, so executable verification should use a macOS-compatible sample-PDF flow.

### Task 1: Add Failing OCR Helper Path Tests

**Files:**
- Create: `tests/ocr.test.ts`

- [ ] **Step 1: Write the failing tests for the default helper path and binary execution contract**

```ts
import path from "node:path";
import { execFileSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeConfig } from "./helpers.js";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(() => JSON.stringify({ text: "Vision OCR text" }))
}));

import { defaultVisionHelperPath, runVisionOcr } from "../src/ocr.js";

describe("ocr helper path", () => {
  beforeEach(() => {
    vi.mocked(execFileSync).mockClear();
  });

  it("defaults the Vision helper path to dist/utils/vision_ocr", () => {
    expect(defaultVisionHelperPath()).toBe(path.resolve(process.cwd(), "dist", "utils", "vision_ocr"));
  });

  it("executes the compiled helper binary directly when no override is configured", () => {
    const config = makeConfig("/tmp/mail-bills-ocr-root").ocr;

    runVisionOcr("/tmp/sample.pdf", config);

    expect(execFileSync).toHaveBeenCalledWith(
      path.resolve(process.cwd(), "dist", "utils", "vision_ocr"),
      ["/tmp/sample.pdf"],
      expect.objectContaining({ encoding: "utf8" })
    );
  });

  it("uses ocr.vision_helper_path when configured", () => {
    const config = makeConfig("/tmp/mail-bills-ocr-root").ocr;
    config.visionHelperPath = "/custom/vision_ocr";

    runVisionOcr("/tmp/sample.pdf", config);

    expect(execFileSync).toHaveBeenCalledWith(
      "/custom/vision_ocr",
      ["/tmp/sample.pdf"],
      expect.objectContaining({ encoding: "utf8" })
    );
  });
});
```

- [ ] **Step 2: Run the new OCR tests to verify they fail for the current implementation**

Run: `npm test -- tests/ocr.test.ts`
Expected: FAIL because `../src/ocr.js` does not yet export `defaultVisionHelperPath`, and `runVisionOcr()` still invokes `swift` with the source file path.

- [ ] **Step 3: Commit the failing-test scaffold once the assertions are correct**

```bash
git add tests/ocr.test.ts
git commit -m "Add OCR helper path regression tests"
```

### Task 2: Move the Helper and Update OCR Runtime Execution

**Files:**
- Create: `utils/vision_ocr.swift`
- Modify: `src/ocr.ts`
- Delete: `scripts/mail_bills/vision_ocr.swift`
- Test: `tests/ocr.test.ts`

- [ ] **Step 1: Move the Swift helper source into `utils/`**

```swift
import AppKit
import Foundation
import PDFKit
import Vision

struct OCRFailure: Error, CustomStringConvertible {
    let description: String
}

func renderPage(_ page: PDFPage, scale: CGFloat = 2.0) throws -> CGImage {
    let bounds = page.bounds(for: .mediaBox)
    let width = max(1, Int(bounds.width * scale))
    let height = max(1, Int(bounds.height * scale))
    guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
          let context = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
          ) else {
        throw OCRFailure(description: "Could not create page render context.")
    }

    context.setFillColor(NSColor.white.cgColor)
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    context.saveGState()
    context.scaleBy(x: scale, y: scale)
    page.draw(with: .mediaBox, to: context)
    context.restoreGState()

    guard let image = context.makeImage() else {
        throw OCRFailure(description: "Could not render PDF page to image.")
    }
    return image
}

func recognizeText(in image: CGImage) throws -> [String] {
    var lines: [String] = []
    let request = VNRecognizeTextRequest { request, error in
        if let error {
            lines.append("OCR_ERROR: \(error.localizedDescription)")
            return
        }
        let observations = request.results as? [VNRecognizedTextObservation] ?? []
        lines.append(contentsOf: observations.compactMap { observation in
            observation.topCandidates(1).first?.string
        })
    }
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true

    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    try handler.perform([request])

    if lines.first?.hasPrefix("OCR_ERROR: ") == true {
        throw OCRFailure(description: String(lines[0].dropFirst("OCR_ERROR: ".count)))
    }
    return lines
}

func main() throws {
    guard CommandLine.arguments.count == 2 else {
        throw OCRFailure(description: "Usage: vision_ocr <pdf-path>")
    }
    let pdfPath = CommandLine.arguments[1]
    let url = URL(fileURLWithPath: pdfPath)
    guard let document = PDFDocument(url: url) else {
        throw OCRFailure(description: "Could not open PDF: \(pdfPath)")
    }

    var pageTexts: [String] = []
    for index in 0..<document.pageCount {
        guard let page = document.page(at: index) else {
            continue
        }
        let image = try renderPage(page)
        pageTexts.append(try recognizeText(in: image).joined(separator: "\n"))
    }

    let payload: [String: Any] = [
        "page_count": document.pageCount,
        "text": pageTexts.joined(separator: "\n\n")
    ]
    let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
}

do {
    try main()
} catch {
    let message = String(describing: error)
    FileHandle.standardError.write(Data(message.utf8))
    FileHandle.standardError.write(Data("\n".utf8))
    exit(1)
}
```

- [ ] **Step 2: Replace the source-execution path logic in `src/ocr.ts` with a compiled-binary resolver**

```ts
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import type { OcrConfig } from "./types.js";
import { Ledger } from "./ledger.js";

export function defaultVisionHelperPath(): string {
  return fileURLToPath(new URL("../dist/utils/vision_ocr", import.meta.url));
}

export function runVisionOcr(pdfPath: string, ocrConfig: OcrConfig): string {
  const helperPath = ocrConfig.visionHelperPath ?? defaultVisionHelperPath();
  const stdout = execFileSync(helperPath, [pdfPath], {
    encoding: "utf8"
  });
  const payload = JSON.parse(stdout) as { text?: string };
  return String(payload.text ?? "");
}
```

- [ ] **Step 3: Remove the retired helper source file from `scripts/mail_bills/`**

```bash
git rm scripts/mail_bills/vision_ocr.swift
```

- [ ] **Step 4: Run the focused OCR tests to verify the new helper-path contract passes**

Run: `npm test -- tests/ocr.test.ts`
Expected: PASS with 3 passing tests confirming the default path and execution contract.

- [ ] **Step 5: Commit the helper move and OCR runtime change**

```bash
git add utils/vision_ocr.swift src/ocr.ts tests/ocr.test.ts
git commit -m "Point OCR fallback at compiled Vision helper"
```

### Task 3: Document and Verify the Manual Helper Build Flow

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a Vision OCR helper build section to the README**

```md
## Vision OCR Helper

Vision fallback uses a compiled macOS helper binary by default.

Build it manually:

```bash
mkdir -p dist/utils
swiftc utils/vision_ocr.swift -o dist/utils/vision_ocr
```

By default, OCR fallback looks for:

```text
dist/utils/vision_ocr
```

You can override that path with `ocr.vision_helper_path` in `config.yaml`.

`bootstrap` does not build or install this helper. It only prepares runtime directories.
```

- [ ] **Step 2: Compile the helper into its canonical runtime location**

Run: `mkdir -p dist/utils && swiftc utils/vision_ocr.swift -o dist/utils/vision_ocr`
Expected: command exits `0` and creates `dist/utils/vision_ocr`

- [ ] **Step 3: Generate a sample PDF and verify the built helper emits JSON**

Run: `printf 'Mail Bills OCR sample\n' > /tmp/vision-ocr-sample.txt && textutil -convert pdf /tmp/vision-ocr-sample.txt -output /tmp/vision-ocr-sample.pdf && ./dist/utils/vision_ocr /tmp/vision-ocr-sample.pdf`
Expected: stdout is JSON containing at least `page_count` and `text`

- [ ] **Step 4: Run the repo verification suite after the helper-path change**

Run: `npm test`
Expected: PASS with all Vitest suites green

Run: `npm run build`
Expected: PASS with TypeScript emitted to `dist/`

Run: `npm run mail-bills -- bootstrap --config ../mail-bills/config.yaml --dry-run`
Expected: prints only directory creation/check lines, confirming `bootstrap` remains directory-only

- [ ] **Step 5: Commit the documentation update and final verification-backed implementation**

```bash
git add README.md dist/utils/vision_ocr
git commit -m "Document Vision OCR helper build flow"
```

## Self-Review

Spec coverage:
- Task 2 moves the helper source to `utils/vision_ocr.swift`, removes the old source location, and points runtime execution at `dist/utils/vision_ocr`.
- Task 3 documents the exact `swiftc` command and verifies the built helper runs on a sample PDF.
- `bootstrap` remains untouched by design, and Task 3 explicitly verifies its behavior still stays directory-only.

Placeholder scan:
- No `TODO`, `TBD`, or deferred implementation markers remain.
- All tasks include exact files, commands, and expected outcomes.

Type consistency:
- `defaultVisionHelperPath()` is introduced in Task 2 and used by the tests defined in Task 1.
- The runtime contract consistently refers to `dist/utils/vision_ocr` across tests, implementation, docs, and verification.
