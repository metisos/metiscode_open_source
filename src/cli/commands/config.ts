import fs from "fs";
import path from "path";
import { loadConfig, loadSecrets, saveGlobalSecrets, getGlobalSecretsLocation, saveGlobalConfig, getGlobalConfigLocation } from "../../config";
import { MetisError } from "../../errors/MetisError";
import { DropdownHelpers } from "../dropdowns/DropdownHelpers";
import kleur from "kleur";

export async function runConfig(args: string[]) {
  try {
    // If args provided, check if it's a direct command
    if (args.length > 0) {
      const action = args[0];

      // Handle direct commands for backwards compatibility or automation
      switch (action) {
        case "show":
          await showConfig();
          return;
        case "set":
          await setConfig(args.slice(1));
          return;
        case "reset":
          await resetConfig();
          return;
        default:
          // Invalid action, fall through to interactive mode
          break;
      }
    }

    // Interactive mode - show main menu
    await runInteractiveConfigMenu();

  } catch (error: any) {
    DropdownHelpers.handleError(error, 'configuration management');
    process.exitCode = 1;
  }
}

async function showConfig() {
  try {
    const config = loadConfig();
    const secrets = loadSecrets();
    const format = process.env.METIS_FORMAT || "pretty";
    
    if (format === "json") {
      // Don't include API keys in JSON output for security
      console.log(JSON.stringify(config, null, 2));
    } else if (format === "yaml") {
      // Would need yaml import for this
      console.log(JSON.stringify(config, null, 2));
    } else {
      console.log("Configuration:");
      console.log(`  Provider: ${config.provider}`);
      console.log(`  Model: ${config.model}`);
      console.log(`  Temperature: ${config.temperature}`);
      
        // Show API key status (but not the actual key for security)
      const groqKey = secrets.groq;
      const keyStatus = groqKey ? "configured" : "missing";
      const keyPreview = groqKey ? `${groqKey.substring(0, 8)}...` : "not set";
      console.log(`  Groq API Key: ${keyStatus} (${keyPreview})`);

      // Show Firecrawl API key status
      const firecrawlKey = secrets.firecrawl_api_key || process.env.FIRECRAWL_API_KEY;
      const firecrawlStatus = firecrawlKey ? "configured" : "not set";
      const firecrawlPreview = firecrawlKey ? `${firecrawlKey.substring(0, 8)}...` : "not set";
      console.log(`  Firecrawl Key: ${firecrawlStatus} (${firecrawlPreview})`);

      console.log(`  Safety - Dry Run: ${config.safety?.dryRun ? "enabled" : "disabled"}`);
      console.log(`  Safety - Require Approval: ${config.safety?.requireExecApproval ? "enabled" : "disabled"}`);
      console.log(`  Global config: ${fs.existsSync(getGlobalConfigLocation()) ? "found" : "not found"}`);
      console.log(`  Config location: ${getGlobalConfigLocation()}`);
      console.log(`  Secrets location: ${getGlobalSecretsLocation()}`);
    }
  } catch (error: any) {
    console.error("Error loading config:", error.message);
    process.exitCode = 1;
  }
}

async function resetConfig() {
  const defaultConfig = {
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    temperature: 0.2,
    safety: { dryRun: false, requireExecApproval: true },
    ignore: ["node_modules/**", ".git/**", "dist/**", ".metis/sessions/**"],
  };

  saveGlobalConfig(defaultConfig);
  console.log("Global configuration reset to defaults");
  console.log(`Location: ${getGlobalConfigLocation()}`);
}

