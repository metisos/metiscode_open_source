import { spawn, execSync, exec } from "child_process";
import { RegisteredTool, ToolHandler, ExecutionContext, ToolResult } from "../registry";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";

const execAsync = promisify(exec);

/**
 * Enhanced Bash Operations with improved code execution capabilities
 * Features:
 * - Intelligent working directory detection
 * - Better error handling and output formatting
 * - Code execution environments (Python, Node.js, etc.)
 * - Background process management
 * - Enhanced safety with context awareness
 */

// Enhanced Bash Command Tool
const enhancedBashHandler: ToolHandler = {
  async execute(
    params: {
      command: string | string[];
      args?: string[];
      timeout?: number;
      capture_output?: boolean;
      working_dir?: string;
      environment?: Record<string, string>;
      background?: boolean;
      shell?: boolean;
    },
    context: ExecutionContext
  ): Promise<ToolResult> {
    let {
      command,
      args = [],
      timeout = 30000,
      capture_output = true,
      working_dir,
      environment = {},
      background = false,
      shell = false
    } = params;

    // Handle case where command is passed as an array
    if (Array.isArray(command)) {
      if (command.length > 0) {
        const fullCommand = command.join(' ');
        command = fullCommand;
        args = [];
      } else {
        return {
          success: false,
          error: "Command cannot be empty"
        };
      }
    }

    // Determine working directory with intelligent detection
    const workingDirectory = working_dir || context.workingDirectory;

    // Enhanced safety checks
    const safetyCheck = performSafetyCheck(command, args, workingDirectory);
    if (!safetyCheck.safe) {
      return {
        success: false,
        error: safetyCheck.reason,
        metadata: { blocked: true, reason: safetyCheck.reason }
      };
    }

    // Prepare environment variables
    const env = { ...process.env, ...environment };

    // Auto-detect and prepare code execution environments
    const executionContext = detectExecutionContext(command, workingDirectory);

    try {
      if (background) {
        return await executeInBackground(command, args, workingDirectory, env);
      } else if (capture_output) {
        return await executeWithOutput(command, args, workingDirectory, env, timeout, shell, executionContext);
      } else {
        return await executeDetached(command, args, workingDirectory, env);
      }
    } catch (error: any) {
      return {
        success: false,
        error: `Command execution failed: ${error.message}`,
        metadata: {
          command,
          args,
          working_directory: workingDirectory,
          exit_code: error.status || error.code || -1,
          stderr: error.stderr?.toString() || '',
          execution_context: executionContext
        }
      };
    }
  }
};

// Enhanced safety checking with context awareness
function performSafetyCheck(command: string, args: string[], workingDir: string): { safe: boolean; reason?: string } {
  const fullCommand = `${command} ${args.join(' ')}`.toLowerCase();

  // Critical system commands that should be blocked
  const criticalCommands = [
    'format', 'fdisk', 'mkfs', 'dd if=', 'shutdown', 'reboot', 'halt',
    'rm -rf /', 'del /s', 'deltree', 'rd /s'
  ];

  for (const dangerous of criticalCommands) {
    if (fullCommand.includes(dangerous)) {
      return { safe: false, reason: `Critical system command blocked: ${dangerous}` };
    }
  }

  // Check for recursive deletes outside project directory
  if (fullCommand.includes('rm -rf') || fullCommand.includes('del /s')) {
    const target = args[args.length - 1];
    if (target && (target.startsWith('/') || target.includes('..') || target.includes('C:\\'))) {
      return { safe: false, reason: 'Recursive delete outside project directory blocked' };
    }
  }

  // Allow safe commands
  return { safe: true };
}

// Detect execution context and prepare environment
function detectExecutionContext(command: string, workingDir: string): any {
  const context: any = {
    type: 'shell',
    language: null,
    project_files: [],
    package_managers: []
  };

  // Detect language/runtime
  if (command.startsWith('python') || command.startsWith('py ')) {
    context.type = 'python';
    context.language = 'python';

    // Check for Python project files
    const pythonFiles = ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile', 'environment.yml'];
    context.project_files = pythonFiles.filter(file =>
      fs.existsSync(path.join(workingDir, file))
    );
  } else if (command.startsWith('node') || command.startsWith('npm') || command.startsWith('npx')) {
    context.type = 'node';
    context.language = 'javascript';

    // Check for Node.js project files
    const nodeFiles = ['package.json', 'package-lock.json', 'yarn.lock', 'tsconfig.json'];
    context.project_files = nodeFiles.filter(file =>
      fs.existsSync(path.join(workingDir, file))
    );
  } else if (command.startsWith('cargo') || command.includes('.rs')) {
    context.type = 'rust';
    context.language = 'rust';

    if (fs.existsSync(path.join(workingDir, 'Cargo.toml'))) {
      context.project_files.push('Cargo.toml');
    }
  } else if (command.startsWith('go ') || command.includes('.go')) {
    context.type = 'go';
    context.language = 'go';

    if (fs.existsSync(path.join(workingDir, 'go.mod'))) {
      context.project_files.push('go.mod');
    }
  }

  return context;
}

