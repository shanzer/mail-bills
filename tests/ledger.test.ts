import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Ledger } from "../src/ledger.js";
import { tempRoot } from "./helpers.js";

describe("ledger", () => {
  it("creates the Python-compatible schema and upserts rows", () => {
    const dir = tempRoot("mail-bills-ledger-");
    const ledger = new Ledger(path.join(dir, "data", "ledger.sqlite"));

    ledger.initialize();
    ledger.upsertBatch({ batch_id: "batch-1", status: "imported", item_count: 1 });
    ledger.upsertDocument({ document_id: "doc-1", batch_id: "batch-1", status: "imported", vendor: "Dominion Energy" });
    ledger.upsertDocument({ document_id: "doc-1", status: "Actionable", amount: "61.20" });

    expect(ledger.getBatch("batch-1")?.status).toBe("imported");
    expect(ledger.getDocument("doc-1")).toMatchObject({ status: "Actionable", vendor: "Dominion Energy", amount: "61.20" });
    expect(ledger.documentsForBatch("batch-1")).toHaveLength(1);
    expect(ledger.appendEvent({ documentId: "doc-1", batchId: "batch-1", eventType: "processed" })).toBe(1);
  });
});
