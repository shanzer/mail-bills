import path from "node:path";
import { fileURLToPath } from "node:url";

export function expandUser(input: string, home = process.env.HOME || ""): string {
  if (input === "~") return path.resolve(home);
  if (input.startsWith("~/")) return path.resolve(home, input.slice(2));
  return path.resolve(input);
}

export function ownerHomeFromConfigPath(configPath: string): string {
  const resolved = path.resolve(configPath);
  const parts = resolved.split(path.sep);
  const hermesIndex = parts.lastIndexOf(".hermes");
  if (hermesIndex > 1) {
    return parts.slice(0, hermesIndex).join(path.sep) || path.sep;
  }
  return process.env.HOME || "";
}

export function ensureUnder(root: string, candidate: string): string {
  const rootResolved = path.resolve(root);
  const candidateResolved = path.resolve(candidate);
  const relative = path.relative(rootResolved, candidateResolved);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return candidateResolved;
  }
  throw new Error(`path escapes root: ${candidate}`);
}

export function projectRootFromModule(metaUrl: string): string {
  return path.resolve(path.dirname(fileURLToPath(metaUrl)), "..");
}

export function optionalText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

export function textValue(value: unknown, fallback = ""): string {
  return optionalText(value) ?? fallback;
}

export function truthy(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return false;
  return ["1", "true", "yes", "y", "on"].includes(String(value).trim().toLowerCase());
}
