import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { RegisteredTool, ToolHandler, ExecutionContext, ToolResult } from "../registry";
import { withinCwdSafe } from "../files";

// Grep Tool (most critical for Claude Code parity!)
const grepHandler: ToolHandler = {
  async execute(
    params: { 
      pattern: string; 
      path?: string;
      recursive?: boolean;
      case_sensitive?: boolean;
      line_numbers?: boolean;
      context?: number;
      file_pattern?: string;
      max_results?: number;
    }, 
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { 
      pattern, 
      path: searchPath = ".", 
      recursive = true,
      case_sensitive = false,
      line_numbers = true,
      context: contextLines = 0,
      file_pattern,
      max_results = 100
    } = params;
    
    if (!withinCwdSafe(searchPath, context.workingDirectory)) {
      return {
        success: false,
        error: `Path outside workspace: ${searchPath}`
      };
    }

    const fullPath = path.resolve(context.workingDirectory, searchPath);
    
    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        error: `Path not found: ${searchPath}`
      };
    }

    try {
      // Try to use ripgrep if available, fall back to native implementation
      const ripgrepResult = await tryRipgrep(params, context);
      if (ripgrepResult) {
        return ripgrepResult;
      }
      
      // Ripgrep not available, use native implementation
      return await nativeGrep(params, context);
    } catch (error: any) {
      return {
        success: false,
        error: `Search failed: ${error.message}`
      };
    }
  }
};

// Try using ripgrep (much faster)
async function tryRipgrep(params: any, context: ExecutionContext): Promise<ToolResult | null> {
  try {
    // First check if ripgrep is available
    try {
      execSync('rg --version', { stdio: 'ignore' });
    } catch {
      // ripgrep not installed, silently fall back to native implementation
      return null;
    }

    const { pattern, path: searchPath = ".", recursive, case_sensitive, line_numbers, context: contextLines, file_pattern, max_results } = params;

    let args = ['rg'];
    
    if (!case_sensitive) args.push('-i');
    if (line_numbers) args.push('-n');
    if (contextLines && contextLines > 0) args.push(`-C${contextLines}`);
    if (!recursive) args.push('--max-depth=1');
    if (file_pattern) args.push('-g', file_pattern);
    if (max_results) args.push('-m', max_results.toString());
    
    args.push('--color=never', pattern);
    if (searchPath !== '.') args.push(searchPath);
    
    const result = execSync(args.join(' '), {
      cwd: context.workingDirectory,
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 5, // 5MB buffer
      stdio: ['ignore', 'pipe', 'ignore'] // Suppress stderr
    });

    return {
      success: true,
      content: result.trim(),
      metadata: {
        tool: 'ripgrep',
        pattern,
        search_path: searchPath,
        matches: result.trim().split('\n').length,
        case_sensitive,
        line_numbers,
        recursive
      }
    };
  } catch (error: any) {
    // ripgrep not available or failed, return null to try native
    if (error.message.includes('not found') || 
        error.message.includes('command not found') ||
        error.message.includes('not recognized') ||
        error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

// Native JavaScript grep implementation
async function nativeGrep(params: any, context: ExecutionContext): Promise<ToolResult> {
  const { pattern, path: searchPath = ".", recursive, case_sensitive, line_numbers, context: contextLines, file_pattern, max_results } = params;
  
  const fullPath = path.resolve(context.workingDirectory, searchPath);
  const results: string[] = [];
  let totalMatches = 0;
  
  const searchRegex = new RegExp(
    pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 
    case_sensitive ? 'g' : 'gi'
  );
  
  const filePatternRegex = file_pattern ? 
    new RegExp(file_pattern.replace(/\*/g, '.*').replace(/\?/g, '.'), 'i') : 
    null;

  const searchInFile = (filePath: string, relativePath: string) => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        if (totalMatches >= max_results) return;
        
        const matches = line.match(searchRegex);
        if (matches) {
          totalMatches++;
          let result = '';
          
          if (line_numbers) {
            result += `${relativePath}:${index + 1}:`;
          } else {
            result += `${relativePath}:`;
          }
          
          // Add context lines if requested
          if (contextLines && contextLines > 0) {
            const startLine = Math.max(0, index - contextLines);
            const endLine = Math.min(lines.length - 1, index + contextLines);
            
            for (let i = startLine; i <= endLine; i++) {
              const contextMarker = i === index ? ':' : '-';
              result += `\n${relativePath}:${i + 1}${contextMarker}${lines[i]}`;
            }
          } else {
            result += line;
          }
          
          results.push(result);
        }
      });
    } catch (error) {
      // Skip files that can't be read (binary, permissions, etc.)
    }
  };

  const scanDirectory = (dir: string, baseDir: string = '') => {
    if (totalMatches >= max_results) return;
    
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (totalMatches >= max_results) break;
        
        const fullEntryPath = path.join(dir, entry.name);
        const relativeEntryPath = path.join(baseDir, entry.name);
        
        if (entry.isFile()) {
          // Apply file pattern filter
          if (filePatternRegex && !filePatternRegex.test(entry.name)) {
            continue;
          }
          
          searchInFile(fullEntryPath, relativeEntryPath);
        } else if (entry.isDirectory() && recursive) {
          // Skip common ignored directories
          if (!["node_modules", ".git", "dist", ".metis", "coverage"].includes(entry.name)) {
            scanDirectory(fullEntryPath, relativeEntryPath);
          }
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }
  };

  if (fs.statSync(fullPath).isFile()) {
    const relativePath = path.relative(context.workingDirectory, fullPath);
    searchInFile(fullPath, relativePath);
  } else {
    scanDirectory(fullPath);
  }

  return {
    success: true,
    content: results.join('\n'),
    metadata: {
      tool: 'native',
      pattern,
      search_path: searchPath,
      matches: totalMatches,
      case_sensitive,
      line_numbers,
      recursive,
      context_lines: contextLines || 0,
      truncated: totalMatches >= max_results
    }
  };
}

