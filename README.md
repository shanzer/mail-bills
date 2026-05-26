# Mail Bills Node

TypeScript REST service for the physical-mail Mail Bills pipeline.

The implementation keeps the Python project's core workflow and SQLite schema, but exposes the workflow through modules and HTTP endpoints instead of UI code shelling out to command-line tools.

## Commands

```bash
npm install
npm run build
npm test

npm run mail-bills -- bootstrap --config ../mail-bills/config.yaml --dry-run
npm run mail-bills -- import --config ../mail-bills/config.yaml --dry-run
npm run mail-bills -- process-pending --config ../mail-bills/config.yaml --dry-run
npm run mail-bills -- pairing --config ../mail-bills/config.yaml --base-url http://yoyodyne:8765 --qr
npm run start -- --host 0.0.0.0 --port 8765
npm run start -- --host 0.0.0.0 --port 8765 --log-level debug
```

`npm run start` runs the compiled `dist/src/cli.js`, so run `npm run build` after source changes.
Use a phone-reachable host and port for pairing, such as `http://yoyodyne:8765`; `127.0.0.1` only works from the Mac itself.

## Logging

The API uses Fastify/Pino structured logs. Configure the default level in `config.yaml`:

```yaml
logging:
  level: info
```

Accepted levels are `silent`, `fatal`, `error`, `warn`, `info`, `debug`, and `trace`. The `api` command can override the config for one run:

```bash
npm run start -- --log-level debug
```

## REST API

- `GET /` - browser UI for the local Mail Bills desk.
- `GET /ui/styles.css` and `GET /ui/app.js` - embedded UI assets served by the API process.
- `GET /health` - service health and ledger path.
- `GET /api/status` - receiver status, intake counts, and configured paths.
- `POST /api/mail-bills/intake` - multipart iPhone upload endpoint.
  - Header: `Authorization: Bearer <intake_upload.token>`.
  - Fields: `pdf` and `sidecar`.
  - The handler only writes a durable PDF/JSON pair. It does not import, OCR, or classify.
- `GET /api/documents` - list ledger documents.
  - Query: `status`, `q`, `limit`, `offset`.
- `POST /api/documents/import-pdf` - browser UI PDF import.
  - Multipart fields: `pdf` required; `category`, `label`, and `note` optional.
  - The handler generates the same sidecar shape as phone intake and queues a PDF/JSON pair in upload intake.
  - It does not OCR, classify, or write the ledger directly; run the pipeline or wait for the scheduler.
- `GET /api/documents/:documentId` - fetch one ledger document.
- `GET /api/documents/:documentId/pdf` - stream the ledger-linked PDF, only if it is under the configured root.
- `POST /api/documents/:documentId/actions` - apply review/UI actions.
  - Body: `{ "action": "update-fields" | "actionable" | "archive" | "complete" | "delete" }`.
- `POST /api/pipeline/process-pending` - import and process pending batches.
  - Body defaults to dry-run. Pass `{ "dryRun": false }` for a live local run.
- `POST /api/pipeline/batches/:batchId/process` - process one batch.
- `GET /api/pipeline/schedule` - current in-process scheduler state.
- `GET /api/pairing/qr` - iPhone pairing payload and SVG QR code.
- `POST /api/pairing/rotate-token` - generate a new intake token and return the updated QR code.

## iPhone Pairing

The iPhone app uses the same shared bearer-token pairing model as the Python implementation.

Generate or reuse a token and print pairing JSON:

```bash
npm run mail-bills -- pairing --config ../mail-bills/config.yaml --write-token --base-url http://yoyodyne:8765
```

Print a terminal QR code:

```bash
npm run mail-bills -- pairing --config ../mail-bills/config.yaml --base-url http://yoyodyne:8765 --qr
```

Write a PNG QR code:

```bash
npm run mail-bills -- pairing --config ../mail-bills/config.yaml --base-url http://yoyodyne:8765 --qr-png /tmp/mail-bills-pairing.png
```

Rotate the token:

```bash
npm run mail-bills -- pairing --config ../mail-bills/config.yaml --rotate-token --base-url http://yoyodyne:8765
```

The QR payload contains:

```json
{
  "endpoint": "http://yoyodyne:8765/api/mail-bills/intake",
  "token": "...",
  "authHeader": "Bearer ...",
  "warnings": []
}
```

## Ported Modules

- Config loading and path expansion.
- Directory bootstrap.
- Sidecar validation and friendly-label mapping.
- Python-compatible SQLite ledger.
- Upload intake receiver.
- Importer for app-upload intake folders, with optional legacy iCloud intake when `icloud_intake_dir` and `icloud_error_dir` are configured.
- Embedded PDF text extraction with optional Vision fallback hook.
- Deterministic classifier.
- Conservative duplicate detection.
- Optional Notion adapter for explicit sync/setup work.
- Processor orchestration.
- Review, completion, archive, and reversible quarantine actions.
- In-process scheduler for periodic local pipeline runs.

## Current Notes

- The service reads the existing `../mail-bills/config.yaml` by default in the scripts above.
- The existing live ledger at `../mail-bills/data/ledger.sqlite` remains compatible.
- The browser UI calls the REST endpoints directly and uses live actions for review, field updates, archive, completion, delete/quarantine, dry checks, and pipeline runs.
- Set `ocr.model_fallback_enabled: true`, `ocr.model_provider: ollama`, and `ocr.model_name` to an installed Ollama model to generate better OCR summaries from local models.
