import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { summarizeRepo } from "../src/tools/repo";

const TMP = path.join(process.cwd(), ".metis_tmp_repo");

function setupRepo() {
  if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  fs.mkdirSync(path.join(TMP, "src"));
  fs.writeFileSync(path.join(TMP, "src", "index.ts"), "export const x = 1;\n");
  fs.writeFileSync(path.join(TMP, "README.md"), "Hello\n");
  fs.writeFileSync(
    path.join(TMP, "package.json"),
    JSON.stringify({ name: "tmp", version: "1.0.0", scripts: { test: "echo ok" } }, null, 2)
  );
}

describe("Repo summary", () => {
  it("includes counts and sample files", () => {
    setupRepo();
    const summary = summarizeRepo(10, TMP);
    expect(summary).toMatch(/Files: /);
    expect(summary).toMatch(/package.json scripts:/);
    expect(summary).toMatch(/src[\\\/]index\.ts/);
  });
});

