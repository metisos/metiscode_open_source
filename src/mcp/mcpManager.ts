import { MCPClient } from './client';

// Global MCP client instance
let mcpClient: MCPClient | null = null;

export function getMCPClient(): MCPClient {
  if (!mcpClient) {
    mcpClient = new MCPClient(30000); // 30 second timeout
    
    // Set up event listeners
    mcpClient.on('serverConnected', (serverId: string, config: any) => {
      if (process.env.METIS_VERBOSE === 'true') {
        console.log(`MCP server connected: ${serverId} (${config.name})`);
      }
    });
    
    mcpClient.on('serverDisconnected', (serverId: string) => {
      if (process.env.METIS_VERBOSE === 'true') {
        console.log(`MCP server disconnected: ${serverId}`);
      }
    });
    
    mcpClient.on('serverError', (serverId: string, error: any) => {
      console.error(`MCP server error (${serverId}):`, error.message);
    });
    
    mcpClient.on('serverMessage', (serverId: string, params: any) => {
      if (params.level === 'error') {
        console.error(`MCP ${serverId}:`, params.data);
      } else if (params.level === 'warning') {
        console.warn(`MCP ${serverId}:`, params.data);
      } else if (process.env.METIS_VERBOSE === 'true') {
        console.log(`MCP ${serverId}:`, params.data);
      }
    });
  }
  
  return mcpClient;
}

export function resetMCPClient(): void {
  if (mcpClient) {
    mcpClient.disconnect().catch(console.error);
    mcpClient = null;
  }
}

// Auto-cleanup on process exit
process.on('exit', () => {
  resetMCPClient();
});

process.on('SIGINT', () => {
  resetMCPClient();
  process.exit(0);
});

process.on('SIGTERM', () => {
  resetMCPClient();
  process.exit(0);
});