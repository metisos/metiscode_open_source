import fs from "fs";
import path from "path";

export function ensureDirFor(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

export function writeText(filePath: string, content: string) {
  ensureDirFor(filePath);
  fs.writeFileSync(filePath, content);
}

export function listFiles(root: string, ignore: string[] = []): string[] {
  const out: string[] = [];
  const relRoot = path.resolve(root);
  const ig = new Set(["node_modules", ".git", "dist", ".metis", ...ignore.map((g) => g.replace("/**", ""))]);
  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(relRoot, abs);
      if (e.isDirectory()) {
        if (ig.has(e.name)) continue;
        walk(abs);
      } else if (e.isFile()) {
        out.push(rel);
      }
    }
  }
  walk(relRoot);
  return out;
}

export function withinCwdSafe(targetPath: string, cwd = process.cwd()) {
  const abs = path.resolve(cwd, targetPath);
  const root = path.resolve(cwd);
  return abs.startsWith(root + path.sep) || abs === root;
}

