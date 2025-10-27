import { EventEmitter } from 'events';
import { MCPMessage, MCPConnection } from '../types';

export interface HttpTransportConfig {
  endpoint: string;
  headers?: Record<string, string>;
  timeout?: number;
  method?: 'POST' | 'PUT';
}

export class HttpTransport extends EventEmitter implements MCPConnection {
  private connected = false;

  constructor(private config: HttpTransportConfig) {
    super();
    this.config.timeout = this.config.timeout ?? 30000;
    this.config.method = this.config.method ?? 'POST';
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      // Test connection with a ping request
      const testResponse = await this.makeRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "ping"
      });

      this.connected = true;
      this.emit('connect');
    } catch (error) {
      throw new Error(`HTTP transport connection failed: ${error}`);
    }
  }

  async send(message: MCPMessage): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Transport not connected');
    }

    try {
      const response = await this.makeRequest(message);
      
      // For HTTP transport, we emit the response immediately
      if (response) {
        this.emit('message', response);
      }
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    this.connected = false;
    this.emit('disconnect');
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async makeRequest(message: MCPMessage): Promise<MCPMessage | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(this.config.endpoint, {
        method: this.config.method,
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers
        },
        body: JSON.stringify(message),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseText = await response.text();
      
      if (!responseText.trim()) {
        return null; // No response body
      }

      try {
        return JSON.parse(responseText) as MCPMessage;
      } catch (parseError) {
        throw new Error(`Invalid JSON response: ${responseText}`);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      
      throw error;
    }
  }
}