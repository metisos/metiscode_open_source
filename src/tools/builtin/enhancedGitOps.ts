import { execSync } from "child_process";
import { RegisteredTool, ToolHandler, ExecutionContext, ToolResult } from "../registry";

// Git Add Tool
const gitAddHandler: ToolHandler = {
  async execute(
    params: { 
      files?: string[];
      all?: boolean;
      patch?: boolean;
    }, 
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { files = [], all = false, patch = false } = params;
    
    if (!files.length && !all) {
      return {
        success: false,
        error: "Must specify files to add or use all=true"
      };
    }
    
    try {
      let args = ["add"];
      
      if (all) {
        args.push("-A");
      } else if (patch) {
        args.push("-p");
        if (files.length > 0) args.push(...files);
      } else {
        args.push(...files);
      }
      
      const result = execSync(`git ${args.join(" ")}`, {
        cwd: context.workingDirectory,
        encoding: "utf8",
        timeout: 30000
      });
      
      // Get status to show what was added
      const statusResult = execSync("git status --porcelain", {
        cwd: context.workingDirectory,
        encoding: "utf8"
      });
      
      return {
        success: true,
        content: `Files staged successfully`,
        metadata: {
          files: all ? ["all files"] : files,
          all,
          patch,
          status_after: statusResult.trim()
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Git add failed: ${error.message}`
      };
    }
  }
};

export const gitAddTool: RegisteredTool = {
  name: "git_add",
  description: "Stage files for git commit",
  schema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        items: { type: "string" },
        description: "Files to stage"
      },
      all: {
        type: "boolean",
        description: "Stage all changes",
        default: false
      },
      patch: {
        type: "boolean", 
        description: "Interactively stage changes",
        default: false
      }
    }
  },
  safety: {
    require_approval: true,
    network_access: false,
    max_execution_time: 30000,
    allowed_in_ci: false
  },
  handler: gitAddHandler,
  metadata: {
    category: "git_operations",
    version: "1.0",
    author: "metis-team"
  }
};

// Git Commit Tool
const gitCommitHandler: ToolHandler = {
  async execute(
    params: { 
      message: string;
      amend?: boolean;
      all?: boolean;
    }, 
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { message, amend = false, all = false } = params;
    
    if (!message && !amend) {
      return {
        success: false,
        error: "Commit message is required"
      };
    }
    
    try {
      let args = ["commit"];
      
      if (amend) {
        args.push("--amend");
      }
      
      if (all) {
        args.push("-a");
      }
      
      if (message) {
        args.push("-m", `"${message}"`);
      }
      
      const result = execSync(`git ${args.join(" ")}`, {
        cwd: context.workingDirectory,
        encoding: "utf8",
        timeout: 30000
      });
      
      // Get the commit hash
      const commitHash = execSync("git rev-parse HEAD", {
        cwd: context.workingDirectory,
        encoding: "utf8"
      }).trim();
      
      return {
        success: true,
        content: result.trim(),
        metadata: {
          message,
          amend,
          all,
          commit_hash: commitHash.substring(0, 7),
          full_hash: commitHash
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Git commit failed: ${error.message}`
      };
    }
  }
};

export const gitCommitTool: RegisteredTool = {
  name: "git_commit",
  description: "Create a git commit",
  schema: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "Commit message"
      },
      amend: {
        type: "boolean",
        description: "Amend the last commit",
        default: false
      },
      all: {
        type: "boolean",
        description: "Stage all changes and commit",
        default: false
      }
    },
    required: ["message"]
  },
  safety: {
    require_approval: true,
    network_access: false,
    max_execution_time: 30000,
    allowed_in_ci: false
  },
  handler: gitCommitHandler,
  metadata: {
    category: "git_operations", 
    version: "1.0",
    author: "metis-team"
  }
};

