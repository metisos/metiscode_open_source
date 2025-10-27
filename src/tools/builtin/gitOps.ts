import { execSync, execFileSync } from "child_process";
import { RegisteredTool, ToolHandler, ExecutionContext, ToolResult } from "../registry";

// Git Status Tool
const gitStatusHandler: ToolHandler = {
  async execute(params: { porcelain?: boolean }, context: ExecutionContext): Promise<ToolResult> {
    const { porcelain = true } = params;
    
    try {
      const args = porcelain ? ["status", "--porcelain"] : ["status"];
      // Use execFileSync for safer execution (prevents command injection)
      const result = execFileSync("git", args, {
        cwd: context.workingDirectory,
        encoding: "utf8",
        timeout: 10000,
        shell: false
      });
      
      return {
        success: true,
        content: result.trim(),
        metadata: {
          porcelain,
          lines: result.trim().split('\n').filter(l => l.length > 0).length
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Git status failed: ${error.message}`
      };
    }
  }
};

export const gitStatusTool: RegisteredTool = {
  name: "git_status",
  description: "Get git repository status",
  schema: {
    type: "object",
    properties: {
      porcelain: {
        type: "boolean",
        description: "Use porcelain format for scripting",
        default: true
      }
    }
  },
  safety: {
    require_approval: false,
    network_access: false,
    max_execution_time: 10000,
    allowed_in_ci: true
  },
  handler: gitStatusHandler,
  metadata: {
    category: "git_operations",
    version: "1.0",
    author: "metis-team"
  }
};

// Git Diff Tool
const gitDiffHandler: ToolHandler = {
  async execute(params: { staged?: boolean; file?: string; context_lines?: number }, context: ExecutionContext): Promise<ToolResult> {
    const { staged = false, file, context_lines } = params;
    
    try {
      let args = ["diff"];
      if (staged) args.push("--cached");
      if (context_lines !== undefined) args.push(`-U${context_lines}`);
      if (file) args.push("--", file);  // Use -- separator for safety

      // Use execFileSync for safer execution (prevents command injection)
      const result = execFileSync("git", args, {
        cwd: context.workingDirectory,
        encoding: "utf8",
        timeout: 15000,
        maxBuffer: 10 * 1024 * 1024,  // 10MB for large diffs
        shell: false
      });
      
      return {
        success: true,
        content: result,
        metadata: {
          staged,
          file: file || null,
          context_lines: context_lines || 3,
          has_changes: result.length > 0
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Git diff failed: ${error.message}`
      };
    }
  }
};

export const gitDiffTool: RegisteredTool = {
  name: "git_diff",
  description: "Show git differences",
  schema: {
    type: "object",
    properties: {
      staged: {
        type: "boolean",
        description: "Show staged changes only",
        default: false
      },
      file: {
        type: "string",
        description: "Show diff for specific file"
      },
      context_lines: {
        type: "number",
        description: "Number of context lines to show",
        default: 3
      }
    }
  },
  safety: {
    require_approval: false,
    network_access: false,
    max_execution_time: 15000,
    allowed_in_ci: true
  },
  handler: gitDiffHandler,
  metadata: {
    category: "git_operations",
    version: "1.0",
    author: "metis-team"
  }
};

// Git Log Tool
const gitLogHandler: ToolHandler = {
  async execute(params: { count?: number; oneline?: boolean; file?: string }, context: ExecutionContext): Promise<ToolResult> {
    const { count = 10, oneline = true, file } = params;
    
    try {
      let args = ["log"];
      if (count) args.push(`-${count}`);
      if (oneline) args.push("--oneline");
      if (file) args.push("--", file);  // Use -- separator for safety

      // Use execFileSync for safer execution (prevents command injection)
      const result = execFileSync("git", args, {
        cwd: context.workingDirectory,
        encoding: "utf8",
        timeout: 15000,
        shell: false
      });
      
      const commits = result.trim().split('\n').filter(l => l.length > 0);
      
      return {
        success: true,
        content: result.trim(),
        metadata: {
          count: commits.length,
          requested_count: count,
          oneline,
          file: file || null
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Git log failed: ${error.message}`
      };
    }
  }
};

export const gitLogTool: RegisteredTool = {
  name: "git_log",
  description: "Show git commit history",
  schema: {
    type: "object",
    properties: {
      count: {
        type: "number",
        description: "Number of commits to show",
        default: 10
      },
      oneline: {
        type: "boolean",
        description: "Show one line per commit",
        default: true
      },
      file: {
        type: "string",
        description: "Show log for specific file"
      }
    }
  },
  safety: {
    require_approval: false,
    network_access: false,
    max_execution_time: 15000,
    allowed_in_ci: true
  },
  handler: gitLogHandler,
  metadata: {
    category: "git_operations",
    version: "1.0",
    author: "metis-team"
  }
};