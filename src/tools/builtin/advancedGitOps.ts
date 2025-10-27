import { execSync } from "child_process";
import { RegisteredTool, ToolHandler, ExecutionContext, ToolResult } from "../registry";

// Git Merge Tool
const gitMergeHandler: ToolHandler = {
  async execute(
    params: { 
      branch: string;
      no_ff?: boolean;
      squash?: boolean;
      strategy?: string;
    }, 
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { branch, no_ff = false, squash = false, strategy } = params;
    
    try {
      let args = ["merge"];
      
      if (no_ff) args.push("--no-ff");
      if (squash) args.push("--squash");
      if (strategy) args.push("--strategy", strategy);
      
      args.push(branch);
      
      const result = execSync(`git ${args.join(" ")}`, {
        cwd: context.workingDirectory,
        encoding: "utf8",
        timeout: 30000
      });
      
      // Check if there are any conflicts
      let conflictFiles: string[] = [];
      try {
        const conflictCheck = execSync("git diff --name-only --diff-filter=U", {
          cwd: context.workingDirectory,
          encoding: "utf8"
        }).trim();
        
        if (conflictCheck) {
          conflictFiles = conflictCheck.split('\n');
        }
      } catch {
        // No conflicts or error checking
      }
      
      return {
        success: true,
        content: result.trim(),
        metadata: {
          branch,
          no_ff,
          squash,
          strategy: strategy || null,
          has_conflicts: conflictFiles.length > 0,
          conflict_files: conflictFiles
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Git merge failed: ${error.message}`,
        metadata: {
          branch,
          suggestion: "Check for conflicts or uncommitted changes"
        }
      };
    }
  }
};

export const gitMergeTool: RegisteredTool = {
  name: "git_merge",
  description: "Merge branches with conflict detection",
  schema: {
    type: "object",
    properties: {
      branch: {
        type: "string",
        description: "Branch to merge into current branch"
      },
      no_ff: {
        type: "boolean",
        description: "Create merge commit even for fast-forward",
        default: false
      },
      squash: {
        type: "boolean", 
        description: "Squash commits during merge",
        default: false
      },
      strategy: {
        type: "string",
        description: "Merge strategy (ours, theirs, recursive, etc.)"
      }
    },
    required: ["branch"]
  },
  safety: {
    require_approval: true,
    network_access: false,
    max_execution_time: 30000,
    allowed_in_ci: false
  },
  handler: gitMergeHandler,
  metadata: {
    category: "git_operations",
    version: "1.0",
    author: "metis-team"
  }
};

// Git Stash Tool
const gitStashHandler: ToolHandler = {
  async execute(
    params: { 
      action?: 'save' | 'pop' | 'list' | 'show' | 'drop' | 'clear';
      message?: string;
      index?: number;
      include_untracked?: boolean;
    }, 
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { action = 'list', message, index, include_untracked = false } = params;
    
    try {
      let args = ["stash"];
      
      switch (action) {
        case 'save':
          args.push("push");
          if (include_untracked) args.push("-u");
          if (message) args.push("-m", `"${message}"`);
          break;
          
        case 'pop':
          args.push("pop");
          if (index !== undefined) args.push(`stash@{${index}}`);
          break;
          
        case 'list':
          args.push("list");
          break;
          
        case 'show':
          args.push("show");
          if (index !== undefined) args.push(`stash@{${index}}`);
          break;
          
        case 'drop':
          args.push("drop");
          if (index !== undefined) args.push(`stash@{${index}}`);
          break;
          
        case 'clear':
          args.push("clear");
          break;
      }
      
      const result = execSync(`git ${args.join(" ")}`, {
        cwd: context.workingDirectory,
        encoding: "utf8",
        timeout: 15000
      });
      
      // Get current stash count
      let stashCount = 0;
      try {
        const stashList = execSync("git stash list", {
          cwd: context.workingDirectory,
          encoding: "utf8"
        }).trim();
        stashCount = stashList ? stashList.split('\n').length : 0;
      } catch {
        // Ignore error
      }
      
      return {
        success: true,
        content: result.trim() || `Stash ${action} completed`,
        metadata: {
          action,
          message: message || null,
          index: index || null,
          stash_count: stashCount,
          include_untracked
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Git stash failed: ${error.message}`
      };
    }
  }
};

export const gitStashTool: RegisteredTool = {
  name: "git_stash",
  description: "Manage git stash (temporarily save changes)",
  schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["save", "pop", "list", "show", "drop", "clear"],
        description: "Stash action to perform",
        default: "list"
      },
      message: {
        type: "string",
        description: "Message for stash save"
      },
      index: {
        type: "number",
        description: "Stash index (0 = most recent)"
      },
      include_untracked: {
        type: "boolean",
        description: "Include untracked files in stash",
        default: false
      }
    }
  },
  safety: {
    require_approval: true, // Can lose work if misused
    network_access: false,
    max_execution_time: 15000,
    allowed_in_ci: false
  },
  handler: gitStashHandler,
  metadata: {
    category: "git_operations",
    version: "1.0",
    author: "metis-team"
  }
};

