import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OcrConfig } from "../src/types.js";

const execFileSyncMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFileSync: execFileSyncMock
}));

function makeOcrConfig(overrides: Partial<OcrConfig> = {}): OcrConfig {
  return {
    localFirst: true,
    visionFallbackEnabled: true,
    modelFallbackEnabled: false,
    modelProvider: "configurable",
    modelName: "configurable",
    lowTextThreshold: 40,
    ...overrides
  };
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedDefaultHelperPath = path.join(repoRoot, "dist", "utils", "vision_ocr");

describe("OCR helper path", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("node:url");
    execFileSyncMock.mockReset();
    execFileSyncMock.mockReturnValue(JSON.stringify({ text: "Vision OCR text" }));
  });

  it("resolves the default Vision helper path to dist/utils/vision_ocr from the source-tree layout", async () => {
    const { defaultVisionHelperPath } = await import("../src/ocr.js");

    expect(defaultVisionHelperPath()).toBe(expectedDefaultHelperPath);
  });

  it("resolves the default Vision helper path to dist/utils/vision_ocr from the compiled runtime layout", async () => {
    vi.doMock("node:url", async () => {
      const actual = await vi.importActual<typeof import("node:url")>("node:url");
      return {
        ...actual,
        fileURLToPath: vi.fn(() => path.join(repoRoot, "dist", "src", "ocr.js"))
      };
    });
    const { defaultVisionHelperPath } = await import("../src/ocr.js");

    expect(defaultVisionHelperPath()).toBe(expectedDefaultHelperPath);
  });

  it("executes the compiled helper binary directly when no override is configured", async () => {
    const { runVisionOcr } = await import("../src/ocr.js");
    const pdfPath = "/tmp/mail-bills-sample.pdf";

    const result = runVisionOcr(pdfPath, makeOcrConfig());

    expect(result).toBe("Vision OCR text");
    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    expect(execFileSyncMock).toHaveBeenCalledWith(expectedDefaultHelperPath, [pdfPath], expect.objectContaining({
      encoding: "utf8"
    }));
  });

  it("uses ocr.vision_helper_path when configured", async () => {
    const { runVisionOcr } = await import("../src/ocr.js");
    const helperPath = "/custom/bin/vision_ocr";
    const pdfPath = "/tmp/mail-bills-custom.pdf";

    const result = runVisionOcr(pdfPath, makeOcrConfig({ visionHelperPath: helperPath }));

    expect(result).toBe("Vision OCR text");
    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    expect(execFileSyncMock).toHaveBeenCalledWith(helperPath, [pdfPath], expect.objectContaining({
      encoding: "utf8"
    }));
  });
});
