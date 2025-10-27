import kleur from 'kleur';

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalTime: number;
}

export class RetryManager {
  private static readonly DEFAULT_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    retryableErrors: [
      'ECONNRESET',
      'ECONNREFUSED', 
      'ETIMEDOUT',
      'ENOTFOUND',
      'EAI_AGAIN',
      'EPIPE',
      'Network request failed',
      'timeout',
      'rate limit',
      'too many requests',
      '429',
      '502',
      '503',
      '504'
    ]
  };

  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    onRetry?: (attempt: number, error: Error, delay: number) => void
  ): Promise<RetryResult<T>> {
    
    const finalConfig = { ...RetryManager.DEFAULT_CONFIG, ...config };
    let lastError: Error;
    const startTime = Date.now();
    
    for (let attempt = 1; attempt <= finalConfig.maxRetries + 1; attempt++) {
      try {
        const result = await operation();
        const totalTime = Date.now() - startTime;
        
        return {
          success: true,
          result,
          attempts: attempt,
          totalTime
        };
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on the final attempt
        if (attempt > finalConfig.maxRetries) {
          break;
        }
        
        // Check if error is retryable
        if (!RetryManager.isRetryableError(error, finalConfig.retryableErrors)) {
          break;
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          finalConfig.baseDelay * Math.pow(finalConfig.backoffMultiplier, attempt - 1),
          finalConfig.maxDelay
        );
        
        // Notify about retry
        onRetry?.(attempt, error, delay);
        
        // Wait before retry
        await RetryManager.delay(delay);
      }
    }
    
    const totalTime = Date.now() - startTime;
    return {
      success: false,
      error: lastError!,
      attempts: finalConfig.maxRetries + 1,
      totalTime
    };
  }

  static isRetryableError(error: Error, retryableErrors: string[]): boolean {
    const errorMessage = error.message.toLowerCase();
    const errorCode = (error as any).code?.toLowerCase() || '';
    
    return retryableErrors.some(retryableError => {
      const checkString = retryableError.toLowerCase();
      return errorMessage.includes(checkString) || errorCode.includes(checkString);
    });
  }

  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static createRetryableOperation<T>(
    operation: () => Promise<T>,
    context: string = 'operation'
  ) {
    return async (config?: Partial<RetryConfig>): Promise<T> => {
      const result = await RetryManager.executeWithRetry(
        operation,
        config,
        (attempt, error, delay) => {
          console.log(kleur.yellow(`⚠️  ${context} failed (attempt ${attempt}), retrying in ${Math.round(delay/1000)}s...`));
          console.log(kleur.gray(`   Error: ${error.message}`));
        }
      );

      if (!result.success) {
        throw new Error(`${context} failed after ${result.attempts} attempts: ${result.error?.message}`);
      }

      if (result.attempts > 1) {
        console.log(kleur.green(`✅ ${context} succeeded after ${result.attempts} attempts`));
      }

      return result.result!;
    };
  }
}