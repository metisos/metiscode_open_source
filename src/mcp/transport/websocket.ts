import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { MCPMessage, MCPConnection } from '../types';

export interface WebSocketTransportConfig {
  url: string;
  protocols?: string[];
  headers?: Record<string, string>;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export class WebSocketTransport extends EventEmitter implements MCPConnection {
  private ws: WebSocket | null = null;
  private connected = false;
  private reconnectCount = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(private config: WebSocketTransportConfig) {
    super();
    this.config.reconnectAttempts = this.config.reconnectAttempts ?? 3;
    this.config.reconnectDelay = this.config.reconnectDelay ?? 1000;
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.url, this.config.protocols, {
          headers: this.config.headers
        });

        this.ws.on('open', () => {
          this.connected = true;
          this.reconnectCount = 0;
          this.emit('connect');
          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            const message: MCPMessage = JSON.parse(data.toString());
            this.emit('message', message);
          } catch (error) {
            this.emit('error', new Error(`Invalid JSON: ${data.toString()}`));
          }
        });

        this.ws.on('error', (error) => {
          this.emit('error', error);
          if (!this.isConnected) {
            reject(error);
          } else {
            this.handleDisconnect();
          }
        });

        this.ws.on('close', (code, reason) => {
          this.connected = false;
          this.emit('disconnect', { code, reason: reason.toString() });
          
          if (this.shouldReconnect(code)) {
            this.scheduleReconnect();
          }
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  async send(message: MCPMessage): Promise<void> {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Transport not connected');
    }

    const jsonMessage = JSON.stringify(message);
    
    return new Promise((resolve, reject) => {
      this.ws!.send(jsonMessage, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async close(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (!this.isConnected || !this.ws) {
      return;
    }

    return new Promise((resolve) => {
      if (this.ws) {
        this.ws.on('close', () => {
          this.connected = false;
          this.emit('disconnect');
          resolve();
        });

        // Close WebSocket connection
        this.ws.close(1000, 'Client disconnect');
      } else {
        resolve();
      }
    });
  }

  isConnected(): boolean {
    return this.connected && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private handleDisconnect(): void {
    this.connected = false;
    if (this.reconnectCount < this.config.reconnectAttempts!) {
      this.scheduleReconnect();
    }
  }

  private shouldReconnect(code: number): boolean {
    // Don't reconnect on normal closure or policy violations
    return code !== 1000 && code !== 1008 && this.reconnectCount < this.config.reconnectAttempts!;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    const delay = this.config.reconnectDelay! * Math.pow(2, this.reconnectCount);
    
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.reconnectCount++;
      
      try {
        await this.connect();
      } catch (error) {
        this.emit('reconnectFailed', error);
        
        if (this.reconnectCount < this.config.reconnectAttempts!) {
          this.scheduleReconnect();
        }
      }
    }, delay);
  }
}