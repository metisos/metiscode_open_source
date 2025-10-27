import { DropdownHelpers } from "../dropdowns/DropdownHelpers";
import { loadConfig, saveGlobalConfig } from "../../config";
import kleur from "kleur";

export async function runModels(args: string[]) {
  try {
    // If args provided, use legacy behavior
    if (args.length > 0) {
      await runModelsLegacy();
      return;
    }

    // Interactive mode - show main menu
    await runInteractiveModelsMenu();

  } catch (error: any) {
    DropdownHelpers.handleError(error, 'models management');
    process.exitCode = 1;
  }
}

async function runModelsLegacy() {
  // Groq model catalog
  const catalog = {
    groq: [
      "llama-3.3-70b-versatile",
      "llama-3.1-70b-versatile",
      "llama-3.1-8b-instant",
      "mixtral-8x7b-32768",
      "gemma2-9b-it"
    ]
  };
  console.log("Available Groq models:");
  for (const [prov, models] of Object.entries(catalog)) {
    console.log(`- ${prov}: ${models.join(", ")}`);
  }
}

async function runInteractiveModelsMenu() {
  while (true) {
    // Show current configuration first
    const config = loadConfig();
    console.log(kleur.cyan('\n🧠 Model Management'));
    console.log(`Current: ${config.provider ? `${config.provider}/${config.model}` : 'not configured'}`);
    console.log();

    // Show available models
    await showModelsByProvider();
    console.log();

    const action = await DropdownHelpers.selectOne({
      message: 'What would you like to do?',
      choices: DropdownHelpers.createIconChoices([
        { item: 'browse', icon: '🔍', name: 'Browse models', description: 'Browse models by provider' },
        { item: 'set-default', icon: '⭐', name: 'Set as default', description: 'Set a model as your default' },
        { item: 'compare', icon: '⚖️', name: 'Compare models', description: 'View model comparison and capabilities' },
        { item: 'refresh', icon: '🔄', name: 'Refresh list', description: 'Refresh available models' },
        { item: 'exit', icon: '🚪', name: 'Exit', description: 'Return to main menu' }
      ])
    });

    switch (action) {
      case 'browse':
        await browseModelsByProvider();
        break;

      case 'set-default':
        await setDefaultModelInteractive();
        break;

      case 'compare':
        await compareModelsInteractive();
        break;

      case 'refresh':
        await showModelsByProvider();
        break;

      case 'exit':
        return;
    }

    console.log(); // Add some spacing
  }
}

function getModelCatalog() {
  // Groq model catalog
  return {
    groq: [
      { name: "llama-3.3-70b-versatile", description: "Latest Llama model, most capable (recommended)", context: "128k", price: "$" },
      { name: "llama-3.1-70b-versatile", description: "Large and capable model", context: "32k", price: "$" },
      { name: "llama-3.1-8b-instant", description: "Ultra-fast and lightweight", context: "32k", price: "$" },
      { name: "mixtral-8x7b-32768", description: "Good balance of speed and capability", context: "32k", price: "$" },
      { name: "gemma2-9b-it", description: "Google's Gemma 2 model", context: "8k", price: "$" },
      { name: "deepseek-r1-distill-llama-70b", description: "DeepSeek reasoning model", context: "64k", price: "$" }
    ]
  };
}

async function showModelsByProvider() {
  const catalog = getModelCatalog();

  console.log("Available models:");
  for (const [provider, models] of Object.entries(catalog)) {
    const providerIcon = getProviderIcon(provider);
    console.log(`\n${providerIcon} ${provider.toUpperCase()}:`);

    for (const model of models) {
      console.log(`  • ${model.name} - ${model.description}`);
      console.log(`    ${kleur.gray(`Context: ${model.context}, Price: ${model.price}`)}`);
    }
  }
}

