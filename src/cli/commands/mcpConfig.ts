import fs from "fs";
import path from "path";
import { loadConfig } from "../../config";
import { getMCPClient } from "../../mcp/mcpManager";
import { DropdownHelpers } from "../dropdowns/DropdownHelpers";
import kleur from "kleur";

export async function runMcpConfig(args: string[]) {
  try {
    // If args provided, check if it's a direct command
    if (args.length > 0) {
      const action = args[0];
      const cwd = process.cwd();
      const mcpConfigPath = path.join(cwd, ".metis", "mcp-servers.json");

      // Handle direct commands for backwards compatibility or automation
      switch (action) {
        case "show":
        case "list":
          await showMCPServers();
          return;
        case "add":
          await addMCPServer(args.slice(1), mcpConfigPath);
          return;
        case "remove":
        case "rm":
          await removeMCPServer(args.slice(1), mcpConfigPath);
          return;
        case "connect":
          await connectMCPServer(args.slice(1));
          return;
        case "disconnect":
          await disconnectMCPServer(args.slice(1));
          return;
        case "test":
          await testMCPServer(args.slice(1));
          return;
        default:
          // Invalid action, fall through to interactive mode
          break;
      }
    }

    // Interactive mode - show main menu
    await runInteractiveMcpMenu();

  } catch (error: any) {
    DropdownHelpers.handleError(error, 'MCP management');
    process.exitCode = 1;
  }
}