// Git Rebase Tool (Interactive)
const gitRebaseHandler: ToolHandler = {
  async execute(
    params: { 
      target?: string;
      interactive?: boolean;
      abort?: boolean;
      continue?: boolean;
      skip?: boolean;
      onto?: string;
    }, 
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { target, interactive = false, abort = false, continue: continueRebase = false, skip = false, onto } = params;
    
    try {
      let args = ["rebase"];
      
      if (abort) {
        args.push("--abort");
      } else if (continueRebase) {
        args.push("--continue");
      } else if (skip) {
        args.push("--skip");
      } else {
        if (interactive) {
          args.push("-i");
        }
        if (onto) {
          args.push("--onto", onto);
        }
        if (target) {
          args.push(target);
        }
      }
      
      const result = execSync(`git ${args.join(" ")}`, {
        cwd: context.workingDirectory,
        encoding: "utf8",
        timeout: 60000 // Longer timeout for interactive operations
      });
      
      // Check rebase status
      let rebaseInProgress = false;
      try {
        execSync("git status --porcelain=v1", {
          cwd: context.workingDirectory,
          encoding: "utf8"
        });
      } catch (error: any) {
        rebaseInProgress = error.message.includes("rebase") || error.message.includes("REBASE");
      }
      
      return {
        success: true,
        content: result.trim() || "Rebase operation completed",
        metadata: {
          target: target || null,
          interactive,
          abort,
          continue: continueRebase,
          skip,
          onto: onto || null,
          rebase_in_progress: rebaseInProgress
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Git rebase failed: ${error.message}`,
        metadata: {
          suggestion: "Use git_rebase with abort=true to cancel, or continue=true to proceed"
        }
      };
    }
  }
};

export const gitRebaseTool: RegisteredTool = {
  name: "git_rebase",
  description: "Rebase commits (interactive and non-interactive)",
  schema: {
    type: "object",
    properties: {
      target: {
        type: "string",
        description: "Target branch or commit to rebase onto"
      },
      interactive: {
        type: "boolean",
        description: "Start interactive rebase",
        default: false
      },
      abort: {
        type: "boolean",
        description: "Abort current rebase",
        default: false
      },
      continue: {
        type: "boolean",
        description: "Continue rebase after resolving conflicts",
        default: false
      },
      skip: {
        type: "boolean",
        description: "Skip current commit during rebase",
        default: false
      },
      onto: {
        type: "string",
        description: "Rebase onto specific commit"
      }
    }
  },
  safety: {
    require_approval: true, // Can rewrite history
    network_access: false,
    max_execution_time: 60000,
    allowed_in_ci: false
  },
  handler: gitRebaseHandler,
  metadata: {
    category: "git_operations",
    version: "1.0",
    author: "metis-team"
  }
};

// Git Remote Tool
const gitRemoteHandler: ToolHandler = {
  async execute(
    params: { 
      action?: 'list' | 'add' | 'remove' | 'set-url' | 'show';
      name?: string;
      url?: string;
      verbose?: boolean;
    }, 
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { action = 'list', name, url, verbose = false } = params;
    
    try {
      let args = ["remote"];
      
      switch (action) {
        case 'list':
          if (verbose) args.push("-v");
          break;
          
        case 'add':
          if (!name || !url) {
            return {
              success: false,
              error: "Name and URL are required for add action"
            };
          }
          args.push("add", name, url);
          break;
          
        case 'remove':
          if (!name) {
            return {
              success: false,
              error: "Name is required for remove action"
            };
          }
          args.push("remove", name);
          break;
          
        case 'set-url':
          if (!name || !url) {
            return {
              success: false,
              error: "Name and URL are required for set-url action"
            };
          }
          args.push("set-url", name, url);
          break;
          
        case 'show':
          if (!name) {
            return {
              success: false,
              error: "Name is required for show action"
            };
          }
          args.push("show", name);
          break;
      }
      
      const result = execSync(`git ${args.join(" ")}`, {
        cwd: context.workingDirectory,
        encoding: "utf8",
        timeout: 15000
      });
      
      return {
        success: true,
        content: result.trim(),
        metadata: {
          action,
          name: name || null,
          url: url || null,
          verbose
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Git remote operation failed: ${error.message}`
      };
    }
  }
};

export const gitRemoteTool: RegisteredTool = {
  name: "git_remote",
  description: "Manage git remotes",
  schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "add", "remove", "set-url", "show"],
        description: "Remote action to perform",
        default: "list"
      },
      name: {
        type: "string",
        description: "Remote name (required for add/remove/set-url/show)"
      },
      url: {
        type: "string",
        description: "Remote URL (required for add/set-url)"
      },
      verbose: {
        type: "boolean",
        description: "Show URLs for list action",
        default: false
      }
    }
  },
  safety: {
    require_approval: true, // Can affect remote repositories
    network_access: true, // May fetch remote info
    max_execution_time: 15000,
    allowed_in_ci: false
  },
  handler: gitRemoteHandler,
  metadata: {
    category: "git_operations",
    version: "1.0",
    author: "metis-team"
  }
};

