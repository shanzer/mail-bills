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

describe("due date extraction", () => {
  it("rejects impossible calendar dates", () => {
    const result = classifyMail("GEICO bill. Amount due $50. Payment due 13/45/2026.");
    expect(result.dueDate).toBeUndefined();
  });

  it("rejects a real-looking but invalid day-of-month", () => {
    const result = classifyMail("GEICO bill. Amount due $50. Due date: 02/30/2026.");
    expect(result.dueDate).toBeUndefined();
  });

  it("ignores dates that are not adjacent to a due/pay keyword", () => {
    const result = classifyMail("GEICO statement period January 5, 2026 through February 4, 2026. Amount due $50.");
    expect(result.dueDate).toBeUndefined();
  });

  it("still extracts keyword-adjacent dates", () => {
    expect(classifyMail("GEICO bill amount due $50, payment due by June 15, 2026").dueDate).toBe("2026-06-15");
    expect(classifyMail("GEICO bill amount due $50. Due date: 06/15/2026").dueDate).toBe("2026-06-15");
  });
});
