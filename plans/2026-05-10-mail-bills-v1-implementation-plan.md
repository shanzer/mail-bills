# Mail & Bills V1 Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build the V1 physical-mail pipeline: iPhone scan intake -> iCloud handoff -> local PDF storage -> OCR/classification -> Notion index -> Apple Reminders for actionable items -> Discord review workflow -> Telegram urgent fallback pointers.

**Architecture:** Original PDFs stay local under `/Users/buckaroo/.hermes/projects/mail-bills/`; iCloud Drive is temporary intake only. Notion is the searchable inbox/archive/status layer and stores OCR text/metadata but no PDFs. Apple Reminders is the actionable task surface. Discord `#mail-bills` is the primary review/operations channel; Telegram only receives short urgent fallback pointers.

**Tech Stack:** Python 3, local JSON/SQLite metadata ledger, PyMuPDF for text extraction, optional OCR/model fallback for difficult scans, Notion workspace CLI/API integration, `remindctl` for Apple Reminders, Hermes messaging delivery for Discord/Telegram, cron/launchd-style scheduled jobs.

---

## Source Design Docs

- `/Users/buckaroo/.hermes/projects/mail-bills/plans/2026-05-09-mail-bills-system.md`
- `/Users/buckaroo/.hermes/projects/mail-bills/plans/2026-05-10-mail-bills-architecture.md`

These are authoritative for workflow behavior. If implementation details conflict with those docs, pause and update the docs before coding.

---

## Confirmed V1 Decisions

- V1 handles physical mail only; Gmail/digital bills are out of scope.
- Generate an importable Apple Shortcut if feasible.
- Shortcut scans one multi-page PDF per mail item.
- Shortcut creates one batch ID per scanning session.
- Shortcut writes one sidecar JSON file per PDF.
- iCloud Drive is temporary transport only.
- After successful local import, delete temporary iCloud copies.
- Original PDFs are retained locally by default.
- Notion stores metadata, OCR text, summaries, statuses, views; no PDFs.
- One Notion database: `Mail & Bills`.
- Apple Reminders list: `Mail & Bills`.
- Actionable items appear in both Notion and Apple Reminders.
- Non-actionable items appear in Notion only.
- Discord primary channel: `#mail-bills`.
- Telegram urgent fallback: short pointer only, with vendor + due date when available.
- No Discord mentions or special urgent formatting for V1.
- Weekly review: Saturday 10:00 AM America/New_York, Discord digest only.

---

## Local Directory Layout

Create:

```text
/Users/buckaroo/.hermes/projects/mail-bills/
  config.yaml
  data/
    ledger.sqlite
    batches/
  intake/
    raw/
    imported/
    processing/
    error/
  archive/
    YYYY/
      MM/
        CATEGORY/
  quarantine/
  logs/
  scripts/
```

Recommended iCloud intake folder:

```text
~/Library/Mobile Documents/com~apple~CloudDocs/Hermes Mail/Intake/
~/Library/Mobile Documents/com~apple~CloudDocs/Hermes Mail/Error/
```

The actual iCloud path should be configurable in `/Users/buckaroo/.hermes/projects/mail-bills/config.yaml`.

---

## Data Model

### Local ledger tables

Use SQLite so dedupe, retries, and state transitions do not become JSON spaghetti wearing a tiny hat.

Tables:

1. `batches`
   - `batch_id` TEXT PRIMARY KEY
   - `created_at` TEXT
   - `source` TEXT DEFAULT `iphone_shortcut`
   - `status` TEXT
   - `item_count` INTEGER
   - `discord_summary_sent_at` TEXT
   - `telegram_urgent_sent_at` TEXT

2. `documents`
   - `document_id` TEXT PRIMARY KEY
   - `batch_id` TEXT
   - `source_pdf_path` TEXT
   - `local_pdf_path` TEXT
   - `sidecar_path` TEXT
   - `sha256` TEXT
   - `created_at` TEXT
   - `imported_at` TEXT
   - `status` TEXT
   - `category` TEXT
   - `shortcut_label` TEXT
   - `detected_category` TEXT
   - `vendor` TEXT
   - `amount` TEXT
   - `due_date` TEXT
   - `ocr_text` TEXT
   - `ocr_summary` TEXT
   - `confidence` TEXT
   - `review_reason` TEXT
   - `urgency_reasons_json` TEXT
   - `notion_page_id` TEXT
   - `apple_reminder_id` TEXT
   - `retention_decision` TEXT
   - `quarantined_until` TEXT
   - `duplicate_of_document_id` TEXT
   - `deleted_at` TEXT
   - `error_message` TEXT

