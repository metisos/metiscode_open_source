import { AssetLoader } from "../../assets/loader";
import { ToolCallingAgent } from "../../agent/toolCallAgent";
import kleur from "kleur";
import { DropdownHelpers } from "../dropdowns/DropdownHelpers";

export async function runPersona(args: string[]) {
  const loader = new AssetLoader();

  try {
    // If args provided, check if it's a direct command
    if (args.length > 0) {
      const action = args[0];
      const personaName = args[1];

      // Handle direct commands for backwards compatibility or automation
      switch (action) {
        case "list":
          await listPersonas(loader);
          return;
        case "show":
          if (!personaName) {
            console.error("Usage: metiscode persona show <name>");
            process.exitCode = 1;
            return;
          }
          await showPersona(loader, personaName);
          return;
        case "validate":
          if (!personaName) {
            console.error("Usage: metiscode persona validate <name>");
            process.exitCode = 1;
            return;
          }
          await validatePersona(loader, personaName);
          return;
        case "generate":
          if (!personaName) {
            console.error("Usage: metiscode persona generate <name> [description]");
            process.exitCode = 1;
            return;
          }
          const description = args.slice(2).join(" ") || "";
          await generatePersona(loader, personaName, description);
          return;
        default:
          // Invalid action, fall through to interactive mode
          break;
      }
    }

    // Interactive mode - show main menu
    await runInteractivePersonaMenu(loader);

  } catch (error: any) {
    DropdownHelpers.handleError(error, 'persona management');
    process.exitCode = 1;
  }
}

async function listPersonas(loader: AssetLoader) {
  try {
    const personas = await loader.listPersonas();
    const format = process.env.METIS_FORMAT || "pretty";
    
    if (format === "json") {
      console.log(JSON.stringify(personas, null, 2));
      return;
    }
    
    if (personas.length === 0) {
      console.log("No personas found. Run 'metiscode init' to create the .metis directory.");
      return;
    }
    
    console.log(`Available personas (${personas.length}):`);
    for (const persona of personas) {
      try {
        const p = await loader.loadPersona(persona);
        const isBuiltin = persona === 'default' || persona === 'senior-dev' || persona === 'security-expert';
        const marker = isBuiltin ? "📦" : "📝";
        console.log(`  ${marker} ${p.name} - ${p.description}`);
      } catch (error) {
        console.log(`  ❌ ${persona} - Invalid format`);
      }
    }
    
    console.log(`\nUse: metiscode persona show <name> for details`);
  } catch (error: any) {
    console.error("Error listing personas:", error.message);
    process.exitCode = 1;
  }
}

async function showPersona(loader: AssetLoader, name: string) {
  try {
    const persona = await loader.loadPersona(name);
    const format = process.env.METIS_FORMAT || "pretty";
    
    if (format === "json") {
      console.log(JSON.stringify(persona, null, 2));
      return;
    }
    
    console.log(`Persona: ${persona.name} (v${persona.version})`);
    console.log(`Description: ${persona.description}`);
    
    if (persona.capabilities && persona.capabilities.length > 0) {
      console.log(`Capabilities: ${persona.capabilities.join(", ")}`);
    }
    
    console.log(`Temperature: ${persona.temperature || 0.2}`);
    
    if (persona.model_preferences && persona.model_preferences.length > 0) {
      console.log(`Preferred models: ${persona.model_preferences.join(", ")}`);
    }
    
    console.log("\nSystem Prompt:");
    console.log(persona.system_prompt.split('\n').map(line => `  ${line}`).join('\n'));
    
    if (persona.metadata) {
      console.log("\nMetadata:");
      Object.entries(persona.metadata).forEach(([key, value]) => {
        console.log(`  ${key}: ${JSON.stringify(value)}`);
      });
    }
    
  } catch (error: any) {
    console.error(`Error loading persona '${name}':`, error.message);
    process.exitCode = 1;
  }
}

async function validatePersona(loader: AssetLoader, name: string) {
  try {
    const isValid = await loader.validateAsset('persona', name);
    if (isValid) {
      console.log(`✅ Persona '${name}' is valid`);
    } else {
      console.log(`❌ Persona '${name}' is invalid`);
      process.exitCode = 1;
    }
  } catch (error: any) {
    console.error(`❌ Persona '${name}' validation failed:`, error.message);
    process.exitCode = 1;
  }
}

