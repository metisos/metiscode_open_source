export type Role = "system" | "user" | "assistant" | "tool";
export type Message = { 
  role: Role; 
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ProviderInit {
  model: string;
  apiKey?: string;
  temperature?: number;
}

export interface ProviderResponse {
  type: "text" | "tool_call";
  content: string;
  tool_calls?: ToolCall[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: any; // JSON Schema
}

export interface Provider {
  name: string;
  send(messages: Message[], opts?: { temperature?: number }): Promise<string>;
  sendWithTools(
    messages: Message[], 
    tools: FunctionDefinition[], 
    opts?: { temperature?: number; max_tokens?: number }
  ): Promise<ProviderResponse>;
  supportsTools(): boolean;
}

