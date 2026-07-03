import { describe, expect, it, vi } from "vitest";
import { configPaths } from "../src/config.js";
import { Ledger } from "../src/ledger.js";
import { processBatch, type ProcessorServices } from "../src/processor.js";
import { loadDuplicateSources, detectDuplicates } from "../src/dedupe.js";
import { makeConfig, tempRoot } from "./helpers.js";

function services(): ProcessorServices {
  return {
    importScanner: vi.fn(),
    ocrProcessor: vi.fn(async () => ({
      pdfPath: "/tmp/current.pdf",
      text: "current OCR text",
      pageCount: 1,
      confidence: "high",
      needsFallback: false,
      summary: "current summary",
      modelSummaryEnabled: false,
      extractionMethod: "embedded" as const
    })),
    classifier: vi.fn(() => ({
      category: "BILL",
      detectedCategory: "BILL",
      status: "Actionable",
      actionRequired: true,
      confidence: "high",
      urgencyReasons: [],
      recommendedNextAction: "Review in Mail Bills UI",
      summary: "current summary"
    })),
    duplicateSourceLoader: vi.fn(() => []),
    duplicateDetector: vi.fn(() => ({
      hasPossibleDuplicates: false,
      recommendedStatus: "Actionable",
      matches: []
    }))
  };
}

describe("processor", () => {
  it("reports only documents attempted in the current live batch run", async () => {
    const config = makeConfig(tempRoot("mail-bills-processor-"));
    const ledger = new Ledger(configPaths(config).ledgerPath);
    ledger.initialize();
    ledger.upsertBatch({ batch_id: "batch-1", status: "imported", item_count: 2 });
    ledger.upsertDocument({
      document_id: "doc-old",
      batch_id: "batch-1",
      status: "Deleted",
      error_message: "historical OCR failure"
    });
    ledger.upsertDocument({
      document_id: "doc-current",
      batch_id: "batch-1",
      status: "imported",
      local_pdf_path: "/tmp/current.pdf"
    });

    const result = await processBatch({
      batchId: "batch-1",
      config,
      ledger,
      dryRun: false,
      services: services()
    });

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.documents.map((document) => document.document_id)).toEqual(["doc-current"]);
    expect(result.documents[0]).toMatchObject({
      status: "Actionable",
      error_message: null
    });
  });

  it("rolls back classification writes when appendEvent throws mid-transaction", async () => {
    const config = makeConfig(tempRoot("mail-bills-proc-rollback-"));
    const ledger = new Ledger(configPaths(config).ledgerPath);
    ledger.initialize();
    ledger.upsertBatch({ batch_id: "batch-rb", status: "imported", item_count: 1 });
    ledger.upsertDocument({ document_id: "doc-rb", batch_id: "batch-rb", status: "imported", local_pdf_path: "/tmp/rb.pdf" });

    // Throw only on the first appendEvent call (inside the processDocument
    // transaction).  The catch handler's "processing_error" appendEvent must
    // be allowed through so processBatch can record the Error status row.
    let appendEventCalls = 0;
    (ledger as unknown as Record<string, unknown>)["appendEvent"] = () => {
      appendEventCalls += 1;
      if (appendEventCalls === 1) throw new Error("event write failed");
    };

    try {
      const result = await processBatch({ batchId: "batch-rb", config, ledger, dryRun: false, services: services() });

      expect(result.failed).toBe(1);

      // The transaction that wrote classification fields must have rolled back.
      const doc = ledger.getDocument("doc-rb");
      expect(doc?.vendor ?? null).toBeNull();

      // The catch handler wrote status: "Error" after the rollback.
      expect(doc?.status).toBe("Error");
    } finally {
      ledger.close();
    }
  });

  it("loads duplicate sources once per batch, not once per document", async () => {
    const root = tempRoot("mail-bills-proc-dedupe-");
    const config = makeConfig(root);
    const ledger = new Ledger(configPaths(config).ledgerPath);
    ledger.initialize();
    ledger.upsertBatch({ batch_id: "b1", status: "imported" });
    for (const id of ["d1", "d2", "d3"]) {
      ledger.upsertDocument({ document_id: id, batch_id: "b1", status: "imported", local_pdf_path: "/dev/null" });
    }
    let loaderCalls = 0;
    const customServices: ProcessorServices = {
      importScanner: async () => ({ imported: 0, failed: 0, skipped: 0, dryRun: true }),
      ocrProcessor: async ({ documentId }) => ({
        pdfPath: "x", text: `text ${documentId}`, pageCount: 1, confidence: "high", needsFallback: false,
        summary: "s", modelSummaryEnabled: false, extractionMethod: "embedded" as const
      }),
      classifier: () => ({
        category: "BILL", detectedCategory: "BILL", status: "Actionable", actionRequired: true,
        confidence: "high", urgencyReasons: [], recommendedNextAction: "x", summary: "s", vendor: "V"
      }),
      duplicateSourceLoader: (l) => { loaderCalls += 1; return loadDuplicateSources(l); },
      duplicateDetector: detectDuplicates
    };
    const result = await processBatch({ batchId: "b1", config, ledger, dryRun: true, services: customServices });
    expect(result.processed).toBe(3);
    expect(loaderCalls).toBe(1);
    ledger.close();
  });
});
