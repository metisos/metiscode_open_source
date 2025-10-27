export { StdioTransport, StdioTransportConfig } from './stdio';
export { WebSocketTransport, WebSocketTransportConfig } from './websocket';
export { HttpTransport, HttpTransportConfig } from './http';

import { MCPConnection, MCPTransportType } from '../types';
import { StdioTransport, StdioTransportConfig } from './stdio';
import { WebSocketTransport, WebSocketTransportConfig } from './websocket';
import { HttpTransport, HttpTransportConfig } from './http';

export type TransportConfig = 
  | ({ type: 'stdio' } & StdioTransportConfig)
  | ({ type: 'websocket' } & WebSocketTransportConfig)
  | ({ type: 'http' } & HttpTransportConfig);

export function createTransport(config: TransportConfig): MCPConnection {
  switch (config.type) {
    case 'stdio':
      return new StdioTransport({
        command: config.command,
        args: config.args,
        env: config.env,
        cwd: config.cwd
      });
    
    case 'websocket':
      return new WebSocketTransport({
        url: config.url,
        protocols: config.protocols,
        headers: config.headers,
        reconnectAttempts: config.reconnectAttempts,
        reconnectDelay: config.reconnectDelay
      });
    
    case 'http':
      return new HttpTransport({
        endpoint: config.endpoint,
        headers: config.headers,
        timeout: config.timeout,
        method: config.method
      });
    
    default:
      throw new Error(`Unknown transport type: ${(config as any).type}`);
  }
}