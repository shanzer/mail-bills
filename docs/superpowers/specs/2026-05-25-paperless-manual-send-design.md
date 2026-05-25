# Paperless Manual Send Design

Date: 2026-05-25

## Goal

Give each mail item an explicit manual option to send its local PDF to Paperless-NGX from both the CLI and browser UI.

The action must not change the existing Notion role. Notion remains the OCR, metadata, status, and review index. Original PDFs remain local unless a separate delete/quarantine action is chosen.

## Current Context

Mail Bills stores imported PDFs locally and records their paths in the ledger as `local_pdf_path`. The UI and CLI already share document actions through `src/actions.ts`, and the API exposes those actions to the browser UI.

The adjacent Paperless CLI project at `../paperless-cli` contains a reusable uploader in `src/pdf-service-upload.js`. That helper reads Paperless connection settings from `~/.fileclerk` and uploads a PDF to `/api/documents/post_document/`.

Quarantine is already reversible. Deleting a mail item moves the local PDF and sidecar JSON to `quarantine/YYYY-MM-DD/<document_id>/`, marks the ledger row `Deleted`, sets `retention_decision` to `Quarantined`, and sets `quarantined_until` at least 7 days out.

## User-Facing Behavior

### CLI

Add a document action:

```bash
npm run mail-bills -- action <documentId> --action send-to-paperless
```

With `--dry-run`, the command reports the local PDF path that would be uploaded and makes no Paperless call.

On a live run, the command uploads the document's `local_pdf_path` to Paperless and leaves the local PDF and sidecar untouched.

### Browser UI

Add a `Send to Paperless` button for the selected document, near the existing review/document action controls.

The button calls the existing document action API with:

```json
{ "action": "send-to-paperless" }
```

The UI shows a concise success or failure message. Failure messages must not expose Paperless API keys, bearer tokens, or full Paperless config content.

## Backend Design

Add `send-to-paperless` to the supported document actions.

The action flow:

1. Load the document from the ledger.
2. Require `local_pdf_path`.
3. Verify the PDF exists before calling Paperless.
4. In dry-run mode, return a planned payload and do not upload.
5. In live mode, call an injectable Paperless upload service.
6. Append a ledger event named `paperless_uploaded` with the document ID, path, and sanitized Paperless response.
7. Return an action result to the CLI/API/UI.

The action does not:

- delete local files
- quarantine local files
- mutate Notion
- mark the document archived or completed
- attach PDFs to Notion

## Integration Boundary

Use a small local adapter module in Mail Bills rather than importing Paperless CLI internals directly from UI/API code.

The adapter should wrap the existing `../paperless-cli/src/pdf-service-upload.js` uploader so tests can inject a fake uploader. If importing that module directly is brittle because it is JavaScript outside this package's TypeScript project, the adapter may call the uploader script with `node` using `execFile` and no shell interpolation.

No Paperless API key should be added to Mail Bills config. Paperless remains configured by `~/.fileclerk`, matching the existing Paperless CLI behavior.

## Quarantine Cleanup Boundary

Permanent cleanup is a separate future action, not part of Paperless upload.

The intended later command is:

```bash
npm run mail-bills -- cleanup quarantine --older-than-days 7 --dry-run
```

It should only target documents already marked `Deleted` with `retention_decision = Quarantined`, and only when `quarantined_until` has passed. A live cleanup should remove quarantined files, update ledger retention state, and append a ledger event.

It must not touch ordinary archived PDFs or local PDFs that were merely sent to Paperless.

## Testing Plan

Add focused Vitest tests for the Paperless action:

- dry-run returns the planned PDF path and does not call the uploader
- missing `local_pdf_path` fails clearly
- missing PDF file fails clearly
- successful upload calls the injected uploader once
- successful upload appends a `paperless_uploaded` event
- successful upload does not delete or move the local PDF

UI tests can stay lightweight unless the existing API/UI action coverage already has a natural place for a button-level assertion.

## Open Implementation Notes

The action result payload should include enough information for the UI to show success, but not the whole Paperless response if it contains noisy or sensitive fields. A minimal response such as `uploaded: true`, `pdf_path`, and `paperless_response` sanitized to simple JSON is sufficient.