async function setConfig(args: string[]) {
  if (args.length < 2) {
    console.log("Error: Please specify both key and value");
    console.log("Usage: metiscode config set <key> <value>");
    console.log("\nAvailable keys: provider, model, temperature, apikey, firecrawl");
    return;
  }

  const [key, value] = args;
  
  // Load current config
  const currentConfig = loadConfig();
  
  // Validate and set the key
  switch (key.toLowerCase()) {
    case "provider":
      if (value.toLowerCase() !== "groq") {
        console.log("Error: Provider must be: groq");
        console.log("Note: This version only supports Groq as the provider");
        return;
      }
      currentConfig.provider = "groq";
      break;
      
    case "model":
      // Validate model based on provider
      const validModels = getValidModels(currentConfig.provider);
      if (validModels.length > 0 && !validModels.includes(value)) {
        console.log(`Warning: Model '${value}' may not be valid for provider '${currentConfig.provider}'`);
        console.log(`Common models for ${currentConfig.provider}:`, validModels.slice(0, 5).join(", "));
        console.log("Setting anyway...");
      }
      currentConfig.model = value;
      break;
      
    case "temperature":
      const temp = parseFloat(value);
      if (isNaN(temp) || temp < 0 || temp > 2) {
        console.log("Error: Temperature must be a number between 0.0 and 2.0");
        return;
      }
      currentConfig.temperature = temp;
      break;
      
    case "apikey":
      // Handle API key separately as it goes to global secrets file
      await setApiKey(currentConfig.provider, value);
      console.log(`✅ API key updated globally for provider: ${currentConfig.provider}`);
      return; // Early return since we don't need to save config file

    case "firecrawl":
      // Handle Firecrawl API key
      await setFirecrawlApiKey(value);
      console.log(`✅ Firecrawl API key updated globally`);
      return;
      
    default:
      console.log(`Error: Unknown configuration key '${key}'`);
      console.log("Available keys: provider, model, temperature, apikey, firecrawl");
      return;
  }
  
  // Write updated config to global location
  try {
    saveGlobalConfig(currentConfig);
    console.log(`✅ Global configuration updated: ${key} = ${value}`);
    console.log(`Location: ${getGlobalConfigLocation()}`);
    
    // Show updated config
    console.log("\nCurrent configuration:");
    console.log(`  Provider: ${currentConfig.provider}`);
    console.log(`  Model: ${currentConfig.model}`);
    console.log(`  Temperature: ${currentConfig.temperature}`);
  } catch (error: any) {
    console.log(`Error saving global configuration: ${error.message}`);
  }
}

async function setApiKey(provider: string, apiKey: string) {
  // Validate API key format
  if (!isValidApiKey(provider, apiKey)) {
    console.log(`Error: Invalid API key format for ${provider}`);
    console.log(getApiKeyFormatHelp(provider));
    return;
  }
  
  try {
    // Save to global secrets location
    saveGlobalSecrets({ [provider]: apiKey });
    console.log(`Global secrets saved to: ${getGlobalSecretsLocation()}`);
    
    // Show priority information
    console.log(`\nAPI Key Priority (highest to lowest):`);
    console.log(`  1. Environment variable (GROQ_API_KEY)`);
    console.log(`  2. Global config: ${getGlobalSecretsLocation()}`);
    console.log(`  3. Local project config: ./.metis/secrets.json`);
    
  } catch (error: any) {
    console.log(`Error saving API key: ${error.message}`);
  }
}

async function setFirecrawlApiKey(apiKey: string) {
  // Basic validation for Firecrawl key
  if (!apiKey.startsWith("fc-") || apiKey.length < 20) {
    console.log("Warning: Firecrawl API key should start with 'fc-' and be at least 20 characters");
    console.log("Visit https://firecrawl.dev to get an API key");

    // Ask for confirmation
    const confirm = await promptConfirmation("Continue anyway?");
    if (!confirm) {
      console.log("API key not saved");
      return;
    }
  }

  try {
    // Load current global secrets
    const globalSecrets = loadSecrets() || {};

    // Add/update Firecrawl key
    globalSecrets.firecrawl_api_key = apiKey;

    // Save to global secrets
    saveGlobalSecrets(globalSecrets);
    console.log(`Global secrets saved to: ${getGlobalSecretsLocation()}`);

    // Show usage information
    console.log(`\nFirecrawl API Key saved!`);
    console.log(`You can now use the following tools:`);
    console.log(`  • firecrawl_scrape - Extract content from any webpage`);
    console.log(`  • firecrawl_crawl - Crawl entire websites`);

  } catch (error: any) {
    console.log(`Error saving Firecrawl API key: ${error.message}`);
  }
}