export const grepTool: RegisteredTool = {
  name: "grep",
  description: "Search for text patterns in files (uses ripgrep if available, falls back to native search)",
  schema: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Text pattern to search for (regex supported)"
      },
      path: {
        type: "string",
        description: "Path to search in (file or directory)",
        default: "."
      },
      recursive: {
        type: "boolean",
        description: "Search recursively in subdirectories",
        default: true
      },
      case_sensitive: {
        type: "boolean",
        description: "Case sensitive search",
        default: false
      },
      line_numbers: {
        type: "boolean",
        description: "Show line numbers in results",
        default: true
      },
      context: {
        type: "number",
        description: "Number of context lines to show around matches",
        default: 0
      },
      file_pattern: {
        type: "string",
        description: "Pattern to filter files (e.g., '*.js', '*.ts')"
      },
      max_results: {
        type: "number",
        description: "Maximum number of results to return",
        default: 100
      }
    },
    required: ["pattern"]
  },
  safety: {
    require_approval: false,
    path_restrictions: ["!node_modules", "!.git"],
    network_access: false,
    max_execution_time: 30000,
    allowed_in_ci: true
  },
  handler: grepHandler,
  metadata: {
    category: "search_operations",
    version: "1.0",
    author: "metis-team"
  }
};

// Find Files Tool
const findFilesHandler: ToolHandler = {
  async execute(
    params: { 
      name?: string;
      path?: string;
      type?: 'f' | 'd' | 'l'; // file, directory, link
      size?: string; // e.g., '+1M', '-100k'
      modified?: string; // e.g., '-1', '+7' (days)
      max_depth?: number;
      max_results?: number;
    }, 
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { 
      name, 
      path: searchPath = ".", 
      type,
      size,
      modified,
      max_depth,
      max_results = 1000
    } = params;
    
    if (!withinCwdSafe(searchPath, context.workingDirectory)) {
      return {
        success: false,
        error: `Path outside workspace: ${searchPath}`
      };
    }

    const fullPath = path.resolve(context.workingDirectory, searchPath);
    
    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        error: `Path not found: ${searchPath}`
      };
    }

    try {
      // Try system find command first (faster), fall back to native
      return await trySystemFind(params, context) || await nativeFind(params, context);
    } catch (error: any) {
      return {
        success: false,
        error: `Find failed: ${error.message}`
      };
    }
  }
};

async function trySystemFind(params: any, context: ExecutionContext): Promise<ToolResult | null> {
  try {
    const { name, path: searchPath = ".", type, max_depth, max_results } = params;
    
    if (process.platform === 'win32') {
      return null; // Use native implementation on Windows
    }
    
    let args = ['find', searchPath];
    
    if (max_depth) args.push('-maxdepth', max_depth.toString());
    if (type) args.push('-type', type);
    if (name) args.push('-name', `"${name}"`);
    
    const result = execSync(args.join(' '), {
      cwd: context.workingDirectory,
      encoding: 'utf8',
      timeout: 30000
    });

    let files = result.trim().split('\n').filter(f => f.length > 0);
    
    if (max_results && files.length > max_results) {
      files = files.slice(0, max_results);
    }

    return {
      success: true,
      content: files.join('\n'),
      metadata: {
        tool: 'system_find',
        search_path: searchPath,
        total_found: files.length,
        type: type || 'all',
        truncated: files.length === max_results
      }
    };
  } catch (error) {
    return null; // Fall back to native
  }
}

