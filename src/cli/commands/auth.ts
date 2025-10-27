import fs from "fs";
import path from "path";
import { DropdownHelpers } from "../dropdowns/DropdownHelpers";
import kleur from "kleur";

export async function runAuth(args: string[]) {
  try {
    // If args provided, check if it's a direct command
    if (args.length > 0) {
      await runAuthLegacy(args);
      return;
    }

    // Interactive mode - show main menu
    await runInteractiveAuthMenu();

  } catch (error: any) {
    DropdownHelpers.handleError(error, 'authentication management');
    process.exitCode = 1;
  }
}

async function runAuthLegacy(args: string[]) {
  const cwd = process.cwd();
  const metisDir = path.join(cwd, ".metis");
  const secretsFile = path.join(metisDir, "secrets.json");

  if (!fs.existsSync(metisDir)) fs.mkdirSync(metisDir);
  if (!fs.existsSync(secretsFile)) fs.writeFileSync(secretsFile, JSON.stringify({}, null, 2));

  const sub = args[0];
  if (sub === "show") {
    const data = JSON.parse(fs.readFileSync(secretsFile, "utf8") || "{}");
    const redacted = Object.fromEntries(
      Object.entries<string>(data).map(([k, v]) => [k, v ? redact(v) : v])
    );
    console.log(JSON.stringify(redacted, null, 2));
    return;
  }

  if (sub === "set") {
    const { provider, key } = parseArgs(args.slice(1));
    if (!provider || !key) {
      console.error("Usage: metis auth set --provider <name> --key <secret>");
      process.exitCode = 1;
      return;
    }
    const data = JSON.parse(fs.readFileSync(secretsFile, "utf8") || "{}");
    data[provider] = key;
    fs.writeFileSync(secretsFile, JSON.stringify(data, null, 2) + "\n");
    console.log(`Saved key for provider '${provider}' to .metis/secrets.json`);
    console.log("Never commit this file. It is gitignored by default.");
    return;
  }

  printHelp();
}

function parseArgs(tokens: string[]) {
  let provider: string | undefined;
  let key: string | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "--provider" || t === "-p") provider = tokens[++i];
    else if (t === "--key" || t === "-k") key = tokens[++i];
  }
  return { provider, key };
}

function printHelp() {
  console.log(`
Usage:
  metiscode auth show
  metiscode auth set --provider <name> --key <secret>
`);
}

function redact(str: string) {
  if (str.length <= 6) return "***";
  return str.slice(0, 3) + "***" + str.slice(-3);
}

async function runInteractiveAuthMenu() {
  const cwd = process.cwd();
  const metisDir = path.join(cwd, ".metis");
  const secretsFile = path.join(metisDir, "secrets.json");

  // Ensure directory and file exist
  if (!fs.existsSync(metisDir)) fs.mkdirSync(metisDir);
  if (!fs.existsSync(secretsFile)) fs.writeFileSync(secretsFile, JSON.stringify({}, null, 2));

  while (true) {
    // Show current credentials first
    console.log(kleur.cyan('\n🔑 API Key Management (Local Project)'));
    console.log(kleur.gray('Note: This manages local project API keys in .metis/secrets.json'));
    console.log(kleur.gray('For global configuration, use "metiscode config"'));
    await showCredentials(secretsFile);
    console.log();

    const action = await DropdownHelpers.selectOne({
      message: 'What would you like to do?',
      choices: DropdownHelpers.createIconChoices([
        { item: 'show', icon: '👀', name: 'Show credentials', description: 'View current API keys (redacted)' },
        { item: 'set', icon: '🔑', name: 'Set API key', description: 'Add or update an API key for a provider' },
        { item: 'remove', icon: '🗑️', name: 'Remove API key', description: 'Delete an API key for a provider' },
        { item: 'test', icon: '🧪', name: 'Test API key', description: 'Validate an API key works' },
        { item: 'global', icon: '🌍', name: 'Switch to global config', description: 'Use global configuration instead' },
        { item: 'exit', icon: '🚪', name: 'Exit', description: 'Return to main menu' }
      ])
    });

    switch (action) {
      case 'show':
        await showCredentials(secretsFile);
        break;

      case 'set':
        await setApiKeyInteractive(secretsFile);
        break;

      case 'remove':
        await removeApiKeyInteractive(secretsFile);
        break;

      case 'test':
        await testApiKeyInteractive(secretsFile);
        break;

      case 'global':
        console.log(kleur.cyan('\n🌍 Switching to global configuration...'));
        console.log(kleur.gray('Use "metiscode config" for global API key management'));
        return;

      case 'exit':
        return;
    }

    console.log(); // Add some spacing
  }
}

async function showCredentials(secretsFile: string) {
  try {
    const data = JSON.parse(fs.readFileSync(secretsFile, "utf8") || "{}");
    const providers = Object.keys(data);

    if (providers.length === 0) {
      console.log(kleur.gray('  No API keys configured locally'));
      return;
    }

    console.log('Local API Keys:');
    for (const provider of providers) {
      const key = data[provider];
      const redacted = key ? redact(key) : 'not set';
      const status = key ? kleur.green('✓') : kleur.red('✗');
      console.log(`  ${status} ${provider}: ${redacted}`);
    }
  } catch (error: any) {
    console.error(kleur.red('Error reading credentials:'), error.message);
  }
}

