import fs from "fs";
import path from "path";

export function nowStamp() {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    "_" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

export function logSession(kind: string, content: string, cwd = process.cwd()) {
  const dir = path.join(cwd, ".metis", "sessions");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${nowStamp()}_${kind}.txt`);
  fs.writeFileSync(file, content);
  return file;
}