async function generatePersona(loader: AssetLoader, name: string, description: string) {
  try {
    console.log(kleur.cyan("🎭 Generating persona with AI assistance..."));

    // Create generation prompt
    const prompt = `Generate a comprehensive persona YAML configuration for a coding assistant.

Persona Name: ${name}
${description ? `Description/Requirements: ${description}` : 'Generate a balanced, helpful coding assistant persona.'}

Please create a complete persona configuration that includes:
1. Basic metadata (name, version, description)
2. A detailed system_prompt that defines the persona's behavior
3. Relevant capabilities array
4. Personality traits object with communication_style, explanation_depth, code_review_tone, help_approach, humor_level, formality, encouragement
5. Behavior guidelines array
6. Temperature setting (0.1-0.9)
7. Model preferences
8. Metadata with author and category

Make the persona unique and specialized based on the name and description. Return ONLY the YAML content, no markdown formatting or explanations.

Example structure:
\`\`\`yaml
name: "${name}"
version: "1.0"
description: "Brief description"
system_prompt: |
  Detailed prompt defining behavior...
capabilities:
  - capability1
  - capability2
temperature: 0.3
personality:
  communication_style: "style description"
  explanation_depth: "depth level"
  code_review_tone: "tone description"
  help_approach: "approach description"
  humor_level: "humor level"
  formality: "formality level"
  encouragement: "encouragement level"
behavior:
  - "Behavior guideline 1"
  - "Behavior guideline 2"
model_preferences:
  - "claude-3-5-sonnet-20241022"
  - "gpt-4o"
metadata:
  author: "user-generated"
  category: "custom"
\`\`\`

Generate the persona now:`;

    // Use the agent to generate the persona
    const agent = new ToolCallingAgent();
    const result = await agent.executeWithTools(prompt, [], 5);

    if (result.type !== 'completed') {
      throw new Error('Failed to generate persona');
    }

    // Extract YAML content from the response
    let yamlContent = result.content;

    // Remove markdown code blocks if present
    yamlContent = yamlContent.replace(/```yaml\n?/g, '').replace(/```\n?/g, '').trim();

    // Validate the generated YAML by trying to parse it
    const yaml = require('js-yaml');
    try {
      const parsed = yaml.load(yamlContent);
      if (!parsed.name || !parsed.system_prompt) {
        throw new Error('Generated persona is missing required fields');
      }
    } catch (parseError: any) {
      throw new Error(`Generated persona has invalid YAML format: ${parseError.message}`);
    }

    // Save the persona
    await saveGeneratedPersona(loader, name, yamlContent);

    console.log(kleur.green(`✅ Successfully generated and saved persona '${name}'`));
    console.log(kleur.gray(`Use: metiscode persona show ${name} to view details`));

  } catch (error: any) {
    console.error(kleur.red(`❌ Failed to generate persona '${name}':`, error.message));
    process.exitCode = 1;
  }
}

async function saveGeneratedPersona(loader: AssetLoader, name: string, yamlContent: string) {
  const fs = require('fs');
  const path = require('path');

  // Ensure .metis/personas directory exists
  const personasDir = path.join(process.cwd(), '.metis', 'personas');
  if (!fs.existsSync(personasDir)) {
    fs.mkdirSync(personasDir, { recursive: true });
  }

  // Save the persona file
  const personaPath = path.join(personasDir, `${name}.yaml`);
  fs.writeFileSync(personaPath, yamlContent);
}