async function setApiKeyInteractive(secretsFile: string) {
  try {
    const provider = await DropdownHelpers.selectOne({
      message: 'Which provider would you like to set an API key for?',
      choices: DropdownHelpers.createIconChoices([
        { item: 'groq', icon: '🟠', name: 'Groq', description: 'Ultra-fast inference with Llama, Mixtral models' },
        { item: 'firecrawl_api_key', icon: '🕷️', name: 'Firecrawl', description: 'Web scraping and crawling service' },
        { item: 'custom', icon: '✏️', name: 'Custom provider', description: 'Enter a custom provider name' }
      ])
    });

    let providerName = provider;
    if (provider === 'custom') {
      providerName = await DropdownHelpers.inputText({
        message: 'Enter custom provider name:',
        validate: (input) => {
          if (!input.trim()) return 'Provider name is required';
          if (!/^[a-zA-Z0-9_-]+$/.test(input)) return 'Provider name can only contain letters, numbers, hyphens, and underscores';
          return true;
        },
        filter: (input) => input.trim().toLowerCase()
      });
    }

    console.log(kleur.cyan(`\n🔑 Setting API key for ${providerName}:`));
    console.log(kleur.gray(getApiKeyFormatHelp(providerName)));
    console.log();

    const apiKey = await DropdownHelpers.inputText({
      message: `Enter your ${providerName} API key:`,
      validate: (input) => {
        if (!input.trim()) return 'API key is required';
        if (!isValidApiKeyFormat(providerName, input)) return `Invalid API key format for ${providerName}`;
        return true;
      }
    });

    const confirmed = await DropdownHelpers.confirm(
      `Save API key for ${providerName} to local project?`,
      true
    );

    if (confirmed) {
      const data = JSON.parse(fs.readFileSync(secretsFile, "utf8") || "{}");
      data[providerName] = apiKey;
      fs.writeFileSync(secretsFile, JSON.stringify(data, null, 2) + "\n");

      console.log(kleur.green(`✅ Saved API key for '${providerName}' to .metis/secrets.json`));
      console.log(kleur.yellow("⚠️  Never commit this file. It is gitignored by default."));
    } else {
      console.log(kleur.gray('API key not saved.'));
    }

  } catch (error: any) {
    console.error(kleur.red('Error setting API key:'), error.message);
  }
}

async function removeApiKeyInteractive(secretsFile: string) {
  try {
    const data = JSON.parse(fs.readFileSync(secretsFile, "utf8") || "{}");
    const providers = Object.keys(data);

    if (providers.length === 0) {
      console.log(kleur.gray('No API keys to remove.'));
      return;
    }

    const choices = providers.map(provider => ({
      item: provider,
      icon: '🗑️',
      name: provider,
      description: `Remove API key for ${provider}`
    }));

    const selectedProvider = await DropdownHelpers.selectOne({
      message: 'Which API key would you like to remove?',
      choices: DropdownHelpers.createIconChoices(choices)
    });

    if (!selectedProvider) return;

    const confirmed = await DropdownHelpers.confirm(
      kleur.red(`Are you sure you want to remove the API key for "${selectedProvider}"?`),
      false
    );

    if (confirmed) {
      delete data[selectedProvider];
      fs.writeFileSync(secretsFile, JSON.stringify(data, null, 2) + "\n");
      console.log(kleur.green(`✅ Removed API key for '${selectedProvider}'`));
    } else {
      console.log(kleur.gray('API key removal cancelled.'));
    }

  } catch (error: any) {
    console.error(kleur.red('Error removing API key:'), error.message);
  }
}

async function testApiKeyInteractive(secretsFile: string) {
  try {
    const data = JSON.parse(fs.readFileSync(secretsFile, "utf8") || "{}");
    const providers = Object.keys(data).filter(key => data[key]); // Only providers with keys

    if (providers.length === 0) {
      console.log(kleur.gray('No API keys to test. Set an API key first.'));
      return;
    }

    const choices = providers.map(provider => ({
      item: provider,
      icon: '🧪',
      name: provider,
      description: `Test ${provider} API key`
    }));

    const selectedProvider = await DropdownHelpers.selectOne({
      message: 'Which API key would you like to test?',
      choices: DropdownHelpers.createIconChoices(choices)
    });

    if (!selectedProvider) return;

    console.log(kleur.cyan(`\n🧪 Testing ${selectedProvider} API key...`));

    // Basic format validation
    const apiKey = data[selectedProvider];
    if (isValidApiKeyFormat(selectedProvider, apiKey)) {
      console.log(kleur.green(`✅ API key format is valid for ${selectedProvider}`));
      console.log(kleur.gray('Note: Format validation only. Actual API testing requires network calls.'));
    } else {
      console.log(kleur.red(`❌ API key format is invalid for ${selectedProvider}`));
      console.log(kleur.gray(getApiKeyFormatHelp(selectedProvider)));
    }

  } catch (error: any) {
    console.error(kleur.red('Error testing API key:'), error.message);
  }
}

function isValidApiKeyFormat(provider: string, apiKey: string): boolean {
  switch (provider.toLowerCase()) {
    case "groq":
      return apiKey.startsWith("gsk_") && apiKey.length > 30;
    case "firecrawl_api_key":
    case "firecrawl":
      return apiKey.startsWith("fc-") && apiKey.length > 20;
    default:
      return apiKey.length > 10; // Basic validation for unknown providers
  }
}

function getApiKeyFormatHelp(provider: string): string {
  switch (provider.toLowerCase()) {
    case "groq":
      return "Groq API keys should start with 'gsk_' and be at least 30 characters long";
    case "firecrawl_api_key":
    case "firecrawl":
      return "Firecrawl API keys should start with 'fc-' and be at least 20 characters long";
    default:
      return "API key should be at least 10 characters long";
  }
}
