import { describe, expect, it, vi } from "vitest";
import { configPaths } from "../src/config.js";
import { Ledger } from "../src/ledger.js";
import { processBatch, type ProcessorServices } from "../src/processor.js";
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
});
