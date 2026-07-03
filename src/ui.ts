import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface UiAssets {
  html: string;
  css: string;
  js: string;
}

let cache: UiAssets | undefined;

/** Load the embedded UI from src/ui (vitest) or dist/src/ui (compiled). */
export function uiAssets(): UiAssets {
  if (!cache) {
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "ui");
    cache = {
      html: fs.readFileSync(path.join(dir, "index.html"), "utf8"),
      css: fs.readFileSync(path.join(dir, "app.css"), "utf8"),
      js: fs.readFileSync(path.join(dir, "app.js"), "utf8")
    };
  }
  return cache;
}

// Backward-compatible named exports so existing tests pass without modification.
export const uiHtml = uiAssets().html;
export const uiCss = uiAssets().css;
export const uiJs = uiAssets().js;
