import { describe, expect, it } from "vitest";
import { uiJs } from "../src/ui.js";

describe("embedded UI behavior", () => {
  it("keeps deleted documents out of the active review detail after delete", () => {
    expect(uiJs).toContain("const doc = reviewDocs.find((item) => item.document_id === state.selectedId) || null;");
    expect(uiJs).toContain("if (action === \"delete\") {");
    expect(uiJs).toContain("state.selectedId = null;");
    expect(uiJs).toContain("state.status = \"All\";");
    expect(uiJs).toContain("showView(\"console\");");
  });
});
