#!/usr/bin/env node
import { Command } from "commander";
import kleur from "kleur";
import { runInit } from "./commands/init";
import { runAuth } from "./commands/auth";
import { runModels } from "./commands/models";
import { runPlan } from "./commands/plan";
import { runAgent } from "./commands/run";
import { runDiff } from "./commands/diff";
import { runApply } from "./commands/apply";
import { runChat } from "./commands/chat";
import { runScan } from "./commands/scan";
import { runExec } from "./commands/exec";
import { runConfig } from "./commands/config";
import { runMcpConfig } from "./commands/mcpConfig";
import { runStatus } from "./commands/status";
import { runPersona } from "./commands/persona";
import { runTools } from "./commands/tools";
import { runAgentCommands } from "./commands/agentCommands";
import { runMigrate } from "./commands/migrate";
import { InteractiveSession } from "./session";

const pkg = require("../../package.json");

// Display welcome banner
function showWelcome() {
  console.log(kleur.cyan(`
███╗   ███╗███████╗████████╗██╗███████╗     ██████╗ ██████╗ ██████╗ ███████╗
████╗ ████║██╔════╝╚══██╔══╝██║██╔════╝    ██╔════╝██╔═══██╗██╔══██╗██╔════╝
██╔████╔██║█████╗     ██║   ██║███████╗    ██║     ██║   ██║██║  ██║█████╗  
██║╚██╔╝██║██╔══╝     ██║   ██║╚════██║    ██║     ██║   ██║██║  ██║██╔══╝  
██║ ╚═╝ ██║███████╗   ██║   ██║███████║    ╚██████╗╚██████╔╝██████╔╝███████╗
╚═╝     ╚═╝╚══════╝   ╚═╝   ╚═╝╚══════╝     ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝
`));

  console.log(kleur.gray(`                    AI Coding Agent v${pkg.version}`));
  console.log();
  
  console.log(kleur.white("🚀 Welcome to Metis Code! Get started with:"));
  console.log();
  console.log(kleur.gray("  • ") + kleur.yellow("metiscode config set apikey sk-your-key-here") + kleur.gray(" - Set up API key (global)"));
  console.log(kleur.gray("  • ") + kleur.yellow("metiscode config set provider openai") + kleur.gray(" - Set up AI provider"));
  console.log(kleur.gray("  • ") + kleur.yellow('metiscode "Fix the bug in login.ts"') + kleur.gray(" - Start coding!"));
  console.log();
  
  console.log(kleur.white("🎯 Slash Commands:"));
  console.log(kleur.gray("  • ") + kleur.cyan("/init") + kleur.gray(" - Create Agent.md with custom instructions"));
  console.log(kleur.gray("  • ") + kleur.cyan("/help") + kleur.gray(" - Show detailed help"));
  console.log(kleur.gray("  • ") + kleur.cyan("/status") + kleur.gray(" - System status"));
  console.log();
  
  console.log(kleur.white("📚 Need help? Run ") + kleur.yellow("metiscode --help") + kleur.white(" for more commands"));
  console.log(kleur.gray("────────────────────────────────────────────────────────────────────────────"));
  console.log();
}

// Handle slash commands
function handleSlashCommand(args: string[]): boolean {
  const firstArg = args[0];
  
  if (!firstArg || !firstArg.startsWith('/')) {
    return false;
  }
  
  const command = firstArg.substring(1);
  const commandArgs = args.slice(1);
  
  switch (command) {
    case 'init':
      runInit(['--agent-md']);
      return true;
    case 'help':
      showWelcome();
      return true;
    case 'status':
      runStatus([]);
      return true;
    default:
      console.log(kleur.red(`Unknown slash command: ${firstArg}`));
      console.log(kleur.gray("Available slash commands: /init, /help, /status"));
      return true;
  }
}

const program = new Command();
program
  .name("metiscode")
  .description("Metis Code — Groq-powered coding CLI agent")
  .version(pkg.version)
  .option('-v, --verbose', 'Enable verbose logging')
  .option('-q, --quiet', 'Suppress non-essential output')
  .option('--headless', 'Run in headless mode (non-interactive, auto-approve all operations)')
  .option('--auto-accept', 'Auto-accept all operations without prompts (alias for headless)')
  .option('--format <type>', 'Output format (json|yaml|pretty)', 'pretty')
  .option('--persona <name>', 'Use specific persona', 'default')
  .option('--trace', 'Enable execution tracing')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) process.env.METIS_VERBOSE = 'true';
    if (opts.quiet) process.env.METIS_QUIET = 'true';
    if (opts.headless || opts.autoAccept) {
      process.env.METIS_HEADLESS = 'true';
      process.env.METIS_AUTO_ACCEPT = 'true';
    }
    if (opts.trace) process.env.METIS_TRACE = 'true';
    if (opts.format) process.env.METIS_FORMAT = opts.format;
    if (opts.persona) process.env.METIS_PERSONA = opts.persona;
  });

program
  .command("init")
  .description("Initialize .metis/ and config")
  .action(() => runInit([]));

