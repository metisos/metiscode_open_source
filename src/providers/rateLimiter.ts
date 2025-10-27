import kleur from 'kleur';

interface RateLimitConfig {
  tokensPerMinute: number;
  requestsPerMinute: number;
  burstAllowance: number; // Allow some burst capacity
}

interface RequestRecord {
  timestamp: number;
  tokens: number;
}

// Rate limit configurations for different Groq models
const GROQ_RATE_LIMITS: Record<string, RateLimitConfig> = {
  'openai/gpt-oss-20b': {
    tokensPerMinute: 250000,
    requestsPerMinute: 30,
    burstAllowance: 0.8 // Use 80% of limit to be safe
  },
  'llama-3.1-70b-versatile': {
    tokensPerMinute: 6000,
    requestsPerMinute: 30,
    burstAllowance: 0.8
  },
  'llama-3.1-8b-instant': {
    tokensPerMinute: 30000,
    requestsPerMinute: 30,
    burstAllowance: 0.8
  },
  'mixtral-8x7b-32768': {
    tokensPerMinute: 5000,
    requestsPerMinute: 30,
    burstAllowance: 0.8
  },
  'gemma-7b-it': {
    tokensPerMinute: 30000,
    requestsPerMinute: 30,
    burstAllowance: 0.8
  }
};

export class GroqRateLimiter {
  private requestHistory: RequestRecord[] = [];
  private config: RateLimitConfig;
  private modelName: string;

  // Mutex lock to prevent race conditions in concurrent requests
  private lock: Promise<void> = Promise.resolve();

  constructor(modelName: string) {
    this.modelName = modelName;
    this.config = GROQ_RATE_LIMITS[modelName] || {
      tokensPerMinute: 5000, // Conservative default
      requestsPerMinute: 30,
      burstAllowance: 0.8
    };
  }

  /**
   * Check if we should delay before making a request
   * Returns delay in milliseconds (0 if no delay needed)
   * Thread-safe via mutex lock
   */
  async shouldDelay(estimatedTokens: number): Promise<number> {
    // Acquire lock to prevent race conditions
    return new Promise((resolve) => {
      this.lock = this.lock.then(async () => {
        const delay = await this.calculateDelay(estimatedTokens);
        resolve(delay);
      });
    });
  }

  /**
   * Internal method to calculate delay (called within lock)
   */
  private async calculateDelay(estimatedTokens: number): Promise<number> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Clean old requests (older than 1 minute)
    this.requestHistory = this.requestHistory.filter(
      record => record.timestamp > oneMinuteAgo
    );

    // Calculate current usage
    const recentTokens = this.requestHistory.reduce((sum, record) => sum + record.tokens, 0);
    const recentRequests = this.requestHistory.length;

    // Check if adding this request would exceed limits
    const tokenLimit = this.config.tokensPerMinute * this.config.burstAllowance;
    const requestLimit = this.config.requestsPerMinute * this.config.burstAllowance;

    const wouldExceedTokens = (recentTokens + estimatedTokens) > tokenLimit;
    const wouldExceedRequests = (recentRequests + 1) > requestLimit;

    if (wouldExceedTokens || wouldExceedRequests) {
      // Calculate delay needed
      let delay = 0;

      if (wouldExceedTokens && this.requestHistory.length > 0) {
        // Find the oldest request that puts us over the limit
        const oldestRelevantRequest = this.requestHistory[0];
        delay = Math.max(delay, (oldestRelevantRequest.timestamp + 60000) - now);
      }

      if (wouldExceedRequests && this.requestHistory.length > 0) {
        const oldestRequest = this.requestHistory[0];
        delay = Math.max(delay, (oldestRequest.timestamp + 60000) - now);
      }

      // Add a small buffer to be safe
      delay = Math.max(delay + 1000, 2000); // Minimum 2 second delay

      return delay;
    }

    // Add minimum delay between requests for Groq (they're very fast)
    const lastRequest = this.requestHistory[this.requestHistory.length - 1];
    if (lastRequest && (now - lastRequest.timestamp) < 100) {
      return 100; // 100ms minimum between requests
    }