// Execute command with full output capture and enhanced formatting
async function executeWithOutput(
  command: string,
  args: string[],
  workingDir: string,
  env: Record<string, string>,
  timeout: number,
  shell: boolean,
  executionContext: any
): Promise<ToolResult> {

  const fullCommand = `${command} ${args.join(' ')}`;

  try {
    const { stdout, stderr } = await execAsync(fullCommand, {
      cwd: workingDir,
      env,
      timeout,
      maxBuffer: 2 * 1024 * 1024, // 2MB buffer
      shell: shell || process.platform === 'win32' // Always use shell on Windows
    });

    // Format output with enhanced presentation
    const output = formatCommandOutput(stdout, stderr, executionContext);

    return {
      success: true,
      content: output,
      metadata: {
        command,
        args,
        working_directory: workingDir,
        exit_code: 0,
        execution_time: Date.now(),
        execution_context: executionContext,
        output_size: output.length
      }
    };
  } catch (error: any) {
    const formattedError = formatErrorOutput(error, executionContext);

    return {
      success: false,
      error: formattedError,
      metadata: {
        command,
        args,
        working_directory: workingDir,
        exit_code: error.code || -1,
        stderr: error.stderr || '',
        stdout: error.stdout || '',
        execution_context: executionContext
      }
    };
  }
}

// Execute command in background with process tracking
async function executeInBackground(
  command: string,
  args: string[],
  workingDir: string,
  env: Record<string, string>
): Promise<ToolResult> {

  const child = spawn(command, args, {
    cwd: workingDir,
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.unref();

  // Store process info for potential management
  const processInfo = {
    pid: child.pid,
    command: `${command} ${args.join(' ')}`,
    started_at: new Date().toISOString(),
    working_directory: workingDir
  };

  return {
    success: true,
    content: `Background process started: ${command} ${args.join(' ')}`,
    metadata: {
      ...processInfo,
      detached: true
    }
  };
}

// Execute detached command (fire and forget)
async function executeDetached(
  command: string,
  args: string[],
  workingDir: string,
  env: Record<string, string>
): Promise<ToolResult> {

  const child = spawn(command, args, {
    cwd: workingDir,
    env,
    detached: true,
    stdio: 'ignore'
  });

  child.unref();

  return {
    success: true,
    content: `Detached command started: ${command} ${args.join(' ')}`,
    metadata: {
      command,
      args,
      pid: child.pid,
      working_directory: workingDir,
      detached: true
    }
  };
}

// Enhanced output formatting based on execution context
function formatCommandOutput(stdout: string, stderr: string, context: any): string {
  const parts: string[] = [];

  if (stdout.trim()) {
    // Format based on execution context
    if (context.type === 'python' && (stdout.includes('Traceback') || stdout.includes('Error:'))) {
      parts.push('🐍 Python Error Output:');
      parts.push(formatPythonError(stdout));
    } else if (context.type === 'node' && stdout.includes('npm ERR!')) {
      parts.push('📦 NPM Error Output:');
      parts.push(formatNpmError(stdout));
    } else if (context.language && stdout.includes('error')) {
      parts.push(`🔧 ${context.language.charAt(0).toUpperCase() + context.language.slice(1)} Output:`);
      parts.push(stdout);
    } else {
      parts.push('📤 Command Output:');
      parts.push(stdout);
    }
  }

  if (stderr.trim()) {
    parts.push('⚠️  Error Output:');
    parts.push(stderr);
  }

  return parts.join('\n\n').trim() || '✅ Command completed successfully (no output)';
}

// Format error output with enhanced context
function formatErrorOutput(error: any, context: any): string {
  const parts: string[] = [];

  if (error.code) {
    parts.push(`❌ Command failed with exit code: ${error.code}`);
  }

  if (error.stdout) {
    parts.push('📤 Standard Output:');
    parts.push(error.stdout);
  }

  if (error.stderr) {
    // Context-aware error formatting
    if (context.type === 'python' && error.stderr.includes('Traceback')) {
      parts.push('🐍 Python Traceback:');
      parts.push(formatPythonError(error.stderr));
    } else if (context.type === 'node' && error.stderr.includes('npm ERR!')) {
      parts.push('📦 NPM Error:');
      parts.push(formatNpmError(error.stderr));
    } else {
      parts.push('⚠️  Error Details:');
      parts.push(error.stderr);
    }
  }

  if (error.message && !error.stderr) {
    parts.push('💬 Error Message:');
    parts.push(error.message);
  }

  return parts.join('\n\n');
}

// Format Python errors for better readability
function formatPythonError(output: string): string {
  const lines = output.split('\n');
  const formatted: string[] = [];

  for (const line of lines) {
    if (line.includes('File "')) {
      formatted.push(`📁 ${line}`);
    } else if (line.includes('Error:') || line.includes('Exception:')) {
      formatted.push(`🚨 ${line}`);
    } else if (line.trim().startsWith('Traceback')) {
      formatted.push(`🔍 ${line}`);
    } else {
      formatted.push(line);
    }
  }

  return formatted.join('\n');
}

// Format NPM errors for better readability
function formatNpmError(output: string): string {
  const lines = output.split('\n');
  const formatted: string[] = [];

  for (const line of lines) {
    if (line.includes('npm ERR!')) {
      formatted.push(line.replace('npm ERR!', '📦❌'));
    } else if (line.includes('WARN')) {
      formatted.push(line.replace('WARN', '⚠️'));
    } else {
      formatted.push(line);
    }
  }

  return formatted.join('\n');
}

export const enhancedBashTool: RegisteredTool = {
  name: "enhanced_bash",
  description: "Execute shell commands with enhanced code execution capabilities, intelligent error formatting, and improved safety",
  schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Command to execute (e.g., 'python script.py', 'npm test', 'cargo run')"
      },
      args: {
        type: "array",
        items: { type: "string" },
        description: "Optional command arguments as separate strings"
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds",
        default: 30000
      },
      capture_output: {
        type: "boolean",
        description: "Whether to capture and return command output",
        default: true
      },
      working_dir: {
        type: "string",
        description: "Working directory for command execution"
      },
      environment: {
        type: "object",
        description: "Additional environment variables",
        additionalProperties: { type: "string" }
      },
      background: {
        type: "boolean",
        description: "Run command in background with process tracking",
        default: false
      },
      shell: {
        type: "boolean",
        description: "Execute command through shell",
        default: false
      }
    },
    required: ["command"]
  },
  safety: {
    require_approval: true,
    network_access: true,
    max_execution_time: 120000, // 2 minutes for code compilation/testing
    allowed_in_ci: false,
    dangerous_patterns: ['rm -rf /', 'format', 'shutdown', 'reboot', 'del /s']
  },
  handler: enhancedBashHandler,
  metadata: {
    category: "enhanced_system_operations",
    version: "2.0",
    author: "metis-team",
    features: [
      "intelligent_error_formatting",
      "code_execution_context",
      "enhanced_safety_checks",
      "background_process_management"
    ]
  }
};

