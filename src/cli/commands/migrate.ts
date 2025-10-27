import fs from "fs";
import path from "path";
import { saveGlobalSecrets, getGlobalSecretsLocation, loadSecrets } from "../../config";
import kleur from "kleur";

export async function runMigrate(args: string[]) {
  const action = args[0] || "help";
  
  switch (action) {
    case "apikeys":
    case "secrets":
      await migrateApiKeys();
      break;
    case "help":
    default:
      showMigrateHelp();
      break;
  }
}

async function migrateApiKeys() {
  const cwd = process.cwd();
  const localSecretsPath = path.join(cwd, ".metis", "secrets.json");
  
  console.log(kleur.cyan("🔄 Migrating API keys to global configuration..."));
  
  // Check if local secrets file exists
  if (!fs.existsSync(localSecretsPath)) {
    console.log(kleur.yellow("No local secrets file found (./.metis/secrets.json)"));
    console.log("Nothing to migrate.");
    return;
  }
  
  try {
    // Load local secrets
    const localSecrets = JSON.parse(fs.readFileSync(localSecretsPath, "utf8"));
    
    if (Object.keys(localSecrets).length === 0) {
      console.log(kleur.yellow("Local secrets file is empty"));
      console.log("Nothing to migrate.");
      return;
    }
    
    console.log(`Found ${Object.keys(localSecrets).length} API keys in local config:`);
    for (const [provider, key] of Object.entries(localSecrets)) {
      const keyPreview = typeof key === 'string' ? `${key.substring(0, 8)}...` : '[invalid]';
      console.log(`  ${kleur.yellow(provider)}: ${kleur.gray(keyPreview)}`);
    }
    
    // Load current global secrets to check for conflicts
    const globalSecrets = loadSecrets();
    const conflicts = [];
    
    for (const provider of Object.keys(localSecrets)) {
      if (globalSecrets[provider] && globalSecrets[provider] !== localSecrets[provider]) {
        conflicts.push(provider);
      }
    }
    
    if (conflicts.length > 0) {
      console.log(kleur.yellow(`\nWarning: These providers already have different global API keys:`));
      for (const provider of conflicts) {
        console.log(`  ${kleur.red(provider)}: Global key will be overwritten`);
      }
    }
    
    // Save to global location
    saveGlobalSecrets(localSecrets);
    
    console.log(kleur.green(`\n✅ Successfully migrated API keys to global config`));
    console.log(`Global location: ${kleur.gray(getGlobalSecretsLocation())}`);
    
    // Ask if user wants to remove local file
    console.log(kleur.yellow(`\nThe local secrets file can now be removed:`));
    console.log(`  ${kleur.gray(localSecretsPath)}`);
    console.log(`\nTo remove it manually: ${kleur.cyan(`rm "${localSecretsPath}"`)}`);
    
    // Show current configuration
    console.log(kleur.cyan(`\n📋 Current API Key Configuration:`));
    const currentSecrets = loadSecrets();
    for (const [provider, key] of Object.entries(currentSecrets)) {
      const keyPreview = `${key.substring(0, 8)}...`;
      console.log(`  ${kleur.yellow(provider)}: ${kleur.green('configured')} (${kleur.gray(keyPreview)})`);
    }
    
  } catch (error: any) {
    console.log(kleur.red(`❌ Migration failed: ${error.message}`));
  }
}

function showMigrateHelp() {
  console.log(kleur.cyan(`
🔄 Migration Commands

Usage: metiscode migrate <action>

Actions:
  apikeys/secrets    Migrate local API keys to global configuration

Background:
  Metis Code now uses global API key storage (~/.metis/secrets.json) instead 
  of per-project storage. This means you only need to configure your API keys 
  once, and they'll work in all projects.

API Key Priority:
  1. Environment variables (OPENAI_API_KEY, etc.) - highest priority
  2. Global config (~/.metis/secrets.json) - recommended
  3. Local project config (./.metis/secrets.json) - legacy, still works

Examples:
  metiscode migrate apikeys    # Move local API keys to global config
  metiscode config show        # View current configuration
  metiscode config set apikey sk-your-key-here  # Set global API key
`));
}