async function showMCPServers() {
  try {
    const client = getMCPClient();
    const servers = client.getConnectedServers();
    const configPath = path.join(process.cwd(), ".metis", "mcp-servers.json");
    
    // Load stored configurations
    let storedConfigs: any = {};
    if (fs.existsSync(configPath)) {
      try {
        storedConfigs = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch (error) {
        console.log("Warning: Could not parse MCP servers config");
      }
    }
    
    console.log("MCP Servers:");
    
    if (Object.keys(storedConfigs).length === 0) {
      console.log("  No MCP servers configured");
      return;
    }
    
    for (const [id, config] of Object.entries(storedConfigs)) {
      const connectedServer = servers.find(s => s.id === id);
      const status = connectedServer ? connectedServer.status : "not connected";
      const configData = config as any;
      
      console.log(`  ${id}:`);
      console.log(`    Name: ${configData.serverConfig?.name || 'Unknown'}`);
      console.log(`    Version: ${configData.serverConfig?.version || 'Unknown'}`);
      console.log(`    Transport: ${configData.transport?.type || 'Unknown'}`);
      console.log(`    Status: ${status}`);
      
      if (connectedServer?.lastError) {
        console.log(`    Last Error: ${connectedServer.lastError}`);
      }
      
      const capabilities = configData.serverConfig?.capabilities;
      if (capabilities) {
        const caps = [];
        if (capabilities.resources) caps.push("resources");
        if (capabilities.tools) caps.push("tools");
        if (capabilities.prompts) caps.push("prompts");
        if (capabilities.logging) caps.push("logging");
        console.log(`    Capabilities: ${caps.join(", ") || "none"}`);
      }
      console.log("");
    }
  } catch (error: any) {
    console.error("Error showing MCP servers:", error.message);
  }
}

async function addMCPServer(args: string[], configPath: string) {
  if (args.length < 2) {
    console.log("Error: Please specify server ID and configuration");
    console.log("Usage: metiscode mcp add <id> <config-json>");
    return;
  }
  
  const [serverId, configJson] = args;
  
  try {
    const serverConfig = JSON.parse(configJson);
    
    // Validate required fields
    if (!serverConfig.name || !serverConfig.version || !serverConfig.description) {
      console.log("Error: Server config must include name, version, and description");
      return;
    }
    
    if (!serverConfig.capabilities) {
      console.log("Error: Server config must include capabilities object");
      return;
    }
    
    if (!serverConfig.transport || !serverConfig.transport.type) {
      console.log("Error: Server config must include transport configuration");
      return;
    }
    
    // Validate transport type
    const validTransports = ["stdio", "websocket", "http"];
    if (!validTransports.includes(serverConfig.transport.type)) {
      console.log(`Error: Transport type must be one of: ${validTransports.join(", ")}`);
      return;
    }
    
    // Ensure .metis directory exists
    const metisDir = path.dirname(configPath);
    if (!fs.existsSync(metisDir)) {
      fs.mkdirSync(metisDir, { recursive: true });
    }
    
    // Load existing configurations
    let configs: any = {};
    if (fs.existsSync(configPath)) {
      try {
        configs = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch (error) {
        console.log("Warning: Could not parse existing MCP config, creating new one");
      }
    }
    
    // Add the new server configuration
    configs[serverId] = {
      serverConfig: {
        name: serverConfig.name,
        version: serverConfig.version,
        description: serverConfig.description,
        author: serverConfig.author,
        homepage: serverConfig.homepage,
        capabilities: serverConfig.capabilities
      },
      transport: serverConfig.transport
    };
    
    // Save configurations
    fs.writeFileSync(configPath, JSON.stringify(configs, null, 2) + "\n");
    
    console.log(`MCP server '${serverId}' added successfully`);
    console.log(`Configuration saved to: ${configPath}`);
    console.log(`\nTo connect: metiscode mcp connect ${serverId}`);
    
  } catch (error: any) {
    if (error.name === "SyntaxError") {
      console.log("Error: Invalid JSON configuration");
      console.log("Make sure to properly escape quotes in JSON");
    } else {
      console.log(`Error adding MCP server: ${error.message}`);
    }
  }
}

async function removeMCPServer(args: string[], configPath: string) {
  if (args.length < 1) {
    console.log("Error: Please specify server ID");
    console.log("Usage: metiscode mcp remove <id>");
    return;
  }
  
  const serverId = args[0];
  
  try {
    if (!fs.existsSync(configPath)) {
      console.log("No MCP servers configured");
      return;
    }
    
    const configs = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    if (!configs[serverId]) {
      console.log(`MCP server '${serverId}' not found`);
      return;
    }
    
    // Disconnect if connected
    const client = getMCPClient();
    try {
      await client.unregisterServer(serverId);
    } catch (error) {
      // Server might not be connected, that's okay
    }
    
    // Remove from configuration
    delete configs[serverId];
    
    // Save updated configurations
    fs.writeFileSync(configPath, JSON.stringify(configs, null, 2) + "\n");
    
    console.log(`MCP server '${serverId}' removed successfully`);
    
  } catch (error: any) {
    console.log(`Error removing MCP server: ${error.message}`);
  }
}

async function connectMCPServer(args: string[]) {
  if (args.length < 1) {
    console.log("Error: Please specify server ID");
    console.log("Usage: metiscode mcp connect <id>");
    return;
  }
  
  const serverId = args[0];
  const configPath = path.join(process.cwd(), ".metis", "mcp-servers.json");
  
  try {
    if (!fs.existsSync(configPath)) {
      console.log("No MCP servers configured");
      console.log("Use 'metiscode mcp add' to add a server first");
      return;
    }
    
    const configs = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const serverConfig = configs[serverId];
    
    if (!serverConfig) {
      console.log(`MCP server '${serverId}' not found in configuration`);
      console.log("Use 'metiscode mcp list' to see available servers");
      return;
    }
    
    const client = getMCPClient();
    
    // Check if already connected
    const existingServer = client.getServerById(serverId);
    if (existingServer && existingServer.status === "connected") {
      console.log(`MCP server '${serverId}' is already connected`);
      return;
    }
    
    console.log(`Connecting to MCP server '${serverId}'...`);
    
    const { createTransport } = await import("../../mcp/transport");
    const connection = createTransport(serverConfig.transport);
    
    await connection.connect();
    await client.registerServer(serverId, serverConfig.serverConfig, connection);
    
    console.log(`Successfully connected to MCP server '${serverId}'`);
    console.log(`Server: ${serverConfig.serverConfig.name} v${serverConfig.serverConfig.version}`);
    
  } catch (error: any) {
    console.log(`Error connecting to MCP server '${serverId}': ${error.message}`);
  }
}

async function disconnectMCPServer(args: string[]) {
  if (args.length < 1) {
    console.log("Error: Please specify server ID");
    console.log("Usage: metiscode mcp disconnect <id>");
    return;
  }
  
  const serverId = args[0];
  
  try {
    const client = getMCPClient();
    await client.unregisterServer(serverId);
    console.log(`Disconnected from MCP server '${serverId}'`);
  } catch (error: any) {
    console.log(`Error disconnecting from MCP server '${serverId}': ${error.message}`);
  }
}

async function testMCPServer(args: string[]) {
  if (args.length < 1) {
    console.log("Error: Please specify server ID");
    console.log("Usage: metiscode mcp test <id>");
    return;
  }
  
  const serverId = args[0];
  
  try {
    const client = getMCPClient();
    const server = client.getServerById(serverId);
    
    if (!server) {
      console.log(`MCP server '${serverId}' not found`);
      console.log("Use 'metiscode mcp connect <id>' to connect first");
      return;
    }
    
    if (server.status !== "connected") {
      console.log(`MCP server '${serverId}' is not connected (status: ${server.status})`);
      return;
    }
    
    console.log(`Testing MCP server '${serverId}'...`);
    
    // Test capabilities
    const capabilities = server.config.capabilities;
    console.log(`\nCapabilities:`);
    
    if (capabilities.resources) {
      try {
        const resources = await client.listResources(serverId);
        console.log(`  Resources: ${resources.length} available`);
      } catch (error: any) {
        console.log(`  Resources: Error - ${error.message}`);
      }
    } else {
      console.log(`  Resources: Not supported`);
    }
    
    if (capabilities.tools) {
      try {
        const tools = await client.listTools(serverId);
        console.log(`  Tools: ${tools.length} available`);
        if (tools.length > 0) {
          console.log(`    Tool names: ${tools.map(t => t.name).join(", ")}`);
        }
      } catch (error: any) {
        console.log(`  Tools: Error - ${error.message}`);
      }
    } else {
      console.log(`  Tools: Not supported`);
    }
    
    if (capabilities.prompts) {
      try {
        const prompts = await client.listPrompts(serverId);
        console.log(`  Prompts: ${prompts.length} available`);
      } catch (error: any) {
        console.log(`  Prompts: Error - ${error.message}`);
      }
    } else {
      console.log(`  Prompts: Not supported`);
    }
    
    console.log(`\nMCP server '${serverId}' test completed successfully`);
    
  } catch (error: any) {
    console.log(`Error testing MCP server '${serverId}': ${error.message}`);
  }
}

async function runInteractiveMcpMenu() {
  const cwd = process.cwd();
  const mcpConfigPath = path.join(cwd, ".metis", "mcp-servers.json");

  while (true) {
    // Show current servers first
    console.log(kleur.cyan('\n🌐 MCP Server Management'));
    await showMCPServers();
    console.log();

    const action = await DropdownHelpers.selectOne({
      message: 'What would you like to do with MCP servers?',
      choices: DropdownHelpers.createIconChoices([
        { item: 'show', icon: '📋', name: 'Show servers', description: 'View all configured MCP servers' },
        { item: 'add', icon: '➕', name: 'Add server', description: 'Configure a new MCP server' },
        { item: 'connect', icon: '🔌', name: 'Connect server', description: 'Connect to a configured server' },
        { item: 'disconnect', icon: '🔌', name: 'Disconnect server', description: 'Disconnect from a connected server' },
        { item: 'test', icon: '🧪', name: 'Test server', description: 'Test server connection and capabilities' },
        { item: 'remove', icon: '🗑️', name: 'Remove server', description: 'Delete server configuration' },
        { item: 'exit', icon: '🚪', name: 'Exit', description: 'Return to main menu' }
      ])
    });

    switch (action) {
      case 'show':
        await showMCPServers();
        break;

      case 'add':
        await addMCPServerInteractive(mcpConfigPath);
        break;

      case 'connect':
        await connectMCPServerInteractive();
        break;

      case 'disconnect':
        await disconnectMCPServerInteractive();
        break;

      case 'test':
        await testMCPServerInteractive();
        break;

      case 'remove':
        await removeMCPServerInteractive(mcpConfigPath);
        break;

      case 'exit':
        return;
    }

    console.log(); // Add some spacing
  }
}

async function addMCPServerInteractive(configPath: string) {
  try {
    console.log(kleur.cyan('\n➕ Add MCP Server'));
    console.log(kleur.gray('Configure a new MCP (Model Context Protocol) server'));
    console.log();

    const serverId = await DropdownHelpers.inputText({
      message: 'Enter server ID (unique identifier):',
      validate: (input) => {
        if (!input.trim()) return 'Server ID is required';
        if (!/^[a-zA-Z0-9_-]+$/.test(input)) return 'Server ID can only contain letters, numbers, hyphens, and underscores';

        // Check if ID already exists
        if (fs.existsSync(configPath)) {
          try {
            const configs = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (configs[input]) return 'A server with this ID already exists';
          } catch (error) {
            // File might be corrupted, continue
          }
        }

        return true;
      },
      filter: (input) => input.trim()
    });

    const name = await DropdownHelpers.inputText({
      message: 'Enter server name:',
      validate: (input) => input.trim() ? true : 'Server name is required'
    });

    const description = await DropdownHelpers.inputText({
      message: 'Enter server description:',
      validate: (input) => input.trim() ? true : 'Server description is required'
    });

    const version = await DropdownHelpers.inputText({
      message: 'Enter server version:',
      default: '1.0.0',
      validate: (input) => input.trim() ? true : 'Version is required'
    });

    // Capabilities selection
    const capabilities = await DropdownHelpers.selectMultiple({
      message: 'Select server capabilities:',
      choices: [
        { name: 'Tools - Execute custom tools/functions', value: 'tools', checked: true },
        { name: 'Resources - Access files and data', value: 'resources', checked: false },
        { name: 'Prompts - Provide custom prompts', value: 'prompts', checked: false },
        { name: 'Logging - Server logging capabilities', value: 'logging', checked: false }
      ],
      validate: (answers) => answers.length > 0 ? true : 'Please select at least one capability'
    });

    // Transport configuration
    const transportType = await DropdownHelpers.selectOne({
      message: 'Select transport type:',
      choices: DropdownHelpers.createIconChoices([
        { item: 'stdio', icon: '💻', name: 'Stdio', description: 'Local process communication via stdin/stdout' },
        { item: 'websocket', icon: '🌐', name: 'WebSocket', description: 'WebSocket connection to remote server' },
        { item: 'http', icon: '🌍', name: 'HTTP', description: 'HTTP-based communication' }
      ])
    });

    let transport: any = { type: transportType };

    if (transportType === 'stdio') {
      const command = await DropdownHelpers.inputText({
        message: 'Enter command to run server:',
        default: 'node',
        validate: (input) => input.trim() ? true : 'Command is required'
      });

      const argsInput = await DropdownHelpers.inputText({
        message: 'Enter command arguments (space-separated):',
        default: 'server.js'
      });

      transport.command = command;
      transport.args = argsInput.split(' ').filter(arg => arg.trim());

    } else if (transportType === 'websocket') {
      const url = await DropdownHelpers.inputText({
        message: 'Enter WebSocket URL:',
        default: 'ws://localhost:8080',
        validate: (input) => {
          if (!input.trim()) return 'URL is required';
          if (!input.startsWith('ws://') && !input.startsWith('wss://')) {
            return 'WebSocket URL must start with ws:// or wss://';
          }
          return true;
        }
      });

      transport.url = url;

    } else if (transportType === 'http') {
      const baseUrl = await DropdownHelpers.inputText({
        message: 'Enter base HTTP URL:',
        default: 'http://localhost:3000',
        validate: (input) => {
          if (!input.trim()) return 'URL is required';
          if (!input.startsWith('http://') && !input.startsWith('https://')) {
            return 'HTTP URL must start with http:// or https://';
          }
          return true;
        }
      });

      transport.baseUrl = baseUrl;
    }

    // Build server configuration
    const serverConfig = {
      name,
      version,
      description,
      capabilities: capabilities.reduce((acc, cap) => ({ ...acc, [cap]: true }), {}),
      transport
    };

    // Show configuration preview
    console.log(kleur.cyan('\n📋 Configuration Preview:'));
    console.log(JSON.stringify(serverConfig, null, 2));
    console.log();

    const confirmed = await DropdownHelpers.confirm(
      `Add MCP server "${serverId}" with this configuration?`,
      true
    );

    if (confirmed) {
      await addMCPServer([serverId, JSON.stringify(serverConfig)], configPath);
    } else {
      console.log(kleur.gray('Server addition cancelled.'));
    }

  } catch (error: any) {
    console.error(kleur.red('Error adding MCP server:'), error.message);
  }
}

async function connectMCPServerInteractive() {
  try {
    const servers = getConfiguredServers();

    if (servers.length === 0) {
      console.log(kleur.gray('No MCP servers configured. Add a server first.'));
      return;
    }

    // Filter to show only disconnected servers
    const client = getMCPClient();
    const connectedServers = client.getConnectedServers();
    const disconnectedServers = servers.filter(server =>
      !connectedServers.find(connected => connected.id === server.id)
    );

    if (disconnectedServers.length === 0) {
      console.log(kleur.gray('All configured servers are already connected.'));
      return;
    }

    const choices = disconnectedServers.map(server => ({
      item: server.id,
      icon: '🔌',
      name: server.config.serverConfig.name,
      description: `${server.config.transport.type} - ${server.config.serverConfig.description}`
    }));

    const selectedServerId = await DropdownHelpers.selectOne({
      message: 'Which server would you like to connect to?',
      choices: DropdownHelpers.createIconChoices(choices)
    });

    if (selectedServerId) {
      await connectMCPServer([selectedServerId]);
    }

  } catch (error: any) {
    console.error(kleur.red('Error connecting MCP server:'), error.message);
  }
}

async function disconnectMCPServerInteractive() {
  try {
    const client = getMCPClient();
    const connectedServers = client.getConnectedServers();

    if (connectedServers.length === 0) {
      console.log(kleur.gray('No MCP servers are currently connected.'));
      return;
    }

    const choices = connectedServers.map(server => ({
      item: server.id,
      icon: '🔌',
      name: server.config.name,
      description: `Connected - ${server.status}`
    }));

    const selectedServerId = await DropdownHelpers.selectOne({
      message: 'Which server would you like to disconnect?',
      choices: DropdownHelpers.createIconChoices(choices)
    });

    if (selectedServerId) {
      await disconnectMCPServer([selectedServerId]);
    }

  } catch (error: any) {
    console.error(kleur.red('Error disconnecting MCP server:'), error.message);
  }
}

async function testMCPServerInteractive() {
  try {
    const client = getMCPClient();
    const connectedServers = client.getConnectedServers();

    if (connectedServers.length === 0) {
      console.log(kleur.gray('No MCP servers are currently connected. Connect a server first.'));
      return;
    }

    const choices = connectedServers.map(server => ({
      item: server.id,
      icon: '🧪',
      name: server.config.name,
      description: `${server.status} - Test capabilities`
    }));

    const selectedServerId = await DropdownHelpers.selectOne({
      message: 'Which server would you like to test?',
      choices: DropdownHelpers.createIconChoices(choices)
    });

    if (selectedServerId) {
      await testMCPServer([selectedServerId]);
    }

  } catch (error: any) {
    console.error(kleur.red('Error testing MCP server:'), error.message);
  }
}

async function removeMCPServerInteractive(configPath: string) {
  try {
    const servers = getConfiguredServers();

    if (servers.length === 0) {
      console.log(kleur.gray('No MCP servers configured.'));
      return;
    }

    const choices = servers.map(server => ({
      item: server.id,
      icon: '🗑️',
      name: server.config.serverConfig.name,
      description: `${server.config.transport.type} - ${server.config.serverConfig.description}`
    }));

    const selectedServerId = await DropdownHelpers.selectOne({
      message: 'Which server would you like to remove?',
      choices: DropdownHelpers.createIconChoices(choices)
    });

    if (!selectedServerId) return;

    const server = servers.find(s => s.id === selectedServerId);
    if (!server) return;

    const confirmed = await DropdownHelpers.confirm(
      kleur.red(`Are you sure you want to remove MCP server "${server.config.serverConfig.name}"?`),
      false
    );

    if (confirmed) {
      await removeMCPServer([selectedServerId], configPath);
    } else {
      console.log(kleur.gray('Server removal cancelled.'));
    }

  } catch (error: any) {
    console.error(kleur.red('Error removing MCP server:'), error.message);
  }
}

function getConfiguredServers(): Array<{id: string, config: any}> {
  const configPath = path.join(process.cwd(), ".metis", "mcp-servers.json");

  if (!fs.existsSync(configPath)) {
    return [];
  }

  try {
    const configs = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return Object.entries(configs).map(([id, config]) => ({ id, config }));
  } catch (error) {
    return [];
  }
}