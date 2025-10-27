import { Message } from "../providers/types";
import { getSessionMemory, SessionMemory } from "./sessionMemory";

/**
 * Advanced memory management inspired by Claude Code's approach
 * Handles intelligent context compression, token estimation, and smart summarization
 */

export interface TokenEstimate {
  messages: number;
  system: number;
  total: number;
  percentage: number;
}

export interface CompressionStrategy {
  method: 'summarize' | 'truncate' | 'selective';
  targetReduction: number; // Percentage to reduce
  preserveRecent: number; // Number of recent messages to keep
  preserveImportant: boolean; // Keep important context markers
}

export interface MemoryConfig {
  maxContextTokens: number;
  autoCompactThreshold: number; // Percentage of context before auto-compact
  minMessagesBeforeCompact: number;
  preserveRecentMessages: number;
  compressionStrategy: CompressionStrategy;
}

export class MemoryManager {
  private sessionMemory: SessionMemory;
  private config: MemoryConfig;
  private summarizerFunction?: (messages: Message[], context?: string) => Promise<string>;

  constructor(
    sessionMemory: SessionMemory,
    config: Partial<MemoryConfig> = {},
    summarizerFunction?: (messages: Message[], context?: string) => Promise<string>
  ) {
    this.sessionMemory = sessionMemory;
    this.summarizerFunction = summarizerFunction;

    // Default configuration inspired by Claude Code
    this.config = {
      maxContextTokens: 180000, // Conservative limit for Claude/GPT-4
      autoCompactThreshold: 0.75, // Auto-compact at 75% capacity
      minMessagesBeforeCompact: 8,
      preserveRecentMessages: 4, // Always keep last 4 messages
      compressionStrategy: {
        method: 'summarize',
        targetReduction: 0.6, // Reduce by 60%
        preserveRecent: 4,
        preserveImportant: true
      },
      ...config
    };
  }

  /**
   * Estimate token count for messages (more accurate than current simple approach)
   */
  estimateTokens(messages: Message[]): TokenEstimate {
    let messageTokens = 0;
    let systemTokens = 0;

    for (const message of messages) {
      const content = message.content || '';
      // More accurate token estimation: ~4 chars per token on average
      // Account for role markers and formatting
      const estimatedTokens = Math.ceil(content.length / 3.5) + 10; // +10 for role/formatting

      if (message.role === 'system') {
        systemTokens += estimatedTokens;
      } else {
        messageTokens += estimatedTokens;
      }
    }

    const total = messageTokens + systemTokens;
    const percentage = (total / this.config.maxContextTokens) * 100;

    return {
      messages: messageTokens,
      system: systemTokens,
      total,
      percentage
    };
  }

  /**
   * Check if memory needs compression based on current state
   */
  shouldCompress(): { needed: boolean; urgency: 'low' | 'medium' | 'high'; reason: string } {
    const messages = this.sessionMemory.getConversationHistory();
    const tokens = this.estimateTokens(messages);

    if (messages.length < this.config.minMessagesBeforeCompact) {
      return { needed: false, urgency: 'low', reason: 'Insufficient messages for compression' };
    }

    if (tokens.percentage > 90) {
      return { needed: true, urgency: 'high', reason: `Context at ${tokens.percentage.toFixed(1)}% capacity` };
    }

    if (tokens.percentage > this.config.autoCompactThreshold * 100) {
      return { needed: true, urgency: 'medium', reason: `Context at ${tokens.percentage.toFixed(1)}% capacity` };
    }

    return { needed: false, urgency: 'low', reason: `Context at ${tokens.percentage.toFixed(1)}% capacity` };
  }

  /**
   * Intelligent message classification for selective compression
   */
  private classifyMessages(messages: Message[]): {
    critical: Message[];
    important: Message[];
    compressible: Message[];
    recent: Message[];
  } {
    const recent = messages.slice(-this.config.preserveRecentMessages);
    const older = messages.slice(0, -this.config.preserveRecentMessages);

    const critical: Message[] = [];
    const important: Message[] = [];
    const compressible: Message[] = [];

    for (const message of older) {
      const content = message.content || '';

      // Critical: System messages, error messages, task definitions
      if (
        message.role === 'system' ||
        content.includes('[CONVERSATION SUMMARY]') ||
        content.includes('**Current Task:**') ||
        content.toLowerCase().includes('error:') ||
        content.toLowerCase().includes('failed:')
      ) {
        critical.push(message);
      }
      // Important: Tool calls, code blocks, file operations
      else if (
        content.includes('```') ||
        content.includes('tool_calls') ||
        content.includes('write_file') ||
        content.includes('read_file') ||
        content.includes('edit_file') ||
        content.length > 500 // Substantial content
      ) {
        important.push(message);
      }
      // Compressible: Short conversations, confirmations, simple requests
      else {
        compressible.push(message);
      }
    }

    return { critical, important, compressible, recent };
  }

