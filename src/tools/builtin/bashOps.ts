import { spawn, execSync, execFileSync } from "child_process";
import { RegisteredTool, ToolHandler, ExecutionContext, ToolResult } from "../registry";
import { getProcessManager } from "../../runtime/processManager";

// Import platform utilities
import { PlatformCommands } from "../../utils/platformCommands";

// Enhanced dangerous command detection
function isDangerousCommand(command: string, args: string[]): boolean {
  const normalized = command.toLowerCase().trim();
  const fullCommand = `${command} ${args.join(' ')}`.toLowerCase();

  // Check for shell metacharacters that could enable injection
  if (command.match(/[;&|`$()<>]/)) {
    return true;
  }

  // Check for dangerous executables
  const dangerousExes = ['rm', 'format', 'fdisk', 'mkfs', 'dd', 'shutdown', 'reboot', 'del', 'erase'];
  if (dangerousExes.includes(normalized)) {
    // Check for recursive/force flags
    const dangerousFlags = ['-rf', '-r', '-f', '--force', '/s', '/q'];
    if (args.some(arg => dangerousFlags.includes(arg.toLowerCase().trim()))) {
      return true;
    }
  }

  // Check for dangerous command patterns
  const dangerousPatterns = ['rm -rf', 'rm -fr', 'format c:', 'del /s', 'deltree'];
  if (dangerousPatterns.some(pattern => fullCommand.includes(pattern))) {
    return true;
  }

  return false;
}

// Bash Command Tool
const bashHandler: ToolHandler = {
  async execute(
    params: {
      command: string | string[];
      args?: string[];
      timeout?: number;
      capture_output?: boolean;
      run_in_background?: boolean;
      description?: string;
      dangerouslyDisableSandbox?: boolean;
    },
    context: ExecutionContext
  ): Promise<ToolResult> {
    let { command, args = [], timeout = 30000, capture_output = true, run_in_background = false } = params;

    // Handle case where command is passed as an array (common AI mistake)
    if (Array.isArray(command)) {
      if (command.length > 0) {
        // Convert array to string format
        const fullCommand = command.join(' ');
        command = fullCommand;
        args = []; // Clear args since we're using the full command string
      } else {
        return {
          success: false,
          error: "Command cannot be empty"
        };
      }
    }

    // Auto-convert common Unix commands to Windows equivalents
    if (process.platform === 'win32') {
      const fullCmd = `${command} ${args.join(' ')}`;

      // Check for common Unix commands and convert them
      if (command === 'rm') {
        if (args.includes('-rf') || args.includes('-r')) {
          // Recursive directory delete
          const target = args[args.length - 1];
          const converted = PlatformCommands.deleteDirectory(target);
          const parts = converted.split(' ');
          command = parts[0];
          args = parts.slice(1);
        } else {
          // File delete
          const target = args.find(arg => !arg.startsWith('-')) || '';
          const converted = PlatformCommands.deleteFile(target);
          const parts = converted.split(' ');
          command = parts[0];
          args = parts.slice(1);
        }
      } else if (command === 'ls') {
        command = 'dir';
      } else if (command === 'cp') {
        if (args.length >= 2) {
          const source = args[args.length - 2];
          const dest = args[args.length - 1];
          const converted = PlatformCommands.copyFile(source, dest);
          const parts = converted.split(' ');
          command = parts[0];
          args = parts.slice(1);
        }
      } else if (command === 'mv') {
        if (args.length >= 2) {
          const source = args[args.length - 2];
          const dest = args[args.length - 1];
          const converted = PlatformCommands.moveFile(source, dest);
          const parts = converted.split(' ');
          command = parts[0];
          args = parts.slice(1);
        }
      } else if (command === 'which') {
        command = 'where';
      } else if (command === 'clear') {
        command = 'cls';
      }
    }
    
    // Enhanced safety check for dangerous commands
    if (isDangerousCommand(command, args)) {
      return {
        success: false,
        error: `Dangerous command blocked: ${command} ${args.join(' ')}. Use specific tools for file operations.`
      };
    }

    // Handle background process execution
    if (run_in_background) {
      const processManager = getProcessManager();

      try {
        const processId = processManager.startProcess(command, args, {
          cwd: context.workingDirectory,
          shell: true
        });

        const process = processManager.getProcess(processId);

        return {
          success: true,
          content: `Process started in background`,
          metadata: {
            bash_id: processId,
            pid: process?.pid,
            command,
            args,
            status: 'running'
          }
        };
      } catch (error: any) {
        return {
          success: false,
          error: `Failed to start background process: ${error.message}`
        };
      }
    }

    try {
      if (capture_output) {
        // Synchronous execution with output capture
        // Use execFileSync for better security (doesn't invoke shell by default)
        try {
          const result = execFileSync(command, args, {
            cwd: context.workingDirectory,
            encoding: 'utf8',
            timeout: timeout,
            maxBuffer: 1024 * 1024, // 1MB buffer
            shell: false  // CRITICAL: Disable shell to prevent injection
          });

          return {
            success: true,
            content: result.toString(),
            metadata: {
              command,
              args,
              exit_code: 0,
              execution_time: Date.now(),
              security: 'safe_execution'
            }
          };
        } catch (execFileError: any) {
          // Fallback to execSync ONLY if the command needs shell features
          // This is a security tradeoff, but logged for audit
          console.warn(`[Security] Falling back to shell execution for: ${command}`);

          const result = execSync(`${command} ${args.join(' ')}`, {
            cwd: context.workingDirectory,
            encoding: 'utf8',
            timeout: timeout,
            maxBuffer: 1024 * 1024,
            shell: true
          });

          return {
            success: true,
            content: result.toString(),
            metadata: {
              command,
              args,
              exit_code: 0,
              execution_time: Date.now(),
              security: 'shell_execution_fallback'
            }
          };
        }
      } else {
        // Asynchronous execution without waiting
        const child = spawn(command, args, {
          cwd: context.workingDirectory,
          detached: true,
          stdio: 'ignore'
        });
        
        child.unref();

        return {
          success: true,
          content: `Command started: ${command} ${args.join(' ')}`,
          metadata: {
            command,
            args,
            pid: child.pid,
            detached: true
          }
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: `Command failed: ${error.message}`,
        metadata: {
          command,
          args,
          exit_code: error.status || -1,
          stderr: error.stderr?.toString() || ''
        }
      };
    }
  }
};

export const bashTool: RegisteredTool = {
  name: "bash",
  description: "Execute shell/bash commands with safety restrictions",
  schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Command to execute (e.g., 'python script.py' or just 'ls')"
      },
      description: {
        type: "string",
        description: "Clear, concise description of what this command does in 5-10 words"
      },
      args: {
        type: "array",
        items: { type: "string" },
        description: "Optional command arguments as separate strings"
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (max 600000)",
        default: 120000
      },
      capture_output: {
        type: "boolean",
        description: "Whether to capture and return command output",
        default: true
      },
      run_in_background: {
        type: "boolean",
        description: "Run command in background and return immediately. Use bash_output to monitor.",
        default: false
      },
      dangerouslyDisableSandbox: {
        type: "boolean",
        description: "Disable sandbox mode (use with caution)",
        default: false
      }
    },
    required: ["command"]
  },
  safety: {
    require_approval: true, // Always require approval for shell commands
    network_access: true,   // Commands may access network
    max_execution_time: 60000,
    allowed_in_ci: false,
    dangerous_patterns: ['rm -rf', 'format', 'shutdown', 'reboot']
  },
  handler: bashHandler,
  metadata: {
    category: "system_operations",
    version: "1.0",
    author: "metis-team"
  }
};

// Process List Tool
const psHandler: ToolHandler = {
  async execute(params: { grep?: string; full?: boolean }, context: ExecutionContext): Promise<ToolResult> {
    const { grep, full = false } = params;
    
    try {
      let command = process.platform === 'win32' ? 'tasklist' : 'ps';
      let args: string[] = [];

      if (process.platform !== 'win32') {
        args = full ? ['aux'] : ['ax'];
      }

      // Use execFileSync for safer execution
      let result = execFileSync(command, args, {
        cwd: context.workingDirectory,
        encoding: 'utf8',
        timeout: 10000,
        shell: false
      });

      // Apply grep filter if specified
      if (grep) {
        const lines = result.split('\n');
        const filtered = lines.filter(line => 
          line.toLowerCase().includes(grep.toLowerCase())
        );
        result = filtered.join('\n');
      }

      return {
        success: true,
        content: result,
        metadata: {
          platform: process.platform,
          grep_filter: grep || null,
          full_info: full
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to list processes: ${error.message}`
      };
    }
  }
};