// Code Runner Tool - Specialized for running code snippets
const codeRunnerHandler: ToolHandler = {
  async execute(
    params: {
      language: string;
      code: string;
      filename?: string;
      args?: string[];
      install_deps?: boolean;
    },
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { language, code, filename, args = [], install_deps = false } = params;

    // Create temporary file for code execution
    const tempDir = path.join(context.workingDirectory, '.metis', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const timestamp = Date.now();
    const extensions: Record<string, string> = {
      'python': '.py',
      'javascript': '.js',
      'typescript': '.ts',
      'rust': '.rs',
      'go': '.go',
      'java': '.java',
      'cpp': '.cpp',
      'c': '.c'
    };

    const ext = extensions[language.toLowerCase()] || '.txt';
    const tempFile = filename || `temp_${timestamp}${ext}`;
    const tempPath = path.join(tempDir, tempFile);

    try {
      // Write code to temporary file
      fs.writeFileSync(tempPath, code, 'utf8');

      // Execute based on language
      const result = await executeCodeByLanguage(language, tempPath, args, context, install_deps);

      return {
        success: result.success,
        content: result.content,
        error: result.error,
        metadata: {
          language,
          filename: tempFile,
          temp_path: tempPath,
          code_size: code.length,
          execution_context: result.metadata
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Code execution failed: ${error.message}`,
        metadata: {
          language,
          filename: tempFile,
          temp_path: tempPath
        }
      };
    } finally {
      // Cleanup temporary file
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  }
};

// Execute code based on language with intelligent setup
async function executeCodeByLanguage(
  language: string,
  filePath: string,
  args: string[],
  context: ExecutionContext,
  installDeps: boolean
): Promise<any> {
  const workingDir = path.dirname(filePath);

  switch (language.toLowerCase()) {
    case 'python':
      return await executePythonCode(filePath, args, context, installDeps);
    case 'javascript':
    case 'js':
      return await executeJavaScriptCode(filePath, args, context, installDeps);
    case 'typescript':
    case 'ts':
      return await executeTypeScriptCode(filePath, args, context, installDeps);
    default:
      return {
        success: false,
        error: `Unsupported language: ${language}`,
        content: '',
        metadata: { supported_languages: ['python', 'javascript', 'typescript'] }
      };
  }
}

// Python code execution with environment detection
async function executePythonCode(filePath: string, args: string[], context: ExecutionContext, installDeps: boolean): Promise<any> {
  try {
    // Check for Python installation
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    const { stdout, stderr } = await execAsync(`${pythonCmd} "${filePath}" ${args.join(' ')}`, {
      cwd: context.workingDirectory,
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024
    });

    return {
      success: true,
      content: formatCommandOutput(stdout, stderr, { type: 'python', language: 'python' }),
      metadata: { python_command: pythonCmd, exit_code: 0 }
    };
  } catch (error: any) {
    return {
      success: false,
      error: formatErrorOutput(error, { type: 'python', language: 'python' }),
      content: '',
      metadata: { exit_code: error.code || -1 }
    };
  }
}

// JavaScript code execution
async function executeJavaScriptCode(filePath: string, args: string[], context: ExecutionContext, installDeps: boolean): Promise<any> {
  try {
    const { stdout, stderr } = await execAsync(`node "${filePath}" ${args.join(' ')}`, {
      cwd: context.workingDirectory,
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024
    });

    return {
      success: true,
      content: formatCommandOutput(stdout, stderr, { type: 'node', language: 'javascript' }),
      metadata: { runtime: 'node', exit_code: 0 }
    };
  } catch (error: any) {
    return {
      success: false,
      error: formatErrorOutput(error, { type: 'node', language: 'javascript' }),
      content: '',
      metadata: { exit_code: error.code || -1 }
    };
  }
}

// TypeScript code execution with compilation
async function executeTypeScriptCode(filePath: string, args: string[], context: ExecutionContext, installDeps: boolean): Promise<any> {
  try {
    // Try ts-node first
    try {
      const { stdout, stderr } = await execAsync(`npx ts-node "${filePath}" ${args.join(' ')}`, {
        cwd: context.workingDirectory,
        timeout: 45000,
        maxBuffer: 2 * 1024 * 1024
      });

      return {
        success: true,
        content: formatCommandOutput(stdout, stderr, { type: 'node', language: 'typescript' }),
        metadata: { runtime: 'ts-node', exit_code: 0 }
      };
    } catch {
      // Fall back to compilation + execution
      const jsPath = filePath.replace('.ts', '.js');
      await execAsync(`npx tsc "${filePath}" --outFile "${jsPath}"`, {
        cwd: context.workingDirectory,
        timeout: 30000
      });

      const { stdout, stderr } = await execAsync(`node "${jsPath}" ${args.join(' ')}`, {
        cwd: context.workingDirectory,
        timeout: 30000,
        maxBuffer: 2 * 1024 * 1024
      });

      return {
        success: true,
        content: formatCommandOutput(stdout, stderr, { type: 'node', language: 'typescript' }),
        metadata: { runtime: 'tsc+node', compiled_to: jsPath, exit_code: 0 }
      };
    }
  } catch (error: any) {
    return {
      success: false,
      error: formatErrorOutput(error, { type: 'node', language: 'typescript' }),
      content: '',
      metadata: { exit_code: error.code || -1 }
    };
  }
}

export const codeRunnerTool: RegisteredTool = {
  name: "run_code",
  description: "Execute code snippets in various languages with intelligent environment setup",
  schema: {
    type: "object",
    properties: {
      language: {
        type: "string",
        description: "Programming language (python, javascript, typescript, etc.)",
        enum: ["python", "javascript", "typescript", "js", "ts", "py"]
      },
      code: {
        type: "string",
        description: "Code to execute"
      },
      filename: {
        type: "string",
        description: "Optional filename for the code"
      },
      args: {
        type: "array",
        items: { type: "string" },
        description: "Command line arguments for the code"
      },
      install_deps: {
        type: "boolean",
        description: "Whether to automatically install dependencies",
        default: false
      }
    },
    required: ["language", "code"]
  },
  safety: {
    require_approval: true,
    network_access: true, // Code might need to download dependencies
    max_execution_time: 60000,
    allowed_in_ci: false
  },
  handler: codeRunnerHandler,
  metadata: {
    category: "code_execution",
    version: "2.0",
    author: "metis-team",
    supported_languages: ["python", "javascript", "typescript"]
  }
};