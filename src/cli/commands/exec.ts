import { loadConfig } from "../../config";
import { execCommand } from "../../tools/shell";

// Usage:
// metis exec --yes -- cmd arg1 arg2
export async function runExec(args: string[]) {
  const yesIdx = args.indexOf("--yes");
  const hasYes = yesIdx !== -1;
  if (hasYes) args.splice(yesIdx, 1);
  const sepIdx = args.indexOf("--");
  if (sepIdx === -1 || sepIdx === args.length - 1) {
    console.log("Usage: metiscode exec --yes -- <command> [args...]");
    return;
  }
  const cmd = args[sepIdx + 1];
  const cmdArgs = args.slice(sepIdx + 2);
  const cfg = loadConfig();
  const requireApproval = cfg.safety?.requireExecApproval !== false;
  if (requireApproval && !hasYes) {
    console.log("Execution blocked. Re-run with --yes to approve.");
    return;
  }
  const res = execCommand(cmd, cmdArgs);
  process.stdout.write(res.stdout);
  process.stderr.write(res.stderr);
  process.exitCode = res.code;
}
