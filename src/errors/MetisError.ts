export class MetisError extends Error {
  public readonly code: string;
  public readonly category: 'config' | 'provider' | 'tool' | 'agent' | 'user' | 'system';
  public readonly recoverable: boolean;
  public readonly suggestions: string[];
  
  constructor(
    message: string,
    code: string,
    category: MetisError['category'],
    recoverable = true,
    suggestions: string[] = []
  ) {
    super(message);
    this.name = 'MetisError';
    this.code = code;
    this.category = category;
    this.recoverable = recoverable;
    this.suggestions = suggestions;
  }

  static configMissing(configPath: string): MetisError {
    return new MetisError(
      `Configuration file not found: ${configPath}`,
      'CONFIG_MISSING',
      'config',
      true,
      [
        'Run "metiscode init" to create initial configuration',
        'Create metis.config.json manually in your project root'
      ]
    );
  }

  static apiKeyMissing(provider: string): MetisError {
    return new MetisError(
      `API key missing for provider: ${provider}`,
      'API_KEY_MISSING',
      'config',
      true,
      [
        `Run "metiscode auth set --provider ${provider} --key YOUR_API_KEY"`,
        `Set ${provider.toUpperCase()}_API_KEY environment variable`,
        'Check that .metis/secrets.json exists and contains your API key'
      ]
    );
  }

  static toolExecutionFailed(toolName: string, reason: string): MetisError {
    return new MetisError(
      `Tool '${toolName}' execution failed: ${reason}`,
      'TOOL_EXECUTION_FAILED',
      'tool',
      true,
      [
        'Try running the tool individually to debug the issue',
        'Check that required files and directories exist',
        'Verify tool parameters are correct'
      ]
    );
  }

  static providerRequestFailed(provider: string, httpCode?: number): MetisError {
    const codeMsg = httpCode ? ` (HTTP ${httpCode})` : '';
    return new MetisError(
      `${provider} API request failed${codeMsg}`,
      'PROVIDER_REQUEST_FAILED',
      'provider',
      true,
      [
        'Check your internet connection',
        'Verify your API key is valid and has sufficient credits',
        'Try again in a few moments - the service may be temporarily unavailable',
        httpCode === 429 ? 'You may have hit rate limits - wait before retrying' : ''
      ].filter(Boolean)
    );
  }

  static fileNotFound(path: string): MetisError {
    return new MetisError(
      `File not found: ${path}`,
      'FILE_NOT_FOUND',
      'user',
      true,
      [
        'Check that the file path is correct',
        'Ensure the file exists in your project',
        'Use relative paths from your project root'
      ]
    );
  }

  static taskTooComplex(): MetisError {
    return new MetisError(
      'Task did not complete within maximum iterations',
      'TASK_TOO_COMPLEX',
      'agent',
      true,
      [
        'Break your task into smaller, more specific steps',
        'Try being more explicit about what files to modify',
        'Run individual operations separately'
      ]
    );
  }

  static unsupportedProvider(provider: string): MetisError {
    return new MetisError(
      `Unsupported provider: ${provider}`,
      'UNSUPPORTED_PROVIDER',
      'config',
      false,
      [
        'Supported providers: openai, anthropic, groq',
        'Check your metis.config.json file',
        'Update to a supported provider'
      ]
    );
  }

  static toolNotSupported(provider: string, details?: string): MetisError {
    return new MetisError(
      `Tool functionality not supported by ${provider}${details ? ': ' + details : ''}`,
      'TOOL_NOT_SUPPORTED',
      'provider',
      true,
      [
        `Switch to a different ${provider} model that supports function calling`,
        provider === 'groq' ? 'Try llama-3.1-70b-versatile or mixtral-8x7b-32768' : '',
        'Use text-only mode if function calling is not needed',
        'Check provider documentation for supported models'
      ].filter(Boolean)
    );
  }

  static requestTooLarge(provider: string): MetisError {
    return new MetisError(
      `Request too large for ${provider} provider`,
      'REQUEST_TOO_LARGE',
      'provider',
      true,
      [
        'Reduce the length of your message or context',
        'Break your task into smaller parts',
        'Use a model with larger context window',
        'Remove unnecessary details from your request'
      ]
    );
  }

  toUserFriendlyString(): string {
    // Clean error display like Claude Code
    let msg = `Error: ${this.message}`;
    
    if (this.suggestions.length > 0 && this.suggestions[0]) {
      // Show only the most relevant suggestion
      msg += `\nTry: ${this.suggestions[0]}`;
    }
    
    return msg;
  }
}