program
  .command("auth")
  .description("Configure provider API keys")
  .argument("[action]", "Action: show, set")
  .option("-p, --provider <name>", "Provider name (openai, anthropic)")
  .option("-k, --key <secret>", "API key")
  .allowUnknownOption(true)
  .action((action: string, options: any, command: any) => {
    // Reconstruct args for the existing runAuth function
    const args = [action].filter(Boolean);
    if (options.provider) args.push("--provider", options.provider);
    if (options.key) args.push("--key", options.key);
    runAuth(args);
  });

program.command("models").description("List available models").action(() => runModels([]));

program
  .command("plan")
  .description("Analyze repo and propose a plan")
  .argument("[task...]")
  .action((task: string[]) => runPlan(task));

program
  .command("scan")
  .description("Print a concise repo summary")
  .action(() => runScan([]));

program
  .command("run")
  .description("Run the coding agent and stage a patch")
  .argument("[task...]")
  .action((task: string[]) => runAgent(task));

program.command("diff").description("Show staged patch and unified diffs").action(() => runDiff([]));

program.command("apply").description("Apply staged changes safely").action(() => runApply([]));

program.command("chat").description("Interactive repo-aware chat").action(() => runChat([]));

program
  .command("config")
  .description("Manage configuration settings")
  .argument("[action]", "Action: show, set, reset")
  .argument("[key]", "Configuration key to set")
  .argument("[value]", "Value to set")
  .action((action?: string, key?: string, value?: string) => {
    const args = [action, key, value].filter(Boolean) as string[];
    runConfig(args);
  });

program
  .command("status")
  .description("Show system status and health")
  .action(() => runStatus([]));

program
  .command("persona")
  .description("Manage personas")
  .argument("[action]", "Action: list, show, validate")
  .argument("[name]", "Persona name")
  .action((action: string, name: string) => {
    const args = [action, name].filter(Boolean);
    runPersona(args);
  });

program
  .command("tools")
  .description("Manage and execute tools")
  .argument("[action]", "Action: list, show, test, exec")
  .argument("[name]", "Tool name")
  .allowUnknownOption(true)
  .action((action: string, name: string, params: any, command: any) => {
    // Get all remaining args after the command name
    const args = [action, name].filter(Boolean);
    if (command.args && command.args.length > 2) {
      args.push(...command.args.slice(2));
    }
    runTools(args);
  });

program
  .command("exec")
  .description("Run a shell command with approval gate")
  .allowUnknownOption(true)
  .argument("[args...]", "-- <cmd> [args]")
  .action((args: string[]) => runExec(args));

program
  .command("mcp")
  .description("Manage MCP (Model Context Protocol) servers")
  .argument("[action]", "Action: show, add, remove, connect, disconnect, test")
  .allowUnknownOption(true)
  .action((action: string, options: any, command: any) => {
    // Get all remaining args after the action
    const args = [action].filter(Boolean);
    if (command.args && command.args.length > 1) {
      args.push(...command.args.slice(1));
    }
    runMcpConfig(args);
  });

program
  .command("agents")
  .description("Manage sub-agents with specialized capabilities")
  .argument("[action]", "Action: list, create, show, exec, remove, templates, personas, skills, stats, health, cleanup")
  .allowUnknownOption(true)
  .action((action: string, options: any, command: any) => {
    // Get all remaining args after the action
    const args = [action].filter(Boolean);
    if (command.args && command.args.length > 1) {
      args.push(...command.args.slice(1));
    }
    runAgentCommands(args);
  });

program
  .command("migrate")
  .description("Migrate configuration and settings")
  .argument("[action]", "Action: apikeys")
  .action((action: string) => {
    const args = [action].filter(Boolean);
    runMigrate(args);
  });

program.addHelpText(
  "after",
  "\n" +
    kleur.gray("Tip:") +
    " Use 'metiscode run " +
    kleur.yellow('"Add a hello command"') +
    "' to generate a patch, then 'metiscode diff' and 'metiscode apply'.\n"
);

// Check for arguments
const args = process.argv.slice(2);

// Check if we should start interactive session
// This happens when there are no args, or only global flags like --persona
const shouldStartInteractive = args.length === 0 ||
  (args.length > 0 && args.every(arg =>
    arg.startsWith('--') ||
    ['--persona', '--verbose', '--quiet', '--trace', '--format'].some(flag =>
      arg === flag || arg.startsWith(flag + '=')
    )
  ));

if (shouldStartInteractive) {
  // Parse global options first to set environment variables before creating session
  program.parseOptions(args);

  // No command specified - start interactive session (like Claude Code)
  try {
    const session = new InteractiveSession();
    session.start().then(() => {
      process.exit(0);
    }).catch((error) => {
      console.error(kleur.red('Session error:'), error.message);
      if (process.env.METIS_VERBOSE === 'true') {
        console.error(error.stack);
      }
      process.exit(1);
    });
  } catch (error: any) {
    console.error(kleur.red('Failed to start session:'), error.message);
    if (process.env.METIS_VERBOSE === 'true') {
      console.error(error.stack);
    }
    process.exit(1);
  }
} else {
  // Arguments provided - check for slash commands or run commander
  if (handleSlashCommand(args)) {
    process.exit(0);
  } else {
    // Normal commander parsing for explicit commands
    program.parse();
  }
}
