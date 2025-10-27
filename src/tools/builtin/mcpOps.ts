import { Tool } from "../registry";
import { createTransport, TransportConfig } from "../../mcp/transport";
import { MCPServerConfig } from "../../mcp/types";
import { getMCPClient } from "../../mcp/mcpManager";

export const connectMCPServerTool: Tool = {
  name: "connect_mcp_server",
  description: "Connect to an MCP server using stdio, websocket, or http transport",
  parameters: {
    type: "object",
    properties: {
      serverId: {
        type: "string",
        description: "Unique identifier for the server"
      },
      serverConfig: {
        type: "object",
        description: "MCP server configuration",
        properties: {
          name: { type: "string" },
          version: { type: "string" },
          description: { type: "string" },
          author: { type: "string" },
          homepage: { type: "string" },
          capabilities: {
            type: "object",
            properties: {
              resources: { type: "boolean" },
              tools: { type: "boolean" },
              prompts: { type: "boolean" },
              logging: { type: "boolean" }
            }
          }
        },
        required: ["name", "version", "description", "capabilities"]
      },
      transport: {
        type: "object",
        description: "Transport configuration",
        oneOf: [
          {
            properties: {
              type: { const: "stdio" },
              command: { type: "string" },
              args: { type: "array", items: { type: "string" } },
              env: { type: "object" },
              cwd: { type: "string" }
            },
            required: ["type", "command"]
          },
          {
            properties: {
              type: { const: "websocket" },
              url: { type: "string" },
              protocols: { type: "array", items: { type: "string" } },
              headers: { type: "object" },
              reconnectAttempts: { type: "number" },
              reconnectDelay: { type: "number" }
            },
            required: ["type", "url"]
          },
          {
            properties: {
              type: { const: "http" },
              endpoint: { type: "string" },
              headers: { type: "object" },
              timeout: { type: "number" },
              method: { enum: ["POST", "PUT"] }
            },
            required: ["type", "endpoint"]
          }
        ]
      }
    },
    required: ["serverId", "serverConfig", "transport"]
  },

  async execute(params: any) {
    const { serverId, serverConfig, transport } = params;
    const client = getMCPClient();

    try {
      const connection = createTransport(transport as TransportConfig);
      
      // Connect transport first
      await connection.connect();
      
      // Register server with client
      await client.registerServer(serverId, serverConfig as MCPServerConfig, connection);
      
      return {
        success: true,
        message: `Successfully connected to MCP server: ${serverId}`,
        server: {
          id: serverId,
          name: serverConfig.name,
          version: serverConfig.version,
          transport: transport.type
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to connect to MCP server ${serverId}: ${error.message}`
      };
    }
  }
};

export const listMCPServersTool: Tool = {
  name: "list_mcp_servers",
  description: "List all connected MCP servers",
  parameters: {
    type: "object",
    properties: {},
    required: []
  },

  async execute() {
    const client = getMCPClient();
    const servers = client.getConnectedServers();
    
    return {
      success: true,
      servers: servers.map(server => ({
        id: server.id,
        name: server.config.name,
        version: server.config.version,
        description: server.config.description,
        status: server.status,
        transport: server.transport.type,
        capabilities: server.config.capabilities,
        lastError: server.lastError
      }))
    };
  }
};

export const listMCPResourcesTool: Tool = {
  name: "list_mcp_resources",
  description: "List resources available from an MCP server",
  parameters: {
    type: "object",
    properties: {
      serverId: {
        type: "string",
        description: "ID of the MCP server to query"
      }
    },
    required: ["serverId"]
  },

  async execute(params: any) {
    const { serverId } = params;
    const client = getMCPClient();

    try {
      const resources = await client.listResources(serverId);
      
      return {
        success: true,
        serverId,
        resources: resources.map(resource => ({
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
          mimeType: resource.mimeType
        }))
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to list resources from server ${serverId}: ${error.message}`
      };
    }
  }
};

export const getMCPResourceTool: Tool = {
  name: "get_mcp_resource",
  description: "Get content of a specific resource from an MCP server",
  parameters: {
    type: "object",
    properties: {
      serverId: {
        type: "string",
        description: "ID of the MCP server"
      },
      uri: {
        type: "string",
        description: "URI of the resource to retrieve"
      }
    },
    required: ["serverId", "uri"]
  },

  async execute(params: any) {
    const { serverId, uri } = params;
    const client = getMCPClient();

    try {
      const content = await client.getResource(serverId, uri);
      
      return {
        success: true,
        serverId,
        uri,
        content: {
          mimeType: content.mimeType,
          text: content.text,
          blob: content.blob ? `[Base64 data: ${content.blob.length} chars]` : undefined
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to get resource ${uri} from server ${serverId}: ${error.message}`
      };
    }
  }
};

export const listMCPToolsTool: Tool = {
  name: "list_mcp_tools",
  description: "List tools available from an MCP server",
  parameters: {
    type: "object",
    properties: {
      serverId: {
        type: "string",
        description: "ID of the MCP server to query"
      }
    },
    required: ["serverId"]
  },

  async execute(params: any) {
    const { serverId } = params;
    const client = getMCPClient();

    try {
      const tools = await client.listTools(serverId);
      
      return {
        success: true,
        serverId,
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to list tools from server ${serverId}: ${error.message}`
      };
    }
  }
};

export const callMCPToolTool: Tool = {
  name: "call_mcp_tool",
  description: "Call a tool on an MCP server",
  parameters: {
    type: "object",
    properties: {
      serverId: {
        type: "string",
        description: "ID of the MCP server"
      },
      toolName: {
        type: "string",
        description: "Name of the tool to call"
      },
      arguments: {
        type: "object",
        description: "Arguments to pass to the tool"
      }
    },
    required: ["serverId", "toolName"]
  },

  async execute(params: any) {
    const { serverId, toolName, arguments: toolArgs = {} } = params;
    const client = getMCPClient();

    try {
      const result = await client.callTool(serverId, {
        name: toolName,
        arguments: toolArgs
      });
      
      return {
        success: true,
        serverId,
        toolName,
        result: {
          content: result.content,
          isError: result.isError
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to call tool ${toolName} on server ${serverId}: ${error.message}`
      };
    }
  }
};

export const disconnectMCPServerTool: Tool = {
  name: "disconnect_mcp_server",
  description: "Disconnect from an MCP server",
  parameters: {
    type: "object",
    properties: {
      serverId: {
        type: "string",
        description: "ID of the server to disconnect"
      }
    },
    required: ["serverId"]
  },

  async execute(params: any) {
    const { serverId } = params;
    const client = getMCPClient();

    try {
      await client.unregisterServer(serverId);
      
      return {
        success: true,
        message: `Successfully disconnected from MCP server: ${serverId}`
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to disconnect from server ${serverId}: ${error.message}`
      };
    }
  }
};