3. `events`
   - `id` INTEGER PRIMARY KEY AUTOINCREMENT
   - `document_id` TEXT
   - `batch_id` TEXT
   - `event_type` TEXT
   - `event_at` TEXT
   - `payload_json` TEXT

### Notion properties

Database: `Mail & Bills`

- `Name` title
- `Status` select: `Inbox`, `Needs Review`, `Actionable`, `Waiting`, `Completed`, `Archived`, `Deleted`, `Error`, `Duplicate`
- `Category` single-select: `BILL`, `HEALTH-INSURANCE`, `OTHER-INSURANCE`, `SCHOOL-FAMILY`, `TAX-LEGAL-GOVERNMENT`, `HOME-AUTO`, `RECEIPT-RECORD`, `SUBSCRIPTION`, `UNKNOWN`
- `Source` select: `physical mail`
- `Sender/Vendor` rich text
- `Amount` rich text or number; choose based on implementation ease
- `Due Date` date
- `Batch ID` rich text
- `Document ID` rich text
- `Local PDF Path` rich text
- `Apple Reminder ID` rich text
- `Confidence` select
- `Review Reason` single-select
- `Urgency Reasons` multi-select
- `OCR Summary` rich text
- `OCR Text` rich text/body blocks if property length is insufficient
- `Created At` date
- `Archived At` date
- `Retention Decision` select: `Undecided`, `Keep`, `Delete Requested`, `Quarantined`, `Permanently Deleted`
- `Quarantined Until` date
- `Duplicate Of / Related Document` relation or rich text for V1

---

## Structured Discord Batch Summary Format

Send every processed batch to Discord `#mail-bills`, even if nothing needs action.

```text
Mail & Bills Batch Summary

Batch ID
- 2026-05-10-2130

Counts
- Scanned: 7
- Imported: 7
- Actionable: 2
- Needs Review: 1
- Archived Pending Approval: 3
- Errors: 0

Apple Reminders Created
- Pay Verizon bill — due 2026-05-25
- Review Aetna letter — due 2026-05-18

Needs Review
- 1 item needs review in Notion
- Top: Aetna — label conflict — due 2026-05-18

Errors
- None
```

No special urgent formatting and no mentions in Discord for V1.

Telegram urgent fallback format:

```text
Mail & Bills: urgent item. Check Discord/Notion.
Vendor: Aetna
Due: 2026-05-18
```

No full OCR text or sensitive item summary in Telegram.

---

## Implementation Tasks

### Task 1: Create package skeleton and config

**Objective:** Establish a clean local module and config file for the Mail & Bills pipeline.

**Files:**
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/config.yaml`
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/mail_bills/__init__.py`
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/mail_bills/config.py`
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/tests/test_config.py`

**Implementation notes:**
- Use `pathlib.Path`.
- Expand `~` in config paths.
- Do not hardcode iCloud path except as default config.

**Verification:**

```bash
cd /Users/buckaroo/.hermes/projects/mail-bills/scripts
python -m pytest tests/test_config.py -v
```

Expected: config loads and expands paths.

---

### Task 2: Create local directory bootstrapper

**Objective:** Create all required local directories idempotently.

**Files:**
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/mail_bills/bootstrap.py`
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/tests/test_bootstrap.py`

**Behavior:**
- Create `data`, `intake/raw`, `intake/imported`, `intake/processing`, `intake/error`, `archive`, `quarantine`, `logs`.
- Do not delete anything.

**Verification:**

```bash
python -m mail_bills.bootstrap --dry-run
python -m mail_bills.bootstrap
```

Expected: dry-run prints intended directories; real run creates them.

---

### Task 3: Build SQLite ledger

**Objective:** Create the local ledger schema and basic CRUD helpers.

**Files:**
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/mail_bills/ledger.py`
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/tests/test_ledger.py`

**Behavior:**
- Initialize schema if missing.
- Upsert batch.
- Upsert document.
- Append event.
- Query by batch ID.
- Query pending/error/needs-review documents.