async function browseModelsByProvider() {
  const catalog = getModelCatalog();
  const providers = Object.keys(catalog);

  const selectedProvider = await DropdownHelpers.selectOne({
    message: 'Which provider would you like to browse?',
    choices: providers.map(provider => ({
      item: provider,
      icon: getProviderIcon(provider),
      name: provider.toUpperCase(),
      description: `Browse ${provider} models`
    }))
  });

  if (!selectedProvider) return;

  const models = catalog[selectedProvider as keyof typeof catalog];

  console.log(kleur.cyan(`\n${getProviderIcon(selectedProvider)} ${selectedProvider.toUpperCase()} Models:`));

  const selectedModel = await DropdownHelpers.selectOne({
    message: 'Which model would you like to learn about?',
    choices: models.map(model => ({
      name: `${model.name} - ${model.description}`,
      value: model,
      short: model.name
    }))
  });

  if (selectedModel) {
    console.log(kleur.cyan(`\n📋 ${selectedModel.name}`));
    console.log(`Description: ${selectedModel.description}`);
    console.log(`Context Window: ${selectedModel.context}`);
    console.log(`Price Tier: ${selectedModel.price}`);
    console.log(`Provider: ${selectedProvider}`);

    const setDefault = await DropdownHelpers.confirm(
      `Set ${selectedModel.name} as your default model?`,
      false
    );

    if (setDefault) {
      await setAsDefault(selectedProvider, selectedModel.name);
    }
  }
}

async function setDefaultModelInteractive() {
  const catalog = getModelCatalog();
  const allModels: Array<{provider: string, model: any}> = [];

  // Flatten all models
  for (const [provider, models] of Object.entries(catalog)) {
    for (const model of models) {
      allModels.push({ provider, model });
    }
  }

  const choices = allModels.map(({provider, model}) => ({
    item: { provider, modelName: model.name },
    icon: getProviderIcon(provider),
    name: `${model.name}`,
    description: `${provider} - ${model.description} (${model.price})`
  }));

  const selection = await DropdownHelpers.selectOne({
    message: 'Which model would you like to set as default?',
    choices: DropdownHelpers.createIconChoices(choices)
  });

  if (selection) {
    await setAsDefault(selection.provider, selection.modelName);
  }
}

async function compareModelsInteractive() {
  const catalog = getModelCatalog();

  // Show comparison table
  console.log(kleur.cyan('\n⚖️ Model Comparison'));
  console.log();

  console.log('| Provider | Model | Context | Price | Best For |');
  console.log('|----------|-------|---------|-------|----------|');

  for (const [provider, models] of Object.entries(catalog)) {
    for (const model of models) {
      const bestFor = getBestUseCase(model.name);
      console.log(`| ${provider.padEnd(8)} | ${model.name.padEnd(25)} | ${model.context.padEnd(7)} | ${model.price.padEnd(5)} | ${bestFor} |`);
    }
  }

  console.log();
  console.log(kleur.gray('Price tiers: $ = Budget, $$ = Standard, $$$ = Premium, $$$$ = Ultra'));
}

async function setAsDefault(provider: string, modelName: string) {
  try {
    const config = loadConfig();
    config.provider = provider;
    config.model = modelName;

    saveGlobalConfig(config);

    console.log(kleur.green(`✅ Set default model to ${provider}/${modelName}`));
    console.log(kleur.gray('This configuration is saved globally'));

  } catch (error: any) {
    console.error(kleur.red('Error setting default model:'), error.message);
  }
}

function getProviderIcon(provider: string): string {
  switch (provider.toLowerCase()) {
    case 'groq': return '🟠';
    default: return '⚪';
  }
}

function getBestUseCase(modelName: string): string {
  const useCases: Record<string, string> = {
    'llama-3.3-70b-versatile': 'Most capable, recommended',
    'llama-3.1-70b-versatile': 'Complex coding tasks',
    'llama-3.1-8b-instant': 'Ultra-fast responses',
    'mixtral-8x7b-32768': 'Long context tasks',
    'gemma2-9b-it': 'Lightweight tasks',
    'deepseek-r1-distill-llama-70b': 'Reasoning and analysis'
  };

  return useCases[modelName] || 'General purpose';
}

