# Browser PDF Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser UI PDF import flow that queues PDFs through the same upload intake workflow as iPhone uploads.

**Architecture:** Add a new internal multipart API route, `POST /api/documents/import-pdf`, that generates a phone-compatible sidecar and calls `acceptUpload`. Add a compact modal to the existing Documents view so the browser posts PDF/category/label/note to that route, then refreshes status and document counts.

**Tech Stack:** TypeScript ES modules, Fastify multipart, existing `acceptUpload` and `scanImports`, embedded browser UI string, Vitest.

---

## File Structure

- Modify `src/api.ts`: add browser import route, category validation, sidecar generation, PDF validation, and small ID helpers.
- Modify `src/ui.ts`: add Import PDF button, modal HTML, UI element references, `FormData` upload flow, and modal event handlers.
- Modify `tests/api.test.ts`: add API tests for browser import success, missing PDF, unsupported category, importer compatibility, and UI asset assertions.
- Modify `README.md`: document the new browser import route and behavior.

---

### Task 1: Browser Import API Tests

**Files:**
- Modify: `tests/api.test.ts`

- [ ] **Step 1: Write failing API tests**

Add tests that:

```ts
it("queues a browser PDF import as an upload-intake PDF and sidecar", async () => {
  const config = makeConfig(tempRoot("mail-bills-api-"));
  const app = createApi(config);
  const multipart = multipartBrowserImport({
    pdf: ["statement.pdf", Buffer.from("%PDF browser\n"), "application/pdf"],
    fields: { category: "BILL", label: "Bill", note: "Imported from desktop" }
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/documents/import-pdf",
    headers: { "content-type": multipart.contentType },
    payload: multipart.body
  });

  expect(response.statusCode).toBe(201);
  const body = response.json();
  expect(body).toMatchObject({ ok: true, created: true, source: "browser_ui" });
  expect(fs.existsSync(body.pdfPath)).toBe(true);
  expect(fs.existsSync(body.sidecarPath)).toBe(true);
  const sidecar = JSON.parse(fs.readFileSync(body.sidecarPath, "utf8"));
  expect(sidecar).toMatchObject({ documentId: body.documentId, batchId: body.batchId, category: "BILL", label: "Bill", note: "Imported from desktop", source: "browser_ui" });
  await app.close();
});
```

Also add tests for missing PDF, invalid category, and `scanImports` importing the queued pair normally.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/api.test.ts -t "browser PDF import|unsupported category|missing PDF|normal upload-intake"
```

Expected: fail with 404 for `/api/documents/import-pdf`.

---

### Task 2: Implement Browser Import API

**Files:**
- Modify: `src/api.ts`

- [ ] **Step 1: Add imports**

Add:

```ts
import crypto from "node:crypto";
import { CATEGORY_VALUES } from "./types.js";
```

- [ ] **Step 2: Add endpoint**

Add `app.post("/api/documents/import-pdf", ...)` near the existing intake endpoint. It should parse multipart file and fields, require a PDF, validate category, generate sidecar JSON, call `acceptUpload`, and return `201` or `200`.

- [ ] **Step 3: Add helpers**

Add helpers:

```ts
function validateBrowserImportCategory(value: unknown): string
function browserImportSidecar(input: { category: string; label?: string; note?: string }): { sidecar: Record<string, unknown>; sidecarBytes: Buffer }
function browserBatchId(date: Date): string
function browserDocumentId(date: Date): string
function compactTimestamp(date: Date): string
function trimText(value: unknown, maxLength?: number): string | undefined
function isPdfUpload(filename?: string, mimetype?: string): boolean
```

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npm test -- tests/api.test.ts -t "browser PDF import|unsupported category|missing PDF|normal upload-intake"
```

Expected: pass.

---

### Task 3: UI Import Modal Tests

**Files:**
- Modify: `tests/api.test.ts`

- [ ] **Step 1: Add failing UI asset assertions**

Extend the existing UI asset test with checks for:

```ts
expect(html.body).toContain("Import PDF");
expect(html.body).toContain("importPdfForm");
expect(html.body).toContain("importPdfFile");
expect(js.body).toContain("/api/documents/import-pdf");
expect(js.body).toContain("FormData");
```

- [ ] **Step 2: Run UI asset test**

Run:

```bash
npm test -- tests/api.test.ts -t "serves the functional UI assets"
```

Expected: fail until the UI is added.

---

### Task 4: Implement UI Import Modal

**Files:**
- Modify: `src/ui.ts`

- [ ] **Step 1: Add toolbar button**

Add an `Import PDF` button to the Documents toolbar:

```html
<button class="button button-secondary" type="button" data-import-pdf-open><span data-icon="upload-cloud"></span>Import PDF</button>
```

- [ ] **Step 2: Add modal HTML**

Add a modal with `id="importPdfModal"` containing `form id="importPdfForm"`, `input id="importPdfFile" type="file" accept="application/pdf,.pdf"`, `select id="importPdfCategory"`, `input id="importPdfLabel"`, and `textarea id="importPdfNote"`.

- [ ] **Step 3: Add JS element references and category population**

Add references to `els`, populate `importPdfCategory`, and add click handlers for open/close.

- [ ] **Step 4: Add submit handler**

Build `FormData`, append file/category/label/note, post to `/api/documents/import-pdf`, close modal on success, toast `Queued PDF import: <documentId>`, refresh documents and status.

- [ ] **Step 5: Run UI asset test**

Run:

```bash
npm test -- tests/api.test.ts -t "serves the functional UI assets"
```

Expected: pass.

---

### Task 5: Docs And Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document route**

Add `POST /api/documents/import-pdf` to REST API docs and explain that it queues PDF/sidecar pairs for the normal importer.

- [ ] **Step 2: Run verification**

Run:

```bash
npm run check
npm test
npm run build
```

Expected: all pass.

- [ ] **Step 3: Commit**

Run:

```bash
git add src/api.ts src/ui.ts tests/api.test.ts README.md docs/superpowers/plans/2026-05-26-browser-pdf-import.md
git commit -m "Add browser PDF import"
```

## Self-Review

Spec coverage:

- Browser UI import control: Task 4.
- Internal route, not bearer-token phone route: Task 2.
- Same intake workflow via `acceptUpload`: Task 2.
- No direct ledger write during upload: Task 2 tests check files/sidecar, importer compatibility test checks later ledger path.
- Validation: Task 1 and Task 2.
- UI refresh/status behavior: Task 4.

Placeholder scan: no unresolved placeholders.

Type consistency: route path, IDs, fields, and sidecar keys match the design spec.