async function nativeFind(params: any, context: ExecutionContext): Promise<ToolResult> {
  const { name, path: searchPath = ".", type, max_depth = 10, max_results } = params;
  
  const fullPath = path.resolve(context.workingDirectory, searchPath);
  const results: string[] = [];
  const nameRegex = name ? new RegExp(name.replace(/\*/g, '.*').replace(/\?/g, '.'), 'i') : null;

  const scanDirectory = (dir: string, currentDepth: number = 0) => {
    if (results.length >= max_results || currentDepth > max_depth) return;
    
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (results.length >= max_results) break;
        
        const fullEntryPath = path.join(dir, entry.name);
        const relativePath = path.relative(context.workingDirectory, fullEntryPath);
        
        // Skip common ignored directories when traversing
        if (entry.isDirectory() && ["node_modules", ".git", "dist", ".metis"].includes(entry.name)) {
          continue;
        }

        // Check if entry matches criteria
        let matches = true;
        
        if (nameRegex && !nameRegex.test(entry.name)) {
          matches = false;
        }
        
        if (type && ((type === 'f' && !entry.isFile()) || 
                     (type === 'd' && !entry.isDirectory()) ||
                     (type === 'l' && !entry.isSymbolicLink()))) {
          matches = false;
        }
        
        if (matches) {
          results.push(relativePath);
        }
        
        // Recurse into directories
        if (entry.isDirectory() && currentDepth < max_depth) {
          scanDirectory(fullEntryPath, currentDepth + 1);
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }
  };

  scanDirectory(fullPath);

  return {
    success: true,
    content: results.join('\n'),
    metadata: {
      tool: 'native_find',
      search_path: searchPath,
      total_found: results.length,
      type: type || 'all',
      max_depth,
      truncated: results.length >= max_results
    }
  };
}

export const findFilesTool: RegisteredTool = {
  name: "find_files",
  description: "Find files and directories by name, type, and other criteria",
  schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name pattern (supports wildcards * and ?)"
      },
      path: {
        type: "string",
        description: "Path to search in",
        default: "."
      },
      type: {
        type: "string",
        enum: ["f", "d", "l"],
        description: "Type: f=file, d=directory, l=link"
      },
      max_depth: {
        type: "number",
        description: "Maximum directory depth to search",
        default: 10
      },
      max_results: {
        type: "number",
        description: "Maximum number of results",
        default: 1000
      }
    }
  },
  safety: {
    require_approval: false,
    path_restrictions: ["!node_modules", "!.git"],
    network_access: false,
    max_execution_time: 30000,
    allowed_in_ci: true
  },
  handler: findFilesHandler,
  metadata: {
    category: "search_operations",
    version: "1.0",
    author: "metis-team"
  }
};

// Search tool alias - redirects to grep for backward compatibility
const searchHandler: ToolHandler = {
  async execute(params: any, context: ExecutionContext): Promise<ToolResult> {
    // Redirect search calls to grep
    return grepHandler.execute(params, context);
  }
};

export const searchTool: RegisteredTool = {
  name: "search",
  description: "Search for text patterns in files (alias for grep tool)",
  schema: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Text pattern to search for (regex supported)"
      },
      path: {
        type: "string",
        description: "Path to search in (file or directory)",
        default: "."
      },
      recursive: {
        type: "boolean",
        description: "Search recursively in subdirectories",
        default: true
      },
      case_sensitive: {
        type: "boolean",
        description: "Case sensitive search",
        default: false
      },
      line_numbers: {
        type: "boolean",
        description: "Show line numbers in results",
        default: false
      },
      context: {
        type: "number",
        description: "Number of context lines to show",
        default: 0
      },
      file_pattern: {
        type: "string",
        description: "Filter files by pattern (e.g., *.js)"
      },
      max_results: {
        type: "number",
        description: "Maximum number of results to return",
        default: 50
      }
    },
    required: ["pattern"]
  },
  safety: {
    require_approval: false,
    network_access: false,
    max_execution_time: 30000,
    allowed_in_ci: true,
    path_restrictions: ["!node_modules", "!.git"]
  },
  handler: searchHandler,
  metadata: {
    category: "search_operations",
    version: "1.0",
    author: "metis-team",
    alias_for: "grep"
  }
};