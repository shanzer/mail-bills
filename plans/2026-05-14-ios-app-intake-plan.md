# Mail & Bills iPhone App Intake Plan

## Context

The scanning iPhone and the processing Mac may use different Apple IDs. That makes app-private iCloud Drive or CloudKit private storage a poor default transport, because files would sync under the iPhone Apple ID rather than the Mac Apple ID.

V1 should keep the existing PDF plus JSON sidecar contract, but replace the brittle Shortcut capture layer with a small iPhone app and a transport that is explicit about where files go.

## Recommendation

Build a minimal iPhone app with a local outbox and upload-based handoff to the Mac.

Preferred handoff:

```text
iPhone app
  -> local app outbox
  -> HTTPS upload to Mac-side intake endpoint
  -> existing local importer/processor pipeline
```

This avoids Apple-ID coupling and lets the app retry safely when the Mac is asleep, offline, or away from the local network.

## iPhone App Scope

App name:

```text
Mail Bills Scan
```

Core screens:

- Batch screen with `Start Batch`, scanned item count, and upload state.
- Scan flow using Apple VisionKit document scanner.
- Label picker using the project categories.
- Optional note field.
- Batch finish screen with queued/uploaded/failed counts.

Per item output:

```text
<documentId>.pdf
<documentId>.json
```

Sidecar JSON:

```json
{
  "batchId": "2026-05-14-0930",
  "documentId": "2026-05-14-0930-1",
  "capturedAt": "2026-05-14T09:30:00-04:00",
  "label": "Bill",
  "category": "BILL",
  "note": "Optional user note",
  "source": "iphone_app"
}
```

## Mac Intake Endpoint

Add a small local receiver that accepts one item at a time:

```text
POST /api/mail-bills/intake
```

Request shape:

- multipart form data
- `pdf`: scanned PDF
- `sidecar`: JSON metadata

Server behavior:

- Validate safe filename/document ID.
- Write PDF and JSON as a same-basename pair into a configured intake folder.
- Return success only after both files are durably written.
- Never process, classify, or create reminders in the upload handler.
- Existing importer/processor remains responsible for ledger state and downstream integrations.

Security for first local version:

- Shared bearer token stored in iPhone app settings and Mac config.
- Bind to localhost/LAN by explicit config.
- Prefer Tailscale or another private network if uploads need to work away from home.

## Fallback Transport

If the Mac endpoint is not reachable, the app keeps files in its local outbox and shows retry state.

Manual export fallback can use the iOS document picker/share sheet, but it should not be the primary workflow.

## Implementation Order

1. Finish local pipeline safety fixes.
2. Add Mac-side HTTP intake receiver with tests.
3. Update config with receiver host, port, token, and upload intake directory.
4. Build the minimal SwiftUI scanner app.
5. Test with two harmless documents.
6. Only after dry-run end-to-end succeeds, wire live Notion, Reminders, Discord, and Telegram.

## Open Decisions

- Whether the Mac endpoint should be LAN-only, Tailscale-only, or both.
- Whether uploads should land directly in `intake/imported` or a new `intake/uploaded` folder. Default should be a new upload folder that the importer can scan like the iCloud folder.
- Whether to keep the manual Shortcut instructions as a fallback after the app is working.
