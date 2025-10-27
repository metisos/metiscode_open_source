import OpenAI from "openai";
import { Message, Provider, ProviderInit, ProviderResponse, FunctionDefinition, ToolCall } from "./types";
import { MetisError } from "../errors/MetisError";

export class OpenAIProvider implements Provider {
  public readonly name = "openai";
  private client: OpenAI;
  private model: string;
  private temperature: number | undefined;

  constructor(init: ProviderInit) {
    if (!init.apiKey) {
      console.error('❌ OpenAI API key not configured');
      console.error('To fix this, run: metiscode config set apikey your-api-key');
      // For interactive session, we'll handle this gracefully
      this.client = {} as OpenAI; // Placeholder
      this.model = init.model || 'gpt-4o';
      this.temperature = init.temperature || 0.2;
      return;
    }
    
    try {
      this.client = new OpenAI({ apiKey: init.apiKey });
      this.model = init.model;
      this.temperature = init.temperature;
    } catch (error: any) {
      throw MetisError.providerRequestFailed('openai');
    }
  }

  async send(messages: Message[], opts?: { temperature?: number }): Promise<string> {
    const temperature = opts?.temperature ?? this.temperature;
    
    try {
      const requestConfig: any = {
        model: this.model,
        temperature,
        messages: messages.map((m) => ({
          role: m.role as any,
          content: m.content,
          tool_calls: m.tool_calls,
          tool_call_id: m.tool_call_id,
          name: m.name,
        })),
      };

      const res = await this.client.chat.completions.create(requestConfig);
      const choice = res.choices?.[0]?.message?.content ?? "";
      return typeof choice === "string" ? choice : JSON.stringify(choice);
    } catch (error: any) {
      if (error.status) {
        throw MetisError.providerRequestFailed('openai', error.status);
      }
      throw MetisError.providerRequestFailed('openai');
    }
  }

  async sendWithTools(
    messages: Message[], 
    tools: FunctionDefinition[], 
    opts?: { temperature?: number; max_tokens?: number }
  ): Promise<ProviderResponse> {
    const temperature = opts?.temperature ?? this.temperature;
    
    try {
      const requestConfig: any = {
        model: this.model,
        temperature,
        max_tokens: opts?.max_tokens,
        messages: messages.map((m) => ({
          role: m.role as any,
          content: m.content,
          tool_calls: m.tool_calls as any,
          tool_call_id: m.tool_call_id,
          name: m.name,
        })),
        tools: tools.map(tool => ({
          type: "function" as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          }
        })),
        tool_choice: "auto",
      };

      const res = await this.client.chat.completions.create(requestConfig);

      const message = res.choices?.[0]?.message;
      if (!message) {
        throw MetisError.providerRequestFailed('openai');
      }

      // Check if the model wants to call tools
      if (message.tool_calls && message.tool_calls.length > 0) {
        return {
          type: "tool_call",
          content: message.content || "",
          tool_calls: message.tool_calls.map(tc => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            }
          })),
          usage: res.usage ? {
            prompt_tokens: res.usage.prompt_tokens,
            completion_tokens: res.usage.completion_tokens,
            total_tokens: res.usage.total_tokens,
          } : undefined
        };
      }

      // Regular text response
      return {
        type: "text",
        content: message.content || "",
        usage: res.usage ? {
          prompt_tokens: res.usage.prompt_tokens,
          completion_tokens: res.usage.completion_tokens,
          total_tokens: res.usage.total_tokens,
        } : undefined
      };
    } catch (error: any) {
      if (error.status) {
        throw MetisError.providerRequestFailed('openai', error.status);
      }
      throw MetisError.providerRequestFailed('openai');
    }
  }

  supportsTools(): boolean {
    // Most OpenAI models support function calling, excluding older instruct models
    return !this.model.includes("gpt-3.5-turbo-instruct");
  }
}