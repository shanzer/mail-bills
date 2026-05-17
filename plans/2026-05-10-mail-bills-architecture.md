# Mail & Bills V1 Architecture

> Current design draft. V1 focuses on physical mail. Digital/Gmail intake is deliberately out of scope for implementation, but the architecture should not block adding it later.

## Goals

- Make physical mail capture low-friction during large mail-processing sessions.
- Avoid missing bills, deadlines, medical/insurance paperwork, school/family items, tax/legal/government notices, or anything actionable.
- Keep obvious junk out by letting Mike toss it before scanning.
- Use Apple Reminders as the action surface.
- Use Discord for normal summaries/questions/review workflow, with Telegram reserved for urgent fallback alerts.
- Keep iCloud Drive as temporary transport only.
- Consider Notion as the inbox/archive/index layer.
- Keep original PDFs locally by default unless Mike explicitly deletes them.

## Non-goals for V1

- No auto-payments.
- No Gmail/digital bill ingestion yet.
- No automatic deletion of retained PDFs except explicit `Ignore/delete` decisions.
- No special encrypted/restricted storage per category yet.
- No physical-paper cleanup reminders in the weekly Discord digest.

## High-level architecture

```text
iPhone Shortcut
  -> iCloud Drive temporary intake
  -> Mac importer / watcher
  -> local raw inbox
  -> OCR/classification processor
  -> duplicate detection
  -> Notion inbox/archive index
  -> Apple Reminders for actionable items
  -> Discord batch summary/questions/review workflow
  -> Telegram urgent fallback alerts
```

## Components

### 1. iPhone Shortcut: Scan Mail Batch

Purpose: fastest possible capture while going through a large pile of mail.

Behavior:

1. Create one `batchId` at start of session.
2. Show loop menu:
   - Scan next mail item
   - Finish batch
3. For each mail item:
   - scan one multi-page PDF
   - ask optional friendly label:
     - Bill -> `BILL`
     - Health / Medical / Insurance -> `HEALTH-INSURANCE`
     - Other Insurance -> `OTHER-INSURANCE`
     - School / Family -> `SCHOOL-FAMILY`
     - Tax / Legal / Government -> `TAX-LEGAL-GOVERNMENT`
     - Home / Auto -> `HOME-AUTO`
     - Receipt / Record -> `RECEIPT-RECORD`
     - Subscription / Membership -> `SUBSCRIPTION`
     - Other / Unknown -> `UNKNOWN`
   - home/auto insurance maps to `HOME-AUTO`; `OTHER-INSURANCE` is for non-health insurance that does not fit home/auto
   - health/medical insurance receipts map to `HEALTH-INSURANCE`, not `RECEIPT-RECORD`
   - `BILL` is reserved for non-medical/non-insurance bills; medical/doctor/health bills map to `HEALTH-INSURANCE`; home/auto insurance bills map to `HOME-AUTO`
   - if OCR/classification clearly disagrees with the Shortcut label, ask before overriding category
   - label conflict prompt choices: `Keep my label`, `Use detected category`, `Create reminder anyway`, `Needs review`
   - label conflict prompts count against the maximum of 5 Discord questions per batch
   - `Needs review` creates/updates a Notion item with status `Needs Review`, due at the next weekly review, with no Apple Reminder
   - `Create reminder anyway` keeps Mike's original Shortcut label/category
   - label conflicts block automatic Apple Reminder creation until Mike answers, even if the item otherwise appears urgent
   - ask optional note
   - save PDF to iCloud temporary intake
   - save sidecar JSON metadata next to PDF
4. On finish:
   - show local iPhone confirmation
   - send Discord message that the batch is ready

Implementation target:

- Generate an importable Apple Shortcut if feasible.
- If that proves brittle, fall back to exact manual Shortcut build instructions.

### 2. iCloud Drive temporary intake

Purpose: handoff from iPhone to Mac only.

Rules:

- Not permanent storage.
- Contains one PDF plus one JSON sidecar per mail item.
- After successful Mac import of both files, delete the iCloud copies.
- If import fails, move files to an error folder and summarize later.

