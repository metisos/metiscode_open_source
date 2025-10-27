import fs from "fs";
import path from "path";
import { RegisteredTool, ToolHandler, ExecutionContext, ToolResult } from "../registry";

// Glob pattern matching tool - like Claude Code's Glob
const globHandler: ToolHandler = {
  async execute(params: { pattern: string; path?: string }, context: ExecutionContext): Promise<ToolResult> {
    const { pattern, path: searchPath = "." } = params;

    try {
      const fullPath = path.resolve(context.workingDirectory, searchPath);
      const matchedFiles: string[] = [];

      function globMatch(pattern: string, text: string): boolean {
        // Enhanced glob pattern matching with ** support
        let regexPattern = pattern
          .replace(/\./g, '\\.')  // Escape dots
          .replace(/\*\*/g, '{{GLOBSTAR}}')  // Temporarily replace **
          .replace(/\*/g, '[^/]*')  // * matches anything except /
          .replace(/{{GLOBSTAR}}/g, '.*')  // ** matches anything including /
          .replace(/\?/g, '.')  // ? matches single char
          .replace(/\{([^}]+)\}/g, (match, group) => {
            // Handle {js,ts} -> (js|ts)
            return `(${group.split(',').join('|')})`;
          });

        const regex = new RegExp(`^${regexPattern}$`, 'i');
        return regex.test(text);
      }

      function walkDirectory(dir: string, basePath: string = ""): void {
        if (!fs.existsSync(dir)) return;

        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullEntryPath = path.join(dir, entry.name);
          const relativePath = path.join(basePath, entry.name);

          if (entry.isFile()) {
            // Test both filename and full relative path
            if (globMatch(pattern, entry.name) || globMatch(pattern, relativePath.replace(/\\/g, '/'))) {
              matchedFiles.push(relativePath.replace(/\\/g, '/'));
            }
          } else if (entry.isDirectory()) {
            // Skip common ignored directories
            if (!["node_modules", ".git", "dist", ".metis", "build", "coverage"].includes(entry.name)) {
              // Always recurse for ** patterns, or when pattern has path separators
              walkDirectory(fullEntryPath, relativePath);
            }
          }
        }
      }

      walkDirectory(fullPath);

      // Sort by modification time (most recent first)
      const filesWithStats = matchedFiles.map(file => {
        const fullFilePath = path.join(fullPath, file);
        const stats = fs.statSync(fullFilePath);
        return { file, mtime: stats.mtime };
      });

      filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      return {
        success: true,
        content: filesWithStats.map(f => f.file),
        metadata: {
          pattern,
          searchPath: searchPath,
          matchCount: filesWithStats.length
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Glob search failed: ${error.message}`
      };
    }
  }
};

export const globTool: RegisteredTool = {
  name: "glob",
  description: "Find files using glob patterns (supports *, ?, **)",
  schema: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Glob pattern to match files (e.g., '**/*.js', 'src/**/*.ts')"
      },
      path: {
        type: "string",
        description: "Directory to search in (defaults to current directory)"
      }
    },
    required: ["pattern"]
  },
  safety: {
    require_approval: false,
    path_restrictions: ["!node_modules", "!.git"],
    network_access: false,
    max_execution_time: 5000,
    allowed_in_ci: true
  },
  handler: globHandler,
  metadata: {
    category: "search_operations",
    version: "1.0",
    author: "metis-team"
  }
};