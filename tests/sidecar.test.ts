import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSidecar, mapFriendlyLabel, SidecarValidationError } from "../src/sidecar.js";
import { tempRoot } from "./helpers.js";

describe("sidecar", () => {
  it("maps friendly labels", () => {
    expect(mapFriendlyLabel("Health / Medical / Insurance")).toBe("HEALTH-INSURANCE");
    expect(mapFriendlyLabel("Other / Unknown")).toBe("UNKNOWN");
  });

  it("loads and validates sidecar json", () => {
    const dir = tempRoot("mail-bills-sidecar-");
    const file = path.join(dir, "doc.json");
    fs.writeFileSync(file, JSON.stringify({ batchId: "batch-1", capturedAt: "2026-05-14T09:30:00Z", label: "Bill" }));

    const sidecar = loadSidecar(file);

    expect(sidecar.batchId).toBe("batch-1");
    expect(sidecar.category).toBe("BILL");
    expect(sidecar.documentId).toMatch(/^batch-1-/);
  });

  it("rejects unknown categories", () => {
    const dir = tempRoot("mail-bills-sidecar-");
    const file = path.join(dir, "doc.json");
    fs.writeFileSync(file, JSON.stringify({ batchId: "batch-1", capturedAt: "2026-05-14T09:30:00Z", category: "BAD" }));

    expect(() => loadSidecar(file)).toThrow(SidecarValidationError);
  });
});
