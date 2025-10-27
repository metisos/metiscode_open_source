import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { RegisteredTool, ToolHandler, ExecutionContext, ToolResult } from "../registry";

// Git Conflict Detection Tool
const detectConflictsHandler: ToolHandler = {
  async execute(params: {}, context: ExecutionContext): Promise<ToolResult> {
    try {
      // Get files with conflicts
      const conflictOutput = execSync("git diff --name-only --diff-filter=U", {
        cwd: context.workingDirectory,
        encoding: "utf8",
        timeout: 10000
      }).trim();
      
      const conflictFiles = conflictOutput ? conflictOutput.split('\n') : [];
      
      if (conflictFiles.length === 0) {
        return {
          success: true,
          content: "No merge conflicts detected",
          metadata: {
            conflict_files: [],
            has_conflicts: false
          }
        };
      }
      
      // Analyze each conflict file
      const conflictDetails = [];
      
      for (const file of conflictFiles) {
        const filePath = path.join(context.workingDirectory, file);
        
        try {
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const lines = fileContent.split('\n');
          
          const conflicts = [];
          let currentConflict = null;
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.startsWith('<<<<<<<')) {
              currentConflict = {
                start: i + 1,
                marker_start: line,
                ours: [],
                theirs: []
              };
            } else if (line.startsWith('=======') && currentConflict) {
              currentConflict.separator = i + 1;
            } else if (line.startsWith('>>>>>>>') && currentConflict) {
              currentConflict.end = i + 1;
              currentConflict.marker_end = line;
              conflicts.push(currentConflict);
              currentConflict = null;
            } else if (currentConflict) {
              if (currentConflict.separator) {
                currentConflict.theirs.push(line);
              } else {
                currentConflict.ours.push(line);
              }
            }
          }
          
          conflictDetails.push({
            file,
            conflicts: conflicts.length,
            conflict_sections: conflicts.map(c => ({
              lines: `${c.start}-${c.end}`,
              ours_lines: c.ours.length,
              theirs_lines: c.theirs.length
            }))
          });
        } catch (error) {
          conflictDetails.push({
            file,
            error: `Could not read file: ${error.message}`
          });
        }
      }
      
      const totalConflicts = conflictDetails.reduce((sum, detail) => 
        sum + (detail.conflicts || 0), 0
      );
      
      return {
        success: true,
        content: `Found ${totalConflicts} conflict(s) in ${conflictFiles.length} file(s):\n${
          conflictDetails.map(d => 
            d.error 
              ? `❌ ${d.file}: ${d.error}`
              : `⚠️  ${d.file}: ${d.conflicts} conflict(s)`
          ).join('\n')
        }`,
        metadata: {
          conflict_files: conflictFiles,
          has_conflicts: true,
          total_conflicts: totalConflicts,
          conflict_details: conflictDetails
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to detect conflicts: ${error.message}`
      };
    }
  }
};

export const detectConflictsTool: RegisteredTool = {
  name: "detect_conflicts",
  description: "Detect and analyze git merge conflicts",
  schema: {
    type: "object",
    properties: {}
  },
  safety: {
    require_approval: false,
    network_access: false,
    max_execution_time: 10000,
    allowed_in_ci: true
  },
  handler: detectConflictsHandler,
  metadata: {
    category: "git_operations",
    version: "1.0",
    author: "metis-team"
  }
};

// Git Conflict Resolution Tool
const resolveConflictHandler: ToolHandler = {
  async execute(
    params: { 
      file: string; 
      strategy?: 'ours' | 'theirs' | 'manual' | 'smart';
      line_start?: number;
      line_end?: number;
      resolution?: string;
    }, 
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { file, strategy = 'manual', line_start, line_end, resolution } = params;
    
    if (!file) {
      return {
        success: false,
        error: "File path is required"
      };
    }
    
    const filePath = path.join(context.workingDirectory, file);
    
    try {
      // Check if file has conflicts
      const conflictCheck = execSync(`git diff --name-only --diff-filter=U "${file}"`, {
        cwd: context.workingDirectory,
        encoding: "utf8"
      }).trim();
      
      if (!conflictCheck) {
        return {
          success: false,
          error: "File does not have merge conflicts"
        };
      }
      
      if (strategy === 'ours' || strategy === 'theirs') {
        // Use git checkout to resolve with strategy
        const checkoutFlag = strategy === 'ours' ? '--ours' : '--theirs';
        
        execSync(`git checkout ${checkoutFlag} "${file}"`, {
          cwd: context.workingDirectory,
          timeout: 10000
        });
        
        // Stage the resolved file
        execSync(`git add "${file}"`, {
          cwd: context.workingDirectory,
          timeout: 5000
        });
        
        return {
          success: true,
          content: `Resolved conflict in ${file} using ${strategy} strategy`,
          metadata: {
            file,
            strategy,
            resolved: true
          }
        };
      } else if (strategy === 'manual' && resolution) {
        // Manual resolution with provided content
        if (line_start && line_end) {
          // Replace specific conflict section
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const lines = fileContent.split('\n');
          
          lines.splice(line_start - 1, line_end - line_start + 1, resolution);
          
          fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
        } else {
          // Replace entire file content
          fs.writeFileSync(filePath, resolution, 'utf8');
        }
        
        // Stage the resolved file
        execSync(`git add "${file}"`, {
          cwd: context.workingDirectory,
          timeout: 5000
        });
        
        return {
          success: true,
          content: `Manually resolved conflict in ${file}`,
          metadata: {
            file,
            strategy,
            resolved: true,
            manual_resolution: true
          }
        };
      } else if (strategy === 'smart') {
        // Smart resolution attempts to merge non-conflicting parts
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const lines = fileContent.split('\n');
        
        let resolvedLines = [];
        let i = 0;
        
        while (i < lines.length) {
          const line = lines[i];
          
          if (line.startsWith('<<<<<<<')) {
            // Find the conflict markers
            let separatorIndex = -1;
            let endIndex = -1;
            
            for (let j = i + 1; j < lines.length; j++) {
              if (lines[j].startsWith('=======') && separatorIndex === -1) {
                separatorIndex = j;
              } else if (lines[j].startsWith('>>>>>>>')) {
                endIndex = j;
                break;
              }
            }
            
            if (separatorIndex !== -1 && endIndex !== -1) {
              const oursSection = lines.slice(i + 1, separatorIndex);
              const theirsSection = lines.slice(separatorIndex + 1, endIndex);
              
              // Simple smart merge: if sections are similar, try to merge
              if (oursSection.join('\n').trim() === theirsSection.join('\n').trim()) {
                // Identical sections, keep one
                resolvedLines.push(...oursSection);
              } else if (oursSection.length === 0) {
                // Our section is empty, keep theirs
                resolvedLines.push(...theirsSection);
              } else if (theirsSection.length === 0) {
                // Their section is empty, keep ours
                resolvedLines.push(...oursSection);
              } else {
                // Different sections, keep both with a comment
                resolvedLines.push('// Merged from both branches:');
                resolvedLines.push(...oursSection);
                if (oursSection.length > 0 && theirsSection.length > 0) {
                  resolvedLines.push('// And:');
                }
                resolvedLines.push(...theirsSection);
              }
              
              i = endIndex + 1;
            } else {
              // Malformed conflict markers, keep as is
              resolvedLines.push(line);
              i++;
            }
          } else {
            resolvedLines.push(line);
            i++;
          }
        }
        
        fs.writeFileSync(filePath, resolvedLines.join('\n'), 'utf8');
        
        // Stage the resolved file
        execSync(`git add "${file}"`, {
          cwd: context.workingDirectory,
          timeout: 5000
        });
        
        return {
          success: true,
          content: `Smart resolved conflict in ${file}`,
          metadata: {
            file,
            strategy,
            resolved: true,
            smart_resolution: true
          }
        };
      } else {
        return {
          success: false,
          error: "Invalid strategy or missing resolution content for manual strategy"
        };
      }
      
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to resolve conflict: ${error.message}`
      };
    }
  }
};

