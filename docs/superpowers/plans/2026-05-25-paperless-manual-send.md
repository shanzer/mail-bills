# Paperless Manual Send Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual `send-to-paperless` action available from both the Mail Bills CLI and browser UI.

**Architecture:** Keep Paperless integration behind a small Mail Bills adapter in `src/paperless.ts`. Extend the existing shared document action path in `src/actions.ts`, so the CLI, REST API, and UI all use the same behavior.

**Tech Stack:** TypeScript ES modules, Vitest, Fastify inject tests, Node `child_process.execFile`.

---

## File Structure

- Create `src/paperless.ts`: focused adapter for uploading a PDF to Paperless using the adjacent `../paperless-cli/src/pdf-service-upload.js` script.
- Modify `src/actions.ts`: add the `send-to-paperless` action, injectable uploader, PDF validation, event append, and sanitized payload.
- Modify `src/ui.ts`: add a `Send to Paperless` button and a clearer toast for the Paperless action.
- Modify `tests/actions.test.ts`: cover dry run, missing path, missing file, successful upload, ledger event creation, and no local deletion.
- Modify `tests/api.test.ts`: verify the UI exposes the button and the JS knows the action string.

---

### Task 1: Add Paperless Action Tests

**Files:**
- Create: `tests/actions.test.ts`
- Modify: none

- [ ] **Step 1: Write failing tests**

Create `tests/actions.test.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { applyDocumentAction } from "../src/actions.js";
import { configPaths } from "../src/config.js";
import { Ledger } from "../src/ledger.js";
import { makeConfig, tempRoot } from "./helpers.js";

function seededDocument() {
  const root = tempRoot("mail-bills-actions-");
  const config = makeConfig(root);
  const ledger = new Ledger(configPaths(config).ledgerPath);
  ledger.initialize();
  ledger.upsertBatch({ batch_id: "batch-1", status: "imported", item_count: 1 });
  const pdfPath = path.join(root, "archive", "2026", "05", "doc-paperless-1.pdf");
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
  fs.writeFileSync(pdfPath, "%PDF-1.4\n%%EOF\n", "utf8");
  ledger.upsertDocument({
    document_id: "doc-paperless-1",
    batch_id: "batch-1",
    status: "Archived",
    local_pdf_path: pdfPath
  });
  return { root, config, ledger, pdfPath };
}

describe("document actions", () => {
  it("dry-runs send-to-paperless without calling the uploader", async () => {
    const { config, ledger, pdfPath } = seededDocument();
    const uploader = vi.fn();

    const result = await applyDocumentAction({
      documentId: "doc-paperless-1",
      action: "send-to-paperless",
      ledger,
      config,
      dryRun: true,
      paperlessUploader: uploader
    });

    expect(result).toMatchObject({
      documentId: "doc-paperless-1",
      action: "send-to-paperless",
      ok: true,
      dryRun: true,
      payload: { uploaded: false, pdf_path: pdfPath }
    });
    expect(uploader).not.toHaveBeenCalled();
  });

  it("fails send-to-paperless when the ledger has no local PDF path", async () => {
    const { config, ledger } = seededDocument();
    ledger.upsertDocument({ document_id: "doc-paperless-1", local_pdf_path: null });

    const result = await applyDocumentAction({
      documentId: "doc-paperless-1",
      action: "send-to-paperless",
      ledger,
      config,
      paperlessUploader: vi.fn()
    });

    expect(result).toMatchObject({
      ok: false,
      action: "send-to-paperless",
      error: "document has no local_pdf_path"
    });
  });

  it("fails send-to-paperless when the local PDF is missing", async () => {
    const { config, ledger, pdfPath } = seededDocument();
    fs.unlinkSync(pdfPath);

    const result = await applyDocumentAction({
      documentId: "doc-paperless-1",
      action: "send-to-paperless",
      ledger,
      config,
      paperlessUploader: vi.fn()
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("PDF file is missing");
  });

  it("uploads to Paperless, records an event, and keeps the local PDF", async () => {
    const { config, ledger, pdfPath } = seededDocument();
    const uploader = vi.fn(async () => ({ task_id: "task-123", document_id: 456 }));

    const result = await applyDocumentAction({
      documentId: "doc-paperless-1",
      action: "send-to-paperless",
      ledger,
      config,
      paperlessUploader: uploader
    });

    expect(result).toMatchObject({
      ok: true,
      action: "send-to-paperless",
      dryRun: false,
      payload: {
        uploaded: true,
        pdf_path: pdfPath,
        paperless_response: { task_id: "task-123", document_id: 456 }
      }
    });
    expect(uploader).toHaveBeenCalledOnce();
    expect(uploader).toHaveBeenCalledWith(pdfPath);
    expect(fs.existsSync(pdfPath)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/actions.test.ts
```

Expected: fail because `paperlessUploader` is not an accepted input property and `send-to-paperless` is unsupported.

---

### Task 2: Add Paperless Adapter

**Files:**
- Create: `src/paperless.ts`

- [ ] **Step 1: Implement adapter**

Create `src/paperless.ts`:

```ts
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type PaperlessUploadResponse = Record<string, unknown>;
export type PaperlessUploader = (pdfPath: string) => Promise<PaperlessUploadResponse>;

export async function uploadPdfToPaperless(pdfPath: string): Promise<PaperlessUploadResponse> {
  const scriptPath = paperlessUploadScriptPath();
  const { stdout } = await execFileAsync(process.execPath, [scriptPath, pdfPath], {
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
  const trimmed = stdout.trim();
  if (!trimmed) return { ok: true };
  try {
    return JSON.parse(trimmed) as PaperlessUploadResponse;
  } catch {
    return { ok: true, stdout: trimmed };
  }
}

export function paperlessUploadScriptPath(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "../../paperless-cli/src/pdf-service-upload.js");
}
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run check
```

