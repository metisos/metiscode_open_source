import fs from "fs";
import path from "path";
import { parseMetisPatch } from "./patch";

export function stagePatch(text: string, cwd = process.cwd()) {
  const dir = path.join(cwd, ".metis");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  const p = path.join(dir, "pending.patch");
  fs.writeFileSync(p, text);
  // write a snapshot of original contents for 3-way apply
  const snapPath = path.join(dir, "pending.snapshot.json");
  const parsed = parseMetisPatch(text);
  const snapshot: Record<string, string> = {};
  for (const op of parsed.ops) {
    if (op.kind === "update" || op.kind === "delete") {
      const abs = path.resolve(cwd, op.file);
      if (fs.existsSync(abs)) snapshot[op.file] = fs.readFileSync(abs, "utf8");
      else snapshot[op.file] = "";
    }
  }
  fs.writeFileSync(snapPath, JSON.stringify(snapshot, null, 2));
  return p;
}

export function readStagedPatch(cwd = process.cwd()): string | null {
  const p = path.join(cwd, ".metis", "pending.patch");
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

export function clearStagedPatch(cwd = process.cwd()) {
  const p = path.join(cwd, ".metis", "pending.patch");
  if (fs.existsSync(p)) fs.unlinkSync(p);
  const s = path.join(cwd, ".metis", "pending.snapshot.json");
  if (fs.existsSync(s)) fs.unlinkSync(s);
}

export function readSnapshot(cwd = process.cwd()): Record<string, string> | null {
  const s = path.join(cwd, ".metis", "pending.snapshot.json");
  if (!fs.existsSync(s)) return null;
  try {
    return JSON.parse(fs.readFileSync(s, "utf8"));
  } catch {
    return null;
  }
}
