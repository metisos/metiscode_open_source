// MCP Protocol Foundation Types
// Based on the Model Context Protocol specification

export interface MCPMessage {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

export interface MCPRequest extends MCPMessage {
  method: string;
  params?: any;
}

export interface MCPResponse extends MCPMessage {
  id: string | number;
  result?: any;
  error?: MCPError;
}

export interface MCPNotification extends MCPMessage {
  method: string;
  params?: any;
}

// MCP Server Configuration
export interface MCPServerConfig {
  name: string;
  version: string;
  description: string;
  author?: string;
  homepage?: string;
  capabilities: MCPServerCapabilities;
}

export interface MCPServerCapabilities {
  resources?: boolean;
  tools?: boolean;
  prompts?: boolean;
  logging?: boolean;
}

// MCP Resource Types
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string; // base64 encoded
}

// MCP Tool Types
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface MCPToolResult {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    resource?: string;
  }>;
  isError?: boolean;
}

// MCP Prompt Types
export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface MCPPromptMessage {
  role: "user" | "assistant" | "system";
  content: {
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    resource?: string;
  };
}

// MCP Client/Server Connection
export interface MCPConnection {
  send(message: MCPMessage): Promise<void>;
  close(): Promise<void>;
}

// MCP Transport Types
export type MCPTransportType = "stdio" | "websocket" | "http";

export interface MCPTransportConfig {
  type: MCPTransportType;
  options?: Record<string, any>;
}

// MCP Server Registry Entry
export interface MCPServerEntry {
  id: string;
  config: MCPServerConfig;
  transport: MCPTransportConfig;
  status: "connected" | "disconnected" | "error";
  lastError?: string;
  connection?: MCPConnection;
}

// MCP Error Codes (following JSON-RPC 2.0)
export const MCPErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  SERVER_ERROR: -32000,
  // MCP-specific error codes
  RESOURCE_NOT_FOUND: -32001,
  TOOL_ERROR: -32002,
  SECURITY_ERROR: -32003,
  CONNECTION_ERROR: -32004
} as const;