    return 0;
  }

  /**
   * Record a completed request
   * Thread-safe via mutex lock
   */
  recordRequest(actualTokens: number): void {
    // Acquire lock to prevent race conditions
    this.lock = this.lock.then(() => {
      this.requestHistory.push({
        timestamp: Date.now(),
        tokens: actualTokens
      });
      return Promise.resolve();
    });
  }

  /**
   * Display a user-friendly delay message
   */
  async delayWithMessage(delayMs: number): Promise<void> {
    if (delayMs <= 0) return;

    const seconds = Math.ceil(delayMs / 1000);
    const reason = this.getDelayReason();

    // Show a Claude Code style delay message
    process.stdout.write(kleur.yellow(`⏳ Rate limiting: waiting ${seconds}s ${reason}\r`));

    await new Promise(resolve => setTimeout(resolve, delayMs));

    // Clear the delay message
    process.stdout.write(' '.repeat(80) + '\r');
  }

  private getDelayReason(): string {
    const oneMinuteAgo = Date.now() - 60000;
    const recentTokens = this.requestHistory
      .filter(r => r.timestamp > oneMinuteAgo)
      .reduce((sum, record) => sum + record.tokens, 0);

    const tokenUsagePercent = Math.round((recentTokens / this.config.tokensPerMinute) * 100);

    return `(${tokenUsagePercent}% of token limit used)`;
  }

  /**
   * Get current usage statistics
   */
  getUsageStats(): { tokens: number; requests: number; tokensPercent: number; requestsPercent: number } {
    const oneMinuteAgo = Date.now() - 60000;
    const recentRequests = this.requestHistory.filter(r => r.timestamp > oneMinuteAgo);

    const tokens = recentRequests.reduce((sum, record) => sum + record.tokens, 0);
    const requests = recentRequests.length;

    return {
      tokens,
      requests,
      tokensPercent: Math.round((tokens / this.config.tokensPerMinute) * 100),
      requestsPercent: Math.round((requests / this.config.requestsPerMinute) * 100)
    };
  }

  /**
   * Estimate tokens from message content
   * Uses improved heuristic accounting for JSON overhead and special characters
   */
  static estimateTokens(messages: any[], tools?: any[]): number {
    let estimate = 0;

    // Estimate tokens from messages
    for (const message of messages) {
      if (message.content) {
        estimate += this.estimateTextTokens(message.content);
      }

      // Account for message structure overhead (role, etc.)
      estimate += 4;  // Overhead per message

      // Account for tool calls in message
      if (message.tool_calls) {
        estimate += this.estimateToolCallsTokens(message.tool_calls);
      }
    }

    // Add tool definitions (they add significant overhead)
    if (tools && tools.length > 0) {
      estimate += this.estimateToolDefinitionsTokens(tools);
    }

    // Add conservative buffer for response tokens
    // Most responses are 100-500 tokens, but complex ones can be larger
    estimate += 500;

    return estimate;
  }

  /**
   * Better token estimation for text content
   * Accounts for:
   * - English text: ~1 token per 4 chars
   * - Code/JSON: ~1 token per 2-3 chars (more special characters)
   * - Special characters: count as ~0.5-1 token each
   */
  private static estimateTextTokens(text: string): number {
    if (!text) return 0;

    const length = text.length;

    // Count special characters (JSON braces, quotes, operators, etc.)
    const specialChars = (text.match(/[{}[\](),:;"'`<>\/\\|&*+=!?-]/g) || []).length;

    // Count whitespace
    const whitespace = (text.match(/\s/g) || []).length;

    // Estimate base tokens from non-special chars
    // JSON/code has more tokens per char than natural language
    const hasLotOfSpecialChars = specialChars > length * 0.1;
    const charsPerToken = hasLotOfSpecialChars ? 2.5 : 3.5;

    const baseTokens = length / charsPerToken;

    // Special characters add overhead
    const specialCharTokens = specialChars * 0.5;

    // Whitespace is often separate tokens
    const whitespaceTokens = whitespace * 0.3;

    return Math.ceil(baseTokens + specialCharTokens + whitespaceTokens);
  }

  /**
   * Estimate tokens for tool calls in a message
   */
  private static estimateToolCallsTokens(toolCalls: any[]): number {
    let tokens = 0;

    for (const call of toolCalls) {
      // Tool call structure overhead
      tokens += 10;

      // Function name
      if (call.function?.name) {
        tokens += 2;
      }

      // Arguments (usually JSON)
      if (call.function?.arguments) {
        const argsString = typeof call.function.arguments === 'string'
          ? call.function.arguments
          : JSON.stringify(call.function.arguments);

        tokens += this.estimateTextTokens(argsString);
      }
    }

    return tokens;
  }

  /**
   * Estimate tokens for tool definitions
   * Tool definitions have significant overhead due to schema structure
   */
  private static estimateToolDefinitionsTokens(tools: any[]): number {
    let tokens = 0;

    for (const tool of tools) {
      // Base overhead for tool structure
      tokens += 20;

      // Tool name
      if (tool.function?.name) {
        tokens += 3;
      }

      // Description
      if (tool.function?.description) {
        tokens += this.estimateTextTokens(tool.function.description);
      }

      // Parameters schema (can be large and complex)
      if (tool.function?.parameters) {
        const schemaString = JSON.stringify(tool.function.parameters);
        // Schema has lots of JSON overhead, use aggressive estimation
        tokens += Math.ceil(schemaString.length / 2);
      }
    }

    return tokens;
  }
}