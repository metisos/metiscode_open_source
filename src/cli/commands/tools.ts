import { toolRegistry, ExecutionContext } from "../../tools/registry";
import { registerBuiltinTools } from "../../tools/builtin";
import { DropdownHelpers } from "../dropdowns/DropdownHelpers";
import kleur from "kleur";

export async function runTools(args: string[]) {
  try {
    // Initialize tools
    registerBuiltinTools();

    // If args provided, check if it's a direct command
    if (args.length > 0) {
      await runToolsLegacy(args);
      return;
    }

    // Interactive mode - show main menu
    await runInteractiveToolsMenu();

  } catch (error: any) {
    DropdownHelpers.handleError(error, 'tools management');
    process.exitCode = 1;
  }
}

async function runToolsLegacy(args: string[]) {
  const action = args[0] || "list";
  const toolName = args[1];

  switch (action) {
    case "list":
      await listTools();
      break;
    case "show":
      if (!toolName) {
        console.error("Usage: metiscode tools show <name>");
        process.exitCode = 1;
        return;
      }
      await showTool(toolName);
      break;
    case "test":
      if (!toolName) {
        console.error("Usage: metiscode tools test <name> [params...]");
        process.exitCode = 1;
        return;
      }
      await testTool(toolName, args.slice(2));
      break;
    case "exec":
      if (!toolName) {
        console.error("Usage: metiscode tools exec <name> <params...>");
        process.exitCode = 1;
        return;
      }
      await execTool(toolName, args.slice(2));
      break;
    default:
      console.log(`
Usage: metiscode tools [action] [name] [params...]

Actions:
  list       List available tools (default)
  show       Show tool details
  test       Test tool execution (dry run)
  exec       Execute tool with parameters
`);
  }
}

async function listTools() {
  const format = process.env.METIS_FORMAT || "pretty";
  const tools = toolRegistry.list();
  
  if (format === "json") {
    const toolData = tools.map(name => {
      const tool = toolRegistry.get(name)!;
      return {
        name: tool.name,
        description: tool.description,
        category: tool.metadata?.category,
        requires_approval: tool.safety?.require_approval || false
      };
    });
    console.log(JSON.stringify(toolData, null, 2));
    return;
  }
  
  if (tools.length === 0) {
    console.log("No tools registered.");
    return;
  }
  
  // Group by category
  const byCategory: Record<string, any[]> = {};
  
  for (const toolName of tools) {
    const tool = toolRegistry.get(toolName)!;
    const category = tool.metadata?.category || "uncategorized";
    
    if (!byCategory[category]) {
      byCategory[category] = [];
    }
    
    byCategory[category].push({
      name: tool.name,
      description: tool.description,
      requiresApproval: tool.safety?.require_approval || false,
      allowedInCI: tool.safety?.allowed_in_ci !== false
    });
  }
  
  console.log(`Available tools (${tools.length}):`);
  
  for (const [category, categoryTools] of Object.entries(byCategory)) {
    console.log(`\n📁 ${category}:`);
    
    for (const tool of categoryTools) {
      const approvalIcon = tool.requiresApproval ? "🔐" : "✅";
      const ciIcon = tool.allowedInCI ? "🤖" : "🚫";
      console.log(`  ${approvalIcon}${ciIcon} ${tool.name} - ${tool.description}`);
    }
  }
  
  console.log(`\nLegend: 🔐=requires approval, ✅=auto-approved, 🤖=CI allowed, 🚫=CI blocked`);
  console.log(`Use: metiscode tools show <name> for details`);
}