async function promptConfirmation(message: string): Promise<boolean> {
  // Simple yes/no prompt (would need readline in real implementation)
  console.log(`${message} (y/n)`);
  return true; // For now, default to yes
}

function isValidApiKey(provider: string, apiKey: string): boolean {
  switch (provider.toLowerCase()) {
    case "groq":
      return apiKey.startsWith("gsk_") && apiKey.length > 30;
    default:
      return apiKey.length > 10; // Basic validation for unknown providers
  }
}

function getApiKeyFormatHelp(provider: string): string {
  switch (provider.toLowerCase()) {
    case "groq":
      return "Groq API keys should start with 'gsk_' and be at least 30 characters long";
    default:
      return "API key should be at least 10 characters long";
  }
}

function getValidModels(provider: string): string[] {
  switch (provider.toLowerCase()) {
    case "groq":
      return [
        "llama-3.3-70b-versatile",
        "llama-3.1-70b-versatile",
        "llama-3.1-8b-instant",
        "mixtral-8x7b-32768",
        "gemma2-9b-it",
        "deepseek-r1-distill-llama-70b"
      ];
    default:
      return [];
  }
}

async function runInteractiveConfigMenu() {
  while (true) {
    // Show current config first
    console.log(kleur.cyan('\n📋 Current Configuration:'));
    await showConfig();
    console.log();

    const action = await DropdownHelpers.selectOne({
      message: 'What would you like to do?',
      choices: DropdownHelpers.createIconChoices([
        { item: 'set', icon: '⚙️', name: 'Set configuration', description: 'Change configuration values' },
        { item: 'show', icon: '👀', name: 'Show configuration', description: 'View current configuration' },
        { item: 'reset', icon: '🔄', name: 'Reset configuration', description: 'Reset to default values' },
        { item: 'exit', icon: '🚪', name: 'Exit', description: 'Return to main menu' }
      ])
    });

    switch (action) {
      case 'set':
        await setConfigInteractive();
        break;

      case 'show':
        await showConfig();
        break;

      case 'reset':
        const confirmed = await DropdownHelpers.confirm(
          kleur.yellow('Are you sure you want to reset configuration to defaults?'),
          false
        );
        if (confirmed) {
          await resetConfig();
        }
        break;

      case 'exit':
        return;
    }

    console.log(); // Add some spacing
  }
}

async function setConfigInteractive() {
  const configKey = await DropdownHelpers.selectOne({
    message: 'What would you like to configure?',
    choices: DropdownHelpers.createIconChoices([
      { item: 'model', icon: '🧠', name: 'Model', description: 'Select the Groq model to use' },
      { item: 'temperature', icon: '🌡️', name: 'Temperature', description: 'Set creativity/randomness (0.0 - 2.0)' },
      { item: 'apikey', icon: '🔑', name: 'Groq API Key', description: 'Set Groq API key' },
      { item: 'firecrawl', icon: '🕷️', name: 'Firecrawl API Key', description: 'Set Firecrawl API key for web scraping' },
      { item: 'back', icon: '←', name: 'Back', description: 'Return to config menu' }
    ])
  });

  if (configKey === 'back') return;

  switch (configKey) {
    case 'model':
      await setModelInteractive();
      break;
    case 'temperature':
      await setTemperatureInteractive();
      break;
    case 'apikey':
      await setApiKeyInteractive();
      break;
    case 'firecrawl':
      await setFirecrawlKeyInteractive();
      break;
  }
}

