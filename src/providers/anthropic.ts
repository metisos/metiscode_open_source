import Anthropic from "@anthropic-ai/sdk";
import { Message, Provider, ProviderInit, ProviderResponse, FunctionDefinition } from "./types";

export class AnthropicProvider implements Provider {
  public readonly name = "anthropic";
  private client: Anthropic;
  private model: string;
  private temperature: number | undefined;

  constructor(init: ProviderInit) {
    if (!init.apiKey) throw new Error("ANTHROPIC_API_KEY missing");
    this.client = new Anthropic({ apiKey: init.apiKey });
    this.model = init.model;
    this.temperature = init.temperature;
  }

  async send(messages: Message[], opts?: { temperature?: number }): Promise<string> {
    const temperature = opts?.temperature ?? this.temperature;
    const sys = messages.find((m) => m.role === "system")?.content;
    const userAssistantPairs = messages.filter((m) => m.role !== "system");
    const content = userAssistantPairs.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

    const res = await this.client.messages.create({
      model: this.model,
      temperature,
      system: sys,
      max_tokens: 1024,
      messages: content as any,
    });

    const text = res.content
      .map((c: any) => (c.type === "text" ? c.text : ""))
      .join("")
      .trim();
    return text;
  }

  async sendWithTools(
    messages: Message[], 
    tools: FunctionDefinition[], 
    opts?: { temperature?: number; max_tokens?: number }
  ): Promise<ProviderResponse> {
    const temperature = opts?.temperature ?? this.temperature;
    const sys = messages.find((m) => m.role === "system")?.content;
    const userAssistantPairs = messages.filter((m) => m.role !== "system");
    
    const content = userAssistantPairs.map((m) => {
      if (m.role === "tool") {
        return {
          role: "user",
          content: `Tool ${m.name || "unknown"} result: ${m.content}`,
        };
      }
      return {
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      };
    });

    // Anthropic uses a different tool format, convert our tools
    const anthropicTools = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));

    const res = await this.client.messages.create({
      model: this.model,
      temperature,
      system: sys,
      max_tokens: opts?.max_tokens || 1024,
      messages: content as any,
      tools: anthropicTools,
    });

    // Check if Anthropic returned tool calls
    const toolUseBlocks = res.content.filter((c: any) => c.type === "tool_use");
    const textBlocks = res.content.filter((c: any) => c.type === "text");
    
    if (toolUseBlocks.length > 0) {
      // Convert Anthropic tool use to our format
      const toolCalls = toolUseBlocks.map((block: any) => ({
        id: block.id,
        type: "function" as const,
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        }
      }));

      return {
        type: "tool_call",
        content: textBlocks.map((c: any) => c.text).join("").trim(),
        tool_calls: toolCalls,
        usage: res.usage ? {
          prompt_tokens: res.usage.input_tokens,
          completion_tokens: res.usage.output_tokens,
          total_tokens: res.usage.input_tokens + res.usage.output_tokens,
        } : undefined
      };
    }

    // Regular text response
    return {
      type: "text",
      content: textBlocks.map((c: any) => c.text).join("").trim(),
      usage: res.usage ? {
        prompt_tokens: res.usage.input_tokens,
        completion_tokens: res.usage.output_tokens,
        total_tokens: res.usage.input_tokens + res.usage.output_tokens,
      } : undefined
    };
  }

  supportsTools(): boolean {
    // Claude 3 models support tools
    return this.model.includes("claude-3") || this.model.includes("claude-sonnet") || this.model.includes("claude-haiku");
  }
}

