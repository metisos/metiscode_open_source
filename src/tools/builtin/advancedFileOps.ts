import fs from "fs";
import path from "path";
import { RegisteredTool, ToolHandler, ExecutionContext, ToolResult } from "../registry";
import { withinCwdSafe } from "../files";

// Edit File Tool (partial editing)
const editFileHandler: ToolHandler = {
  async execute(
    params: {
      path: string;
      search?: string;
      replace?: string;
      old_string?: string;  // Support Claude Code style
      new_string?: string;  // Support Claude Code style
      line_number?: number;
      backup?: boolean;
    },
    context: ExecutionContext
  ): Promise<ToolResult> {
    // Support both parameter styles for compatibility
    const searchText = params.search || params.old_string || '';
    const replaceText = params.replace || params.new_string || '';

    // Check for missing required parameters
    if (!params.search || !params.replace) {
      return {
        success: false,
        error: `Missing required parameters! edit_file needs:\n1. path: "${params.path}"\n2. search: (text to find) - MISSING\n3. replace: (text to replace with) - MISSING\n\nTo VIEW file first, use: read_file("${params.path}")`
      };
    }

    const { path: filePath, search, replace, line_number, backup = true } = params;
    
    if (!withinCwdSafe(filePath, context.workingDirectory)) {
      return {
        success: false,
        error: `Path outside workspace: ${filePath}`
      };
    }

    const fullPath = path.resolve(context.workingDirectory, filePath);
    
    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        error: `File not found: ${filePath}`
      };
    }

    try {
      const originalContent = fs.readFileSync(fullPath, 'utf8');
      let newContent: string;
      let changes = 0;

      // IMPORTANT: Use exact string matching like Claude Code
      // No regex! The search text must match EXACTLY including whitespace

      if (!originalContent.includes(search)) {
        return {
          success: false,
          error: `Search text not found in file. The text must match EXACTLY including all whitespace and indentation.\n\nSearched for:\n${search.substring(0, 200)}${search.length > 200 ? '...' : ''}\n\nTo see file contents, use: read_file("${filePath}")`
        };
      }

      if (line_number !== undefined && line_number !== null) {
        // Edit specific line number (exact string match within that line)
        const lines = originalContent.split('\n');
        if (line_number < 1 || line_number > lines.length) {
          return {
            success: false,
            error: `Line number ${line_number} is out of range (1-${lines.length})`
          };
        }

        const oldLine = lines[line_number - 1];
        if (!oldLine.includes(search)) {
          return {
            success: false,
            error: `Search text not found on line ${line_number}`
          };
        }

        lines[line_number - 1] = oldLine.replace(search, replace);
        changes = 1;
        newContent = lines.join('\n');
      } else {
        // Global exact string replacement (only replace first occurrence for safety)
        // Claude Code behavior: fail if multiple matches to prevent ambiguity
        const firstIndex = originalContent.indexOf(search);
        const secondIndex = originalContent.indexOf(search, firstIndex + search.length);

        if (secondIndex !== -1) {
          return {
            success: false,
            error: `Found multiple matches for search text. Please make the search text more specific to match exactly one location, or use line_number parameter to target a specific line.\n\nFirst match at position: ${firstIndex}\nSecond match at position: ${secondIndex}`
          };
        }

        // Single match - safe to replace
        newContent = originalContent.replace(search, replace);
        changes = 1;
      }

      // Create backup if requested
      if (backup && changes > 0) {
        const backupPath = `${fullPath}.bak`;
        fs.writeFileSync(backupPath, originalContent, 'utf8');
      }

      if (changes > 0) {
        fs.writeFileSync(fullPath, newContent, 'utf8');
      }

      // Create a meaningful summary of what was changed
      let summary = '';
      if (changes > 0) {
        if (line_number) {
          summary = `Updated line ${line_number}: replaced "${search}" with "${replace}"`;
        } else {
          summary = `Replaced ${changes} occurrence${changes > 1 ? 's' : ''} of "${search.substring(0, 50)}${search.length > 50 ? '...' : ''}" with "${replace.substring(0, 50)}${replace.length > 50 ? '...' : ''}"`;
        }
      } else {
        summary = `No matches found for "${search.substring(0, 50)}${search.length > 50 ? '...' : ''}"`;
      }

      return {
        success: true,
        content: summary,
        metadata: {
          path: filePath,
          changes,
          line_number: line_number || null,
          search_pattern: search,
          replacement: replace,
          backup_created: backup && changes > 0
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to edit file: ${error.message}`
      };
    }
  }
};

export const editFileTool: RegisteredTool = {
  name: "edit_file",
  description: "Replace exact text in a file. Use 'search' and 'replace' parameters only. Do NOT use line_start, line_end, old_string, new_string, or any other parameters.",
  schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to file to edit"
      },
      search: {
        type: "string",
        description: "Exact text to find and replace (REQUIRED). This must match the exact text in the file including whitespace and indentation."
      },
      replace: {
        type: "string",
        description: "Text to replace the search text with (REQUIRED). Use this parameter to specify the replacement text."
      },
      line_number: {
        type: ["number", "null"],
        description: "Optional: Specific line number to edit (1-based), or null for global replace"
      },
      backup: {
        type: "boolean",
        description: "Optional: Create backup file",
        default: true
      }
    },
    required: ["path", "search", "replace"],
    additionalProperties: false
  },
  safety: {
    require_approval: true,
    path_restrictions: ["!node_modules", "!.git", "!dist"],
    network_access: false,
    max_execution_time: 10000,
    allowed_in_ci: false
  },
  handler: editFileHandler,
  metadata: {
    category: "file_operations",
    version: "1.0",
    author: "metis-team"
  }
};

// Append to File Tool
const appendToFileHandler: ToolHandler = {
  async execute(
    params: { 
      path: string; 
      content: string; 
      newline?: boolean;
      create?: boolean;
    }, 
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { path: filePath, content, newline = true, create = false } = params;
    
    if (!withinCwdSafe(filePath, context.workingDirectory)) {
      return {
        success: false,
        error: `Path outside workspace: ${filePath}`
      };
    }

    const fullPath = path.resolve(context.workingDirectory, filePath);
    
    if (!fs.existsSync(fullPath) && !create) {
      return {
        success: false,
        error: `File not found: ${filePath}. Set create=true to create new file.`
      };
    }

    try {
      const contentToAppend = newline ? `\n${content}` : content;
      fs.appendFileSync(fullPath, contentToAppend, 'utf8');
      
      const stats = fs.statSync(fullPath);
      
      return {
        success: true,
        content: `Appended ${content.length} characters to ${filePath}`,
        metadata: {
          path: filePath,
          content_length: content.length,
          newline_added: newline,
          file_size: stats.size,
          created: create && !fs.existsSync(fullPath)
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to append to file: ${error.message}`
      };
    }
  }
};

