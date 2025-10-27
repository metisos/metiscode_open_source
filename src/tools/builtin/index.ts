import { toolRegistry } from "../registry";

// Core file operations
import { readFileTool, writeFileTool, listFilesTool } from "./fileOps";

// Advanced file operations  
import { 
  editFileTool, 
  appendToFileTool, 
  createDirectoryTool, 
  moveFileTool 
} from "./advancedFileOps";

// Basic git operations
import { gitStatusTool, gitDiffTool, gitLogTool } from "./gitOps";

// Enhanced git operations
import { 
  gitAddTool, 
  gitCommitTool, 
  gitBranchTool, 
  gitCheckoutTool 
} from "./enhancedGitOps";

// Advanced git operations
import {
  gitMergeTool,
  gitStashTool,
  gitRebaseTool,
  gitRemoteTool,
  generateCommitMessageTool
} from "./advancedGitOps";

// GitHub CLI operations
import {
  githubPRTool,
  githubIssueTool,
  githubRepoTool,
  githubWorkflowTool
} from "./githubOps";

// Git conflict resolution
import {
  detectConflictsTool,
  resolveConflictTool,
  gitStatusEnhancedTool
} from "./gitConflictOps";

// Search operations (critical for Claude Code parity)
import { grepTool, findFilesTool, searchTool } from "./searchOps";

// Todo management operations
import { 
  createTodoTool, 
  updateTodoTool, 
  listTodosTool, 
  deleteTodoTool, 
  clearCompletedTool 
} from "./todoOps";

// Bash/system operations
import {
  bashTool,
  psTool,
  envTool,
  whichTool
} from "./bashOps";

// Background process operations
import {
  bashOutputTool,
  killShellTool
} from "./backgroundProcessOps";

// User interaction operations
import {
  askUserQuestionTool
} from "./questionOps";

// Enhanced bash and code execution
import {
  enhancedBashTool,
  codeRunnerTool
} from "./enhancedBashOps";

// Multi-file batch operations
import {
  multiFileReplaceTool,
  batchReadTool,
  renameSymbolTool
} from "./batchFileOps";

// Import organization
import {
  organizeImportsTool
} from "./importOps";

// MCP operations
import {
  connectMCPServerTool,
  listMCPServersTool,
  listMCPResourcesTool,
  getMCPResourceTool,
  listMCPToolsTool,
  callMCPToolTool,
  disconnectMCPServerTool
} from "./mcpOps";

// Web operations
import { webFetchTool } from "./webOps";

// Glob operations
import { globTool } from "./globOps";

// Multi-edit operations
import { multiEditTool } from "./multiEditOps";

// Notebook operations
import { notebookEditTool } from "./notebookOps";

// Web search operations
import { webSearchTool } from "./webSearchOps";

// Task delegation operations
import { taskTool } from "./taskOps";

// Firecrawl web scraping operations
import { firecrawlScrapeTool, firecrawlCrawlTool } from "./firecrawlOps";

export function registerBuiltinTools() {
  // Core file operations
  toolRegistry.register(readFileTool);
  toolRegistry.register(writeFileTool);
  toolRegistry.register(listFilesTool);
  
  // Advanced file operations
  toolRegistry.register(editFileTool);
  toolRegistry.register(appendToFileTool);
  toolRegistry.register(createDirectoryTool);
  toolRegistry.register(moveFileTool);
  
  // Search operations (most critical!)
  toolRegistry.register(grepTool);
  toolRegistry.register(findFilesTool);
  toolRegistry.register(searchTool); // Alias for grep
  
  // Todo management operations
  toolRegistry.register(createTodoTool);
  toolRegistry.register(updateTodoTool);
  toolRegistry.register(listTodosTool);
  toolRegistry.register(deleteTodoTool);
  toolRegistry.register(clearCompletedTool);
  
  // Basic git operations  
  toolRegistry.register(gitStatusTool);
  toolRegistry.register(gitDiffTool);
  toolRegistry.register(gitLogTool);
  
  // Enhanced git operations
  toolRegistry.register(gitAddTool);
  toolRegistry.register(gitCommitTool);
  toolRegistry.register(gitBranchTool);
  toolRegistry.register(gitCheckoutTool);
  
  // Advanced git operations
  toolRegistry.register(gitMergeTool);
  toolRegistry.register(gitStashTool);
  toolRegistry.register(gitRebaseTool);
  toolRegistry.register(gitRemoteTool);
  toolRegistry.register(generateCommitMessageTool);
  
  // GitHub CLI operations
  toolRegistry.register(githubPRTool);
  toolRegistry.register(githubIssueTool);
  toolRegistry.register(githubRepoTool);
  toolRegistry.register(githubWorkflowTool);
  
  // Git conflict resolution
  toolRegistry.register(detectConflictsTool);
  toolRegistry.register(resolveConflictTool);
  toolRegistry.register(gitStatusEnhancedTool);
  
  // System operations
  toolRegistry.register(bashTool);
  toolRegistry.register(psTool);
  toolRegistry.register(envTool);
  toolRegistry.register(whichTool);

  // Background process operations
  toolRegistry.register(bashOutputTool);
  toolRegistry.register(killShellTool);

  // User interaction operations
  toolRegistry.register(askUserQuestionTool);

  // Enhanced execution capabilities
  toolRegistry.register(enhancedBashTool);
  toolRegistry.register(codeRunnerTool);
  
  // Multi-file batch operations
  toolRegistry.register(multiFileReplaceTool);
  toolRegistry.register(batchReadTool);
  toolRegistry.register(renameSymbolTool);
  
  // Import organization
  toolRegistry.register(organizeImportsTool);
  
  // MCP operations
  toolRegistry.register(connectMCPServerTool);
  toolRegistry.register(listMCPServersTool);
  toolRegistry.register(listMCPResourcesTool);
  toolRegistry.register(getMCPResourceTool);
  toolRegistry.register(listMCPToolsTool);
  toolRegistry.register(callMCPToolTool);
  toolRegistry.register(disconnectMCPServerTool);

  // Web operations
  toolRegistry.register(webFetchTool);

  // Advanced search operations
  toolRegistry.register(globTool);

  // Advanced file editing
  toolRegistry.register(multiEditTool);

  // Notebook operations
  toolRegistry.register(notebookEditTool);

  // Web search operations
  toolRegistry.register(webSearchTool);

  // Task delegation
  toolRegistry.register(taskTool);

  // Firecrawl web scraping
  toolRegistry.register(firecrawlScrapeTool);
  toolRegistry.register(firecrawlCrawlTool);

  // Only show in trace mode, not verbose
  if (process.env.METIS_TRACE === 'true') {
    console.log(`Registered ${toolRegistry.list().length} built-in tools`);
  }
}

export { toolRegistry };