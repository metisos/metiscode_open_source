import fs from "fs";
import path from "path";
import { listFiles } from "./files";
import { loadConfig } from "../config";

export type RepoSummary = {
  root: string;
  files: string[];
  counts: { total: number; byExt: Record<string, number> };
  scripts?: Record<string, string>;
};

export function scanRepo(cwd = process.cwd()): RepoSummary {
  const cfg = loadConfig(cwd);
  const files = listFiles(cwd, cfg.ignore);
  const byExt: Record<string, number> = {};
  for (const f of files) {
    const ext = path.extname(f) || "(noext)";
    byExt[ext] = (byExt[ext] || 0) + 1;
  }
  let scripts: Record<string, string> | undefined;
  const pkg = path.join(cwd, "package.json");
  if (fs.existsSync(pkg)) {
    try {
      const data = JSON.parse(fs.readFileSync(pkg, "utf8"));
      if (data?.scripts) scripts = data.scripts;
    } catch {}
  }
  return { root: cwd, files, counts: { total: files.length, byExt }, scripts };
}

export function summarizeRepo(maxFiles = 60, cwd = process.cwd()): string {
  const r = scanRepo(cwd);
  const top = r.files.slice(0, maxFiles);
  const extCounts = Object.entries(r.counts.byExt)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ext, n]) => `${ext}:${n}`)
    .join(", ");
  const scripts = r.scripts
    ? Object.keys(r.scripts)
        .slice(0, 10)
        .map((k) => `${k}`)
        .join(", ")
    : "none";
  return [
    `Files: ${r.counts.total} total; top extensions: ${extCounts}`,
    `package.json scripts: ${scripts}`,
    `Sample files (${top.length}):`,
    ...top.map((f) => `- ${f}`),
  ].join("\n");
}

