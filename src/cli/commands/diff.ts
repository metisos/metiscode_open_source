import { readStagedPatch } from "../../tools/stage";
import { parseMetisPatch } from "../../tools/patch";
import { unifiedDiffForFile } from "../../tools/unifiedDiff";

export async function runDiff(_args: string[]) {
  const staged = readStagedPatch();
  if (!staged) {
    console.log("[diff] No staged patch found. Run 'metis run' first.");
    return;
  }
  console.log(staged);
  // Additionally show unified diffs per file for clarity
  const parsed = parseMetisPatch(staged);
  if (parsed.ops.length) {
    console.log("\n--- Unified diff preview ---\n");
    for (const op of parsed.ops) {
      if (op.kind === "add" || op.kind === "update") {
        const ud = unifiedDiffForFile(op.file, op.content);
        console.log(ud + "\n");
      }
    }
  }
}
