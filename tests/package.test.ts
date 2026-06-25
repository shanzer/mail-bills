import fs from "node:fs";
import { describe, expect, it } from "vitest";

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function readPackageJson(): PackageJson {
  return JSON.parse(fs.readFileSync("package.json", "utf8")) as PackageJson;
}

describe("package scripts", () => {
  it("declares the CLI package used by the start script", () => {
    const packageJson = readPackageJson();
    const command = packageJson.scripts?.start?.split(/\s+/)[0];
    const declaredPackages = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };

    expect(command).toBe("dotenv");
    expect(declaredPackages).toHaveProperty("dotenv-cli");
  });
});