Proposed folder shape:

```text
iCloud Drive/Hermes Mail/Intake/
iCloud Drive/Hermes Mail/Error/
```

### 3. Mac importer / watcher

Purpose: reliably move captured documents from iCloud into local processing.

Behavior:

- Frequent watcher/poller.
- Import PDF + sidecar JSON as a unit.
- Verify both files are present and stable before import.
- Copy to local raw inbox.
- Only after successful local import, delete iCloud intake copies.
- Failed imports go to error handling and appear in batch/weekly summaries.

### 4. Local file storage

Purpose: retain original PDFs and local processing artifacts.

Rules:

- Default keep local PDFs.
- Delete only when explicitly chosen.
- Possible future cleanup job after 30 days, not enabled until rules are approved.
- Retained PDFs organized by year/month/category.

Proposed folders:

```text
/Users/buckaroo/.hermes/projects/mail-bills/inbox/
/Users/buckaroo/.hermes/projects/mail-bills/processing/
/Users/buckaroo/.hermes/projects/mail-bills/archive/YYYY/MM/CATEGORY/
/Users/buckaroo/.hermes/projects/mail-bills/errors/
/Users/buckaroo/.hermes/projects/mail-bills/metadata/
```

Open decision:

- Whether OCR text is kept permanently, temporarily, or regenerated from PDFs.

### 5. OCR/classification processor

Purpose: extract text, classify item, detect actionability, identify urgency.

Implementation approach:

- Import and OCR/classification can be separate retryable steps.
- Use local extraction first:
  - real-text PDFs: PyMuPDF-style extraction
  - scanned PDFs/photos: OCR
- Use configurable vision/LLM model only for difficult scans where local extraction is insufficient.
- Do not use model for every document unless later approved.

Classifier output:

- category
- sender/vendor
- summary
- amount, if any
- due date, if any
- payment/action required flag
- confidence
- urgency flag/reasons
- recommended next action
- duplicate candidates

Urgent triggers:

- due within 14 days
- any detected amount due
- medical/insurance deadline
- school/family deadline
- tax/legal/government notice
- terms such as final notice, past due, urgent, action required, deadline, cancellation, lapse, denial, appeal, collections, or similar

### 6. Duplicate detection

Purpose: avoid duplicate reminders and duplicate archive records.

Compare new scans against:

- pending/actionable items
- archived records

Signals:

- exact PDF file hash
- OCR text similarity
- sender/vendor match
- due date match
- amount match
- Shortcut label/category match
- batch/date proximity

Pending/actionable duplicate choices:

- Attach to existing item
- Create separate reminder
- Archive duplicate
- Delete duplicate

Archived-record duplicate choices:

- Keep both
- Replace archived copy
- Delete new duplicate
- Create reminder anyway

If replacing archived copy, ask whether to delete old PDF immediately or move it to a replaced/backup folder.

`Attach to existing item` keeps both PDFs as alternate scans.

### 7. Notion inbox/archive layer

Confirmed V1 Notion role:

- Notion stores searchable/indexable records, OCR text, summaries, metadata, review state, and status views.
- Notion does not store or attach original PDFs.
- Local Mac stores original PDFs.
- Notion page/database rows point to local PDFs by document ID and/or local path.
- Apple Reminders remains the task surface for actionable work.

Database model:

- Use one `Mail & Bills` Notion database with statuses and views, not separate inbox/archive databases.

Likely statuses:

- Inbox
- Needs Review
- Actionable
- Waiting
- Completed
- Archived
- Deleted
- Error
- Duplicate

These statuses are accepted for V1. When a linked Apple Reminder is completed, move the Notion record to `Needs Review` with reason `Reminder completed; decide archive/retention`, and also record completion metadata. The separate `Completed` status is available for items that are completed and do not currently need retention/review action, or if implementation later proves that distinction useful.

Actionable items should appear in both Notion and Apple Reminders:

