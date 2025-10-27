import { MetisError } from './MetisError';
import { RetryManager, RetryConfig } from './RetryManager';
import { ErrorSuggestionEngine } from './ErrorSuggestions';
import kleur from 'kleur';

export class ErrorHandler {
  static handle(error: unknown, context?: string): never {
    const isVerbose = process.env.METIS_VERBOSE === 'true';
    const isTrace = process.env.METIS_TRACE === 'true';
    const isInteractiveSession = process.env.METIS_INTERACTIVE === 'true';
    
    if (error instanceof MetisError) {
      // Structured error with helpful suggestions
      console.error(error.toUserFriendlyString());
      
      if (isVerbose) {
        console.error(`\nError Code: ${error.code}`);
        console.error(`Category: ${error.category}`);
        if (context) console.error(`Context: ${context}`);
      }
      
      if (isTrace) {
        console.error(`\nStack trace:\n${error.stack}`);
      }
      
      if (isInteractiveSession) {
        throw error; // Don't exit in interactive session
      } else {
        process.exit(1);
      }
    }
    
    if (error instanceof Error) {
      // Convert common errors to structured errors
      const structuredError = this.convertToStructuredError(error, context);
      if (structuredError) {
        return this.handle(structuredError, context);
      }
      
      // Enhanced error handling with intelligent suggestions
      const suggestions = ErrorSuggestionEngine.analyzeError(error);
      const formattedSuggestions = ErrorSuggestionEngine.formatSuggestions(suggestions);
      
      // Simple error display like Claude Code
      console.error(kleur.red(`Error: ${error.message}`));
      
      if (isVerbose || isTrace) {
        console.error(kleur.gray(`\nStack trace:\n${error.stack}`));
      }
      
      if (isInteractiveSession) {
        throw error; // Don't exit in interactive session
      } else {
        process.exit(1);
      }
    }
    
    // Unknown error type
    console.error(kleur.red(`Error: ${String(error)}`));
    
    if (isTrace) {
      console.error('Error details:', error);
    }
    
    if (isInteractiveSession) {
      throw new Error(String(error)); // Don't exit in interactive session
    } else {
      process.exit(1);
    }
  }

  private static convertToStructuredError(error: Error, context?: string): MetisError | null {
    const message = error.message.toLowerCase();
    
    // API Key errors
    if (message.includes('api_key') || message.includes('unauthorized') || message.includes('401')) {
      const provider = this.extractProvider(error.message) || 'unknown';
      return MetisError.apiKeyMissing(provider);
    }
    
    // Network/API errors
    if (message.includes('fetch failed') || message.includes('network') || message.includes('timeout')) {
      const provider = this.extractProvider(error.message) || 'API';
      return MetisError.providerRequestFailed(provider);
    }
    
    // Rate limit errors
    if (message.includes('rate limit') || message.includes('429')) {
      const provider = this.extractProvider(error.message) || 'API';
      return MetisError.providerRequestFailed(provider, 429);
    }
    
    // Groq-specific errors
    if (message.includes('groq api request failed')) {
      if (message.includes('function calling') || message.includes('tool')) {
        return MetisError.toolNotSupported('groq', 'Current model does not support function calling');
      }
      if (message.includes('max_tokens') || message.includes('too large')) {
        return MetisError.requestTooLarge('groq');
      }
      if (message.includes('http 400')) {
        return MetisError.providerRequestFailed('groq', 400);
      }
    }
    
    // File not found errors
    if (message.includes('enoent') || message.includes('no such file')) {
      const pathMatch = error.message.match(/['"](.*?)['"]/);
      const path = pathMatch ? pathMatch[1] : 'unknown';
      return MetisError.fileNotFound(path);
    }
    
    // Configuration errors
    if (message.includes('config') && (message.includes('missing') || message.includes('not found'))) {
      return MetisError.configMissing('metis.config.json');
    }
    
    return null;
  }

  private static extractProvider(message: string): string | null {
    if (message.toLowerCase().includes('openai')) return 'openai';
    if (message.toLowerCase().includes('anthropic')) return 'anthropic';
    if (message.toLowerCase().includes('groq')) return 'groq';
    return null;
  }

  static async withRecovery<T>(
    operation: () => Promise<T>,
    retries = 2,
    context?: string
  ): Promise<T> {
    return await this.withEnhancedRetry(operation, {
      maxRetries: retries
    }, context);
  }

  static async withEnhancedRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    context?: string
  ): Promise<T> {
    const operationName = context || 'operation';
    
    const result = await RetryManager.executeWithRetry(
      operation,
      config,
      (attempt, error, delay) => {
        console.log(kleur.yellow(`⚠️  ${operationName} failed (attempt ${attempt}), retrying in ${Math.round(delay/1000)}s...`));
        if (process.env.METIS_VERBOSE === 'true') {
          console.log(kleur.gray(`   Error: ${error.message}`));
        }
      }
    );

    if (!result.success) {
      // Enhance the final error with suggestions
      const enhancedError = this.enhanceError(result.error!, operationName);
      throw enhancedError;
    }

    if (result.attempts > 1 && process.env.METIS_VERBOSE === 'true') {
      console.log(kleur.green(`✅ ${operationName} succeeded after ${result.attempts} attempts`));
    }

    return result.result!;
  }

  private static enhanceError(error: Error, context?: string): Error {
    const suggestions = ErrorSuggestionEngine.analyzeError(error);
    const formattedSuggestions = ErrorSuggestionEngine.formatSuggestions(suggestions);
    
    const enhancedMessage = context 
      ? `${context} failed: ${error.message}\n\n${formattedSuggestions}`
      : `${error.message}\n\n${formattedSuggestions}`;
    
    const enhancedError = new Error(enhancedMessage);
    enhancedError.stack = error.stack;
    (enhancedError as any).originalError = error;
    (enhancedError as any).suggestions = suggestions;
    
    return enhancedError;
  }

  private static isRetryableError(error: unknown): boolean {
    if (error instanceof MetisError) {
      return error.recoverable && (
        error.code === 'PROVIDER_REQUEST_FAILED' ||
        error.code === 'NETWORK_ERROR'
      );
    }
    
    if (error instanceof Error) {
      return RetryManager.isRetryableError(error, RetryManager['DEFAULT_CONFIG'].retryableErrors);
    }
    
    return false;
  }

  // Convenience method for quick operations
  static async withQuickRetry<T>(operation: () => Promise<T>, context?: string): Promise<T> {
    return await this.withEnhancedRetry(operation, {
      maxRetries: 1,
      baseDelay: 500,
      maxDelay: 1000
    }, context);
  }

  // Convenience method for network operations  
  static async withNetworkRetry<T>(operation: () => Promise<T>, context?: string): Promise<T> {
    return await this.withEnhancedRetry(operation, {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 8000,
      backoffMultiplier: 2
    }, context);
  }
}