async function showTool(name: string) {
  const tool = toolRegistry.get(name);
  if (!tool) {
    console.error(`Tool not found: ${name}`);
    process.exitCode = 1;
    return;
  }
  
  const format = process.env.METIS_FORMAT || "pretty";
  
  if (format === "json") {
    console.log(JSON.stringify(tool, null, 2));
    return;
  }
  
  console.log(`Tool: ${tool.name}`);
  console.log(`Description: ${tool.description}`);
  console.log(`Category: ${tool.metadata?.category || "uncategorized"}`);
  console.log(`Version: ${tool.metadata?.version || "unknown"}`);
  
  if (tool.safety) {
    console.log("\n🔒 Safety Policy:");
    console.log(`  Requires approval: ${tool.safety.require_approval ? "yes" : "no"}`);
    console.log(`  Network access: ${tool.safety.network_access ? "yes" : "no"}`);
    console.log(`  Allowed in CI: ${tool.safety.allowed_in_ci !== false ? "yes" : "no"}`);
    console.log(`  Max execution time: ${tool.safety.max_execution_time || "unlimited"}ms`);
    
    if (tool.safety.path_restrictions && tool.safety.path_restrictions.length > 0) {
      console.log(`  Path restrictions: ${tool.safety.path_restrictions.join(", ")}`);
    }
  }
  
  if (tool.schema) {
    console.log("\n📋 Parameters:");
    if (tool.schema.properties) {
      for (const [param, spec] of Object.entries(tool.schema.properties as any)) {
        const required = tool.schema.required?.includes(param) ? " (required)" : "";
        const defaultVal = spec.default !== undefined ? ` [default: ${spec.default}]` : "";
        console.log(`  ${param}: ${spec.type}${required}${defaultVal}`);
        if (spec.description) {
          console.log(`    ${spec.description}`);
        }
      }
    }
  }
}

async function testTool(name: string, paramArgs: string[]) {
  console.log(`🧪 Testing tool: ${name} (dry run)`);
  
  // Parse parameters (simplified - would need proper parsing for complex params)
  const params: Record<string, any> = {};
  for (let i = 0; i < paramArgs.length; i += 2) {
    if (paramArgs[i].startsWith('--')) {
      const key = paramArgs[i].slice(2);
      const value = paramArgs[i + 1] || "true";
      params[key] = value;
    }
  }
  
  const context: ExecutionContext = {
    sessionId: "test-session",
    workingDirectory: process.cwd(),
    config: { autoApprove: true },
    traceEnabled: true,
    verboseEnabled: process.env.METIS_VERBOSE === 'true'
  };
  
  console.log("Parameters:", params);
  console.log("Note: This would execute the tool with the given parameters");
  
  const tool = toolRegistry.get(name);
  if (tool && tool.safety?.require_approval) {
    console.log("⚠️  This tool requires approval in normal execution");
  }
}

async function execTool(name: string, paramArgs: string[]) {
  console.log(`⚡ Executing tool: ${name}`);
  
  // Parse parameters (simplified)
  const params: Record<string, any> = {};
  for (let i = 0; i < paramArgs.length; i += 2) {
    if (paramArgs[i].startsWith('--')) {
      const key = paramArgs[i].slice(2);
      const value = paramArgs[i + 1] || "true";
      params[key] = value;
    }
  }
  
  const context: ExecutionContext = {
    sessionId: `exec-${Date.now()}`,
    workingDirectory: process.cwd(),
    config: { autoApprove: process.env.METIS_AUTO_APPROVE === 'true' },
    traceEnabled: process.env.METIS_TRACE === 'true',
    verboseEnabled: process.env.METIS_VERBOSE === 'true'
  };
  
  try {
    const result = await toolRegistry.execute(name, params, context);
    
    if (result.success) {
      console.log("✅ Success");
      if (result.content) {
        console.log("\nResult:");
        console.log(typeof result.content === 'string' ? result.content : JSON.stringify(result.content, null, 2));
      }
      if (result.metadata) {
        console.log("\nMetadata:", result.metadata);
      }
    } else {
      console.log("❌ Failed");
      console.error("Error:", result.error);
      process.exitCode = 1;
    }
  } catch (error: any) {
    console.error("❌ Execution failed:", error.message);
    process.exitCode = 1;
  }
}

async function runInteractiveToolsMenu() {
  while (true) {
    // Show available tools first
    console.log(kleur.cyan('\n🔧 Tool Management'));
    await listTools();
    console.log();

    const action = await DropdownHelpers.selectOne({
      message: 'What would you like to do with tools?',
      choices: DropdownHelpers.createIconChoices([
        { item: 'list', icon: '📋', name: 'List tools', description: 'View all available tools by category' },
        { item: 'show', icon: '👀', name: 'Show tool details', description: 'View detailed tool information' },
        { item: 'test', icon: '🧪', name: 'Test tool', description: 'Test tool execution (dry run)' },
        { item: 'exec', icon: '⚡', name: 'Execute tool', description: 'Run a tool with parameters' },
        { item: 'filter', icon: '🔍', name: 'Filter by category', description: 'View tools by category' },
        { item: 'exit', icon: '🚪', name: 'Exit', description: 'Return to main menu' }
      ])
    });

    switch (action) {
      case 'list':
        await listTools();
        break;

      case 'show':
        await showToolInteractive();
        break;

      case 'test':
        await testToolInteractive();
        break;

      case 'exec':
        await execToolInteractive();
        break;

      case 'filter':
        await filterToolsByCategory();
        break;

      case 'exit':
        return;
    }

    console.log(); // Add some spacing
  }
}

