import { EventEmitter } from 'events';
import { 
  MCPMessage, 
  MCPRequest, 
  MCPResponse, 
  MCPNotification,
  MCPError,
  MCPConnection,
  MCPServerConfig,
  MCPServerEntry,
  MCPResource,
  MCPResourceContent,
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  MCPPrompt,
  MCPErrorCodes
} from './types';

export class MCPClient extends EventEmitter {
  private connections: Map<string, MCPServerEntry> = new Map();
  private requestId = 0;
  private pendingRequests: Map<string | number, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  constructor(private requestTimeout: number = 30000) {
    super();
  }

  // Server Management
  async registerServer(
    serverId: string, 
    config: MCPServerConfig, 
    connection: MCPConnection
  ): Promise<void> {
    const entry: MCPServerEntry = {
      id: serverId,
      config,
      transport: { type: 'websocket' }, // Default, can be overridden
      status: 'disconnected',
      connection
    };

    this.connections.set(serverId, entry);

    try {
      // Initialize connection
      await this.initializeServer(serverId);
      entry.status = 'connected';
      this.emit('serverConnected', serverId, config);
    } catch (error: any) {
      entry.status = 'error';
      entry.lastError = error.message;
      this.emit('serverError', serverId, error);
    }
  }

  async unregisterServer(serverId: string): Promise<void> {
    const entry = this.connections.get(serverId);
    if (entry?.connection) {
      await entry.connection.close();
    }
    
    this.connections.delete(serverId);
    this.emit('serverDisconnected', serverId);
  }

  getConnectedServers(): MCPServerEntry[] {
    return Array.from(this.connections.values()).filter(entry => 
      entry.status === 'connected'
    );
  }

  getServerById(serverId: string): MCPServerEntry | undefined {
    return this.connections.get(serverId);
  }

