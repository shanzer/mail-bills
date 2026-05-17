import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { acceptUpload, IntakeUploadError, UploadCollisionError } from "../src/intake.js";
import { makeConfig, sidecarBytes, tempRoot } from "./helpers.js";

describe("intake uploads", () => {
  it("writes pdf and sidecar atomically and accepts identical retry", () => {
    const config = makeConfig(tempRoot("mail-bills-upload-"));

    const first = acceptUpload({ pdfBytes: Buffer.from("%PDF upload\n"), sidecarBytes: sidecarBytes(), config });
    const second = acceptUpload({ pdfBytes: Buffer.from("%PDF upload\n"), sidecarBytes: sidecarBytes(), config });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(fs.readFileSync(first.pdfPath, "utf8")).toBe("%PDF upload\n");
    expect(fs.readdirSync(config.intakeUpload.intakeDir).some((name) => name.endsWith(".part"))).toBe(false);
  });

  it("rejects collisions and unsafe document IDs", () => {
    const config = makeConfig(tempRoot("mail-bills-upload-"));
    acceptUpload({ pdfBytes: Buffer.from("%PDF upload\n"), sidecarBytes: sidecarBytes(), config });

    expect(() => acceptUpload({ pdfBytes: Buffer.from("different"), sidecarBytes: sidecarBytes(), config })).toThrow(UploadCollisionError);
    expect(() => acceptUpload({ pdfBytes: Buffer.from("%PDF upload\n"), sidecarBytes: sidecarBytes("../escape"), config })).toThrow(IntakeUploadError);
  });
});
