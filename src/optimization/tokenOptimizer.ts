export class TokenOptimizer {
  /**
   * Optimize system prompt to reduce token usage while maintaining effectiveness
   */
  static optimizeSystemPrompt(basePrompt: string, tools: string[], repoSummary: string): string {
    // Truncate repo summary if too long
    const maxRepoSummaryLength = 1000;
    const truncatedSummary = repoSummary.length > maxRepoSummaryLength 
      ? repoSummary.substring(0, maxRepoSummaryLength) + "..."
      : repoSummary;

    // Use concise tool descriptions
    const toolsList = tools.length > 0 
      ? `Available tools: ${tools.join(", ")}`
      : "";

    // Optimized prompt template
    return `${basePrompt}

${toolsList}

You can read files, write files, check git status, and perform other operations to complete coding tasks.

When implementing changes:
1. Analyze the request
2. Read relevant files to understand context  
3. Implement changes directly using tools
4. Provide a clear summary

Repository context:
${truncatedSummary}

Complete the user's task efficiently.`;
  }

  /**
   * Intelligently truncate conversation history to stay within token limits
   */
  static optimizeMessageHistory(messages: any[], maxTokens = 8000): any[] {
    // Rough token estimation (4 chars ≈ 1 token)
    const estimateTokens = (text: string) => Math.ceil(text.length / 4);
    
    let totalTokens = 0;
    const optimizedMessages = [];
    
    // Always keep system message and recent user message
    const systemMessage = messages.find(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1];
    
    if (systemMessage) {
      optimizedMessages.push(systemMessage);
      totalTokens += estimateTokens(systemMessage.content);
    }
    
    if (lastUserMessage) {
      optimizedMessages.push(lastUserMessage);
      totalTokens += estimateTokens(lastUserMessage.content);
    }
    
    // Add recent conversation history, working backwards
    const conversationMessages = messages.filter(m => 
      m.role !== 'system' && m !== lastUserMessage
    ).reverse();
    
    for (const message of conversationMessages) {
      const messageTokens = estimateTokens(message.content || JSON.stringify(message));
      
      if (totalTokens + messageTokens > maxTokens) {
        break;
      }
      
      optimizedMessages.splice(-1, 0, message); // Insert before last user message
      totalTokens += messageTokens;
    }
    
    return optimizedMessages;
  }

  /**
   * Optimize tool execution by batching related operations
   */
  static suggestToolBatching(tools: string[]): string[] {
    const batchableOperations = [
      ['read_file', 'list_files'],     // File analysis batch
      ['git_status', 'git_diff'],      // Git analysis batch  
      ['write_file', 'git_status']     // Implementation batch
    ];
    
    const suggestions: string[] = [];
    
    for (const batch of batchableOperations) {
      const hasAllTools = batch.every(tool => tools.includes(tool));
      if (hasAllTools) {
        suggestions.push(`Consider batching: ${batch.join(' → ')}`);
      }
    }
    
    return suggestions;
  }

  /**
   * Estimate cost of operation in tokens/dollars
   */
  static estimateOperationCost(
    prompt: string, 
    expectedResponse: number = 500,
    provider: 'openai' | 'anthropic' = 'openai'
  ): { tokens: number; estimatedCost: number } {
    const promptTokens = Math.ceil(prompt.length / 4);
    const totalTokens = promptTokens + expectedResponse;
    
    // Rough pricing (as of 2024)
    const pricing = {
      openai: {
        'gpt-4o-mini': { input: 0.15, output: 0.6 }, // per 1M tokens
        'gpt-4o': { input: 2.5, output: 10 },
      },
      anthropic: {
        'claude-3-5-sonnet': { input: 3, output: 15 },
        'claude-3-5-haiku': { input: 0.25, output: 1.25 }
      }
    };
    
    // Default to cheapest model for estimation
    const rates = provider === 'openai' 
      ? pricing.openai['gpt-4o-mini']
      : pricing.anthropic['claude-3-5-haiku'];
    
    const cost = (
      (promptTokens / 1000000) * rates.input + 
      (expectedResponse / 1000000) * rates.output
    );
    
    return {
      tokens: totalTokens,
      estimatedCost: cost
    };
  }

  /**
   * Generate summary of optimization opportunities
   */
  static analyzeOptimizationOpportunities(
    messages: any[],
    tools: string[],
    repoSize: number
  ): {
    currentTokens: number;
    optimizedTokens: number;
    savings: number;
    recommendations: string[];
  } {
    const currentTokens = messages.reduce((total, msg) => 
      total + Math.ceil((msg.content || JSON.stringify(msg)).length / 4), 0
    );
    
    const optimized = this.optimizeMessageHistory(messages);
    const optimizedTokens = optimized.reduce((total, msg) => 
      total + Math.ceil((msg.content || JSON.stringify(msg)).length / 4), 0
    );
    
    const savings = currentTokens - optimizedTokens;
    const recommendations: string[] = [];
    
    if (savings > 1000) {
      recommendations.push(`Truncate conversation history (save ~${savings} tokens)`);
    }
    
    if (repoSize > 50) {
      recommendations.push("Consider using repo summary instead of full file lists");
    }
    
    const batchSuggestions = this.suggestToolBatching(tools);
    recommendations.push(...batchSuggestions);
    
    if (tools.length > 10) {
      recommendations.push("Consider limiting available tools to task-specific ones");
    }
    
    return {
      currentTokens,
      optimizedTokens,
      savings,
      recommendations
    };
  }
}