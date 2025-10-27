import { execSync } from "child_process";
import { RegisteredTool, ToolHandler, ExecutionContext, ToolResult } from "../registry";

// Helper function to check if GitHub CLI is available
function checkGithubCLI(): boolean {
  try {
    execSync("gh --version", { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// GitHub Pull Request Tool
const githubPRHandler: ToolHandler = {
  async execute(
    params: { 
      action?: 'create' | 'list' | 'view' | 'merge' | 'close' | 'edit';
      title?: string;
      body?: string;
      base?: string;
      head?: string;
      draft?: boolean;
      assignees?: string[];
      labels?: string[];
      reviewers?: string[];
      pr_number?: number;
      auto_merge?: boolean;
      delete_branch?: boolean;
    }, 
    context: ExecutionContext
  ): Promise<ToolResult> {
    if (!checkGithubCLI()) {
      return {
        success: false,
        error: "GitHub CLI (gh) is not installed. Install it from https://cli.github.com/"
      };
    }
    
    const { 
      action = 'list', 
      title, 
      body, 
      base = 'main', 
      head, 
      draft = false,
      assignees = [],
      labels = [],
      reviewers = [],
      pr_number,
      auto_merge = false,
      delete_branch = false
    } = params;
    
    try {
      let args = ["pr"];
      
      switch (action) {
        case 'create':
          if (!title) {
            return {
              success: false,
              error: "Title is required for creating a PR"
            };
          }
          
          args.push("create", "--title", title);
          
          if (body) args.push("--body", body);
          if (base) args.push("--base", base);
          if (head) args.push("--head", head);
          if (draft) args.push("--draft");
          
          if (assignees.length > 0) args.push("--assignee", assignees.join(','));
          if (labels.length > 0) args.push("--label", labels.join(','));
          if (reviewers.length > 0) args.push("--reviewer", reviewers.join(','));
          break;
          
        case 'list':
          args.push("list");
          break;
          
        case 'view':
          args.push("view");
          if (pr_number) args.push(pr_number.toString());
          break;
          
        case 'merge':
          if (!pr_number) {
            return {
              success: false,
              error: "PR number is required for merge action"
            };
          }
          args.push("merge", pr_number.toString());
          if (auto_merge) args.push("--auto");
          if (delete_branch) args.push("--delete-branch");
          break;
          
        case 'close':
          if (!pr_number) {
            return {
              success: false,
              error: "PR number is required for close action"
            };
          }
          args.push("close", pr_number.toString());
          break;
          
        case 'edit':
          if (!pr_number) {
            return {
              success: false,
              error: "PR number is required for edit action"
            };
          }
          args.push("edit", pr_number.toString());
          if (title) args.push("--title", title);
          if (body) args.push("--body", body);
          break;
      }
      
      const result = execSync(`gh ${args.join(" ")}`, {
        cwd: context.workingDirectory,
        encoding: "utf8",
        timeout: 30000
      });
      
      return {
        success: true,
        content: result.trim(),
        metadata: {
          action,
          pr_number: pr_number || null,
          title: title || null,
          base,
          head: head || null,
          draft,
          labels,
          reviewers,
          assignees
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `GitHub PR operation failed: ${error.message}`,
        metadata: {
          suggestion: "Ensure you're authenticated with 'gh auth login' and have proper repository access"
        }
      };
    }
  }
};

export const githubPRTool: RegisteredTool = {
  name: "github_pr",
  description: "Manage GitHub pull requests via GitHub CLI",
  schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "list", "view", "merge", "close", "edit"],
        description: "PR action to perform",
        default: "list"
      },
      title: {
        type: "string",
        description: "PR title (required for create/edit)"
      },
      body: {
        type: "string",
        description: "PR body/description"
      },
      base: {
        type: "string",
        description: "Base branch for PR",
        default: "main"
      },
      head: {
        type: "string",
        description: "Head branch for PR (defaults to current branch)"
      },
      draft: {
        type: "boolean",
        description: "Create as draft PR",
        default: false
      },
      assignees: {
        type: "array",
        items: { type: "string" },
        description: "GitHub usernames to assign"
      },
      labels: {
        type: "array",
        items: { type: "string" },
        description: "Labels to add to PR"
      },
      reviewers: {
        type: "array",
        items: { type: "string" },
        description: "GitHub usernames to request review from"
      },
      pr_number: {
        type: "number",
        description: "PR number (required for view/merge/close/edit)"
      },
      auto_merge: {
        type: "boolean",
        description: "Enable auto-merge when merging",
        default: false
      },
      delete_branch: {
        type: "boolean",
        description: "Delete head branch after merge",
        default: false
      }
    }
  },
  safety: {
    require_approval: true, // Can modify repository
    network_access: true,
    max_execution_time: 30000,
    allowed_in_ci: false
  },
  handler: githubPRHandler,
  metadata: {
    category: "github_operations",
    version: "1.0",
    author: "metis-team"
  }
};

// GitHub Issues Tool
const githubIssueHandler: ToolHandler = {
  async execute(
    params: { 
      action?: 'create' | 'list' | 'view' | 'close' | 'reopen' | 'edit';
      title?: string;
      body?: string;
      assignees?: string[];
      labels?: string[];
      milestone?: string;
      issue_number?: number;
      state?: 'open' | 'closed' | 'all';
    }, 
    context: ExecutionContext
  ): Promise<ToolResult> {
    if (!checkGithubCLI()) {
      return {
        success: false,
        error: "GitHub CLI (gh) is not installed. Install it from https://cli.github.com/"
      };
    }
    
    const { 
      action = 'list', 
      title, 
      body, 
      assignees = [],
      labels = [],
      milestone,
      issue_number,
      state = 'open'
    } = params;
    
    try {
      let args = ["issue"];
      
      switch (action) {
        case 'create':
          if (!title) {
            return {
              success: false,
              error: "Title is required for creating an issue"
            };
          }
          
          args.push("create", "--title", title);
          
          if (body) args.push("--body", body);
          if (assignees.length > 0) args.push("--assignee", assignees.join(','));
          if (labels.length > 0) args.push("--label", labels.join(','));
          if (milestone) args.push("--milestone", milestone);
          break;
          
        case 'list':
          args.push("list");
          if (state !== 'open') args.push("--state", state);
          break;
          
        case 'view':
          args.push("view");
          if (issue_number) args.push(issue_number.toString());
          break;
          
        case 'close':
          if (!issue_number) {
            return {
              success: false,
              error: "Issue number is required for close action"
            };
          }
          args.push("close", issue_number.toString());
          break;
          
        case 'reopen':
          if (!issue_number) {
            return {
              success: false,
              error: "Issue number is required for reopen action"
            };
          }
          args.push("reopen", issue_number.toString());
          break;
          
        case 'edit':
          if (!issue_number) {
            return {
              success: false,
              error: "Issue number is required for edit action"
            };
          }
          args.push("edit", issue_number.toString());
          if (title) args.push("--title", title);
          if (body) args.push("--body", body);
          break;
      }
      
      const result = execSync(`gh ${args.join(" ")}`, {
        cwd: context.workingDirectory,
        encoding: "utf8",
        timeout: 30000
      });
      
      return {
        success: true,
        content: result.trim(),
        metadata: {
          action,
          issue_number: issue_number || null,
          title: title || null,
          state,
          labels,
          assignees,
          milestone: milestone || null
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `GitHub issue operation failed: ${error.message}`,
        metadata: {
          suggestion: "Ensure you're authenticated with 'gh auth login' and have proper repository access"
        }
      };
    }
  }
};

export const githubIssueTool: RegisteredTool = {
  name: "github_issue",
  description: "Manage GitHub issues via GitHub CLI",
  schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "list", "view", "close", "reopen", "edit"],
        description: "Issue action to perform",
        default: "list"
      },
      title: {
        type: "string",
        description: "Issue title (required for create/edit)"
      },
      body: {
        type: "string",
        description: "Issue body/description"
      },
      assignees: {
        type: "array",
        items: { type: "string" },
        description: "GitHub usernames to assign"
      },
      labels: {
        type: "array",
        items: { type: "string" },
        description: "Labels to add to issue"
      },
      milestone: {
        type: "string",
        description: "Milestone to assign"
      },
      issue_number: {
        type: "number",
        description: "Issue number (required for view/close/reopen/edit)"
      },
      state: {
        type: "string",
        enum: ["open", "closed", "all"],
        description: "Filter issues by state",
        default: "open"
      }
    }
  },
  safety: {
    require_approval: true, // Can modify repository
    network_access: true,
    max_execution_time: 30000,
    allowed_in_ci: false
  },
  handler: githubIssueHandler,
  metadata: {
    category: "github_operations",
    version: "1.0",
    author: "metis-team"
  }
};

