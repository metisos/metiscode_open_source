import { runSimpleAgent } from "../../agent/simpleAgent";
import { ToolCallingAgent } from "../../agent/toolCallAgent";
import { parseMetisPatch } from "../../tools/patch";
import { stagePatch } from "../../tools/stage";
import { logSession } from "../../runtime/session";
import { makeProvider } from "../../agent/simpleAgent";
import { ErrorHandler } from "../../errors/errorHandler";
import { MetisError } from "../../errors/MetisError";
import fs from "fs";
import path from "path";

// Load Agent.md instructions if available
function loadAgentInstructions(): string | null {
  const cwd = process.cwd();
  const agentMdPath = path.join(cwd, "Agent.md");
  
  if (fs.existsSync(agentMdPath)) {
    try {
      return fs.readFileSync(agentMdPath, 'utf8');
    } catch (error) {
      // Silently fail - Agent.md is optional
      return null;
    }
  }
  return null;
}

export async function runAgent(args: string[]) {
  const task = args.join(" ") || "No task provided";
  const maxIterations = 50; // Higher limit like Claude Code
  
  const verboseEnabled = process.env.METIS_VERBOSE === 'true';
  
  // Load project-specific instructions
  const agentInstructions = loadAgentInstructions();
  if (agentInstructions && verboseEnabled) {
    console.log("📋 Loaded project instructions from Agent.md");
  }

  // Validate task
  if (!task || task.trim() === "No task provided") {
    if (process.env.METIS_INTERACTIVE === 'true') {
      throw new Error('Please provide a task description. For example: "Fix the authentication bug" or "Add error handling to the API"');
    } else {
      ErrorHandler.handle(new MetisError(
        'No task provided',
        'MISSING_TASK',
        'user',
        true,
        [
          'Provide a task description: metiscode run "your task here"',
          'Example: metiscode run "add a hello function to utils.ts"'
        ]
      ));
    }
  }

  if (verboseEnabled) {
    console.log(`🚀 Starting task: "${task}"`);
  }

  try {
    // Check if provider supports tools for enhanced capabilities
    const provider = makeProvider();
    const hasToolSupport = provider.supportsTools();

    if (hasToolSupport) {
      const result = await ErrorHandler.withRecovery(async () => {
        const agent = new ToolCallingAgent();
        // Pass agent instructions to enhance context
        const enhancedTask = agentInstructions 
          ? `${task}\n\nProject-specific instructions:\n${agentInstructions}`
          : task;
        return await agent.executeWithTools(enhancedTask, [], maxIterations);
      }, 1, 'agent_execution'); // 1 retry for agent execution

      if (result.type === "failed") {
        ErrorHandler.handle(new MetisError(
          result.content,
          'AGENT_EXECUTION_FAILED',
          'agent',
          true,
          [
            'Try breaking the task into smaller steps',
            'Be more specific about what files to modify',
            'Check that all referenced files exist'
          ]
        ));
      }

      if (result.type === "max_iterations") {
        ErrorHandler.handle(MetisError.taskTooComplex());
      }

      // Show results naturally
      if (verboseEnabled) {
        console.log(`✅ Completed in ${result.iterations} step${result.iterations > 1 ? 's' : ''}`);
        if (result.toolCalls > 0) {
          console.log(`🔧 Used ${result.toolCalls} operation${result.toolCalls > 1 ? 's' : ''}`);
        }
        if (result.tokens) {
          console.log(`📊 ${result.tokens.total} tokens`);
        }
      }

      console.log("\n" + result.content);
      
      if (result.toolCalls > 0 && !verboseEnabled) {
        console.log(`\n✅ Task completed.`);
      }
      
      return;

    } else {
      // Fallback to patch-based approach for providers without tool support
      if (verboseEnabled) {
        console.log("Using patch-based approach");
      }
      
      const output = await runSimpleAgent("run", task);
      
      // Log raw output
      logSession("agent_output", output);
      
      const parsed = parseMetisPatch(output);
      if (parsed.ops.length > 0) {
        const stagedPath = stagePatch(output);
        console.log(`✅ [run] Staged patch at ${stagedPath}`);
        console.log("Run 'metiscode diff' to inspect, then 'metiscode apply' to apply.");
        return;
      } else {
        console.log("\n" + "=".repeat(50));
        console.log("AGENT RESPONSE");
        console.log("=".repeat(50));
        console.log(output);
        console.log("\n" + "-".repeat(50));
        console.log("ℹ️  No patch format detected in response.");
      }
    }

  } catch (error: any) {
    ErrorHandler.handle(error, 'run_command');
  }
}
