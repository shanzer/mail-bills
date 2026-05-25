import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type PaperlessUploadResponse = Record<string, unknown>;
export type PaperlessUploader = (pdfPath: string) => Promise<PaperlessUploadResponse>;

export async function uploadPdfToPaperless(pdfPath: string): Promise<PaperlessUploadResponse> {
  const scriptPath = paperlessUploadScriptPath();
  const { stdout } = await execFileAsync(process.execPath, [scriptPath, pdfPath], {
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
  const trimmed = stdout.trim();
  if (!trimmed) return { ok: true };
  try {
    return JSON.parse(trimmed) as PaperlessUploadResponse;
  } catch {
    return { ok: true, stdout: trimmed };
  }
}

export function paperlessUploadScriptPath(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, candidatePrefix(), "paperless-cli", "src", "pdf-service-upload.js");
}

function candidatePrefix(): string {
  return currentDirIncludesBuildOutput() ? "../../.." : "../..";
}

function currentDirIncludesBuildOutput(): boolean {
  return fileURLToPath(import.meta.url).split(path.sep).includes("dist");
}