export const appendToFileTool: RegisteredTool = {
  name: "append_to_file",
  description: "Append content to end of file",
  schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to file"
      },
      content: {
        type: "string",
        description: "Content to append"
      },
      newline: {
        type: "boolean",
        description: "Add newline before content",
        default: true
      },
      create: {
        type: "boolean",
        description: "Create file if it doesn't exist",
        default: false
      }
    },
    required: ["path", "content"]
  },
  safety: {
    require_approval: true,
    path_restrictions: ["!node_modules", "!.git", "!dist"],
    network_access: false,
    max_execution_time: 10000,
    allowed_in_ci: false
  },
  handler: appendToFileHandler,
  metadata: {
    category: "file_operations",
    version: "1.0",
    author: "metis-team"
  }
};

// Create Directory Tool
const createDirectoryHandler: ToolHandler = {
  async execute(
    params: { 
      path: string; 
      recursive?: boolean;
    }, 
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { path: dirPath, recursive = true } = params;
    
    if (!withinCwdSafe(dirPath, context.workingDirectory)) {
      return {
        success: false,
        error: `Path outside workspace: ${dirPath}`
      };
    }

    const fullPath = path.resolve(context.workingDirectory, dirPath);
    
    if (fs.existsSync(fullPath)) {
      if (fs.statSync(fullPath).isDirectory()) {
        return {
          success: true,
          content: `Directory already exists: ${dirPath}`,
          metadata: {
            path: dirPath,
            created: false,
            already_existed: true
          }
        };
      } else {
        return {
          success: false,
          error: `Path exists but is not a directory: ${dirPath}`
        };
      }
    }

    try {
      fs.mkdirSync(fullPath, { recursive });
      
      return {
        success: true,
        content: `Created directory: ${dirPath}`,
        metadata: {
          path: dirPath,
          created: true,
          recursive
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to create directory: ${error.message}`
      };
    }
  }
};

export const createDirectoryTool: RegisteredTool = {
  name: "create_directory",
  description: "Create a new directory",
  schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path of directory to create"
      },
      recursive: {
        type: "boolean",
        description: "Create parent directories if they don't exist",
        default: true
      }
    },
    required: ["path"]
  },
  safety: {
    require_approval: false,
    path_restrictions: ["!node_modules", "!.git", "!dist"],
    network_access: false,
    max_execution_time: 5000,
    allowed_in_ci: true
  },
  handler: createDirectoryHandler,
  metadata: {
    category: "file_operations",
    version: "1.0",
    author: "metis-team"
  }
};

// Move/Rename File Tool
const moveFileHandler: ToolHandler = {
  async execute(
    params: { 
      source: string; 
      destination: string; 
      overwrite?: boolean;
    }, 
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { source, destination, overwrite = false } = params;
    
    if (!withinCwdSafe(source, context.workingDirectory) || 
        !withinCwdSafe(destination, context.workingDirectory)) {
      return {
        success: false,
        error: `Path outside workspace: ${source} or ${destination}`
      };
    }

    const sourcePath = path.resolve(context.workingDirectory, source);
    const destPath = path.resolve(context.workingDirectory, destination);
    
    if (!fs.existsSync(sourcePath)) {
      return {
        success: false,
        error: `Source file not found: ${source}`
      };
    }

    if (fs.existsSync(destPath) && !overwrite) {
      return {
        success: false,
        error: `Destination already exists: ${destination}. Set overwrite=true to replace.`
      };
    }

    try {
      // Create destination directory if it doesn't exist
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      fs.renameSync(sourcePath, destPath);
      
      const stats = fs.statSync(destPath);
      
      return {
        success: true,
        content: `Moved ${source} to ${destination}`,
        metadata: {
          source,
          destination,
          overwrite,
          size: stats.size,
          is_directory: stats.isDirectory()
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to move file: ${error.message}`
      };
    }
  }
};

export const moveFileTool: RegisteredTool = {
  name: "move_file",
  description: "Move or rename a file or directory",
  schema: {
    type: "object",
    properties: {
      source: {
        type: "string",
        description: "Source path"
      },
      destination: {
        type: "string", 
        description: "Destination path"
      },
      overwrite: {
        type: "boolean",
        description: "Overwrite destination if it exists",
        default: false
      }
    },
    required: ["source", "destination"]
  },
  safety: {
    require_approval: true,
    path_restrictions: ["!node_modules", "!.git", "!dist"],
    network_access: false,
    max_execution_time: 10000,
    allowed_in_ci: false
  },
  handler: moveFileHandler,
  metadata: {
    category: "file_operations",
    version: "1.0",
    author: "metis-team"
  }
};