**Verification:**

```bash
python -m pytest tests/test_ledger.py -v
```

Expected: all CRUD tests pass using a temporary SQLite file.

---

### Task 4: Define sidecar JSON schema

**Objective:** Validate Shortcut sidecar JSON before import.

**Files:**
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/mail_bills/sidecar.py`
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/tests/test_sidecar.py`

**Expected sidecar fields:**

```json
{
  "batchId": "2026-05-10-2130",
  "documentId": "optional-from-shortcut-or-generated-on-import",
  "capturedAt": "2026-05-10T21:30:00-04:00",
  "label": "Bill",
  "category": "BILL",
  "note": "optional free text",
  "source": "iphone_shortcut"
}
```

**Behavior:**
- Require `batchId` and `capturedAt` if available; generate safe fallbacks if missing.
- Friendly labels map to internal category values.
- Invalid/missing fields move item to error handling, not silent failure.

**Verification:**

```bash
python -m pytest tests/test_sidecar.py -v
```

---

### Task 5: Implement import scanner

**Objective:** Find stable PDF+JSON pairs in iCloud intake and import them locally.

**Files:**
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/mail_bills/importer.py`
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/tests/test_importer.py`

**Behavior:**
- Scan configured iCloud intake folder.
- Pair `*.pdf` with same-basename `*.json`.
- Confirm files are stable before import.
- Compute SHA-256 hash.
- Copy PDF and JSON into local raw/imported area.
- Insert/update ledger rows.
- Delete iCloud originals only after verified local copy.
- Move failures to configured error folder.

**Verification:**

```bash
python -m pytest tests/test_importer.py -v
python -m mail_bills.importer --dry-run
```

Expected: dry-run never deletes source files.

---

### Task 6: Implement PDF text extraction

**Objective:** Extract OCR/text content from imported PDFs.

**Files:**
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/mail_bills/ocr.py`
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/tests/test_ocr.py`

**Behavior:**
- Use PyMuPDF for text-based PDFs.
- Mark low/no-text PDFs as needing OCR/model fallback.
- Do not call a model for every document.
- Make fallback model configurable and off unless needed.

**Verification:**

```bash
python -m pytest tests/test_ocr.py -v
python -m mail_bills.ocr --document-id <id> --dry-run
```

---

### Task 7: Implement category/actionability classifier

**Objective:** Convert OCR text + Shortcut label into category, actionability, due date, amount, confidence, urgency reasons, and review reason.

**Files:**
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/mail_bills/classifier.py`
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/tests/test_classifier.py`

**Rules:**
- `BILL` is for non-medical/non-insurance bills only.
- Health/medical/doctor bills and receipts map to `HEALTH-INSURANCE`.
- Home/auto insurance maps to `HOME-AUTO`.
- Other non-health/non-home-auto insurance maps to `OTHER-INSURANCE`.
- If OCR clearly disagrees with Shortcut label, set `Needs Review` and do not auto-create Apple Reminder.
- Low confidence triggers: unsure classifier, missing sender/vendor, missing due date on bill-like item, missing amount on bill-like item, category conflict.
- Urgent reasons are multi-select.

**Verification:**

```bash
python -m pytest tests/test_classifier.py -v
```

Include fixtures for Verizon bill, Aetna EOB, doctor bill, car insurance, receipt, tax notice, and subscription.

---

### Task 8: Implement duplicate detection

**Objective:** Detect exact and likely duplicate scans before creating reminders.

**Files:**
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/mail_bills/dedupe.py`
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/tests/test_dedupe.py`

**Signals:**
- SHA-256 exact hash.
- OCR text similarity.
- vendor match.
- due date match.
- amount match.
- category match.
- batch/date proximity.

**Behavior:**
- Compare against pending/actionable and archived records.
- Do not auto-create duplicate reminders.
- Mark possible duplicates as Notion `Needs Review` if not resolved in Discord.

**Verification:**

```bash
python -m pytest tests/test_dedupe.py -v
```

---

### Task 9: Implement Notion adapter

**Objective:** Create/update Notion `Mail & Bills` records without storing PDFs in Notion.

**Files:**
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/mail_bills/notion_adapter.py`
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/tests/test_notion_adapter.py`

