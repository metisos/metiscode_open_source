import { spawnSync } from "child_process";

export type ExecResult = { code: number; stdout: string; stderr: string };

export function execCommand(cmd: string, args: string[] = [], opts?: { cwd?: string; env?: NodeJS.ProcessEnv }): ExecResult {
  const p = spawnSync(cmd, args, {
    cwd: opts?.cwd,
    env: { ...process.env, ...(opts?.env || {}) },
    shell: process.platform === "win32",
    encoding: "utf8",
  });
  return { code: p.status ?? -1, stdout: p.stdout || "", stderr: p.stderr || "" };
}

