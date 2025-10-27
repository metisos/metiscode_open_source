import kleur from 'kleur';
import { ToolResult } from '../tools/registry';

export interface ErrorSuggestion {
  type: 'fix' | 'info' | 'command' | 'warning';
  message: string;
  action?: string;
  command?: string;
}

export class ErrorSuggestionEngine {
  private static readonly ERROR_PATTERNS: Array<{
    pattern: RegExp;
    suggestions: ErrorSuggestion[];
  }> = [
    // API Key Issues
    {
      pattern: /(api key|authentication|unauthorized|401)/i,
      suggestions: [
        {
          type: 'command',
          message: 'API key might be missing or invalid',
          action: 'Configure your API key',
          command: 'metiscode auth set openai YOUR_API_KEY'
        },
        {
          type: 'info',
          message: 'Check that your API key has the correct permissions'
        }
      ]
    },
    
    // Network Issues
    {
      pattern: /(network|connection|timeout|enotfound|econnrefused)/i,
      suggestions: [
        {
          type: 'fix',
          message: 'Check your internet connection'
        },
        {
          type: 'info',
          message: 'The operation will be retried automatically'
        },
        {
          type: 'command',
          message: 'Try running the operation again',
          action: 'Manual retry'
        }
      ]
    },
    
    // Rate Limiting
    {
      pattern: /(rate limit|too many requests|429)/i,
      suggestions: [
        {
          type: 'info',
          message: 'You\'re being rate limited by the API'
        },
        {
          type: 'fix',
          message: 'Wait a moment and try again - the system will retry automatically'
        },
        {
          type: 'command',
          message: 'Consider switching to auto-accept mode to reduce API calls',
          action: 'Switch permission mode',
          command: '/mode auto_accept'
        }
      ]
    },
    
    // File Not Found
    {
      pattern: /(file not found|enoent|no such file)/i,
      suggestions: [
        {
          type: 'fix',
          message: 'Check that the file path is correct'
        },
        {
          type: 'info',
          message: 'Verify the file exists in your workspace'
        },
        {
          type: 'command',
          message: 'List files in the directory',
          action: 'Check directory contents',
          command: 'ls'
        }
      ]
    },
    
    // Permission Denied
    {
      pattern: /(permission denied|eacces|access denied)/i,
      suggestions: [
        {
          type: 'fix',
          message: 'You don\'t have permission to access this file/directory'
        },
        {
          type: 'command',
          message: 'Check file permissions',
          action: 'View permissions',
          command: 'ls -la'
        },
        {
          type: 'warning',
          message: 'Be careful when changing file permissions'
        }
      ]
    },
    
    // Git Issues
    {
      pattern: /(git|repository|not a git repository|fatal: not a git repository)/i,
      suggestions: [
        {
          type: 'command',
          message: 'Initialize a git repository',
          action: 'Init git repo',
          command: 'git init'
        },
        {
          type: 'info',
          message: 'Make sure you\'re in the correct directory'
        }
      ]
    },
    
    // Node/NPM Issues
    {
      pattern: /(module not found|cannot find module|npm)/i,
      suggestions: [
        {
          type: 'command',
          message: 'Install dependencies',
          action: 'Install packages',
          command: 'npm install'
        },
        {
          type: 'info',
          message: 'Check if the package name is correct'
        }
      ]
    },
    
    // Tool Not Found
    {
      pattern: /tool not found/i,
      suggestions: [
        {
          type: 'command',
          message: 'See available tools',
          action: 'List tools',
          command: 'metiscode tools list'
        },
        {
          type: 'info',
          message: 'Check if the tool name is spelled correctly'
        }
      ]
    }
  ];

  static analyzeError(error: Error | string): ErrorSuggestion[] {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const suggestions: ErrorSuggestion[] = [];

    for (const { pattern, suggestions: patternSuggestions } of this.ERROR_PATTERNS) {
      if (pattern.test(errorMessage)) {
        suggestions.push(...patternSuggestions);
      }
    }

    // Add generic suggestions if no specific ones found
    if (suggestions.length === 0) {
      suggestions.push(
        {
          type: 'info',
          message: 'An unexpected error occurred'
        },
        {
          type: 'command',
          message: 'Try running the operation again'
        },
        {
          type: 'command',
          message: 'Check system status',
          action: 'View status',
          command: 'metiscode status'
        }
      );
    }

    return suggestions;
  }

  static formatSuggestions(suggestions: ErrorSuggestion[]): string {
    if (suggestions.length === 0) return '';

    const lines = [kleur.white('💡 Suggestions:')];
    
    for (const suggestion of suggestions) {
      const icon = this.getSuggestionIcon(suggestion.type);
      const message = kleur.gray(`   ${icon} ${suggestion.message}`);
      lines.push(message);
      
      if (suggestion.command) {
        const commandLine = kleur.cyan(`      → ${suggestion.command}`);
        lines.push(commandLine);
      }
    }
    
    return lines.join('\n');
  }

  private static getSuggestionIcon(type: string): string {
    switch (type) {
      case 'fix': return '🔧';
      case 'info': return 'ℹ️';
      case 'command': return '💻';
      case 'warning': return '⚠️';
      default: return '💡';
    }
  }

  static enhanceToolResult(result: ToolResult): ToolResult {
    if (result.success || !result.error) return result;

    const suggestions = this.analyzeError(result.error);
    const formattedSuggestions = this.formatSuggestions(suggestions);
    
    return {
      ...result,
      error: result.error + '\n\n' + formattedSuggestions,
      metadata: {
        ...result.metadata,
        suggestions,
        enhancedError: true
      }
    };
  }
}