async function showToolInteractive() {
  try {
    const tools = toolRegistry.list();

    if (tools.length === 0) {
      console.log(kleur.gray('No tools available.'));
      return;
    }

    // Group tools by category for better organization
    const byCategory: Record<string, string[]> = {};
    const choices: Array<{item: string, icon: string, name: string, description: string}> = [];

    for (const toolName of tools) {
      const tool = toolRegistry.get(toolName)!;
      const category = tool.metadata?.category || "uncategorized";
      const approvalIcon = tool.safety?.require_approval ? "🔐" : "✅";

      choices.push({
        item: toolName,
        icon: approvalIcon,
        name: tool.name,
        description: `${category} - ${tool.description}`
      });
    }

    const selectedTool = await DropdownHelpers.selectOne({
      message: 'Which tool would you like to view?',
      choices: DropdownHelpers.createIconChoices(choices)
    });

    if (selectedTool) {
      await showTool(selectedTool);
    }

  } catch (error: any) {
    console.error(kleur.red('Error showing tool:'), error.message);
  }
}

async function testToolInteractive() {
  try {
    const tools = toolRegistry.list();

    if (tools.length === 0) {
      console.log(kleur.gray('No tools available to test.'));
      return;
    }

    const choices = tools.map(toolName => {
      const tool = toolRegistry.get(toolName)!;
      const category = tool.metadata?.category || "uncategorized";
      return {
        item: toolName,
        icon: '🧪',
        name: tool.name,
        description: `${category} - Test execution (dry run)`
      };
    });

    const selectedTool = await DropdownHelpers.selectOne({
      message: 'Which tool would you like to test?',
      choices: DropdownHelpers.createIconChoices(choices)
    });

    if (!selectedTool) return;

    const tool = toolRegistry.get(selectedTool)!;
    const params = await getToolParametersInteractive(tool);

    console.log(kleur.cyan(`\n🧪 Testing tool: ${selectedTool} (dry run)`));
    console.log("Parameters:", params);
    console.log("Note: This would execute the tool with the given parameters");

    if (tool.safety?.require_approval) {
      console.log(kleur.yellow("⚠️  This tool requires approval in normal execution"));
    }

  } catch (error: any) {
    console.error(kleur.red('Error testing tool:'), error.message);
  }
}

async function execToolInteractive() {
  try {
    const tools = toolRegistry.list();

    if (tools.length === 0) {
      console.log(kleur.gray('No tools available to execute.'));
      return;
    }

    const choices = tools.map(toolName => {
      const tool = toolRegistry.get(toolName)!;
      const category = tool.metadata?.category || "uncategorized";
      const approvalIcon = tool.safety?.require_approval ? "🔐" : "⚡";

      return {
        item: toolName,
        icon: approvalIcon,
        name: tool.name,
        description: `${category} - ${tool.description}`
      };
    });

    const selectedTool = await DropdownHelpers.selectOne({
      message: 'Which tool would you like to execute?',
      choices: DropdownHelpers.createIconChoices(choices)
    });

    if (!selectedTool) return;

    const tool = toolRegistry.get(selectedTool)!;

    if (tool.safety?.require_approval) {
      const confirmed = await DropdownHelpers.confirm(
        kleur.yellow(`This tool requires approval. Continue with execution?`),
        false
      );
      if (!confirmed) {
        console.log(kleur.gray('Tool execution cancelled.'));
        return;
      }
    }

    const params = await getToolParametersInteractive(tool);

    console.log(kleur.cyan(`\n⚡ Executing tool: ${selectedTool}`));
    console.log("Parameters:", params);

    const context: ExecutionContext = {
      sessionId: `interactive-${Date.now()}`,
      workingDirectory: process.cwd(),
      config: { autoApprove: false },
      traceEnabled: process.env.METIS_TRACE === 'true',
      verboseEnabled: process.env.METIS_VERBOSE === 'true'
    };

    const result = await toolRegistry.execute(selectedTool, params, context);

    if (result.success) {
      console.log(kleur.green("✅ Success"));
      if (result.content) {
        console.log("\nResult:");
        console.log(typeof result.content === 'string' ? result.content : JSON.stringify(result.content, null, 2));
      }
      if (result.metadata) {
        console.log("\nMetadata:", result.metadata);
      }
    } else {
      console.log(kleur.red("❌ Failed"));
      console.error("Error:", result.error);
    }

  } catch (error: any) {
    console.error(kleur.red('Error executing tool:'), error.message);
  }
}

