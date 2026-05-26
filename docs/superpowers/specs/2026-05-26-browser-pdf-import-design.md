# Browser PDF Import Design

Date: 2026-05-26

## Goal

Let a user import a PDF from the browser UI and have it enter Mail Bills through the same internal intake workflow as an iPhone upload.

The browser import must create a durable PDF plus JSON sidecar pair in the configured upload intake directory. It must not directly write the ledger, skip importer validation, or create a second processing path.

## Current Workflow

The iPhone intake endpoint posts a multipart request to `/api/mail-bills/intake` with:

- `pdf`: the PDF bytes
- `sidecar`: JSON metadata

The API calls `acceptUpload`, which validates the sidecar, writes `.part` files, fsyncs them, validates the pair, and renames the files into `intakeUpload.intakeDir`.

Later, `scanImports` finds PDF/JSON pairs in upload intake, imports them into `intake/imported/<batchId>/`, writes the ledger, deletes the upload-intake copies, and leaves processing to `process-pending` / `process-batch`.

## User-Facing Behavior

Add an `Import PDF` control to the Documents view toolbar.

The browser flow:

1. User selects a PDF.
2. User can choose a category/label from the existing category list.
3. User can submit the import.
4. The UI shows the created document ID and tells the user the PDF is queued for the normal pipeline.
5. The UI refreshes status/document counts.

The import action queues the document only. It does not automatically OCR/classify/process unless the user separately runs the pipeline or the scheduler picks it up.

## API Design

Add:

```http
POST /api/documents/import-pdf
Content-Type: multipart/form-data
```

Fields:

- `pdf`: required PDF file
- `category`: optional category; defaults to `UNKNOWN`
- `label`: optional friendly label; defaults to the selected category or `Unknown`
- `note`: optional short note

The endpoint creates sidecar JSON with:

```json
{
  "batchId": "browser-YYYYMMDD-HHMMSS",
  "documentId": "ui-<timestamp>-<random>",
  "capturedAt": "<current ISO timestamp>",
  "label": "<label>",
  "category": "<category>",
  "note": "<note>",
  "source": "browser_ui"
}
```

The endpoint then calls `acceptUpload` with the uploaded PDF bytes and generated sidecar bytes.

Response:

```json
{
  "ok": true,
  "created": true,
  "documentId": "...",
  "batchId": "...",
  "pdfPath": "...",
  "sidecarPath": "..."
}
```

If the same generated document ID somehow collides, the endpoint should regenerate once or return the existing `acceptUpload` collision error. It should not overwrite existing files.

## Validation And Safety

- Reject missing `pdf`.
- Reject non-PDF content type or filenames that do not end in `.pdf`.
- Validate category against `CATEGORY_VALUES`; unsupported values become a 400 response.
- Trim `label` and `note`.
- Limit note length to 500 characters.
- Do not require or expose the iPhone intake bearer token in browser JavaScript.
- Reuse `acceptUpload` for atomic write behavior and sidecar validation.

## UI Design

Keep the control compact and operational, matching the current workbench UI.

Add an import button to the Documents toolbar. Clicking it opens a small modal with:

- PDF file picker
- category select
- label input
- note input
- submit and cancel buttons

After successful import:

- close the modal
- show a toast like `Queued PDF import: <documentId>`
- refresh `/api/status` and `/api/documents`

On failure:

- keep the modal open
- show the API error in the toast

## Testing Plan

Add focused Vitest coverage:

- API accepts a browser PDF upload and writes a PDF/sidecar pair to upload intake.
- Sidecar has source `browser_ui`, a batch ID, document ID, captured timestamp, category, and label.
- API rejects missing PDF.
- API rejects unsupported category.
- Existing importer sees the browser upload as a normal upload-intake pair.
- UI assets contain the import button, modal fields, and `/api/documents/import-pdf` call.

## Out Of Scope

- Drag-and-drop upload.
- Multiple PDFs in one request.
- Immediate OCR/classification during upload.
- Direct ledger writes from the browser import endpoint.
- Exposing the iPhone intake token to the browser.
