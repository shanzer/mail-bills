import { describe, expect, it } from "vitest";
import { classifyMail } from "../src/classifier.js";

describe("classifier", () => {
  it("extracts actionable bill fields", () => {
    const result = classifyMail("Dominion Energy bill amount due $61.20 due 06/10/2026");

    expect(result.status).toBe("Actionable");
    expect(result.vendor).toBe("Dominion Energy");
    expect(result.amount).toBe("61.20");
    expect(result.dueDate).toBe("2026-06-10");
    expect(result.urgencyReasons).toContain("amount due");
  });

  it("requires review on clear shortcut label conflict", () => {
    const result = classifyMail(
      "Mass General Brigham\nPatient responsibility $84.10\nHealth insurance explanation of benefits",
      { shortcutLabel: "BILL" }
    );

    expect(result.status).toBe("Needs Review");
    expect(result.detectedCategory).toBe("HEALTH-INSURANCE");
    expect(result.reviewReason).toContain("conflicts");
  });

  it("uses the detected category when the shortcut label is unknown", () => {
    const result = classifyMail("Dominion Energy bill amount due $61.20 due 06/10/2026", { shortcutLabel: "Unknown" });

    expect(result.category).toBe("BILL");
    expect(result.detectedCategory).toBe("BILL");
  });
});