**Behavior:**
- Create database automatically if feasible; otherwise validate configured database ID and generate setup script/spec for approval instead of requiring manual UI work.
- Upsert by `Document ID`.
- Store OCR text/summary/metadata/status.
- Store local PDF path as text/reference only.
- Never upload or attach PDFs.

**Verification:**

```bash
python -m pytest tests/test_notion_adapter.py -v
python -m mail_bills.notion_adapter --validate --dry-run
```

Implementation must follow the `notion-workspace` skill conventions. Do not bypass established workspace tooling unless explicitly necessary.

---

### Task 10: Implement Apple Reminders adapter

**Objective:** Create and sync Apple Reminders for actionable items.

**Files:**
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/mail_bills/reminders_adapter.py`
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/tests/test_reminders_adapter.py`

**Behavior:**
- Ensure Apple Reminders list `Mail & Bills` exists.
- Create reminders only for actionable high-confidence items not blocked by conflicts/duplicates.
- Clean title, no source/category prefix.
- Notes include category, source, amount, due date, summary, short document ID, full local PDF path, confidence, batch ID.
- Store reminder ID back in ledger and Notion.
- No Apple Reminder for Notion-only `Needs Review` items.

**Verification:**

```bash
remindctl status
python -m pytest tests/test_reminders_adapter.py -v
python -m mail_bills.reminders_adapter --dry-run --document-id <id>
```

---

### Task 11: Implement Discord message formatter

**Objective:** Generate structured Discord batch summaries and confirmation prompts.

**Files:**
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/mail_bills/discord_formatter.py`
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/tests/test_discord_formatter.py`

**Behavior:**
- Plain structured sections.
- No mentions.
- No special urgent formatting.
- Max 5 questions per batch.
- Overflow questions become Notion `Needs Review` due next weekly review.

**Verification:**

```bash
python -m pytest tests/test_discord_formatter.py -v
```

---

### Task 12: Implement messaging delivery wrapper

**Objective:** Send Discord primary messages and Telegram urgent fallback pointers.

**Files:**
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/mail_bills/messaging.py`
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/tests/test_messaging.py`

**Behavior:**
- Delivery targets are config values.
- Discord target is one channel, expected `#mail-bills`.
- Telegram urgent fallback contains only vendor + due date + “check Discord/Notion”.
- Support `--dry-run` to print instead of sending.

**Verification:**

```bash
python -m pytest tests/test_messaging.py -v
python -m mail_bills.messaging --dry-run --sample-batch-summary
python -m mail_bills.messaging --dry-run --sample-telegram-urgent
```

---

### Task 13: Implement processor orchestration

**Objective:** Tie import, OCR, classification, dedupe, Notion, Reminders, and messaging into one retryable processor.

**Files:**
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/mail_bills/processor.py`
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/tests/test_processor.py`

**Behavior:**
- `process-batch` command processes imported docs by batch ID.
- `process-pending` command processes pending documents.
- Errors move document to error state and appear in batch/weekly summaries.
- Always sends structured Discord summary for processed batch.
- Sends Telegram fallback only for urgent items.

**Verification:**

```bash
python -m pytest tests/test_processor.py -v
python -m mail_bills.processor process-pending --dry-run
```

---

### Task 14: Implement weekly review generator

**Objective:** Generate Saturday 10:00 AM Discord digest content.

**Files:**
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/mail_bills/weekly_review.py`
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/tests/test_weekly_review.py`

**Sections:**
- Due soon
- Needs action
- Waiting
- New/unreviewed / Needs Review: count + top 5, urgent first then due soonest
- Archived records: counts only unless questions/errors/duplicates exist
- Completed this week awaiting retention decision
- Quarantined deletion candidates: counts only
- Unresolved import/OCR errors

**Verification:**

```bash
python -m pytest tests/test_weekly_review.py -v
python -m mail_bills.weekly_review --dry-run
```

---

### Task 15: Implement quarantine cleanup review

**Objective:** Keep deleted files reversible and ask before permanent deletion.

**Files:**
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/mail_bills/quarantine.py`
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/tests/test_quarantine.py`

**Behavior:**
- `Ignore/delete` and `Delete duplicate` move files to quarantine.
- Set Notion status `Deleted` and retention decision `Quarantined`.
- Set `Quarantined Until` at least 7 days out.
- Weekly review shows counts only.
- No automatic permanent deletion.

