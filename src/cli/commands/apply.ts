import { applyMetisPatch, parseMetisPatch, summarizePatch } from "../../tools/patch";
import { clearStagedPatch, readSnapshot, readStagedPatch } from "../../tools/stage";
import fs from "fs";
import path from "path";

export async function runApply(_args: string[]) {
  const staged = readStagedPatch();
  if (!staged) {
    console.log("[apply] No staged patch to apply.");
    return;
  }
  const parsed = parseMetisPatch(staged);
  const summary = summarizePatch(parsed);
  console.log(`[apply] Applying patch (add: ${summary.add}, update: ${summary.update}, delete: ${summary.delete})`);
  const snapshot = readSnapshot() || {};
  // If no conflicts (current === original) we can apply directly; otherwise write conflict markers
  for (const op of parsed.ops) {
    const abs = path.resolve(process.cwd(), op.file);
    if (op.kind === "update") {
      const original = snapshot[op.file] ?? (fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "");
      const current = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
      const desired = op.content;
      if (current === original) {
        fs.writeFileSync(abs, desired);
      } else {
        const conflict = [
          "<<<<<<< current\n" + current.replace(/\r\n/g, "\n"),
          "||||||| original\n" + original.replace(/\r\n/g, "\n"),
          "=======\n" + desired.replace(/\r\n/g, "\n"),
          ">>>>>>> metis\n",
        ].join("\n");
        fs.writeFileSync(abs, conflict);
        console.warn(`- Conflict in ${op.file}; wrote conflict markers`);
      }
    } else if (op.kind === "delete") {
      const original = snapshot[op.file] ?? "";
      const current = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
      if (current === original) {
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      } else {
        const conflict = [
          "<<<<<<< current\n" + current.replace(/\r\n/g, "\n"),
          "||||||| original\n" + original.replace(/\r\n/g, "\n"),
          "=======\n(Deleted by metis)\n",
          ">>>>>>> metis\n",
        ].join("\n");
        fs.writeFileSync(abs, conflict);
        console.warn(`- Conflict on delete ${op.file}; kept file with markers`);
      }
    }
  }
  // Use existing applier for adds
  const filtered = { ops: parsed.ops.filter((o) => o.kind === "add") } as any;
  const res = applyMetisPatch(filtered);
  res.errors.forEach((e) => console.error("- Error:", e));
  console.log(`[apply] Applied operations: ${res.applied} (+ updates/deletes handled above)`);
  if (res.errors.length === 0) clearStagedPatch();
}
