import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { tempRoot } from "./helpers.js";

describe("config", () => {
  it("loads configurable logging level", () => {
    const root = tempRoot("mail-bills-config-");
    const configPath = path.join(root, "config.yaml");
    fs.writeFileSync(configPath, [
      `root_dir: ${root}`,
      "logging:",
      "  level: debug"
    ].join("\n"));

    const config = loadConfig(configPath);

    expect(config.logging.level).toBe("debug");
  });

  it("defaults logging level to info", () => {
    const root = tempRoot("mail-bills-config-");
    const configPath = path.join(root, "config.yaml");
    fs.writeFileSync(configPath, `root_dir: ${root}\n`);

    const config = loadConfig(configPath);

    expect(config.logging.level).toBe("info");
  });
});