// GitHub Repository Info Tool
const githubRepoHandler: ToolHandler = {
  async execute(
    params: { 
      action?: 'view' | 'clone' | 'fork' | 'create';
      repo?: string;
      name?: string;
      description?: string;
      visibility?: 'public' | 'private';
    }, 
    context: ExecutionContext
  ): Promise<ToolResult> {
    if (!checkGithubCLI()) {
      return {
        success: false,
        error: "GitHub CLI (gh) is not installed. Install it from https://cli.github.com/"
      };
    }
    
    const { action = 'view', repo, name, description, visibility = 'public' } = params;
    
    try {
      let args = ["repo"];
      
      switch (action) {
        case 'view':
          args.push("view");
          if (repo) args.push(repo);
          break;
          
        case 'clone':
          if (!repo) {
            return {
              success: false,
              error: "Repository name is required for clone action"
            };
          }
          args.push("clone", repo);
          break;
          
        case 'fork':
          args.push("fork");
          if (repo) args.push(repo);
          break;
          
        case 'create':
          if (!name) {
            return {
              success: false,
              error: "Repository name is required for create action"
            };
          }
          args.push("create", name);
          args.push(`--${visibility}`);
          if (description) args.push("--description", description);
          break;
      }
      
      const result = execSync(`gh ${args.join(" ")}`, {
        cwd: context.workingDirectory,
        encoding: "utf8",
        timeout: 60000 // Longer timeout for clone operations
      });
      
      return {
        success: true,
        content: result.trim(),
        metadata: {
          action,
          repo: repo || null,
          name: name || null,
          description: description || null,
          visibility
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `GitHub repo operation failed: ${error.message}`,
        metadata: {
          suggestion: "Ensure you're authenticated with 'gh auth login' and have proper repository access"
        }
      };
    }
  }
};

export const githubRepoTool: RegisteredTool = {
  name: "github_repo",
  description: "Manage GitHub repositories via GitHub CLI",
  schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["view", "clone", "fork", "create"],
        description: "Repository action to perform",
        default: "view"
      },
      repo: {
        type: "string",
        description: "Repository name (owner/repo format)"
      },
      name: {
        type: "string",
        description: "New repository name (for create action)"
      },
      description: {
        type: "string",
        description: "Repository description (for create action)"
      },
      visibility: {
        type: "string",
        enum: ["public", "private"],
        description: "Repository visibility",
        default: "public"
      }
    }
  },
  safety: {
    require_approval: true, // Can create/modify repositories
    network_access: true,
    max_execution_time: 60000,
    allowed_in_ci: false
  },
  handler: githubRepoHandler,
  metadata: {
    category: "github_operations",
    version: "1.0",
    author: "metis-team"
  }
};