- Notion keeps the full mail/document record, status, OCR text, metadata, and archive/review history.
- Apple Reminders mirrors the actual actionable task for day-to-day execution.
- Non-actionable scans appear in Notion only, not Apple Reminders.
- Apple Reminder notes include both the short document ID and full local PDF path for traceability.
- When an Apple Reminder is completed, automatically update the matching Notion record if technically feasible. The matching Notion record should move to `Needs Review` with reason `Reminder completed; decide archive/retention`, so completion does not require manual double-entry and retention is still reviewed.
- Unresolved Discord questions/decisions should live in Notion as `Needs Review` items, especially when batch question count exceeds the Discord max of 5.

Likely views:

- Inbox / Needs Review
- Actionable
- Due Soon
- Urgent
- Archived
- Errors
- Duplicates
- By Category
- By Batch

Possible Notion properties:

- Name/title
- Status
- Category: single-select. Values: `BILL`, `HEALTH-INSURANCE`, `OTHER-INSURANCE`, `SCHOOL-FAMILY`, `TAX-LEGAL-GOVERNMENT`, `HOME-AUTO`, `RECEIPT-RECORD`, `SUBSCRIPTION`, `UNKNOWN`.
- Source
- Sender/Vendor
- Amount
- Due Date
- Batch ID
- Document ID
- Local PDF Path or File Reference
- Apple Reminder ID
- Confidence
- Review Reason: single-select explaining why review is needed, e.g. label conflict, low OCR confidence, possible duplicate, suggested archive, over Discord question limit, reminder completed; decide retention
- Urgency Reasons: multi-select, e.g. due within 14 days, amount due, final notice / past due, health deadline, school/family deadline, tax/legal/government notice
- OCR Summary
- Created At
- Archived At
- Retention Decision: select with values `Undecided`, `Keep`, `Delete Requested`, `Quarantined`, `Permanently Deleted`. Archived records default to `Keep`.
- Quarantined Until
- Duplicate Of / Related Document

Open Notion decisions:

- Should PDFs be uploaded/attached to Notion, or should Notion only hold metadata and local file references?
- Should there be one Notion database with status views, or separate Inbox and Archive databases?
- Should Notion be V1 implementation, or V1.1 after local-only proof-of-life?

### 8. Apple Reminders action surface

Purpose: actual task list.

Rules:

- Dedicated Reminders list: `Mail & Bills`.
- Only actionable items become reminders.
- High-confidence actionable items create reminders automatically.
- Low-confidence items ask via Discord before reminder creation.
- Urgent items create a reminder and send Telegram urgent fallback alerts.
- If no clear due date, due at next weekly review after processing.
- Reminder titles should be clean, no source/category prefix.

Reminder notes include:

- category
- source = physical mail
- amount, if any
- due date, if any
- summary
- local PDF path and/or document ID
- confidence / needs-review flags
- batch ID

Open decision:

- Reminder notes should contain full local path, short document ID, or both.

### 9. Messaging behavior

V1 messaging split:

- Discord is the primary Mail & Bills operations surface.
- Use one dedicated Discord channel for V1: `#mail-bills`.
- Telegram is urgent fallback only.
- Do not send every message to both platforms.

Discord should receive:

- batch summaries
- normal review questions
- duplicate prompts
- archive/delete decisions
- weekly digest
- unresolved Needs Review summaries
- import/OCR error summaries

Telegram should receive only short urgent fallback pointer alerts, not full item summaries. The Telegram alert should say to check Discord/Notion, without dumping sensitive document details or naming the Discord channel. Include only minimal metadata: vendor and due date when available.

Discord `#mail-bills` urgent messages should not mention Mike by default. Mentions are disabled for V1 unless Mike explicitly enables them later. Use no special urgent formatting by default: no mention, no `URGENT:` prefix, no special emoji.

Trigger examples:

- due within 14 days
- amount due and likely actionable
- health/insurance deadline
- school/family deadline
- tax/legal/government notice
- scary/high-risk OCR words like final notice, past due, action required, denial, appeal, collections
- severe processing failure that prevents the system from operating