**Verification:**

```bash
python -m pytest tests/test_quarantine.py -v
```

---

### Task 16: Generate Apple Shortcut artifact or manual fallback

**Objective:** Produce the iPhone capture workflow.

**Files:**
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/shortcuts/README.md`
- Create if feasible: `/Users/buckaroo/.hermes/projects/mail-bills/shortcuts/Mail_Bills_Scan.shortcut`

**Behavior:**
- Start batch and generate batch ID.
- Loop: scan next mail item / finish batch.
- Ask optional friendly label.
- Ask optional note.
- Save one PDF + one JSON sidecar per item to iCloud intake.
- On finish, show local iPhone confirmation and send Discord “batch ready” message if feasible.

**Verification:**
- Import Shortcut on iPhone.
- Scan two test PDFs.
- Confirm files appear in iCloud intake.
- Confirm sidecars are valid JSON.

---

### Task 17: Add scheduling

**Objective:** Run import/processing frequently and weekly review on Saturday at 10:00 AM.

**Files:**
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/run-import-and-process.sh`
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/run-weekly-review.sh`

**Behavior:**
- Import/process runs frequently.
- Weekly review runs Saturday 10:00 AM America/New_York.
- Do not create Apple Reminder for weekly review.

**Verification:**

```bash
/Users/buckaroo/.hermes/projects/mail-bills/scripts/run-import-and-process.sh --dry-run
/Users/buckaroo/.hermes/projects/mail-bills/scripts/run-weekly-review.sh --dry-run
```

Then configure with Hermes cron or launchd after Mike approves.

---

### Task 18: End-to-end dry-run test

**Objective:** Prove the whole pipeline works without touching real bills.

**Files:**
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/tests/fixtures/sample_verizon_bill.pdf`
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/tests/fixtures/sample_aetna_letter.pdf`
- Create: `/Users/buckaroo/.hermes/projects/mail-bills/scripts/tests/e2e/test_pipeline_dry_run.py`

**Scenario:**
1. Place fixture PDF+sidecar pairs in fake iCloud intake.
2. Import locally.
3. Extract text.
4. Classify one actionable bill and one health-insurance review item.
5. Upsert Notion dry-run payloads.
6. Generate Apple Reminder dry-run payload.
7. Generate structured Discord summary.
8. Generate Telegram urgent fallback pointer if urgent.

**Verification:**

```bash
python -m pytest tests/e2e/test_pipeline_dry_run.py -v
```

Expected: one batch summary, one reminder payload, Notion records, no real messages sent.

---

## Current Implementation Status for Documentation

> Last updated after Kanban work through processor orchestration, weekly review/quarantine implementation review, and the final Notion empty-category payload fix.

This section is intended as the handoff for New Jersey or any docs writer. Prefer documenting the behavior below over the original task checklist when the two differ.

### Implemented modules

- `scripts/mail_bills/config.py` — loads `/Users/buckaroo/.hermes/projects/mail-bills/config.yaml` and normalizes configured paths.
- `scripts/mail_bills/bootstrap.py` — plans/creates local project directories; supports dry-run.
- `scripts/mail_bills/ledger.py` — SQLite ledger for batches, documents, and events.
- `scripts/mail_bills/sidecar.py` — parses Shortcut sidecar JSON and maps friendly labels to V1 categories.
- `scripts/mail_bills/importer.py` — imports stable iCloud PDF/sidecar pairs into local archive/ledger.
- `scripts/mail_bills/ocr.py` — extracts text/summary/confidence from local PDFs.
- `scripts/mail_bills/classifier.py` — classifies OCR text into V1 category/status/actionability fields.
- `scripts/mail_bills/dedupe.py` — detects exact/fuzzy duplicates and returns `Needs Review` payloads that block duplicate reminder creation.
- `scripts/mail_bills/notion_adapter.py` — dry-run-safe Notion validation/upsert adapter; stores PDF paths as text references and never uploads/attaches PDFs.
- `scripts/mail_bills/reminders_adapter.py` — dry-run-safe Apple Reminders adapter; only eligible actionable/high-confidence/non-conflict/non-duplicate items get reminders.
- `scripts/mail_bills/discord_formatter.py` — structured Discord batch summaries with safe question overflow handling.
- `scripts/mail_bills/messaging.py` — dry-run-safe Discord delivery wrapper and minimal Telegram urgent fallback.
- `scripts/mail_bills/processor.py` — retryable `process-pending` / `process-batch` orchestration across import, OCR, classification, dedupe, Notion, Reminders, Discord, and Telegram fallback.
- `scripts/mail_bills/weekly_review.py` — weekly digest generator; currently print-only/no external send.
- `scripts/mail_bills/quarantine.py` — reversible delete/quarantine flow; no permanent deletion.

### Current command surface

Run commands from `/Users/buckaroo/.hermes/projects/mail-bills/scripts` using `uv run python -m ...`.

```bash
uv run python -m pytest -q
uv run python -m mail_bills.bootstrap --dry-run --config /Users/buckaroo/.hermes/projects/mail-bills/config.yaml
uv run python -m mail_bills.notion_adapter --validate --dry-run
uv run python -m mail_bills.messaging --dry-run --sample-batch-summary
uv run python -m mail_bills.messaging --dry-run --sample-telegram-urgent
uv run python -m mail_bills.processor process-pending --dry-run --stable-delay 0
uv run python -m mail_bills.processor process-batch <batch_id> --dry-run
uv run python -m mail_bills.weekly_review --dry-run
uv run python -m mail_bills.quarantine <document_id> --choice "Ignore/delete" --dry-run
uv run python -m mail_bills.quarantine <document_id> --choice "Delete duplicate" --dry-run
```

Do **not** document bare `uv run pytest`; use `uv run python -m pytest` because the active Hermes virtualenv can otherwise make `pytest` resolve against the wrong environment.

### Current V1 taxonomy and status behavior

Categories:

- `BILL`
- `HEALTH-INSURANCE`
- `OTHER-INSURANCE`
- `SCHOOL-FAMILY`
- `TAX-LEGAL-GOVERNMENT`
- `HOME-AUTO`
- `RECEIPT-RECORD`
- `SUBSCRIPTION`
- `UNKNOWN`

Statuses:

- `Inbox`
- `Needs Review`
- `Actionable`
- `Waiting`
- `Completed`
- `Archived`
- `Deleted`
- `Error`
- `Duplicate`

Classifier notes for docs:

- Bills with amount/due/action language become `Actionable` when confidence is sufficient.
- Receipts, subscriptions with no immediate action, EOBs, and other record-only mail normally become `Archived`.
- Unknown or ambiguous mail becomes `Needs Review` or `UNKNOWN` depending on the available signals.
- Urgent items do **not** get special Discord formatting; Telegram only gets a minimal pointer.

### Notion behavior now implemented

- Adapter validates or creates a `Mail & Bills` setup spec in dry-run.
- Upserts by `Document ID`.
- Stores OCR text, summaries, metadata, status, category, review reason, duplicate candidates, local PDF path, and quarantine metadata as properties.
- Never uploads PDFs, never attaches PDFs, and does not add page children for PDFs.
- `Category` is a select only when a category exists. Deleted tombstones with no category omit that property instead of sending an empty Notion select.
- Quarantine metadata fields:
  - `Retention Decision`
  - `Quarantined Until`
  - `Deleted At`
  - `Deletion Reason`

### Duplicate behavior now implemented

- Exact `sha256` matches are exact duplicates.
- Fuzzy duplicate candidates use OCR similarity plus vendor, due date, amount, category, and batch/date proximity.
- Dedupe compares against pending/actionable statuses and archived records.
- Possible duplicates are represented as `Needs Review` payloads for Notion/Discord.
- Duplicate candidates block Apple Reminder creation.
- Deleted, Error, and already-Duplicate records are ignored as duplicate sources.

### Apple Reminders behavior now implemented

Create reminders only when all of these are true:

- status is `Actionable`
- confidence is high enough
- no conflict/review reason
- not marked duplicate / possible duplicate
- no existing `apple_reminder_id`

Reminder notes include category, source, amount, due date, summary, short document ID, full local PDF path, confidence, and batch ID.

### Discord and Telegram behavior now implemented

Discord batch summaries include:

- Batch ID
- Counts
- Apple Reminders Created
- Needs Review
- Questions
- Errors

Safety rules:

- No Discord mentions.
- No special urgent formatting in Discord.
- At most 5 questions in Discord; overflow becomes Notion `Needs Review` payloads for weekly review.
- Telegram urgent fallback includes only vendor, due date, and “check Discord/Notion”; no OCR text or sensitive summary.
- Dry-run prints instead of sending.

### Processor behavior now implemented

- `process-pending` imports first, then processes ledger batches with `imported`/`Inbox` documents.
- `process-batch` processes a specific batch ID.
- Each document is processed through OCR, classification, dedupe, Notion upsert, reminders, Discord summary, and optional Telegram urgent fallback.
- One bad document does not sink the whole batch; it is marked `Error`, an event is recorded, and the batch summary includes the error.
- Dry-run is supported end-to-end with injectable services in tests.

### Weekly review and quarantine behavior now implemented

Weekly digest sections:

- Due Soon
- Needs Action
- Waiting
- New / Unreviewed / Needs Review, count plus top 5 prioritized urgent first then due soonest
- Archived Counts
- Completed Awaiting Retention
- Quarantined Deletion Candidates
- Unresolved Errors

Current weekly review command is print-only and performs no external sends, even without `--dry-run`, pending explicit Mike approval for real Discord side effects.

Quarantine:

- Accepts only `Ignore/delete` and `Delete duplicate` choices.
- Moves local PDF/sidecar to `quarantine/YYYY-MM-DD/<document_id>/`.
- Marks ledger status `Deleted` and `retention_decision` `Quarantined`.
- Sets `quarantined_until` to at least today + 7 days and never shortens an existing longer date.
- Upserts a minimal Notion tombstone without full OCR text.
- Does not perform permanent deletion automatically.

### Documentation still needed

New Jersey should create user-facing docs for:

1. **Operator quickstart** — how to run dry-runs, process pending mail, process one batch, generate weekly review, and quarantine a document.
2. **iPhone Shortcut usage** — use `/Users/buckaroo/.hermes/projects/mail-bills/shortcuts/README.md` as source material.
3. **Notion setup/reference** — database properties, statuses, category taxonomy, and dry-run validation.
4. **Review workflow** — what to do with `Needs Review`, duplicates, errors, weekly review, and quarantine candidates.
5. **Safety model** — no real external sends or destructive actions until dry-run/E2E passes and Mike approves.
6. **Troubleshooting** — correct test command, config path, dry-run commands, and common blocked states.

### Current remaining engineering work

- Finish/re-verify the weekly review/quarantine card after the final Notion empty-category fix.
- Add end-to-end dry-run test and scheduling wrappers.
- Do not enable real Discord/Telegram/Notion/Apple Reminders side effects until E2E dry-run passes and Mike approves.

---

## Open Implementation Decisions

1. Exact Discord delivery target ID for `#mail-bills`.
2. Whether Shortcut can reliably generate/import `.shortcut` artifact; if not, produce exact manual build instructions.