// GitHub Workflow (Actions) Tool
const githubWorkflowHandler: ToolHandler = {
  async execute(
    params: { 
      action?: 'list' | 'view' | 'run' | 'cancel';
      workflow?: string;
      run_id?: number;
      branch?: string;
    }, 
    context: ExecutionContext
  ): Promise<ToolResult> {
    if (!checkGithubCLI()) {
      return {
        success: false,
        error: "GitHub CLI (gh) is not installed. Install it from https://cli.github.com/"
      };
    }
    
    const { action = 'list', workflow, run_id, branch } = params;
    
    try {
      let args = [];
      
      switch (action) {
        case 'list':
          args = ["workflow", "list"];
          break;
          
        case 'view':
          if (workflow) {
            args = ["workflow", "view", workflow];
          } else if (run_id) {
            args = ["run", "view", run_id.toString()];
          } else {
            args = ["run", "list"];
          }
          break;
          
        case 'run':
          if (!workflow) {
            return {
              success: false,
              error: "Workflow name is required for run action"
            };
          }
          args = ["workflow", "run", workflow];
          if (branch) args.push("--ref", branch);
          break;
          
        case 'cancel':
          if (!run_id) {
            return {
              success: false,
              error: "Run ID is required for cancel action"
            };
          }
          args = ["run", "cancel", run_id.toString()];
          break;
      }
      
      const result = execSync(`gh ${args.join(" ")}`, {
        cwd: context.workingDirectory,
        encoding: "utf8",
        timeout: 30000
      });
      
      return {
        success: true,
        content: result.trim(),
        metadata: {
          action,
          workflow: workflow || null,
          run_id: run_id || null,
          branch: branch || null
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `GitHub workflow operation failed: ${error.message}`,
        metadata: {
          suggestion: "Ensure you're authenticated with 'gh auth login' and have proper repository access"
        }
      };
    }
  }
};

export const githubWorkflowTool: RegisteredTool = {
  name: "github_workflow",
  description: "Manage GitHub Actions workflows via GitHub CLI",
  schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "view", "run", "cancel"],
        description: "Workflow action to perform",
        default: "list"
      },
      workflow: {
        type: "string",
        description: "Workflow name or filename"
      },
      run_id: {
        type: "number",
        description: "Workflow run ID"
      },
      branch: {
        type: "string",
        description: "Branch to run workflow on"
      }
    }
  },
  safety: {
    require_approval: true, // Can trigger CI/CD workflows
    network_access: true,
    max_execution_time: 30000,
    allowed_in_ci: false
  },
  handler: githubWorkflowHandler,
  metadata: {
    category: "github_operations",
    version: "1.0",
    author: "metis-team"
  }
};