  // Protocol Methods
  private async initializeServer(serverId: string): Promise<void> {
    const entry = this.connections.get(serverId);
    if (!entry?.connection) {
      throw new Error(`Server ${serverId} not found or no connection`);
    }

    // Send initialize request
    const response = await this.sendRequest(serverId, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        resources: true,
        tools: true,
        prompts: true,
        logging: false
      },
      clientInfo: {
        name: 'metis-code',
        version: '0.4.0'
      }
    });

    if (response.error) {
      throw new Error(`Server initialization failed: ${response.error.message}`);
    }

    // Send initialized notification
    await this.sendNotification(serverId, 'notifications/initialized');
  }

  // Resource Operations
  async listResources(serverId: string): Promise<MCPResource[]> {
    const response = await this.sendRequest(serverId, 'resources/list');
    
    if (response.error) {
      throw new Error(`Failed to list resources: ${response.error.message}`);
    }

    return response.result?.resources || [];
  }

  async getResource(serverId: string, uri: string): Promise<MCPResourceContent> {
    const response = await this.sendRequest(serverId, 'resources/read', { uri });
    
    if (response.error) {
      throw new Error(`Failed to get resource: ${response.error.message}`);
    }

    return response.result?.contents?.[0];
  }

  // Tool Operations
  async listTools(serverId: string): Promise<MCPTool[]> {
    const response = await this.sendRequest(serverId, 'tools/list');
    
    if (response.error) {
      throw new Error(`Failed to list tools: ${response.error.message}`);
    }

    return response.result?.tools || [];
  }

  async callTool(
    serverId: string, 
    toolCall: MCPToolCall
  ): Promise<MCPToolResult> {
    const response = await this.sendRequest(serverId, 'tools/call', {
      name: toolCall.name,
      arguments: toolCall.arguments
    });
    
    if (response.error) {
      throw new Error(`Tool call failed: ${response.error.message}`);
    }

    return response.result;
  }

  // Prompt Operations
  async listPrompts(serverId: string): Promise<MCPPrompt[]> {
    const response = await this.sendRequest(serverId, 'prompts/list');
    
    if (response.error) {
      throw new Error(`Failed to list prompts: ${response.error.message}`);
    }

    return response.result?.prompts || [];
  }

  async getPrompt(
    serverId: string, 
    name: string, 
    args?: Record<string, any>
  ): Promise<MCPPromptMessage[]> {
    const response = await this.sendRequest(serverId, 'prompts/get', {
      name,
      arguments: args
    });
    
    if (response.error) {
      throw new Error(`Failed to get prompt: ${response.error.message}`);
    }

    return response.result?.messages || [];
  }

  // Low-level Protocol Methods
  private async sendRequest(
    serverId: string, 
    method: string, 
    params?: any
  ): Promise<MCPResponse> {
    const entry = this.connections.get(serverId);
    if (!entry?.connection) {
      throw new Error(`Server ${serverId} not connected`);
    }

    const id = ++this.requestId;
    const request: MCPRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, this.requestTimeout);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      entry.connection!.send(request).catch(error => {
        this.pendingRequests.delete(id);
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private async sendNotification(
    serverId: string, 
    method: string, 
    params?: any
  ): Promise<void> {
    const entry = this.connections.get(serverId);
    if (!entry?.connection) {
      throw new Error(`Server ${serverId} not connected`);
    }

    const notification: MCPNotification = {
      jsonrpc: "2.0",
      method,
      params
    };

    await entry.connection.send(notification);
  }

  // Handle incoming messages
  handleMessage(serverId: string, message: MCPMessage): void {
    try {
      if (this.isResponse(message)) {
        this.handleResponse(message);
      } else if (this.isNotification(message)) {
        this.handleNotification(serverId, message);
      } else if (this.isRequest(message)) {
        this.handleRequest(serverId, message as MCPRequest);
      }
    } catch (error: any) {
      this.emit('error', new Error(`Failed to handle message: ${error.message}`));
    }
  }

  private isResponse(message: MCPMessage): message is MCPResponse {
    return message.id !== undefined && 
           (message.result !== undefined || message.error !== undefined);
  }

  private isNotification(message: MCPMessage): message is MCPNotification {
    return message.id === undefined && message.method !== undefined;
  }

  private isRequest(message: MCPMessage): message is MCPRequest {
    return message.id !== undefined && message.method !== undefined;
  }

  private handleResponse(response: MCPResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(response.id);

      if (response.error) {
        pending.reject(new Error(response.error.message));
      } else {
        pending.resolve(response);
      }
    }
  }

  private handleNotification(serverId: string, notification: MCPNotification): void {
    this.emit('notification', serverId, notification.method, notification.params);
    
    // Handle specific notifications
    switch (notification.method) {
      case 'notifications/message':
        this.emit('serverMessage', serverId, notification.params);
        break;
      case 'notifications/resources/updated':
        this.emit('resourcesUpdated', serverId, notification.params);
        break;
      case 'notifications/tools/updated':
        this.emit('toolsUpdated', serverId, notification.params);
        break;
      case 'notifications/prompts/updated':
        this.emit('promptsUpdated', serverId, notification.params);
        break;
    }
  }

  private async handleRequest(serverId: string, request: MCPRequest): Promise<void> {
    // Handle requests from servers (if any)
    const entry = this.connections.get(serverId);
    if (!entry?.connection) return;

    let response: MCPResponse;

    try {
      switch (request.method) {
        case 'ping':
          response = {
            jsonrpc: "2.0",
            id: request.id!,
            result: { pong: true }
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
          message: error.message
        }
      };
    }

    await entry.connection.send(response);
  }

  // Cleanup
  async disconnect(): Promise<void> {
    const serverIds = Array.from(this.connections.keys());
    await Promise.all(
      serverIds.map(serverId => this.unregisterServer(serverId))
    );

    // Clear pending requests
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Client disconnected'));
    }
    this.pendingRequests.clear();
  }
}