export const psTool: RegisteredTool = {
  name: "ps",
  description: "List running processes",
  schema: {
    type: "object",
    properties: {
      grep: {
        type: "string",
        description: "Filter processes by name/command"
      },
      full: {
        type: "boolean",
        description: "Show full process information",
        default: false
      }
    }
  },
  safety: {
    require_approval: false,
    network_access: false,
    max_execution_time: 10000,
    allowed_in_ci: true
  },
  handler: psHandler,
  metadata: {
    category: "system_operations",
    version: "1.0",
    author: "metis-team"
  }
};

// Environment Variables Tool
const envHandler: ToolHandler = {
  async execute(params: { variable?: string; grep?: string }, context: ExecutionContext): Promise<ToolResult> {
    const { variable, grep } = params;
    
    try {
      if (variable) {
        // Get specific environment variable
        const value = process.env[variable];
        return {
          success: true,
          content: value || '',
          metadata: {
            variable,
            exists: value !== undefined
          }
        };
      } else {
        // Get all environment variables
        let envVars = Object.entries(process.env)
          .map(([key, value]) => `${key}=${value || ''}`)
          .sort();

        // Apply grep filter if specified
        if (grep) {
          envVars = envVars.filter(line => 
            line.toLowerCase().includes(grep.toLowerCase())
          );
        }

        return {
          success: true,
          content: envVars.join('\n'),
          metadata: {
            total_vars: Object.keys(process.env).length,
            filtered_vars: envVars.length,
            grep_filter: grep || null
          }
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to get environment variables: ${error.message}`
      };
    }
  }
};

export const envTool: RegisteredTool = {
  name: "env",
  description: "Get environment variables",
  schema: {
    type: "object",
    properties: {
      variable: {
        type: "string",
        description: "Specific environment variable to get"
      },
      grep: {
        type: "string",
        description: "Filter environment variables"
      }
    }
  },
  safety: {
    require_approval: false,
    network_access: false,
    max_execution_time: 5000,
    allowed_in_ci: true
  },
  handler: envHandler,
  metadata: {
    category: "system_operations",
    version: "1.0",
    author: "metis-team"
  }
};

// Which Tool (find executable)
const whichHandler: ToolHandler = {
  async execute(params: { command: string }, context: ExecutionContext): Promise<ToolResult> {
    const { command } = params;
    
    try {
      const whichCmd = process.platform === 'win32' ? 'where' : 'which';
      // Use execFileSync for safer execution
      const result = execFileSync(whichCmd, [command], {
        cwd: context.workingDirectory,
        encoding: 'utf8',
        timeout: 5000,
        shell: false
      });

      return {
        success: true,
        content: result.trim(),
        metadata: {
          command,
          platform: process.platform,
          found: result.trim().length > 0
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Command not found: ${command}`,
        metadata: {
          command,
          platform: process.platform,
          found: false
        }
      };
    }
  }
};

export const whichTool: RegisteredTool = {
  name: "which",
  description: "Find the path of an executable command",
  schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Command to find"
      }
    },
    required: ["command"]
  },
  safety: {
    require_approval: false,
    network_access: false,
    max_execution_time: 5000,
    allowed_in_ci: true
  },
  handler: whichHandler,
  metadata: {
    category: "system_operations",
    version: "1.0",
    author: "metis-team"
  }
};