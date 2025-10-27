import fs from "fs";
import path from "path";
import { RegisteredTool, ToolHandler, ExecutionContext, ToolResult } from "../registry";
import { withinCwdSafe } from "../files";
import kleur from 'kleur';

// Multi-file Search and Replace Tool
const multiFileReplaceHandler: ToolHandler = {
  async execute(
    params: { 
      search: string; 
      replace: string;
      files: string[];
      file_pattern?: string;
      dry_run?: boolean;
      case_sensitive?: boolean;
      whole_word?: boolean;
      backup?: boolean;
    }, 
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { 
      search, 
      replace, 
      files = [],
      file_pattern,
      dry_run = false,
      case_sensitive = false,
      whole_word = false,
      backup = true
    } = params;

    let filesToProcess: string[] = [];

    // If file_pattern provided, find matching files
    if (file_pattern) {
      try {
        const { execSync } = require('child_process');
        const findCommand = process.platform === 'win32' 
          ? `dir /s /b "${file_pattern}"` 
          : `find . -name "${file_pattern}" -type f`;
        
        const output = execSync(findCommand, { 
          cwd: context.workingDirectory,
          encoding: 'utf8' 
        });
        
        const foundFiles = output.trim().split('\n')
          .map(f => path.relative(context.workingDirectory, f))
          .filter(f => f && !f.includes('node_modules') && !f.includes('.git'));
        
        filesToProcess.push(...foundFiles);
      } catch (error) {
        // Fall back to provided files list
        filesToProcess = files;
      }
    } else {
      filesToProcess = files;
    }

    if (filesToProcess.length === 0) {
      return {
        success: false,
        error: 'No files specified or found matching pattern'
      };
    }

    // Verify all files are within workspace
    for (const file of filesToProcess) {
      if (!withinCwdSafe(file, context.workingDirectory)) {
        return {
          success: false,
          error: `Path outside workspace: ${file}`
        };
      }
    }

    const results: Array<{
      file: string;
      changes: number;
      success: boolean;
      error?: string;
    }> = [];

    let totalChanges = 0;
    const backupFiles: string[] = [];

    try {
      // Create search regex
      let searchFlags = 'g';
      if (!case_sensitive) searchFlags += 'i';
      
      let searchPattern = search;
      if (whole_word) {
        searchPattern = `\\b${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`;
      } else {
        searchPattern = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      
      const searchRegex = new RegExp(searchPattern, searchFlags);

      // Process each file
      for (const file of filesToProcess) {
        const fullPath = path.resolve(context.workingDirectory, file);
        
        if (!fs.existsSync(fullPath)) {
          results.push({
            file,
            changes: 0,
            success: false,
            error: 'File not found'
          });
          continue;
        }

        try {
          const originalContent = fs.readFileSync(fullPath, 'utf8');
          const newContent = originalContent.replace(searchRegex, replace);
          
          const matches = originalContent.match(searchRegex);
          const changes = matches ? matches.length : 0;
          
          if (changes > 0) {
            if (!dry_run) {
              // Create backup if requested
              if (backup) {
                const backupPath = `${fullPath}.bak`;
                fs.writeFileSync(backupPath, originalContent, 'utf8');
                backupFiles.push(backupPath);
              }
              
              // Write new content
              fs.writeFileSync(fullPath, newContent, 'utf8');
            }
            
            totalChanges += changes;
          }

          results.push({
            file,
            changes,
            success: true
          });

        } catch (error: any) {
          results.push({
            file,
            changes: 0,
            success: false,
            error: error.message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      let summary = dry_run 
        ? `DRY RUN: Would make ${totalChanges} changes across ${successCount} files`
        : `Made ${totalChanges} changes across ${successCount} files`;

      if (failureCount > 0) {
        summary += `. ${failureCount} files failed to process.`;
      }

      return {
        success: failureCount === 0,
        content: summary,
        metadata: {
          total_files: filesToProcess.length,
          successful_files: successCount,
          failed_files: failureCount,
          total_changes: totalChanges,
          search_pattern: search,
          replacement: replace,
          dry_run,
          backup_files: backupFiles,
          results
        }
      };

    } catch (error: any) {
      return {
        success: false,
        error: `Batch replace failed: ${error.message}`,
        metadata: {
          results
        }
      };
    }
  }
};

export const multiFileReplaceTool: RegisteredTool = {
  name: "multi_file_replace",
  description: "Search and replace text across multiple files",
  schema: {
    type: "object",
    properties: {
      search: {
        type: "string",
        description: "Text to search for"
      },
      replace: {
        type: "string", 
        description: "Replacement text"
      },
      files: {
        type: "array",
        items: { type: "string" },
        description: "Array of file paths to process"
      },
      file_pattern: {
        type: "string",
        description: "File pattern to match (e.g., '*.js', '*.ts')"
      },
      dry_run: {
        type: "boolean",
        description: "Preview changes without applying them",
        default: false
      },
      case_sensitive: {
        type: "boolean",
        description: "Case sensitive search",
        default: false
      },
      whole_word: {
        type: "boolean", 
        description: "Match whole words only",
        default: false
      },
      backup: {
        type: "boolean",
        description: "Create backup files",
        default: true
      }
    },
    required: ["search", "replace"]
  },
  safety: {
    require_approval: true,
    path_restrictions: ["!node_modules", "!.git", "!dist"],
    network_access: false,
    max_execution_time: 30000,
    allowed_in_ci: false
  },
  handler: multiFileReplaceHandler,
  metadata: {
    category: "file_operations",
    version: "1.0",
    author: "metis-team"
  }
};

// Batch File Read Tool
const batchReadHandler: ToolHandler = {
  async execute(
    params: { 
      files: string[];
      file_pattern?: string;
      encoding?: string;
      max_size?: number;
    }, 
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { 
      files = [], 
      file_pattern,
      encoding = 'utf8',
      max_size = 1024 * 1024 // 1MB default limit per file
    } = params;

    let filesToRead: string[] = [];

    // If file_pattern provided, find matching files
    if (file_pattern) {
      try {
        const { execSync } = require('child_process');
        const findCommand = process.platform === 'win32'
          ? `dir /s /b "${file_pattern}"`
          : `find . -name "${file_pattern}" -type f`;
        
        const output = execSync(findCommand, { 
          cwd: context.workingDirectory,
          encoding: 'utf8' 
        });
        
        const foundFiles = output.trim().split('\n')
          .map(f => path.relative(context.workingDirectory, f))
          .filter(f => f && !f.includes('node_modules') && !f.includes('.git'))
          .slice(0, 50); // Limit to 50 files max
        
        filesToRead.push(...foundFiles);
      } catch (error) {
        filesToRead = files;
      }
    } else {
      filesToRead = files.slice(0, 20); // Limit to 20 files for safety
    }

    if (filesToRead.length === 0) {
      return {
        success: false,
        error: 'No files specified or found matching pattern'
      };
    }

    // Verify all files are within workspace
    for (const file of filesToRead) {
      if (!withinCwdSafe(file, context.workingDirectory)) {
        return {
          success: false,
          error: `Path outside workspace: ${file}`
        };
      }
    }

    const fileContents: Record<string, {
      content?: string;
      error?: string;
      size: number;
      modified?: string;
    }> = {};

    let successCount = 0;
    let totalSize = 0;

    for (const file of filesToRead) {
      const fullPath = path.resolve(context.workingDirectory, file);
      
      try {
        if (!fs.existsSync(fullPath)) {
          fileContents[file] = {
            error: 'File not found',
            size: 0
          };
          continue;
        }

        const stats = fs.statSync(fullPath);
        
        if (stats.size > max_size) {
          fileContents[file] = {
            error: `File too large (${stats.size} bytes, max ${max_size})`,
            size: stats.size
          };
          continue;
        }

        const content = fs.readFileSync(fullPath, encoding);
        fileContents[file] = {
          content,
          size: stats.size,
          modified: stats.mtime.toISOString()
        };
        
        successCount++;
        totalSize += stats.size;

      } catch (error: any) {
        fileContents[file] = {
          error: error.message,
          size: 0
        };
      }
    }

    const failureCount = filesToRead.length - successCount;
    
    return {
      success: successCount > 0,
      content: `Read ${successCount} files (${Math.round(totalSize / 1024)}KB total)${
        failureCount > 0 ? `. ${failureCount} files failed.` : ''
      }`,
      metadata: {
        file_contents: fileContents,
        total_files: filesToRead.length,
        successful_files: successCount,
        failed_files: failureCount,
        total_size: totalSize
      }
    };
  }
};

export const batchReadTool: RegisteredTool = {
  name: "batch_read",
  description: "Read multiple files at once",
  schema: {
    type: "object", 
    properties: {
      files: {
        type: "array",
        items: { type: "string" },
        description: "Array of file paths to read"
      },
      file_pattern: {
        type: "string",
        description: "File pattern to match (e.g., '*.js', '*.ts')"
      },
      encoding: {
        type: "string",
        description: "File encoding",
        default: "utf8"
      },
      max_size: {
        type: "number",
        description: "Maximum file size in bytes",
        default: 1048576
      }
    }
  },
  safety: {
    require_approval: false,
    path_restrictions: ["!node_modules", "!.git", "!dist"],
    network_access: false,
    max_execution_time: 15000,
    allowed_in_ci: true
  },
  handler: batchReadHandler,
  metadata: {
    category: "file_operations",
    version: "1.0",
    author: "metis-team"
  }
};

// Rename Symbol Across Files Tool (for refactoring)
const renameSymbolHandler: ToolHandler = {
  async execute(
    params: { 
      old_name: string;
      new_name: string; 
      files: string[];
      file_pattern?: string;
      symbol_type?: 'variable' | 'function' | 'class' | 'interface' | 'any';
      dry_run?: boolean;
    }, 
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { 
      old_name, 
      new_name, 
      files = [],
      file_pattern,
      symbol_type = 'any',
      dry_run = false
    } = params;

    let filesToProcess: string[] = [];

    // If file_pattern provided, find matching files
    if (file_pattern) {
      try {
        const { execSync } = require('child_process');
        const findCommand = process.platform === 'win32'
          ? `dir /s /b "${file_pattern}"`
          : `find . -name "${file_pattern}" -type f`;
        
        const output = execSync(findCommand, { 
          cwd: context.workingDirectory,
          encoding: 'utf8' 
        });
        
        const foundFiles = output.trim().split('\n')
          .map(f => path.relative(context.workingDirectory, f))
          .filter(f => f && !f.includes('node_modules') && !f.includes('.git'));
        
        filesToProcess.push(...foundFiles);
      } catch (error) {
        filesToProcess = files;
      }
    } else {
      filesToProcess = files;
    }

    if (filesToProcess.length === 0) {
      return {
        success: false,
        error: 'No files specified or found matching pattern'
      };
    }

    // Create patterns based on symbol type
    let patterns: RegExp[] = [];
    
    switch (symbol_type) {
      case 'variable':
        patterns = [
          new RegExp(`\\b(const|let|var)\\s+${old_name}\\b`, 'g'),
          new RegExp(`\\b${old_name}\\s*=`, 'g'),
          new RegExp(`\\b${old_name}\\b(?=\\s*[\\[\\.]|$)`, 'g') // Usage
        ];
        break;
      case 'function':
        patterns = [
          new RegExp(`\\bfunction\\s+${old_name}\\b`, 'g'),
          new RegExp(`\\b${old_name}\\s*=\\s*function`, 'g'),
          new RegExp(`\\b${old_name}\\s*\\(`, 'g'), // Function calls
          new RegExp(`\\b${old_name}\\s*:`, 'g') // Object methods
        ];
        break;
      case 'class':
        patterns = [
          new RegExp(`\\bclass\\s+${old_name}\\b`, 'g'),
          new RegExp(`\\bnew\\s+${old_name}\\b`, 'g'),
          new RegExp(`\\bextends\\s+${old_name}\\b`, 'g'),
          new RegExp(`\\b${old_name}\\.`, 'g') // Static members
        ];
        break;
      case 'interface':
        patterns = [
          new RegExp(`\\binterface\\s+${old_name}\\b`, 'g'),
          new RegExp(`\\b:\\s*${old_name}\\b`, 'g'),
          new RegExp(`\\bimplements\\s+${old_name}\\b`, 'g')
        ];
        break;
      default: // 'any'
        patterns = [
          new RegExp(`\\b${old_name}\\b`, 'g') // Simple word boundary match
        ];
    }

    const results: Array<{
      file: string;
      changes: number;
      success: boolean;
      error?: string;
    }> = [];

    let totalChanges = 0;

    try {
      for (const file of filesToProcess) {
        if (!withinCwdSafe(file, context.workingDirectory)) {
          results.push({
            file,
            changes: 0,
            success: false,
            error: 'Path outside workspace'
          });
          continue;
        }

        const fullPath = path.resolve(context.workingDirectory, file);
        
        if (!fs.existsSync(fullPath)) {
          results.push({
            file,
            changes: 0,
            success: false,
            error: 'File not found'
          });
          continue;
        }

        try {
          const originalContent = fs.readFileSync(fullPath, 'utf8');
          let newContent = originalContent;
          let fileChanges = 0;

          // Apply each pattern
          for (const pattern of patterns) {
            const matches = newContent.match(pattern);
            if (matches) {
              newContent = newContent.replace(pattern, (match) => {
                fileChanges++;
                return match.replace(new RegExp(`\\b${old_name}\\b`, 'g'), new_name);
              });
            }
          }

          if (fileChanges > 0 && !dry_run) {
            // Create backup
            const backupPath = `${fullPath}.bak`;
            fs.writeFileSync(backupPath, originalContent, 'utf8');
            
            // Write new content
            fs.writeFileSync(fullPath, newContent, 'utf8');
          }

          totalChanges += fileChanges;
          results.push({
            file,
            changes: fileChanges,
            success: true
          });

        } catch (error: any) {
          results.push({
            file,
            changes: 0,
            success: false,
            error: error.message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      const summary = dry_run
        ? `DRY RUN: Would rename ${totalChanges} occurrences of '${old_name}' to '${new_name}' across ${successCount} files`
        : `Renamed ${totalChanges} occurrences of '${old_name}' to '${new_name}' across ${successCount} files`;

      return {
        success: failureCount === 0,
        content: summary,
        metadata: {
          old_name,
          new_name,
          symbol_type,
          total_files: filesToProcess.length,
          successful_files: successCount,
          failed_files: failureCount,
          total_changes: totalChanges,
          dry_run,
          results
        }
      };

    } catch (error: any) {
      return {
        success: false,
        error: `Symbol rename failed: ${error.message}`,
        metadata: {
          results
        }
      };
    }
  }
};

export const renameSymbolTool: RegisteredTool = {
  name: "rename_symbol",
  description: "Rename variables, functions, classes across multiple files",
  schema: {
    type: "object",
    properties: {
      old_name: {
        type: "string",
        description: "Current symbol name"
      },
      new_name: {
        type: "string",
        description: "New symbol name"
      },
      files: {
        type: "array",
        items: { type: "string" },
        description: "Array of file paths to process"
      },
      file_pattern: {
        type: "string",
        description: "File pattern to match (e.g., '*.js', '*.ts')"
      },
      symbol_type: {
        type: "string",
        enum: ["variable", "function", "class", "interface", "any"],
        description: "Type of symbol being renamed",
        default: "any"
      },
      dry_run: {
        type: "boolean",
        description: "Preview changes without applying them",
        default: false
      }
    },
    required: ["old_name", "new_name"]
  },
  safety: {
    require_approval: true,
    path_restrictions: ["!node_modules", "!.git", "!dist"],
    network_access: false,
    max_execution_time: 30000,
    allowed_in_ci: false
  },
  handler: renameSymbolHandler,
  metadata: {
    category: "file_operations",
    version: "1.0",
    author: "metis-team"
  }
};