// Smart Commit Message Generator Tool
const generateCommitMessageHandler: ToolHandler = {
  async execute(params: { files?: string[]; type?: string; scope?: string }, context: ExecutionContext): Promise<ToolResult> {
    const { files = [], type, scope } = params;
    
    try {
      // Get git diff for staged changes
      let diffOutput = "";
      try {
        diffOutput = execSync("git diff --cached", {
          cwd: context.workingDirectory,
          encoding: "utf8",
          timeout: 10000
        });
      } catch (error) {
        return {
          success: false,
          error: "No staged changes found. Stage changes first with git add."
        };
      }
      
      if (!diffOutput.trim()) {
        return {
          success: false,
          error: "No staged changes found. Stage changes first with git add."
        };
      }
      
      // Get changed files
      const changedFiles = execSync("git diff --cached --name-only", {
        cwd: context.workingDirectory,
        encoding: "utf8"
      }).trim().split('\n').filter(f => f.length > 0);
      
      // Analyze changes to suggest commit type and message
      const diffLines = diffOutput.split('\n');
      const additions = diffLines.filter(line => line.startsWith('+')).length;
      const deletions = diffLines.filter(line => line.startsWith('-')).length;
      
      // Simple heuristics for commit type
      let suggestedType = type;
      if (!suggestedType) {
        if (changedFiles.some(f => f.includes('test') || f.includes('.test.') || f.includes('.spec.'))) {
          suggestedType = 'test';
        } else if (changedFiles.some(f => f.includes('README') || f.includes('doc'))) {
          suggestedType = 'docs';
        } else if (additions > deletions * 2) {
          suggestedType = 'feat';
        } else if (deletions > additions) {
          suggestedType = 'refactor';
        } else {
          suggestedType = 'fix';
        }
      }
      
      // Generate scope if not provided
      let suggestedScope = scope;
      if (!suggestedScope && changedFiles.length > 0) {
        const commonPath = changedFiles[0].split('/')[0];
        if (changedFiles.every(f => f.startsWith(commonPath))) {
          suggestedScope = commonPath;
        }
      }
      
      // Create commit message suggestions
      const scopeStr = suggestedScope ? `(${suggestedScope})` : '';
      const filesSummary = changedFiles.length <= 3 
        ? changedFiles.join(', ')
        : `${changedFiles.slice(0, 2).join(', ')} and ${changedFiles.length - 2} more`;
      
      const suggestions = [
        `${suggestedType}${scopeStr}: update ${filesSummary}`,
        `${suggestedType}${scopeStr}: improve ${suggestedScope || 'functionality'}`,
        `${suggestedType}${scopeStr}: modify ${changedFiles.length} file${changedFiles.length > 1 ? 's' : ''}`
      ];
      
      return {
        success: true,
        content: suggestions[0], // Return the best suggestion
        metadata: {
          suggestions,
          changed_files: changedFiles,
          changes_summary: {
            files: changedFiles.length,
            additions,
            deletions
          },
          suggested_type: suggestedType,
          suggested_scope: suggestedScope
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to generate commit message: ${error.message}`
      };
    }
  }
};

export const generateCommitMessageTool: RegisteredTool = {
  name: "generate_commit_message", 
  description: "Generate intelligent commit messages based on staged changes",
  schema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        items: { type: "string" },
        description: "Specific files to consider (optional)"
      },
      type: {
        type: "string",
        enum: ["feat", "fix", "docs", "style", "refactor", "test", "chore"],
        description: "Conventional commit type"
      },
      scope: {
        type: "string",
        description: "Commit scope (component/module affected)"
      }
    }
  },
  safety: {
    require_approval: false, // Just generates suggestions
    network_access: false,
    max_execution_time: 10000,
    allowed_in_ci: true
  },
  handler: generateCommitMessageHandler,
  metadata: {
    category: "git_operations",
    version: "1.0",
    author: "metis-team"
  }
};