Expected: fail because `paperless.ts` exists but is not yet used, or pass if TypeScript accepts it. Continue either way.

---

### Task 3: Implement Shared Document Action

**Files:**
- Modify: `src/actions.ts`
- Test: `tests/actions.test.ts`

- [ ] **Step 1: Extend action inputs and action set**

In `src/actions.ts`, add imports:

```ts
import fs from "node:fs";
import { uploadPdfToPaperless, type PaperlessUploader } from "./paperless.js";
```

Add `"send-to-paperless"` to `DOCUMENT_ACTIONS`.

Add this property to `applyDocumentAction` input:

```ts
paperlessUploader?: PaperlessUploader;
```

- [ ] **Step 2: Route action to helper**

Inside `applyDocumentAction`, after the `delete` branch, add:

```ts
if (input.action === "send-to-paperless") return sendToPaperless(document, input, dryRun);
```

- [ ] **Step 3: Add helper implementation**

Add this helper near the other action helpers:

```ts
async function sendToPaperless(document: DocumentRecord, input: Parameters<typeof applyDocumentAction>[0], dryRun: boolean): Promise<DocumentActionResult> {
  const pdfPath = textValue(document.local_pdf_path);
  if (!pdfPath) throw new Error("document has no local_pdf_path");
  if (!fs.existsSync(pdfPath)) throw new Error(`PDF file is missing: ${pdfPath}`);
  if (dryRun) {
    return {
      documentId: document.document_id,
      action: "send-to-paperless",
      ok: true,
      dryRun: true,
      payload: { uploaded: false, pdf_path: pdfPath }
    };
  }
  const uploader = input.paperlessUploader ?? uploadPdfToPaperless;
  const response = sanitizePaperlessResponse(await uploader(pdfPath));
  input.ledger.appendEvent({
    documentId: document.document_id,
    batchId: document.batch_id,
    eventType: "paperless_uploaded",
    payload: { pdf_path: pdfPath, paperless_response: response }
  });
  return {
    documentId: document.document_id,
    action: "send-to-paperless",
    ok: true,
    dryRun: false,
    payload: { uploaded: true, pdf_path: pdfPath, paperless_response: response }
  };
}

function sanitizePaperlessResponse(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { value: String(value ?? "") };
  const blocked = new Set(["apiKey", "apikey", "token", "authorization", "Authorization"]);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !blocked.has(key))
      .map(([key, entry]) => [key, typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean" || entry === null ? entry : JSON.stringify(entry)])
  );
}
```

- [ ] **Step 4: Run action tests**

Run:

```bash
npm test -- tests/actions.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit backend action**

Run:

```bash
git add src/paperless.ts src/actions.ts tests/actions.test.ts
git commit -m "Add manual Paperless document action"
```

---

### Task 4: Add UI Button and API Asset Test

**Files:**
- Modify: `src/ui.ts`
- Modify: `tests/api.test.ts`

- [ ] **Step 1: Write failing API asset assertion**

In `tests/api.test.ts`, in `serves the functional UI assets`, add:

```ts
expect(html.body).toContain("Send to Paperless");
expect(js.body).toContain("send-to-paperless");
```

- [ ] **Step 2: Run API test to verify it fails**

Run:

```bash
npm test -- tests/api.test.ts -t "serves the functional UI assets"
```

Expected: fail because the UI does not contain `Send to Paperless`.

- [ ] **Step 3: Add UI button**

In `src/ui.ts`, inside the `.action-grid` after `Complete`, add:

```html
<button class="button button-secondary" type="button" data-doc-action="send-to-paperless"><span data-icon="upload-cloud"></span>Send to Paperless</button>
```

- [ ] **Step 4: Improve Paperless toast**

In `src/ui.ts`, replace:

```js
toast(result.action + " applied to " + doc.document_id);
```

with:

```js
toast(action === "send-to-paperless" ? "Sent to Paperless: " + doc.document_id : result.action + " applied to " + doc.document_id);
```

- [ ] **Step 5: Run API asset test**

Run:

```bash
npm test -- tests/api.test.ts -t "serves the functional UI assets"
```

Expected: pass.

- [ ] **Step 6: Commit UI button**

Run:

```bash
git add src/ui.ts tests/api.test.ts
git commit -m "Add Paperless send button to UI"
```

---

### Task 5: Full Verification

**Files:**
- No code edits.

- [ ] **Step 1: Run typecheck**

Run:

```bash
npm run check
```

Expected: pass.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: pass.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: pass.

- [ ] **Step 4: Inspect git status**

Run:

```bash
git status --short
```

Expected: only unrelated pre-existing untracked files remain, if any.

## Self-Review

Spec coverage:

- CLI uses existing `action <documentId> --action send-to-paperless`.
- UI gets a `Send to Paperless` button using the existing action endpoint.
- Backend requires `local_pdf_path`, verifies file existence, supports dry-run, uploads live, appends `paperless_uploaded`, and leaves files untouched.
- Paperless config remains in `~/.fileclerk`; Mail Bills does not add API key config.
- Quarantine cleanup remains outside this implementation.

Placeholder scan: no `TBD`, `TODO`, or unresolved implementation placeholders.

Type consistency: `PaperlessUploader`, `paperlessUploader`, `send-to-paperless`, `paperless_uploaded`, `pdf_path`, and `paperless_response` are used consistently across tasks.
