import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OcrConfig } from "../src/types.js";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: execFileMock
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

function mockVisionSuccess(text = "Vision OCR text"): void {
  execFileMock.mockImplementation((_file: string, _args: string[], _opts: unknown, cb: (err: unknown, stdout: string) => void) => {
    cb(null, JSON.stringify({ text }));
  });
}

describe("OCR helper path", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("node:url");
    execFileMock.mockReset();
    mockVisionSuccess();
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

    const result = await runVisionOcr(pdfPath, makeOcrConfig());

    expect(result).toBe("Vision OCR text");
    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(execFileMock).toHaveBeenCalledWith(expectedDefaultHelperPath, [pdfPath], expect.objectContaining({ encoding: "utf8" }), expect.any(Function));
  });

  it("uses ocr.vision_helper_path when configured", async () => {
    const { runVisionOcr } = await import("../src/ocr.js");
    const helperPath = "/custom/bin/vision_ocr";
    const pdfPath = "/tmp/mail-bills-custom.pdf";

    const result = await runVisionOcr(pdfPath, makeOcrConfig({ visionHelperPath: helperPath }));

    expect(result).toBe("Vision OCR text");
    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(execFileMock).toHaveBeenCalledWith(helperPath, [pdfPath], expect.objectContaining({ encoding: "utf8" }), expect.any(Function));
  });

  it("explains EACCES failures from non-executable Vision helper paths", async () => {
    const { runVisionOcr } = await import("../src/ocr.js");
    const helperPath = path.join(repoRoot, "utils", "vision_ocr.swift");
    const pdfPath = "/tmp/mail-bills-source-helper.pdf";
    execFileMock.mockImplementationOnce((_file: string, _args: string[], _opts: unknown, cb: (err: unknown) => void) => {
      cb(Object.assign(new Error("spawn EACCES"), { code: "EACCES" }));
    });

    await expect(runVisionOcr(pdfPath, makeOcrConfig({ visionHelperPath: helperPath })))
      .rejects.toThrow(`Vision OCR helper is not executable: ${helperPath}`);
  });

  it("returns empty text when the helper emits non-JSON stdout", async () => {
    const { runVisionOcr } = await import("../src/ocr.js");
    execFileMock.mockImplementation((_file: string, _args: string[], _opts: unknown, cb: (err: unknown, stdout: string) => void) => {
      cb(null, "not valid json { oops");
    });

    await expect(runVisionOcr("/tmp/x.pdf", makeOcrConfig())).resolves.toBe("");
  });
});

describe("extractPdfText", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("node:url");
    execFileMock.mockReset();
  });

  it("surfaces a Vision OCR helper failure when low embedded text requires fallback", async () => {
    const pdfBytes = Buffer.from("%PDF-1.4");
    const getTextMock = vi.fn().mockResolvedValue({ text: "tiny", total: 1 });
    const destroyMock = vi.fn().mockResolvedValue(undefined);
    const visionError = new Error("vision helper failed");

    vi.doMock("node:fs", () => ({
      default: {
        readFileSync: vi.fn(() => pdfBytes)
      }
    }));
    vi.doMock("pdf-parse", () => ({
      PDFParse: class {
        async getText() {
          return getTextMock();
        }

        async destroy() {
          return destroyMock();
        }
      }
    }));

    const { extractPdfText } = await import("../src/ocr.js");

    await expect(extractPdfText({
      pdfPath: "/tmp/low-text.pdf",
      ocrConfig: makeOcrConfig({ visionFallbackEnabled: true, lowTextThreshold: 40 }),
      visionOcrRunner: () => {
        throw visionError;
      }
    })).rejects.toThrow("vision helper failed");

    expect(getTextMock).toHaveBeenCalledTimes(1);
    expect(destroyMock).toHaveBeenCalledTimes(1);
  });

  it("still destroys the parser when getText rejects", async () => {
    const pdfBytes = Buffer.from("%PDF-1.4");
    const getTextMock = vi.fn().mockRejectedValue(new Error("parse boom"));
    const destroyMock = vi.fn().mockResolvedValue(undefined);

    vi.doMock("node:fs", () => ({ default: { readFileSync: vi.fn(() => pdfBytes) } }));
    vi.doMock("pdf-parse", () => ({
      PDFParse: class {
        async getText() { return getTextMock(); }
        async destroy() { return destroyMock(); }
      }
    }));

    const { extractPdfText } = await import("../src/ocr.js");

    await expect(extractPdfText({
      pdfPath: "/tmp/boom.pdf",
      ocrConfig: makeOcrConfig({ visionFallbackEnabled: false })
    })).rejects.toThrow("parse boom");

    expect(destroyMock).toHaveBeenCalledTimes(1);
  });
});