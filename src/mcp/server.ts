import { EventEmitter } from 'events';
import { 
  MCPMessage, 
  MCPRequest, 
  MCPResponse, 
  MCPNotification,
  MCPError,
  MCPConnection,
  MCPServerConfig,
  MCPResource,
  MCPResourceContent,
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  MCPPrompt,
  MCPPromptMessage,
  MCPErrorCodes
} from './types';

export interface MCPResourceProvider {
  listResources(): Promise<MCPResource[]>;
  getResource(uri: string): Promise<MCPResourceContent>;
}

export interface MCPToolProvider {
  listTools(): Promise<MCPTool[]>;
  callTool(call: MCPToolCall): Promise<MCPToolResult>;
}

export interface MCPPromptProvider {
  listPrompts(): Promise<MCPPrompt[]>;
  getPrompt(name: string, args?: Record<string, any>): Promise<MCPPromptMessage[]>;
}

export class MCPServer extends EventEmitter {
  private connections: Set<MCPConnection> = new Set();
  private resourceProviders: Map<string, MCPResourceProvider> = new Map();
  private toolProviders: Map<string, MCPToolProvider> = new Map();
  private promptProviders: Map<string, MCPPromptProvider> = new Map();
  private isInitialized = false;

  constructor(private config: MCPServerConfig) {
    super();
  }

  // Server Management
  async addConnection(connection: MCPConnection): Promise<void> {
    this.connections.add(connection);
    this.emit('connectionAdded', connection);
  }

  async removeConnection(connection: MCPConnection): Promise<void> {
    this.connections.delete(connection);
    this.emit('connectionRemoved', connection);
  }

  // Provider Registration
  registerResourceProvider(namespace: string, provider: MCPResourceProvider): void {
    this.resourceProviders.set(namespace, provider);
    this.notifyResourcesUpdated();
  }

  registerToolProvider(namespace: string, provider: MCPToolProvider): void {
    this.toolProviders.set(namespace, provider);
    this.notifyToolsUpdated();
  }

  registerPromptProvider(namespace: string, provider: MCPPromptProvider): void {
    this.promptProviders.set(namespace, provider);
    this.notifyPromptsUpdated();
  }

  // Message Handling
  async handleMessage(connection: MCPConnection, message: MCPMessage): Promise<void> {
    try {
      if (this.isRequest(message)) {
        await this.handleRequest(connection, message);
      } else if (this.isNotification(message)) {
        await this.handleNotification(connection, message);
      }
    } catch (error: any) {
      this.emit('error', error);
    }
  }

  private isRequest(message: MCPMessage): message is MCPRequest {
    return message.id !== undefined && message.method !== undefined;
  }

  private isNotification(message: MCPMessage): message is MCPNotification {
    return message.id === undefined && message.method !== undefined;
  }

  private async handleRequest(connection: MCPConnection, request: MCPRequest): Promise<void> {
    let response: MCPResponse;

    try {
      switch (request.method) {
        case 'initialize':
          response = await this.handleInitialize(request);
          break;
        
        case 'resources/list':
          response = await this.handleListResources(request);
          break;
        
        case 'resources/read':
          response = await this.handleReadResource(request);
          break;
        
        case 'tools/list':
          response = await this.handleListTools(request);
          break;
        
        case 'tools/call':
          response = await this.handleCallTool(request);
          break;
        
        case 'prompts/list':
          response = await this.handleListPrompts(request);
          break;
        
        case 'prompts/get':
          response = await this.handleGetPrompt(request);
          break;
        
        case 'ping':
          response = {
            jsonrpc: "2.0",
            id: request.id!,
            result: { pong: true, timestamp: new Date().toISOString() }
          };
          break;
        
        default:
          response = {
            jsonrpc: "2.0",
            id: request.id!,
            error: {
              code: MCPErrorCodes.METHOD_NOT_FOUND,
              message: `Method not found: ${request.method}`
            }
          };
      }
    } catch (error: any) {
      response = {
        jsonrpc: "2.0",
        id: request.id!,
        error: {
          code: MCPErrorCodes.INTERNAL_ERROR,
          message: error.message,
          data: { method: request.method }
        }
      };
    }

    await connection.send(response);
  }

  private async handleNotification(
    connection: MCPConnection, 
    notification: MCPNotification
  ): Promise<void> {
    switch (notification.method) {
      case 'notifications/initialized':
        this.isInitialized = true;
        this.emit('initialized', connection);
        break;
      
      case 'notifications/cancelled':
        this.emit('requestCancelled', notification.params);
        break;
      
      default:
        this.emit('notification', notification.method, notification.params);
    }
  }

