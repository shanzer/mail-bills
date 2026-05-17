# Mail Bills Scan iPhone App

Minimal SwiftUI app for scanning physical mail and uploading one PDF plus one JSON sidecar to the Mac intake receiver.

## Current Scope

- Pair with the Mac by scanning the pairing QR code or pasting pairing JSON.
- Store endpoint and bearer token in iOS Keychain.
- Scan pages with VisionKit document scanner.
- Build one PDF per mail item.
- Build the matching sidecar JSON.
- Upload multipart fields `pdf` and `sidecar` to the configured Mac endpoint.
- Save failed uploads locally so they can be retried without rescanning.

Failed uploads remain in the app outbox until the retry succeeds.

## Mac Setup

Start the receiver:

```bash
cd /Users/buckaroo/.hermes/projects/mail-bills/scripts
uv run python -m mail_bills.intake_receiver --config /Users/buckaroo/.hermes/projects/mail-bills/config.yaml
```

Print pairing JSON and QR:

```bash
uv run python -m mail_bills.pairing --base-url http://yoyodyne:8765 --qr
```

Do not paste the JSON from opening the receiver URL in a browser. Browser JSON is only the health check. The app needs pairing JSON with `endpoint` and `token`.

## Xcode Setup

1. Open `ios/MailBillsScan/MailBillsScan.xcodeproj`.
2. Select the `MailBillsScan` target.
3. Set your Apple Developer Team for signing.
4. Install on the iPhone.
5. Scan the pairing QR from the Mac, or paste the pairing JSON into the pairing screen.
6. Scan a harmless test document first.

## Receiver Contract

```text
POST /api/mail-bills/intake
Authorization: Bearer <token>
Content-Type: multipart/form-data
fields: pdf, sidecar
```

The app sends sidecars with `source: iphone_app`.
