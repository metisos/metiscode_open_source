import { Message, Provider, ProviderInit, ProviderResponse, FunctionDefinition } from "./types";
import { MetisError } from "../errors/MetisError";
import { GroqRateLimiter } from "./rateLimiter";

// Groq API Client (OpenAI-compatible)
interface GroqMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

interface GroqTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

interface GroqResponse {
  choices: {
    message: {
      role: string;
      content: string | null;
      tool_calls?: any[];
    };
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class GroqProvider implements Provider {
  public readonly name = "groq";
  private apiKey: string;
  private model: string;
  private temperature: number | undefined;
  private baseURL = "https://api.groq.com/openai/v1";
  private rateLimiter: GroqRateLimiter;

  constructor(init: ProviderInit) {
    if (!init.apiKey) {
      throw MetisError.apiKeyMissing('groq');
    }
    
    this.apiKey = init.apiKey;
    this.model = init.model;
    this.temperature = init.temperature;
    this.rateLimiter = new GroqRateLimiter(this.model);
  }

  async send(messages: Message[], opts?: { temperature?: number }): Promise<string> {
    const temperature = opts?.temperature ?? this.temperature;

    // Apply rate limiting
    const estimatedTokens = GroqRateLimiter.estimateTokens(messages);
    const delay = await this.rateLimiter.shouldDelay(estimatedTokens);
    if (delay > 0) {
      await this.rateLimiter.delayWithMessage(delay);
    }

    try {
      const response = await this.makeRequest('/chat/completions', {
        model: this.model,
        temperature,
        messages: messages.map((m) => {
          // Groq has specific requirements for message format
          const groqMessage: any = {
            role: m.role,
            content: m.content || null  // Groq might prefer null over empty string
          };
          
          // Only include tool-related fields if they exist and role is appropriate
          if (m.role === 'assistant' && m.tool_calls) {
            groqMessage.tool_calls = m.tool_calls;
            // Assistant messages with tool calls can have null content
            if (!m.content) {
              groqMessage.content = null;
            }
          }
          
          // For tool responses, Groq expects specific format
          if (m.role === 'tool') {
            groqMessage.tool_call_id = m.tool_call_id;
            // Some Groq models expect name field for tool messages
            if (m.name) {
              groqMessage.name = m.name;
            }
            // Tool messages must have string content, not null
            if (!groqMessage.content) {
              groqMessage.content = "";
            }
          }
          
          return groqMessage;
        }),
      });

      const choice = response.choices?.[0]?.message?.content ?? "";

      // Record actual token usage for rate limiting
      if (response.usage) {
        this.rateLimiter.recordRequest(response.usage.total_tokens);
      }

      return typeof choice === "string" ? choice : JSON.stringify(choice);
    } catch (error: any) {
      if (error.status) {
        throw MetisError.providerRequestFailed('groq', error.status);
      }
      throw MetisError.providerRequestFailed('groq');
    }
  }

  async sendWithTools(
    messages: Message[],
    tools: FunctionDefinition[],
    opts?: { temperature?: number; max_tokens?: number }
  ): Promise<ProviderResponse> {
    const temperature = opts?.temperature ?? this.temperature;

    // Check if the current model supports tools
    if (!this.supportsTools()) {
      throw new Error(`Model ${this.model} does not support function calling. Please use a compatible model like llama-3.1-70b-versatile or mixtral-8x7b-32768`);
    }

    // Apply rate limiting
    const estimatedTokens = GroqRateLimiter.estimateTokens(messages, tools);
    const delay = await this.rateLimiter.shouldDelay(estimatedTokens);
    if (delay > 0) {
      await this.rateLimiter.delayWithMessage(delay);
    }

    try {
      const requestConfig: any = {
        model: this.model,
        temperature,
        max_tokens: opts?.max_tokens,
        messages: messages.map((m) => {
          // Groq has specific requirements for message format
          const groqMessage: any = {
            role: m.role,
            content: m.content || null  // Groq might prefer null over empty string
          };
          
          // Only include tool-related fields if they exist and role is appropriate
          if (m.role === 'assistant' && m.tool_calls) {
            groqMessage.tool_calls = m.tool_calls;
            // Assistant messages with tool calls can have null content
            if (!m.content) {
              groqMessage.content = null;
            }
          }
          
          // For tool responses, Groq expects specific format
          if (m.role === 'tool') {
            groqMessage.tool_call_id = m.tool_call_id;
            // Some Groq models expect name field for tool messages
            if (m.name) {
              groqMessage.name = m.name;
            }
            // Tool messages must have string content, not null
            if (!groqMessage.content) {
              groqMessage.content = "";
            }
          }
          
          return groqMessage;
        }),
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

      // Add Groq-specific parameters for supported models
      if (this.supportsAdvancedFeatures()) {
        requestConfig.service_tier = "on_demand"; // Default to on_demand tier
      }

      // Enhanced debug logging for Groq requests
      if (process.env.METIS_VERBOSE === 'true' || process.env.METIS_TRACE === 'true') {
        console.log('[Groq] Sending request with', requestConfig.messages.length, 'messages');
        console.log('[Groq] Message roles:', requestConfig.messages.map(m => m.role).join(', '));
        console.log('[Groq] Model:', this.model);
        console.log('[Groq] Tools:', requestConfig.tools.map(t => t.function.name).join(', '));

        if (process.env.METIS_TRACE === 'true') {
          console.log('[Groq] Full request config:');
          console.log(JSON.stringify(requestConfig, null, 2));
          console.log('[Groq] Tool schemas:');
          requestConfig.tools.forEach(tool => {
            console.log(`[Groq] ${tool.function.name}:`, JSON.stringify(tool.function.parameters, null, 2));
          });
        }
      }

      
      const response = await this.makeRequest('/chat/completions', requestConfig);

      const message = response.choices?.[0]?.message;
      if (!message) {
        throw MetisError.providerRequestFailed('groq');
      }

      // Record actual token usage for rate limiting
      if (response.usage) {
        this.rateLimiter.recordRequest(response.usage.total_tokens);
      }

      // Check if the model wants to call tools
      if (message.tool_calls && message.tool_calls.length > 0) {
        return {
          type: "tool_call",
          content: message.content || "",
          tool_calls: message.tool_calls.map(tc => {
            // Fix for Groq JSON generation issues - clean up arguments
            let cleanedArguments = tc.function.arguments;

            // Try to fix common JSON formatting issues from Groq
            if (typeof cleanedArguments === 'string') {
              // Remove trailing quotes or other characters after final }
              cleanedArguments = cleanedArguments.replace(/}\s*"?\s*$/, '}');

              // Fix double quotes at end of JSON
              cleanedArguments = cleanedArguments.replace(/}"\s*}/, '}}');

              // Validate and potentially repair JSON
              try {
                JSON.parse(cleanedArguments);
              } catch (e) {
                // Try to repair common issues
                // Remove any trailing characters after the last }
                const lastBrace = cleanedArguments.lastIndexOf('}');
                if (lastBrace !== -1 && lastBrace < cleanedArguments.length - 1) {
                  cleanedArguments = cleanedArguments.substring(0, lastBrace + 1);
                }

                // Try parsing again
                try {
                  JSON.parse(cleanedArguments);
                } catch (e2) {
                  console.error('[Groq] Failed to parse tool arguments after repair:', cleanedArguments);
                  console.error('[Groq] Original arguments:', tc.function.arguments);
                }
              }
            }

            return {
              id: tc.id,
              type: "function",
              function: {
                name: tc.function.name,
                arguments: cleanedArguments,
              }
            };
          }),
          usage: response.usage ? {
            prompt_tokens: response.usage.prompt_tokens,
            completion_tokens: response.usage.completion_tokens,
            total_tokens: response.usage.total_tokens,
          } : undefined
        };
      }

      // Regular text response
      return {
        type: "text",
        content: message.content || "",
        usage: response.usage ? {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
        } : undefined
      };
    } catch (error: any) {
      // Handle rate limiting more gracefully
      if (error.status === 429) {
        // Extract wait time from error message if available
        const waitMatch = error.message?.match(/Please try again in (\d+\.?\d*)/);
        const waitTime = waitMatch ? Math.ceil(parseFloat(waitMatch[1])) : 2;

        // Create a more user-friendly rate limit error
        const rateLimitError = new Error(`API rate limit reached. Waiting ${waitTime} seconds before retry...`);
        rateLimitError.status = 429;
        rateLimitError.waitTime = waitTime * 1000; // Convert to milliseconds
        throw rateLimitError;
      }

      if (error.status) {
        throw MetisError.providerRequestFailed('groq', error.status);
      }
      throw MetisError.providerRequestFailed('groq');
    }
  }

  supportsTools(): boolean {
    // Current Groq models that support function calling (as of 2025)
    const toolSupportedModels = [
      'llama-3.1-70b-versatile',
      'llama-3.1-8b-instant',
      'llama-3.3-70b-versatile',
      'mixtral-8x7b-32768',
      'gemma2-9b-it',
      'gemma-7b-it',
      'openai/gpt-oss-20b',  // Added support for this model
    ];

    return toolSupportedModels.some(model => this.model.includes(model)) ||
           this.model.includes('tool-use') ||
           this.model.includes('function');
  }

  // Get current rate limit status (for debugging)
  getRateLimitStatus() {
    return this.rateLimiter.getUsageStats();
  }

  private supportsAdvancedFeatures(): boolean {
    // Check if model supports advanced Groq features
    return this.model.includes('llama-4') || 
           this.model.includes('mixtral') ||
           this.model.includes('gemma2');
  }

  private async makeRequest(endpoint: string, body: any, retries = 3): Promise<GroqResponse> {
    const url = `${this.baseURL}${endpoint}`;

    // Exponential backoff retry logic
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        // Create abort controller for timeout (30 seconds)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });

        clearTimeout(timeoutId);  // Clear timeout on successful response

        if (!response.ok) {
          // Check for retryable errors
          const isRetryable = response.status === 429 || response.status >= 500;

          if (isRetryable && attempt < retries - 1) {
            // Calculate exponential backoff delay
            const baseDelay = 1000; // 1 second
            const maxDelay = 10000; // 10 seconds
            const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
            const jitter = Math.random() * 1000; // Add random jitter
            const delay = exponentialDelay + jitter;

            console.log(`[Groq] Request failed with status ${response.status}, retrying in ${Math.round(delay/1000)}s (attempt ${attempt + 1}/${retries})...`);

            await new Promise(resolve => setTimeout(resolve, delay));
            continue; // Retry
          }

          // Not retryable or last attempt - throw error
          const errorText = await response.text();
          let errorMessage = `HTTP ${response.status}`;
          let errorDetails = '';
          let fullErrorJson = null;

          try {
            fullErrorJson = JSON.parse(errorText);
            errorMessage = fullErrorJson.error?.message || errorMessage;
            errorDetails = fullErrorJson.error?.type || '';

            // Handle specific Groq error types
            if (response.status === 400) {
              // Check for tool parsing errors from Groq
              if (fullErrorJson.error?.code === 'tool_use_failed' && fullErrorJson.error?.failed_generation) {
                console.error('[Groq] Tool parsing error. Failed generation:', fullErrorJson.error.failed_generation);

                // This is a Groq-side JSON generation issue
                errorMessage = 'Groq generated malformed tool call JSON. This is a known issue with some models. Please try again or use a different model.';

                // Log the malformed JSON for debugging
                console.error('[Groq] Malformed JSON from model:', fullErrorJson.error.failed_generation);
              } else if (errorMessage.includes('tool') || errorMessage.includes('function')) {
                errorMessage = 'Model does not support function calling. Try a different model or use text-only mode.';
              } else if (errorMessage.includes('max_tokens')) {
                errorMessage = 'Request too large. Try reducing message length or context.';
              } else if (errorMessage.includes('invalid_request_error')) {
                errorMessage = 'Invalid request format. Check your input parameters.';
              } else if (errorMessage.includes('content')) {
                errorMessage = 'Invalid message content format. Ensure all messages have valid content.';
              } else {
                // Include more details for debugging
                errorMessage = `Bad request: ${errorMessage}. Check message format and model compatibility.`;
              }
            }
          } catch {
            // Use default error message
          }

          // Enhanced error logging
          console.error('[Groq] API Error Details:');
          console.error('[Groq] Status:', response.status);
          console.error('[Groq] Error Message:', errorMessage);
          console.error('[Groq] Error Type:', errorDetails);
          console.error('[Groq] Raw Response:', errorText);

          const error = new Error(`groq API request failed (${errorMessage})`);
          (error as any).status = response.status;
          (error as any).details = errorDetails;
          (error as any).response = errorText;
          throw error;
        }

        // Success - return response
        return await response.json();

      } catch (error: any) {
        // Handle fetch errors (network, timeout, etc.)
        const isLastAttempt = attempt === retries - 1;

        // Check if it's a retryable error
        const isAbortError = error.name === 'AbortError';
        const isNetworkError = !error.status && (error.message?.includes('fetch') || error.message?.includes('network'));
        const isRetryable = isAbortError || isNetworkError;

        if (isRetryable && !isLastAttempt) {
          // Calculate exponential backoff delay
          const baseDelay = 1000; // 1 second
          const maxDelay = 10000; // 10 seconds
          const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
          const jitter = Math.random() * 1000; // Add random jitter
          const delay = exponentialDelay + jitter;

          const errorType = isAbortError ? 'timeout' : 'network error';
          console.log(`[Groq] Request failed (${errorType}), retrying in ${Math.round(delay/1000)}s (attempt ${attempt + 1}/${retries})...`);

          await new Promise(resolve => setTimeout(resolve, delay));
          continue; // Retry
        }

        // Last attempt or non-retryable error - rethrow
        if (error.status) {
          throw error;
        }
        throw new Error(error.message || 'Network error');
      }
    }

    // Should never reach here, but TypeScript needs it
    throw new Error('All retry attempts failed');
  }

  // Helper method to get available models
  static getAvailableModels(): string[] {
    return [
      // Llama models
      'llama3-groq-70b-8192-tool-use-preview',
      'llama3-groq-8b-8192-tool-use-preview', 
      'meta-llama/llama-4-scout-17b-16e-instruct',
      'llama-3.3-70b-versatile',
      'llama-3.1-70b-versatile',
      'llama-3.1-8b-instant',
      
      // Mixtral models
      'mixtral-8x7b-32768',
      
      // Gemma models
      'gemma2-9b-it',
      'gemma-7b-it',
      
      // Qwen models
      'qwen2.5-72b-instruct',
      
      // DeepSeek models
      'deepseek-r1-distill-llama-70b',
    ];
  }
}