  // Protocol Method Handlers
  private async handleInitialize(request: MCPRequest): Promise<MCPResponse> {
    const params = request.params || {};
    
    return {
      jsonrpc: "2.0",
      id: request.id!,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: this.config.capabilities,
        serverInfo: {
          name: this.config.name,
          version: this.config.version,
          description: this.config.description,
          author: this.config.author,
          homepage: this.config.homepage
        }
      }
    };
  }

  private async handleListResources(request: MCPRequest): Promise<MCPResponse> {
    if (!this.config.capabilities.resources) {
      return {
        jsonrpc: "2.0",
        id: request.id!,
        error: {
          code: MCPErrorCodes.METHOD_NOT_FOUND,
          message: "Resources not supported by this server"
        }
      };
    }

    try {
      const allResources: MCPResource[] = [];
      
      for (const provider of this.resourceProviders.values()) {
        const resources = await provider.listResources();
        allResources.push(...resources);
      }

      return {
        jsonrpc: "2.0",
        id: request.id!,
        result: {
          resources: allResources
        }
      };
    } catch (error: any) {
      return {
        jsonrpc: "2.0",
        id: request.id!,
        error: {
          code: MCPErrorCodes.INTERNAL_ERROR,
          message: `Failed to list resources: ${error.message}`
        }
      };
    }
  }

  private async handleReadResource(request: MCPRequest): Promise<MCPResponse> {
    if (!this.config.capabilities.resources) {
      return {
        jsonrpc: "2.0",
        id: request.id!,
        error: {
          code: MCPErrorCodes.METHOD_NOT_FOUND,
          message: "Resources not supported by this server"
        }
      };
    }

    const { uri } = request.params || {};
    if (!uri) {
      return {
        jsonrpc: "2.0",
        id: request.id!,
        error: {
          code: MCPErrorCodes.INVALID_PARAMS,
          message: "Missing required parameter: uri"
        }
      };
    }

    try {
      let resourceContent: MCPResourceContent | null = null;
      
      for (const provider of this.resourceProviders.values()) {
        try {
          resourceContent = await provider.getResource(uri);
          if (resourceContent) break;
        } catch {
          // Continue to next provider
        }
      }

      if (!resourceContent) {
        return {
          jsonrpc: "2.0",
          id: request.id!,
          error: {
            code: MCPErrorCodes.RESOURCE_NOT_FOUND,
            message: `Resource not found: ${uri}`
          }
        };
      }

      return {
        jsonrpc: "2.0",
        id: request.id!,
        result: {
          contents: [resourceContent]
        }
      };
    } catch (error: any) {
      return {
        jsonrpc: "2.0",
        id: request.id!,
        error: {
          code: MCPErrorCodes.INTERNAL_ERROR,
          message: `Failed to read resource: ${error.message}`
        }
      };
    }
  }

  private async handleListTools(request: MCPRequest): Promise<MCPResponse> {
    if (!this.config.capabilities.tools) {
      return {
        jsonrpc: "2.0",
        id: request.id!,
        error: {
          code: MCPErrorCodes.METHOD_NOT_FOUND,
          message: "Tools not supported by this server"
        }
      };
    }

    try {
      const allTools: MCPTool[] = [];
      
      for (const provider of this.toolProviders.values()) {
        const tools = await provider.listTools();
        allTools.push(...tools);
      }

      return {
        jsonrpc: "2.0",
        id: request.id!,
        result: {
          tools: allTools
        }
      };
    } catch (error: any) {
      return {
        jsonrpc: "2.0",
        id: request.id!,
        error: {
          code: MCPErrorCodes.INTERNAL_ERROR,
          message: `Failed to list tools: ${error.message}`
        }
      };
    }
  }

  private async handleCallTool(request: MCPRequest): Promise<MCPResponse> {
    if (!this.config.capabilities.tools) {
      return {
        jsonrpc: "2.0",
        id: request.id!,
        error: {
          code: MCPErrorCodes.METHOD_NOT_FOUND,
          message: "Tools not supported by this server"
        }
      };
    }

    const { name, arguments: args } = request.params || {};
    if (!name) {
      return {
        jsonrpc: "2.0",
        id: request.id!,
        error: {
          code: MCPErrorCodes.INVALID_PARAMS,
          message: "Missing required parameter: name"
        }
      };
    }

    try {
      let toolResult: MCPToolResult | null = null;
      
      for (const provider of this.toolProviders.values()) {
        try {
          toolResult = await provider.callTool({ name, arguments: args || {} });
          if (toolResult) break;
        } catch (error: any) {
          // Return tool error
          return {
            jsonrpc: "2.0",
            id: request.id!,
            error: {
              code: MCPErrorCodes.TOOL_ERROR,
              message: `Tool execution failed: ${error.message}`,
              data: { tool: name }
            }
          };
        }
      }

      if (!toolResult) {
        return {
          jsonrpc: "2.0",
          id: request.id!,
          error: {
            code: MCPErrorCodes.METHOD_NOT_FOUND,
            message: `Tool not found: ${name}`
          }
        };
      }

      return {
        jsonrpc: "2.0",
        id: request.id!,
        result: toolResult
      };
    } catch (error: any) {
      return {
        jsonrpc: "2.0",
        id: request.id!,
        error: {
          code: MCPErrorCodes.INTERNAL_ERROR,
          message: `Failed to call tool: ${error.message}`
        }
      };
    }
  }

  private async handleListPrompts(request: MCPRequest): Promise<MCPResponse> {
    if (!this.config.capabilities.prompts) {
      return {
        jsonrpc: "2.0",
        id: request.id!,
        error: {
          code: MCPErrorCodes.METHOD_NOT_FOUND,
          message: "Prompts not supported by this server"
        }
      };
    }

    try {
      const allPrompts: MCPPrompt[] = [];
      
      for (const provider of this.promptProviders.values()) {
        const prompts = await provider.listPrompts();
        allPrompts.push(...prompts);
      }

      return {
        jsonrpc: "2.0",
        id: request.id!,
        result: {
          prompts: allPrompts
        }
      };
    } catch (error: any) {
      return {
        jsonrpc: "2.0",
        id: request.id!,
        error: {
          code: MCPErrorCodes.INTERNAL_ERROR,
          message: `Failed to list prompts: ${error.message}`
        }
      };
    }
  }

  private async handleGetPrompt(request: MCPRequest): Promise<MCPResponse> {
    if (!this.config.capabilities.prompts) {
      return {
        jsonrpc: "2.0",
        id: request.id!,
        error: {
          code: MCPErrorCodes.METHOD_NOT_FOUND,
          message: "Prompts not supported by this server"
        }
      };
    }

    const { name, arguments: args } = request.params || {};
    if (!name) {
      return {
        jsonrpc: "2.0",
        id: request.id!,
        error: {
          code: MCPErrorCodes.INVALID_PARAMS,
          message: "Missing required parameter: name"
        }
      };
    }

    try {
      let promptMessages: MCPPromptMessage[] | null = null;
      
      for (const provider of this.promptProviders.values()) {
        try {
          promptMessages = await provider.getPrompt(name, args || {});
          if (promptMessages) break;
        } catch {
          // Continue to next provider
        }
      }

      if (!promptMessages) {
        return {
          jsonrpc: "2.0",
          id: request.id!,
          error: {
            code: MCPErrorCodes.METHOD_NOT_FOUND,
            message: `Prompt not found: ${name}`
          }
        };
      }

      return {
        jsonrpc: "2.0",
        id: request.id!,
        result: {
          description: `Prompt: ${name}`,
          messages: promptMessages
        }
      };
    } catch (error: any) {
      return {
        jsonrpc: "2.0",
        id: request.id!,
        error: {
          code: MCPErrorCodes.INTERNAL_ERROR,
          message: `Failed to get prompt: ${error.message}`
        }
      };
    }
  }

  // Notification Methods
  private async notifyResourcesUpdated(): Promise<void> {
    await this.broadcast('notifications/resources/updated');
  }

  private async notifyToolsUpdated(): Promise<void> {
    await this.broadcast('notifications/tools/updated');
  }

  private async notifyPromptsUpdated(): Promise<void> {
    await this.broadcast('notifications/prompts/updated');
  }

  async sendMessage(message: string, level: 'debug' | 'info' | 'notice' | 'warning' | 'error' = 'info'): Promise<void> {
    await this.broadcast('notifications/message', {
      level,
      logger: this.config.name,
      data: message
    });
  }

  private async broadcast(method: string, params?: any): Promise<void> {
    const notification: MCPNotification = {
      jsonrpc: "2.0",
      method,
      params
    };

    await Promise.all(
      Array.from(this.connections).map(connection =>
        connection.send(notification).catch(error => {
          this.emit('connectionError', connection, error);
        })
      )
    );
  }

  // Cleanup
  async shutdown(): Promise<void> {
    const connections = Array.from(this.connections);
    await Promise.all(
      connections.map(connection => 
        this.removeConnection(connection).then(() => connection.close())
      )
    );
    this.connections.clear();
  }
}