Batch summary:

- Always send to Discord so Mike knows the system ran.
- Use structured sections:
  - Batch ID
  - Counts
  - Apple Reminders Created
  - Needs Review
  - Errors
- Include batch ID.
- Summary emphasizes counts and created reminders.
- Include questions/errors if present.
- Max 5 confirmation questions per batch.
- Additional unresolved confirmations become Notion `Needs Review` items due at the next weekly review and roll into the weekly digest.
- Non-actionable items suggested for archive stay in Notion `Needs Review` until Mike explicitly approves archiving; do not move them to `Archived` automatically.
- Notion `Needs Review` items do not create Apple Reminders.

Standard confirmation choices:

- Create reminder
- Archive only
- Mark urgent
- Ignore/delete

`Ignore/delete` deletes local PDF and associated metadata immediately. Prompt text must make that destructive action explicit.

`Archive only` keeps the local PDF by default.

Possible duplicate choices are listed in the duplicate detection section.

### 10. Weekly review

Schedule:

- Saturday 10:00 AM America/New_York
- Discord digest only, with Telegram urgent fallback handled separately
- No Apple Reminder for the review itself

Digest sections:

- Due soon
- Needs action
- Waiting
- New/unreviewed / Needs Review: count + top 5, prioritized urgent first then due soonest
- Archived records: counts only unless questions/errors/duplicates exist
- Completed this week awaiting retention decision
- Unresolved import/OCR errors

Physical paper-original cleanup remains separate and is not included as routine weekly digest noise.

### 11. Deletion policy

Use safe deletion for V1.

When Mike chooses `Ignore/delete` or `Delete duplicate`:

- remove the item from normal active/archive storage
- move deleted files to a local trash/quarantine area for at least 7 days
- do not permanently delete quarantined files automatically; ask in the weekly Discord review before permanent deletion
- weekly review should show quarantined deletion candidates as counts only
- if Mike does not answer the permanent deletion question, keep the files quarantined and ask again in the next weekly review
- keep a minimal Notion tombstone record with status `Deleted`
- hide `Deleted` records from normal Notion views
- expose them only in a dedicated `Deleted` view

Deleted tombstone records should keep minimal audit info only:

- title/category/source
- deleted date
- batch ID
- deletion reason/choice
- document ID
- retention decision
- quarantined until date

Do not retain full OCR text in deleted tombstones unless later approved.

## V1 implementation phases

### Phase 1: Architecture + data model

- finalize Notion role
- finalize local document ID/path strategy
- define metadata schema
- define Reminders mapping
- define Discord summary/question format and Telegram urgent fallback format

### Phase 2: Shortcut

- generate importable Shortcut if feasible
- test looped scan flow
- test sidecar JSON creation
- test iCloud handoff

### Phase 3: Importer

- watch/poll iCloud intake
- import stable PDF+JSON pairs
- delete iCloud copies only after verified local import
- move failures to error folder

### Phase 4: OCR/classification

- extract text
- classify category/actionability/urgency
- use fallback model for difficult scans only
- create metadata record

### Phase 5: Reminders + Discord + Telegram urgent fallback

- create/verify `Mail & Bills` Reminders list
- auto-create high-confidence actionable reminders
- send batch summaries
- ask bounded multiple-choice questions

### Phase 6: Notion inbox/archive

- create/inspect Notion database schema
- write inbox/archive records
- keep Reminders as task surface
- verify end-to-end with test scans

## Key open questions

1. Notion storage model:
   - confirmed: Notion stores OCR text, summaries, metadata, statuses, and views
   - confirmed: original PDFs stay local on the Mac; no PDFs attached/uploaded to Notion

2. Notion database model:
   - confirmed: one `Mail & Bills` database with statuses and views

3. Reminder document reference:
   - full local path
   - short document ID
   - both

4. OCR/metadata retention:
   - permanent
   - temporary
   - regenerated from PDFs

5. Non-actionable archive confirmation timing:
   - immediate question
   - suggested archive in summary
   - other