async function filterToolsByCategory() {
  try {
    const tools = toolRegistry.list();
    const categories = new Set<string>();

    // Collect all categories
    for (const toolName of tools) {
      const tool = toolRegistry.get(toolName)!;
      categories.add(tool.metadata?.category || "uncategorized");
    }

    const choices = Array.from(categories).map(category => ({
      item: category,
      icon: '📁',
      name: category,
      description: `View tools in ${category} category`
    }));

    const selectedCategory = await DropdownHelpers.selectOne({
      message: 'Which category would you like to view?',
      choices: DropdownHelpers.createIconChoices(choices)
    });

    if (!selectedCategory) return;

    console.log(kleur.cyan(`\n📁 Tools in category: ${selectedCategory}`));

    const categoryTools = tools.filter(toolName => {
      const tool = toolRegistry.get(toolName)!;
      const category = tool.metadata?.category || "uncategorized";
      return category === selectedCategory;
    });

    for (const toolName of categoryTools) {
      const tool = toolRegistry.get(toolName)!;
      const approvalIcon = tool.safety?.require_approval ? "🔐" : "✅";
      const ciIcon = tool.safety?.allowed_in_ci !== false ? "🤖" : "🚫";
      console.log(`  ${approvalIcon}${ciIcon} ${tool.name} - ${tool.description}`);
    }

    console.log(`\nLegend: 🔐=requires approval, ✅=auto-approved, 🤖=CI allowed, 🚫=CI blocked`);

  } catch (error: any) {
    console.error(kleur.red('Error filtering tools:'), error.message);
  }
}

async function getToolParametersInteractive(tool: any): Promise<Record<string, any>> {
  const params: Record<string, any> = {};

  if (!tool.schema || !tool.schema.properties) {
    const hasParams = await DropdownHelpers.confirm('This tool has no defined parameters. Add custom parameters?', false);

    if (hasParams) {
      while (true) {
        const key = await DropdownHelpers.inputText({
          message: 'Enter parameter name (or press Enter to finish):',
          default: ''
        });

        if (!key.trim()) break;

        const value = await DropdownHelpers.inputText({
          message: `Enter value for ${key}:`,
          validate: (input) => input.trim() ? true : 'Value is required'
        });

        params[key] = value;
      }
    }

    return params;
  }

  // Handle defined parameters
  const properties = tool.schema.properties as Record<string, any>;
  const required = tool.schema.required || [];

  for (const [paramName, spec] of Object.entries(properties)) {
    const isRequired = required.includes(paramName);
    const defaultValue = spec.default !== undefined ? spec.default.toString() : undefined;

    if (isRequired || await DropdownHelpers.confirm(`Set parameter "${paramName}"? ${spec.description || ''}`, isRequired)) {
      let value: any;

      if (spec.type === 'boolean') {
        value = await DropdownHelpers.confirm(`${paramName}:`, defaultValue === 'true');
      } else if (spec.enum && spec.enum.length > 0) {
        value = await DropdownHelpers.selectOne({
          message: `Select ${paramName}:`,
          choices: spec.enum.map((option: any) => ({
            name: option.toString(),
            value: option
          })),
          defaultValue: defaultValue
        });
      } else {
        value = await DropdownHelpers.inputText({
          message: `Enter ${paramName}${spec.description ? ` (${spec.description})` : ''}:`,
          default: defaultValue,
          validate: isRequired ? (input) => input.trim() ? true : `${paramName} is required` : undefined
        });

        // Convert to appropriate type
        if (spec.type === 'number') {
          value = parseFloat(value);
        } else if (spec.type === 'integer') {
          value = parseInt(value);
        }
      }

      params[paramName] = value;
    }
  }

  return params;
}