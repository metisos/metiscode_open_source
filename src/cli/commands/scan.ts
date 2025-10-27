import { summarizeRepo } from "../../tools/repo";

export async function runScan(args: string[]) {
  const max = parseInt(args[0] || "60", 10) || 60;
  console.log(summarizeRepo(max));
}

