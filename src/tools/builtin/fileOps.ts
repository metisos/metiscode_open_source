import fs from "fs";
import path from "path";
import { RegisteredTool, ToolHandler, ExecutionContext, ToolResult } from "../registry";
import { withinCwdSafe } from "../files";

// Read File Tool
const readFileHandler: ToolHandler = {
  async execute(params: { path: string; encoding?: string; line_start?: number; line_end?: number }, context: ExecutionContext): Promise<ToolResult> {
    const { path: filePath, encoding = "utf8", line_start, line_end } = params;
    
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
      const fullContent = fs.readFileSync(fullPath, encoding);
      const stats = fs.statSync(fullPath);

      // Format output like cat -n (with line numbers and tabs)
      const lines = fullContent.split('\n');
      let selectedLines: string[];
      let formattedLines: string[];
      let metadata: any = {
        path: filePath,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        total_lines: lines.length
      };

      // Handle line range selection
      if (line_start !== undefined || line_end !== undefined) {
        const startIdx = Math.max(0, (line_start || 1) - 1); // Convert to 0-based, default to start
        const endIdx = Math.min(lines.length, line_end || lines.length); // Default to end

        if (startIdx >= lines.length) {
          return {
            success: false,
            error: `Line start ${line_start} is beyond file length (${lines.length} lines)`
          };
        }

        selectedLines = lines.slice(startIdx, endIdx);

        formattedLines = selectedLines.map((line, idx) => {
          const lineNum = startIdx + idx + 1;
          return `${lineNum.toString().padStart(6)}→${line}`;
        });

        metadata.line_range = {
          start: startIdx + 1,
          end: endIdx,
          total_lines: lines.length
        };
      } else {
        selectedLines = lines;
        formattedLines = selectedLines.map((line, idx) => {
          return `${(idx + 1).toString().padStart(6)}→${line}`;
        });
      }

      const content = formattedLines.join('\n');

      return {
        success: true,
        content,
        metadata
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to read file: ${error.message}`
      };
    }
  }
};

export const readFileTool: RegisteredTool = {
  name: "read_file",
  description: "Read file contents to view them (use line_start/line_end for partial reading)",
  schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file to read"
      },
      encoding: {
        type: "string",
        description: "File encoding"
      },
      line_start: {
        type: "integer",
        description: "Starting line number (1-based) for partial read"
      },
      line_end: {
        type: "integer",
        description: "Ending line number (1-based) for partial read"
      }
    },
    required: ["path"]
  },
  safety: {
    require_approval: false,
    path_restrictions: ["!node_modules", "!.git"],
    network_access: false,
    max_execution_time: 5000,
    allowed_in_ci: true
  },
  handler: readFileHandler,
  metadata: {
    category: "file_operations",
    version: "1.0",
    author: "metis-team"
  }
};

// Write File Tool
const writeFileHandler: ToolHandler = {
  async execute(params: { path: string; content: string; encoding?: string; create_dirs?: boolean }, context: ExecutionContext): Promise<ToolResult> {
    const { path: filePath, content, encoding = "utf8", create_dirs = true } = params;
    
    if (!withinCwdSafe(filePath, context.workingDirectory)) {
      return {
        success: false,
        error: `Path outside workspace: ${filePath}`
      };
    }

    const fullPath = path.resolve(context.workingDirectory, filePath);
    
    try {
      if (create_dirs) {
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }

      const existedBefore = fs.existsSync(fullPath);
      let originalSize = 0;
      if (existedBefore) {
        originalSize = fs.statSync(fullPath).size;
      }

      fs.writeFileSync(fullPath, content, encoding);
      const stats = fs.statSync(fullPath);

      // Generate a meaningful summary
      const lines = content.split('\n').length;
      const sizeKB = (stats.size / 1024).toFixed(1);
      let summary = '';

      if (!existedBefore) {
        summary = `Created new file ${filePath} (${lines} lines, ${sizeKB} KB)`;
      } else {
        const sizeDiff = stats.size - originalSize;
        if (sizeDiff > 0) {
          summary = `Updated ${filePath}: added ${sizeDiff} bytes (now ${lines} lines, ${sizeKB} KB)`;
        } else if (sizeDiff < 0) {
          summary = `Updated ${filePath}: removed ${Math.abs(sizeDiff)} bytes (now ${lines} lines, ${sizeKB} KB)`;
        } else {
          summary = `Updated ${filePath} (${lines} lines, ${sizeKB} KB)`;
        }
      }

      return {
        success: true,
        content: summary,
        metadata: {
          path: filePath,
          size: stats.size,
          created: !existedBefore,
          modified: stats.mtime.toISOString()
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to write file: ${error.message}`
      };
    }
  }
};

export const writeFileTool: RegisteredTool = {
  name: "write_file",
  description: "Write content to a file",
  schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file to write"
      },
      content: {
        type: "string",
        description: "Content to write to the file"
      },
      encoding: {
        type: "string",
        description: "File encoding",
        default: "utf8"
      },
      create_dirs: {
        type: "boolean",
        description: "Create parent directories if they don't exist",
        default: true
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
  handler: writeFileHandler,
  metadata: {
    category: "file_operations",
    version: "1.0",
    author: "metis-team"
  }
};

// List Files Tool
const listFilesHandler: ToolHandler = {
  async execute(params: { path?: string; pattern?: string; recursive?: boolean }, context: ExecutionContext): Promise<ToolResult> {
    const { path: dirPath = ".", pattern, recursive = false } = params;
    
    if (!withinCwdSafe(dirPath, context.workingDirectory)) {
      return {
        success: false,
        error: `Path outside workspace: ${dirPath}`
      };
    }

    const fullPath = path.resolve(context.workingDirectory, dirPath);
    
    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        error: `Directory not found: ${dirPath}`
      };
    }

    if (!fs.statSync(fullPath).isDirectory()) {
      return {
        success: false,
        error: `Path is not a directory: ${dirPath}`
      };
    }

    try {
      const files: string[] = [];
      
      const scanDir = (dir: string, basePath: string = "") => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullEntryPath = path.join(dir, entry.name);
          const relativePath = path.join(basePath, entry.name);
          
          if (entry.isFile()) {
            if (!pattern || entry.name.includes(pattern)) {
              files.push(relativePath);
            }
          } else if (entry.isDirectory() && recursive) {
            // Skip common ignored directories
            if (!["node_modules", ".git", "dist", ".metis"].includes(entry.name)) {
              scanDir(fullEntryPath, relativePath);
            }
          }
        }
      };

      scanDir(fullPath);
      
      return {
        success: true,
        content: files,
        metadata: {
          path: dirPath,
          count: files.length,
          recursive,
          pattern: pattern || null
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to list files: ${error.message}`
      };
    }
  }
};

export const listFilesTool: RegisteredTool = {
  name: "list_files",
  description: "List files in a directory",
  schema: {
    type: "object",
    properties: {
      path: { 
        type: "string", 
        description: "Directory path to list", 
        default: "." 
      },
      pattern: { 
        type: "string", 
        description: "Pattern to filter files" 
      },
      recursive: { 
        type: "boolean", 
        description: "List files recursively", 
        default: false 
      }
    }
  },
  safety: {
    require_approval: false,
    path_restrictions: ["!node_modules", "!.git"],
    network_access: false,
    max_execution_time: 10000,
    allowed_in_ci: true
  },
  handler: listFilesHandler,
  metadata: {
    category: "file_operations",
    version: "1.0",
    author: "metis-team"
  }
};