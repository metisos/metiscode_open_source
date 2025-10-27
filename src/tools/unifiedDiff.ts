import { createTwoFilesPatch } from "diff";
import fs from "fs";
import path from "path";

export function unifiedDiffForFile(filePath: string, newContent: string, cwd = process.cwd()): string {
  const abs = path.resolve(cwd, filePath);
  const old = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
  const patch = createTwoFilesPatch(filePath, filePath, old, newContent, "old", "new", { context: 3 });
  return patch;
}

export function unifiedDiffSummary(patchText: string): string {
  const lines = patchText.split(/\r?\n/);
  const changes = lines.filter((l) => l.startsWith("+") || l.startsWith("-")).length;
  return `${changes} changed lines`;
}