Resolved implementation decisions:

- Notion `Mail & Bills` database should be auto-created if technically feasible. If auto-create fails or Notion API limitations make it brittle, generate a setup script/spec and pause for approval instead of hand-waving at the UI like a peasant.
- Apple Reminder notes should include both the short document ID and the full local PDF path.
- OCR/model fallback should be configurable. Start with local/basic OCR first and defer model-based extraction until the boring pipeline works, but the config/schema should include a configurable fallback model/provider so adding it later is not a rewrite.
- Notion `Category` is a select only when category is present; tombstones without a category omit it to avoid invalid empty Notion selects.
- Weekly review generation is print-only/no-send until Mike approves real Discord delivery.
- Quarantine is reversible only; permanent deletion is never automatic.

---

## Execution Order Recommendation

1. Build local skeleton, config, ledger, sidecar validation.
2. Build importer and dry-run fixture tests.
3. Build OCR/classifier/dedupe locally with no Notion/Reminders side effects.
4. Add Notion adapter dry-run/validation.
5. Add Reminders adapter dry-run/validation.
6. Add Discord/Telegram formatting and dry-run delivery.
7. Add full processor and weekly review.
8. Generate Shortcut.
9. Run end-to-end dry-run.
10. Only then enable real messaging/scheduling.

Do not schedule or send real messages until dry-run E2E passes.