export const resolveConflictTool: RegisteredTool = {
  name: "resolve_conflict",
  description: "Resolve git merge conflicts with various strategies",
  schema: {
    type: "object",
    properties: {
      file: {
        type: "string",
        description: "Path to file with conflicts"
      },
      strategy: {
        type: "string",
        enum: ["ours", "theirs", "manual", "smart"],
        description: "Resolution strategy",
        default: "manual"
      },
      line_start: {
        type: "number",
        description: "Starting line number for manual resolution"
      },
      line_end: {
        type: "number",
        description: "Ending line number for manual resolution"
      },
      resolution: {
        type: "string",
        description: "Manual resolution content"
      }
    },
    required: ["file"]
  },
  safety: {
    require_approval: true, // Can modify files
    network_access: false,
    max_execution_time: 15000,
    allowed_in_ci: false
  },
  handler: resolveConflictHandler,
  metadata: {
    category: "git_operations",
    version: "1.0",
    author: "metis-team"
  }
};

// Git Status Enhanced Tool (with conflict awareness)
const gitStatusEnhancedHandler: ToolHandler = {
  async execute(
    params: { 
      show_conflicts?: boolean;
      show_untracked?: boolean;
      show_ignored?: boolean;
    }, 
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { show_conflicts = true, show_untracked = true, show_ignored = false } = params;
    
    try {
      // Get regular status
      const statusResult = execSync("git status --porcelain=v1", {
        cwd: context.workingDirectory,
        encoding: "utf8",
        timeout: 10000
      });
      
      // Parse status
      const statusLines = statusResult.trim().split('\n').filter(l => l.length > 0);
      const statusInfo = {
        modified: [],
        staged: [],
        untracked: [],
        deleted: [],
        renamed: [],
        conflicts: []
      };
      
      for (const line of statusLines) {
        const status = line.substring(0, 2);
        const file = line.substring(3);
        
        if (status === 'UU' || status === 'AA' || status === 'DD') {
          statusInfo.conflicts.push(file);
        } else if (status[0] === 'A' || status[0] === 'M' || status[0] === 'D') {
          statusInfo.staged.push(file);
        } else if (status[1] === 'M') {
          statusInfo.modified.push(file);
        } else if (status[1] === 'D') {
          statusInfo.deleted.push(file);
        } else if (status === '??') {
          statusInfo.untracked.push(file);
        } else if (status[0] === 'R') {
          statusInfo.renamed.push(file);
        }
      }
      
      // Get current branch
      let currentBranch = "";
      try {
        currentBranch = execSync("git branch --show-current", {
          cwd: context.workingDirectory,
          encoding: "utf8"
        }).trim();
      } catch {
        currentBranch = "HEAD (detached)";
      }
      
      // Check if in the middle of merge/rebase/cherry-pick
      let operationInProgress = null;
      const gitDir = path.join(context.workingDirectory, '.git');
      
      if (fs.existsSync(path.join(gitDir, 'MERGE_HEAD'))) {
        operationInProgress = 'merge';
      } else if (fs.existsSync(path.join(gitDir, 'rebase-merge')) || fs.existsSync(path.join(gitDir, 'rebase-apply'))) {
        operationInProgress = 'rebase';
      } else if (fs.existsSync(path.join(gitDir, 'CHERRY_PICK_HEAD'))) {
        operationInProgress = 'cherry-pick';
      }
      
      // Build status report
      const report = [];
      report.push(`Branch: ${currentBranch}`);
      
      if (operationInProgress) {
        report.push(`Operation: ${operationInProgress.toUpperCase()} in progress`);
      }
      
      if (statusInfo.conflicts.length > 0) {
        report.push(`\nConflicts (${statusInfo.conflicts.length}):`);
        statusInfo.conflicts.forEach(file => report.push(`  ⚠️  ${file}`));
      }
      
      if (statusInfo.staged.length > 0) {
        report.push(`\nStaged (${statusInfo.staged.length}):`);
        statusInfo.staged.forEach(file => report.push(`  ✓ ${file}`));
      }
      
      if (statusInfo.modified.length > 0) {
        report.push(`\nModified (${statusInfo.modified.length}):`);
        statusInfo.modified.forEach(file => report.push(`  • ${file}`));
      }
      
      if (statusInfo.deleted.length > 0) {
        report.push(`\nDeleted (${statusInfo.deleted.length}):`);
        statusInfo.deleted.forEach(file => report.push(`  - ${file}`));
      }
      
      if (statusInfo.renamed.length > 0) {
        report.push(`\nRenamed (${statusInfo.renamed.length}):`);
        statusInfo.renamed.forEach(file => report.push(`  → ${file}`));
      }
      
      if (show_untracked && statusInfo.untracked.length > 0) {
        report.push(`\nUntracked (${statusInfo.untracked.length}):`);
        statusInfo.untracked.forEach(file => report.push(`  ? ${file}`));
      }
      
      return {
        success: true,
        content: report.join('\n'),
        metadata: {
          current_branch: currentBranch,
          operation_in_progress: operationInProgress,
          status_counts: {
            conflicts: statusInfo.conflicts.length,
            staged: statusInfo.staged.length,
            modified: statusInfo.modified.length,
            deleted: statusInfo.deleted.length,
            untracked: statusInfo.untracked.length,
            renamed: statusInfo.renamed.length
          },
          has_conflicts: statusInfo.conflicts.length > 0,
          conflict_files: statusInfo.conflicts
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Enhanced git status failed: ${error.message}`
      };
    }
  }
};

export const gitStatusEnhancedTool: RegisteredTool = {
  name: "git_status_enhanced",
  description: "Enhanced git status with conflict detection and operation awareness",
  schema: {
    type: "object",
    properties: {
      show_conflicts: {
        type: "boolean",
        description: "Show conflict information",
        default: true
      },
      show_untracked: {
        type: "boolean", 
        description: "Show untracked files",
        default: true
      },
      show_ignored: {
        type: "boolean",
        description: "Show ignored files",
        default: false
      }
    }
  },
  safety: {
    require_approval: false,
    network_access: false,
    max_execution_time: 10000,
    allowed_in_ci: true
  },
  handler: gitStatusEnhancedHandler,
  metadata: {
    category: "git_operations",
    version: "1.0",
    author: "metis-team"
  }
};