async function setProviderInteractive() {
  console.log(kleur.cyan('\n🟠 Provider is set to Groq'));
  console.log(kleur.gray('This version only supports Groq as the AI provider'));
  console.log(kleur.gray('Groq offers ultra-fast inference with Llama, Mixtral, and other models'));

  // Provider is always Groq, no selection needed
  await setConfig(['provider', 'groq']);
}

async function setModelInteractive() {
  const currentConfig = loadConfig();
  const provider = currentConfig.provider;

  if (!provider) {
    console.log(kleur.red('Please set a provider first before selecting a model.'));
    return;
  }

  const validModels = getValidModels(provider);

  if (validModels.length === 0) {
    console.log(kleur.yellow(`No predefined models for provider '${provider}'. You can still enter a custom model name.`));
    const customModel = await DropdownHelpers.inputText({
      message: 'Enter the model name:',
      validate: (input) => input.trim() ? true : 'Model name is required'
    });
    await setConfig(['model', customModel]);
    return;
  }

  const choices = validModels.map(model => ({
    item: model,
    icon: '🧠',
    name: model,
    description: getModelDescription(provider, model)
  }));

  choices.push({
    item: 'custom',
    icon: '✏️',
    name: 'Custom model',
    description: 'Enter a custom model name'
  });

  const selectedModel = await DropdownHelpers.selectOne({
    message: `Which ${provider} model would you like to use?`,
    choices: DropdownHelpers.createIconChoices(choices)
  });

  if (selectedModel === 'custom') {
    const customModel = await DropdownHelpers.inputText({
      message: 'Enter the custom model name:',
      validate: (input) => input.trim() ? true : 'Model name is required'
    });
    await setConfig(['model', customModel]);
  } else {
    await setConfig(['model', selectedModel]);
  }
}

async function setTemperatureInteractive() {
  const temperature = await DropdownHelpers.inputText({
    message: 'Enter temperature (0.0 to 2.0):',
    validate: (input) => {
      const temp = parseFloat(input);
      if (isNaN(temp)) return 'Temperature must be a number';
      if (temp < 0 || temp > 2) return 'Temperature must be between 0.0 and 2.0';
      return true;
    },
    default: '0.2'
  });

  await setConfig(['temperature', temperature]);
}

async function setApiKeyInteractive() {
  const provider = "groq";

  console.log(kleur.cyan(`\n🔑 Setting Groq API key:`));
  console.log(kleur.gray(getApiKeyFormatHelp(provider)));
  console.log();

  const apiKey = await DropdownHelpers.inputText({
    message: `Enter your Groq API key:`,
    validate: (input) => {
      if (!input.trim()) return 'API key is required';
      if (!isValidApiKey(provider, input)) return `Invalid API key format for ${provider}`;
      return true;
    }
  });

  await setConfig(['apikey', apiKey]);
}

async function setFirecrawlKeyInteractive() {
  console.log(kleur.cyan('\n🕷️ Setting Firecrawl API key:'));
  console.log(kleur.gray('Firecrawl API keys should start with "fc-" and be at least 20 characters long'));
  console.log(kleur.gray('Visit https://firecrawl.dev to get an API key'));
  console.log();

  const apiKey = await DropdownHelpers.inputText({
    message: 'Enter your Firecrawl API key:',
    validate: (input) => {
      if (!input.trim()) return 'API key is required';
      return true; // Allow any format since validation is done in the main function
    }
  });

  await setConfig(['firecrawl', apiKey]);
}

function getModelDescription(provider: string, model: string): string {
  const descriptions: Record<string, Record<string, string>> = {
    groq: {
      'llama-3.3-70b-versatile': 'Latest Llama model, most capable (recommended)',
      'llama-3.1-70b-versatile': 'Large and capable model',
      'llama-3.1-8b-instant': 'Ultra-fast and lightweight',
      'mixtral-8x7b-32768': 'Good balance of speed and capability',
      'gemma2-9b-it': 'Google\'s Gemma 2 model',
      'deepseek-r1-distill-llama-70b': 'DeepSeek reasoning model'
    }
  };

  return descriptions[provider]?.[model] || 'AI model';
}