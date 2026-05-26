# Vision OCR Helper Path Design

Date: 2026-05-26
Scope: Move the Vision OCR helper out of `scripts/`, standardize its built artifact location under `dist/utils/`, keep `bootstrap` directory-only, document the build flow, and verify the helper executes against a sample PDF.

## Goal

Make the Vision OCR fallback behave like a repo-owned compiled utility rather than an ad hoc script or a data-root artifact.

This change should:

- move the helper source out of `scripts/mail_bills/`
- define one canonical built helper location inside the repo
- keep `bootstrap` focused on directory creation only
- document the helper build process clearly in `README.md`
- verify that the built helper executable actually runs

The data root under `root_dir` should remain strictly for runtime data, not helper binaries.

## Runtime Contract

The Vision OCR helper becomes a compiled repo utility.

### Source location

- source file: `utils/vision_ocr.swift`

### Built artifact location

- executable: `dist/utils/vision_ocr`

This means the helper is treated like a build artifact owned by the repo, not as a script under `scripts/` and not as a runtime binary inside the configured Mail Bills data root.

## OCR Runtime Behavior

`runVisionOcr()` should stop trying to run a Swift source file directly.

### Required behavior

- If `ocr.vision_helper_path` is configured, use that path.
- Otherwise, default to `dist/utils/vision_ocr`.
- Execute the compiled binary directly with the PDF path argument.
- Do not fall back to `scripts/mail_bills/vision_ocr.swift`.
- Do not look inside `root_dir/bin` or any other data-root location.

This creates one predictable default runtime path and makes the helper contract explicit.

## Bootstrap Behavior

`bootstrap` should remain pure directory setup.

### Required behavior

- Continue creating/checking configured runtime directories only.
- Do not copy helper binaries.
- Do not validate that the OCR helper exists.
- Do not modify repo build artifacts.

This keeps `bootstrap` focused on preparing data directories rather than installing code artifacts.

## Source Layout Change

The old helper source location should be retired.

### Required change

- Move `scripts/mail_bills/vision_ocr.swift` to `utils/vision_ocr.swift`.

There should be one maintained source file for the helper after this change, not duplicate Swift sources in multiple folders.

## Documentation

`README.md` should document one canonical Vision OCR helper flow.

### Required content

- Explain that Vision fallback expects a compiled helper binary.
- Show the exact `swiftc` command that builds `utils/vision_ocr.swift` into `dist/utils/vision_ocr`.
- Make clear that the helper must exist at that path unless `ocr.vision_helper_path` overrides it.
- Keep the rest of the pipeline commands unchanged.

The README should describe this as a manual build step, not an automatic postinstall or bootstrap side effect.

## Error Handling

The runtime should fail plainly when the helper is missing or unusable.

### Required behavior

- If Vision fallback is enabled and the default helper path does not exist, surface the process/filesystem failure.
- Do not silently fall back to source execution.
- Do not add alternate implicit search paths.

This keeps misconfiguration obvious instead of masking it with guesswork.

## Testing And Verification

Verification should cover both the helper itself and the repo integration point.

### Required checks

- Compile the helper with `swiftc` into `dist/utils/vision_ocr`.
- Run the built helper against a sample PDF and confirm it emits JSON.
- Run `npm test`.
- Run `npm run build`.

### Optional code-level verification

If a small focused test can be added cheaply, it should verify that the default OCR helper path resolves to `dist/utils/vision_ocr` when no explicit `ocr.vision_helper_path` override is set.

This should stay narrowly scoped. Do not introduce a large new test harness just for this path change.

## Implementation Boundaries

Allowed changes:

- moving the Swift helper source file
- updating OCR runtime helper-path resolution and execution mode
- README documentation for the helper build process
- small targeted tests if they are cheap and directly relevant

Do not change:

- bootstrap into an installer
- runtime data directory structure
- OCR summary/classification logic unrelated to helper execution
- automatic helper compilation hooks

## Verification Outcomes

After implementation, verify:

- the source lives at `utils/vision_ocr.swift`
- the default runtime helper path is `dist/utils/vision_ocr`
- `runVisionOcr()` executes the compiled binary rather than `swift <source.swift>`
- `bootstrap` still only creates directories
- the README documents the build command and runtime expectation
- the built helper runs successfully on a sample PDF
