import fs from "node:fs";
import type { MailBillsConfig } from "./types.js";
import { configPaths } from "./config.js";

export function bootstrapDirectories(config: MailBillsConfig, options: { dryRun?: boolean } = {}): string[] {
  const paths = configPaths(config);
  const directories = [
    paths.dataDir,
    paths.batchesDir,
    paths.rawIntakeDir,
    paths.uploadIntakeDir,
    paths.importedIntakeDir,
    paths.processingDir,
    paths.errorDir,
    paths.uploadErrorDir,
    paths.archiveDir,
    paths.quarantineDir,
    paths.logsDir
  ];
  if (options.dryRun) return directories;
  for (const directory of directories) {
    fs.mkdirSync(directory, { recursive: true });
  }
  return directories;
}