async function runInteractivePersonaMenu(loader: AssetLoader) {
  while (true) {
    const action = await DropdownHelpers.selectOne({
      message: 'What would you like to do with personas?',
      choices: DropdownHelpers.createIconChoices([
        { item: 'list', icon: '📋', name: 'List all personas', description: 'View all available personas' },
        { item: 'show', icon: '👀', name: 'Show persona details', description: 'View details of a specific persona' },
        { item: 'generate', icon: '✨', name: 'Generate new persona', description: 'Create a new persona with AI assistance' },
        { item: 'validate', icon: '✅', name: 'Validate persona', description: 'Check if a persona format is valid' },
        { item: 'exit', icon: '🚪', name: 'Exit', description: 'Return to main menu' }
      ])
    });

    switch (action) {
      case 'list':
        await listPersonasInteractive(loader);
        break;

      case 'show':
        await showPersonaInteractive(loader);
        break;

      case 'generate':
        await generatePersonaInteractive(loader);
        break;

      case 'validate':
        await validatePersonaInteractive(loader);
        break;

      case 'exit':
        return;
    }

    console.log(); // Add some spacing
  }
}

async function listPersonasInteractive(loader: AssetLoader) {
  try {
    // First show the list
    await listPersonas(loader);

    const personas = await loader.listPersonas();
    if (personas.length === 0) {
      return;
    }

    console.log();
    const wantToSelect = await DropdownHelpers.confirm('Would you like to select a persona to view details?', false);

    if (wantToSelect) {
      await showPersonaInteractive(loader);
    }
  } catch (error: any) {
    console.error(kleur.red('Error listing personas:'), error.message);
  }
}

async function showPersonaInteractive(loader: AssetLoader) {
  try {
    const personas = await loader.listPersonas();

    if (personas.length === 0) {
      console.log(kleur.gray('No personas found. Run the generate option to create one.'));
      return;
    }

    const choices = [];
    for (const personaName of personas) {
      try {
        const persona = await loader.loadPersona(personaName);
        const isBuiltin = ['default', 'senior-dev', 'security-expert', 'friendly-mentor'].includes(personaName);
        choices.push({
          item: personaName,
          icon: isBuiltin ? '📦' : '📝',
          name: persona.name,
          description: persona.description
        });
      } catch (error) {
        choices.push({
          item: personaName,
          icon: '❌',
          name: personaName,
          description: 'Invalid format'
        });
      }
    }

    // Add back option
    choices.push({ item: null, icon: '←', name: 'Back', description: 'Return to persona menu' });

    const selectedPersona = await DropdownHelpers.selectOne({
      message: 'Which persona would you like to view?',
      choices: DropdownHelpers.createIconChoices(choices)
    });

    if (selectedPersona) {
      await showPersona(loader, selectedPersona);
    }
  } catch (error: any) {
    console.error(kleur.red('Error loading personas:'), error.message);
  }
}

async function generatePersonaInteractive(loader: AssetLoader) {
  try {
    const name = await DropdownHelpers.inputText({
      message: 'Enter the persona name:',
      validate: (input) => {
        if (!input.trim()) return 'Persona name is required';
        if (!/^[a-zA-Z0-9_-]+$/.test(input)) return 'Persona name can only contain letters, numbers, hyphens, and underscores';
        return true;
      },
      filter: (input) => input.trim().toLowerCase()
    });

    const description = await DropdownHelpers.inputText({
      message: 'Enter a description for the persona (optional):',
      default: ''
    });

    const confirmed = await DropdownHelpers.confirm(
      `Generate persona "${name}"${description ? ` with description "${description}"` : ''}?`,
      true
    );

    if (confirmed) {
      await generatePersona(loader, name, description);
    } else {
      console.log(kleur.gray('Persona generation cancelled.'));
    }
  } catch (error: any) {
    console.error(kleur.red('Error generating persona:'), error.message);
  }
}

async function validatePersonaInteractive(loader: AssetLoader) {
  try {
    const personas = await loader.listPersonas();

    if (personas.length === 0) {
      console.log(kleur.gray('No personas found to validate.'));
      return;
    }

    const choices = personas.map(name => ({
      item: name,
      icon: '📝',
      name,
      description: 'Validate this persona'
    }));

    // Add back option
    choices.push({ item: null, icon: '←', name: 'Back', description: 'Return to persona menu' });

    const selectedPersona = await DropdownHelpers.selectOne({
      message: 'Which persona would you like to validate?',
      choices: DropdownHelpers.createIconChoices(choices)
    });

    if (selectedPersona) {
      await validatePersona(loader, selectedPersona);
    }
  } catch (error: any) {
    console.error(kleur.red('Error validating persona:'), error.message);
  }
}