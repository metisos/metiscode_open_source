import fs from "fs";
import path from "path";
import { loadConfig, loadSecrets } from "../../config";
import { scanRepo } from "../../tools/repo";
import type { ToolCallingAgent } from "../../agent/toolCallAgent";

export async function runStatus(_args: string[], agent?: ToolCallingAgent) {
  const cwd = process.cwd();
  const format = process.env.METIS_FORMAT || "pretty";

  // Gather system information
  const status = {
    timestamp: new Date().toISOString(),
    version: require("../../../package.json").version,
    node_version: process.version,
    platform: process.platform,
    working_directory: cwd,
    config: await getConfigStatus(cwd),
    secrets: await getSecretsStatus(cwd),
    workspace: await getWorkspaceStatus(cwd),
    environment: getEnvironmentStatus(),
    budget: agent ? getBudgetStatus(agent) : undefined
  };

  if (format === "json") {
    console.log(JSON.stringify(status, null, 2));
  } else {
    printPrettyStatus(status);
  }
}

async function getConfigStatus(cwd: string) {
  const configPath = path.join(cwd, "metis.config.json");
  try {
    const config = loadConfig(cwd);
    return {
      file_exists: fs.existsSync(configPath),
      path: configPath,
      provider: config.provider,
      model: config.model,
      dry_run: config.safety?.dryRun || false,
      valid: true
    };
  } catch (error: any) {
    return {
      file_exists: fs.existsSync(configPath),
      path: configPath,
      valid: false,
      error: error.message
    };
  }
}

async function getSecretsStatus(cwd: string) {
  const secretsPath = path.join(cwd, ".metis", "secrets.json");
  try {
    const secrets = loadSecrets(cwd);
    const providers = Object.keys(secrets);
    return {
      file_exists: fs.existsSync(secretsPath),
      path: secretsPath,
      configured_providers: providers,
      count: providers.length
    };
  } catch {
    return {
      file_exists: fs.existsSync(secretsPath),
      path: secretsPath,
      configured_providers: [],
      count: 0
    };
  }
}

async function getWorkspaceStatus(cwd: string) {
  try {
    const metisDir = path.join(cwd, ".metis");
    const repoSummary = scanRepo(cwd);
    
    return {
      metis_initialized: fs.existsSync(metisDir),
      total_files: repoSummary.counts.total,
      file_types: Object.keys(repoSummary.counts.byExt).length,
      has_git: fs.existsSync(path.join(cwd, ".git")),
      has_package_json: fs.existsSync(path.join(cwd, "package.json")),
      staged_patch: fs.existsSync(path.join(metisDir, "pending.patch"))
    };
  } catch {
    return {
      metis_initialized: false,
      error: "Failed to analyze workspace"
    };
  }
}

function getEnvironmentStatus() {
  return {
    ci: !!(process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITLAB_CI),
    verbose: process.env.METIS_VERBOSE === 'true',
    trace: process.env.METIS_TRACE === 'true',
    format: process.env.METIS_FORMAT || 'pretty',
    persona: process.env.METIS_PERSONA || 'default'
  };
}

function getBudgetStatus(agent: ToolCallingAgent) {
  const usage = agent.budgetManager.getUsage();
  return {
    used: usage.used,
    budget: usage.budget,
    percentage: usage.percentage,
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens
  };
}

function printPrettyStatus(status: any) {
  console.log(`Metis Code Status (v${status.version})`);
  console.log(`Platform: ${status.platform} | Node: ${status.node_version}`);
  console.log(`Working Directory: ${status.working_directory}`);
  console.log("");
  
  console.log("📋 Configuration:");
  console.log(`  Config file: ${status.config.file_exists ? "✅ found" : "❌ missing"}`);
  if (status.config.valid) {
    console.log(`  Provider: ${status.config.provider}`);
    console.log(`  Model: ${status.config.model}`);
    console.log(`  Safety: ${status.config.dry_run ? "🔒 dry run enabled" : "⚠️  dry run disabled"}`);
  } else {
    console.log(`  ❌ Invalid: ${status.config.error}`);
  }
  
  console.log("");
  console.log("🔑 Secrets:");
  console.log(`  Secrets file: ${status.secrets.file_exists ? "✅ found" : "❌ missing"}`);
  console.log(`  Configured providers: ${status.secrets.count} (${status.secrets.configured_providers.join(", ") || "none"})`);
  
  console.log("");
  console.log("📁 Workspace:");
  console.log(`  Metis initialized: ${status.workspace.metis_initialized ? "✅ yes" : "❌ no"}`);
  if (status.workspace.total_files !== undefined) {
    console.log(`  Files: ${status.workspace.total_files} (${status.workspace.file_types} types)`);
    console.log(`  Git repository: ${status.workspace.has_git ? "✅ yes" : "❌ no"}`);
    console.log(`  Package.json: ${status.workspace.has_package_json ? "✅ yes" : "❌ no"}`);
    console.log(`  Staged patch: ${status.workspace.staged_patch ? "✅ yes" : "❌ no"}`);
  }
  
  console.log("");
  console.log("🌍 Environment:");
  console.log(`  CI mode: ${status.environment.ci ? "✅ detected" : "❌ no"}`);
  console.log(`  Verbose: ${status.environment.verbose ? "✅ enabled" : "❌ disabled"}`);
  console.log(`  Tracing: ${status.environment.trace ? "✅ enabled" : "❌ disabled"}`);
  console.log(`  Output format: ${status.environment.format}`);
  console.log(`  Active persona: ${status.environment.persona}`);

  if (status.budget) {
    console.log("");
    console.log("💰 Token Budget:");
    console.log(`  Used: ${status.budget.used.toLocaleString()} tokens`);
    console.log(`  Budget: ${status.budget.budget.toLocaleString()} tokens`);

    // Color-code based on percentage
    const pct = status.budget.percentage;
    let pctDisplay;
    if (pct >= 90) {
      pctDisplay = `🔴 ${pct.toFixed(1)}%`;
    } else if (pct >= 75) {
      pctDisplay = `🟡 ${pct.toFixed(1)}%`;
    } else {
      pctDisplay = `🟢 ${pct.toFixed(1)}%`;
    }
    console.log(`  Usage: ${pctDisplay}`);

    // Progress bar
    const barLength = 30;
    const filled = Math.floor((pct / 100) * barLength);
    const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
    console.log(`  [${bar}]`);

    console.log(`  Prompt tokens: ${status.budget.prompt_tokens.toLocaleString()}`);
    console.log(`  Completion tokens: ${status.budget.completion_tokens.toLocaleString()}`);
  }
}