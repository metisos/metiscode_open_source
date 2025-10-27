import { runSimpleAgent } from "../../agent/simpleAgent";

export async function runPlan(args: string[]) {
  const task = args.join(" ") || "Describe the requested change";
  console.log("[plan] Drafting steps for:", JSON.stringify(task));
  try {
    const output = await runSimpleAgent("plan", task);
    console.log(output);
  } catch (e: any) {
    console.error("[plan] Error:", e?.message || e);
    process.exitCode = 1;
  }
}
