import path from "path";
import fs from "fs";
import { withinCwdSafe, writeText } from "./files";

export type PatchOp =
  | { kind: "add"; file: string; content: string }
  | { kind: "update"; file: string; content: string }
  | { kind: "delete"; file: string };

export type ParsedPatch = { ops: PatchOp[] };

// Metis Patch format (simple):
// *** Begin Patch
// *** Add File: path/to/file
// <full file content>
// *** Update File: path/to/file
// <full file content>
// *** Delete File: path/to/file
// *** End Patch
export function parseMetisPatch(text: string): ParsedPatch {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const ops: PatchOp[] = [];
  let i = 0;
  // find Begin Patch if present
  while (i < lines.length && !lines[i].startsWith("*** Begin Patch")) i++;
  if (i >= lines.length) return { ops: [] };
  i++;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("*** End Patch")) break;
    if (line.startsWith("*** Add File:")) {
      const file = line.replace("*** Add File:", "").trim();
      const content: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("*** ")) {
        // Be lenient: strip leading '+' if present
        const raw = lines[i];
        content.push(raw.startsWith("+") ? raw.slice(1) : raw);
        i++;
      }
      ops.push({ kind: "add", file, content: content.join("\n") + (content.length ? "\n" : "") });
      continue;
    }
    if (line.startsWith("*** Update File:")) {
      const file = line.replace("*** Update File:", "").trim();
      const content: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("*** ")) {
        const raw = lines[i];
        content.push(raw.startsWith("+") ? raw.slice(1) : raw);
        i++;
      }
      ops.push({ kind: "update", file, content: content.join("\n") + (content.length ? "\n" : "") });
      continue;
    }
    if (line.startsWith("*** Delete File:")) {
      const file = line.replace("*** Delete File:", "").trim();
      ops.push({ kind: "delete", file });
      i++;
      continue;
    }
    // Unknown line; skip
    i++;
  }
  return { ops };
}

export function applyMetisPatch(patch: ParsedPatch, cwd = process.cwd()): { applied: number; errors: string[] } {
  let applied = 0;
  const errors: string[] = [];
  for (const op of patch.ops) {
    const target = path.resolve(cwd, op.file);
    if (!withinCwdSafe(op.file, cwd)) {
      errors.push(`Blocked path outside workspace: ${op.file}`);
      continue;
    }
    try {
      if (op.kind === "delete") {
        if (fs.existsSync(target)) fs.unlinkSync(target);
        applied++;
      } else if (op.kind === "add" || op.kind === "update") {
        writeText(target, op.content);
        applied++;
      }
    } catch (e: any) {
      errors.push(`${op.kind} ${op.file}: ${e?.message || e}`);
    }
  }
  return { applied, errors };
}

export function summarizePatch(patch: ParsedPatch) {
  const add = patch.ops.filter((o) => o.kind === "add").length;
  const upd = patch.ops.filter((o) => o.kind === "update").length;
  const del = patch.ops.filter((o) => o.kind === "delete").length;
  return { add, update: upd, delete: del };
}