// Git Branch Tool
const gitBranchHandler: ToolHandler = {
  async execute(
    params: { 
      action?: 'list' | 'create' | 'delete' | 'switch';
      name?: string;
      force?: boolean;
    }, 
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { action = 'list', name, force = false } = params;
    
    try {
      let args = ["branch"];
      let commandResult = "";
      
      switch (action) {
        case 'list':
          args.push("-a"); // Show all branches
          break;
          
        case 'create':
          if (!name) {
            return {
              success: false,
              error: "Branch name is required for create action"
            };
          }
          args.push(name);
          break;
          
        case 'delete':
          if (!name) {
            return {
              success: false,
              error: "Branch name is required for delete action"
            };
          }
          args.push(force ? "-D" : "-d", name);
          break;
          
        case 'switch':
          if (!name) {
            return {
              success: false,
              error: "Branch name is required for switch action"
            };
          }
          args = ["checkout", name];
          break;
      }
      
      commandResult = execSync(`git ${args.join(" ")}`, {
        cwd: context.workingDirectory,
        encoding: "utf8",
        timeout: 15000
      });
      
      // Get current branch info
      let currentBranch = "";
      try {
        currentBranch = execSync("git branch --show-current", {
          cwd: context.workingDirectory,
          encoding: "utf8"
        }).trim();
      } catch {
        // Ignore error
      }
      
      return {
        success: true,
        content: commandResult.trim(),
        metadata: {
          action,
          branch_name: name || null,
          current_branch: currentBranch,
          force
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Git branch operation failed: ${error.message}`
      };
    }
  }
};

export const gitBranchTool: RegisteredTool = {
  name: "git_branch",
  description: "Manage git branches",
  schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "create", "delete", "switch"],
        description: "Branch action to perform",
        default: "list"
      },
      name: {
        type: "string",
        description: "Branch name (required for create/delete/switch)"
      },
      force: {
        type: "boolean",
        description: "Force operation (for delete)",
        default: false
      }
    }
  },
  safety: {
    require_approval: true, // Branch operations can be destructive
    network_access: false,
    max_execution_time: 15000,
    allowed_in_ci: false
  },
  handler: gitBranchHandler,
  metadata: {
    category: "git_operations",
    version: "1.0",
    author: "metis-team"
  }
};

// Git Checkout Tool
const gitCheckoutHandler: ToolHandler = {
  async execute(
    params: { 
      target: string;
      create?: boolean;
      files?: string[];
      force?: boolean;
    }, 
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { target, create = false, files = [], force = false } = params;
    
    try {
      let args = ["checkout"];
      
      if (force) {
        args.push("-f");
      }
      
      if (create) {
        args.push("-b");
      }
      
      args.push(target);
      
      if (files.length > 0) {
        args.push("--", ...files);
      }
      
      const result = execSync(`git ${args.join(" ")}`, {
        cwd: context.workingDirectory,
        encoding: "utf8", 
        timeout: 15000
      });
      
      // Get current branch after checkout
      let currentBranch = "";
      try {
        currentBranch = execSync("git branch --show-current", {
          cwd: context.workingDirectory,
          encoding: "utf8"
        }).trim();
      } catch {
        // Ignore error
      }
      
      return {
        success: true,
        content: result.trim(),
        metadata: {
          target,
          create,
          files: files.length > 0 ? files : null,
          force,
          current_branch: currentBranch
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Git checkout failed: ${error.message}`
      };
    }
  }
};

export const gitCheckoutTool: RegisteredTool = {
  name: "git_checkout",
  description: "Switch branches or restore files",
  schema: {
    type: "object",
    properties: {
      target: {
        type: "string",
        description: "Branch name or commit hash"
      },
      create: {
        type: "boolean",
        description: "Create new branch",
        default: false
      },
      files: {
        type: "array",
        items: { type: "string" },
        description: "Specific files to checkout"
      },
      force: {
        type: "boolean",
        description: "Force checkout (discard local changes)",
        default: false
      }
    },
    required: ["target"]
  },
  safety: {
    require_approval: true, // Can discard changes
    network_access: false,
    max_execution_time: 15000,
    allowed_in_ci: false
  },
  handler: gitCheckoutHandler,
  metadata: {
    category: "git_operations",
    version: "1.0", 
    author: "metis-team"
  }
};