  /**
   * Advanced compression using multiple strategies
   */
  async compressMemory(forceCompress: boolean = false): Promise<{
    success: boolean;
    originalCount: number;
    newCount: number;
    tokensReduced: number;
    method: string;
  }> {
    const compressionCheck = this.shouldCompress();

    if (!forceCompress && !compressionCheck.needed) {
      return {
        success: false,
        originalCount: 0,
        newCount: 0,
        tokensReduced: 0,
        method: 'none'
      };
    }

    const messages = this.sessionMemory.getConversationHistory();
    const originalTokens = this.estimateTokens(messages);
    const classified = this.classifyMessages(messages);

    let compressedMessages: Message[] = [];
    let method = '';

    try {
      switch (this.config.compressionStrategy.method) {
        case 'summarize':
          compressedMessages = await this.summarizeCompress(classified);
          method = 'intelligent_summarization';
          break;

        case 'selective':
          compressedMessages = await this.selectiveCompress(classified);
          method = 'selective_compression';
          break;

        case 'truncate':
        default:
          compressedMessages = this.truncateCompress(classified);
          method = 'truncation';
          break;
      }

      // Update session memory with compressed messages
      const session = this.sessionMemory.getCurrentSession();
      session.messages = compressedMessages;

      // Add compression metadata
      this.sessionMemory.updateMetadata('lastCompression', {
        timestamp: new Date().toISOString(),
        method,
        originalCount: messages.length,
        newCount: compressedMessages.length,
        originalTokens: originalTokens.total,
        newTokens: this.estimateTokens(compressedMessages).total
      });

      const newTokens = this.estimateTokens(compressedMessages);

      return {
        success: true,
        originalCount: messages.length,
        newCount: compressedMessages.length,
        tokensReduced: originalTokens.total - newTokens.total,
        method
      };

    } catch (error: any) {
      console.warn('Memory compression failed:', error.message);

      // Fallback to simple truncation
      compressedMessages = this.truncateCompress(classified);
      const session = this.sessionMemory.getCurrentSession();
      session.messages = compressedMessages;

      const newTokens = this.estimateTokens(compressedMessages);

      return {
        success: true,
        originalCount: messages.length,
        newCount: compressedMessages.length,
        tokensReduced: originalTokens.total - newTokens.total,
        method: 'fallback_truncation'
      };
    }
  }

  /**
   * Intelligent summarization-based compression
   */
  private async summarizeCompress(classified: ReturnType<typeof this.classifyMessages>): Promise<Message[]> {
    const { critical, important, compressible, recent } = classified;

    // Always preserve critical and recent messages
    let result: Message[] = [...critical];

    // Summarize compressible messages if we have a summarizer
    if (compressible.length > 0 && this.summarizerFunction) {
      try {
        const context = this.sessionMemory.getSessionSummary();
        const summary = await this.summarizerFunction(compressible, context);

        const summaryMessage: Message = {
          role: 'system',
          content: `[COMPRESSED CONTEXT - ${compressible.length} messages]\n${summary}`
        };

        result.push(summaryMessage);
      } catch (error) {
        // If summarization fails, keep the most recent compressible messages
        result.push(...compressible.slice(-2));
      }
    } else {
      // No summarizer available, keep recent compressible messages
      result.push(...compressible.slice(-1));
    }

    // Selectively include important messages (keep most recent important ones)
    const importantToKeep = Math.min(important.length, 3);
    result.push(...important.slice(-importantToKeep));

    // Always add recent messages
    result.push(...recent);

    // Sort by original order (approximate)
    return result;
  }

  /**
   * Selective compression keeping the most valuable messages
   */
  private async selectiveCompress(classified: ReturnType<typeof this.classifyMessages>): Promise<Message[]> {
    const { critical, important, compressible, recent } = classified;

    // Calculate how many messages we can keep
    const targetCount = Math.floor(classified.critical.length + classified.important.length + classified.compressible.length + classified.recent.length * (1 - this.config.compressionStrategy.targetReduction));

    let result: Message[] = [...critical, ...recent]; // Always keep these

    const remainingSlots = Math.max(0, targetCount - result.length);

    // Fill remaining slots with important messages first
    const importantToKeep = Math.min(important.length, Math.floor(remainingSlots * 0.7));
    result.push(...important.slice(-importantToKeep));

    // Fill rest with compressible messages
    const compressibleToKeep = Math.min(compressible.length, remainingSlots - importantToKeep);
    if (compressibleToKeep > 0) {
      result.push(...compressible.slice(-compressibleToKeep));
    }

    return result;
  }

  /**
   * Simple truncation-based compression (fallback)
   */
  private truncateCompress(classified: ReturnType<typeof this.classifyMessages>): Message[] {
    const { critical, recent } = classified;

    // Keep only critical messages and recent ones
    return [...critical, ...recent];
  }

  /**
   * Get memory statistics for debugging and monitoring
   */
  getMemoryStats(): {
    messageCount: number;
    tokenEstimate: TokenEstimate;
    compressionRecommendation: ReturnType<typeof this.shouldCompress>;
    lastCompression?: any;
  } {
    const messages = this.sessionMemory.getConversationHistory();
    const session = this.sessionMemory.getCurrentSession();

    return {
      messageCount: messages.length,
      tokenEstimate: this.estimateTokens(messages),
      compressionRecommendation: this.shouldCompress(),
      lastCompression: session.metadata?.lastCompression
    };
  }

  /**
   * Set custom summarizer function
   */
  setSummarizer(summarizerFunction: (messages: Message[], context?: string) => Promise<string>): void {
    this.summarizerFunction = summarizerFunction;
  }

  /**
   * Update memory configuration
   */
  updateConfig(newConfig: Partial<MemoryConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

/**
 * Factory function to create memory manager with session memory
 */
export function createMemoryManager(
  workingDirectory?: string,
  config?: Partial<MemoryConfig>,
  summarizerFunction?: (messages: Message[], context?: string) => Promise<string>
): MemoryManager {
  const sessionMemory = getSessionMemory(workingDirectory);
  return new MemoryManager(sessionMemory, config, summarizerFunction);
}