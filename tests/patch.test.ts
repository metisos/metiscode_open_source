import { describe, it, expect } from "vitest";
import { parseMetisPatch, applyMetisPatch } from "../src/tools/patch";
import fs from "fs";
import path from "path";

const TMP = path.join(process.cwd(), ".metis_tmp_test");

function resetTmp() {
  if (fs.existsSync(TMP)) {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
  fs.mkdirSync(TMP, { recursive: true });
}

describe("Metis Patch", () => {
  it("parses add/update/delete ops", () => {
    const text = `*** Begin Patch\n*** Add File: a.txt\n+hello\n*** Update File: b.txt\n+world\n*** Delete File: c.txt\n*** End Patch\n`;
    const parsed = parseMetisPatch(text);
    expect(parsed.ops.length).toBe(3);
    expect(parsed.ops[0]).toMatchObject({ kind: "add", file: "a.txt" });
    expect(parsed.ops[1]).toMatchObject({ kind: "update", file: "b.txt" });
    expect(parsed.ops[2]).toMatchObject({ kind: "delete", file: "c.txt" });
  });

  it("applies add/update safely inside cwd", () => {
    resetTmp();
    const text = `*** Begin Patch\n*** Add File: foo/bar.txt\n+one\n+two\n*** Update File: foo/bar.txt\n+three\n*** End Patch\n`;
    const parsed = parseMetisPatch(text);
    const res1 = applyMetisPatch(parsed, TMP);
    expect(res1.errors.length).toBe(0);
    expect(res1.applied).toBe(2);
    const content = fs.readFileSync(path.join(TMP, "foo", "bar.txt"), "utf8");
    expect(content.trim()).toBe("three");
  });
});

