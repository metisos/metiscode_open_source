import fs from "fs";
import path from "path";
import { RegisteredTool, ToolHandler, ExecutionContext, ToolResult } from "../registry";
import { withinCwdSafe } from "../files";

// Organize Imports Tool
const organizeImportsHandler: ToolHandler = {
  async execute(
    params: { 
      files: string[];
      file_pattern?: string;
      sort_imports?: boolean;
      remove_unused?: boolean;
      group_imports?: boolean;
      dry_run?: boolean;
    }, 
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { 
      files = [],
      file_pattern,
      sort_imports = true,
      remove_unused = false, // Conservative default
      group_imports = true,
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
          .filter(f => f && 
            !f.includes('node_modules') && 
            !f.includes('.git') &&
            (f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.tsx') || f.endsWith('.jsx'))
          );
        
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

    const results: Array<{
      file: string;
      changes: number;
      success: boolean;
      error?: string;
      details?: string;
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
          const organizedContent = organizeFileImports(
            originalContent, 
            {
              sortImports: sort_imports,
              removeUnused: remove_unused,
              groupImports: group_imports
            }
          );

          const hasChanges = originalContent !== organizedContent;
          let changeCount = 0;

          if (hasChanges) {
            changeCount = 1; // Simplified - could count individual import changes
            
            if (!dry_run) {
              // Create backup
              const backupPath = `${fullPath}.bak`;
              fs.writeFileSync(backupPath, originalContent, 'utf8');
              
              // Write organized content
              fs.writeFileSync(fullPath, organizedContent, 'utf8');
            }
            
            totalChanges++;
          }

          results.push({
            file,
            changes: changeCount,
            success: true,
            details: hasChanges ? 'Imports organized' : 'No changes needed'
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
      const changedCount = results.filter(r => r.changes > 0).length;

      const summary = dry_run
        ? `DRY RUN: Would organize imports in ${changedCount} of ${successCount} files`
        : `Organized imports in ${changedCount} of ${successCount} files`;

      return {
        success: failureCount === 0,
        content: summary,
        metadata: {
          total_files: filesToProcess.length,
          successful_files: successCount,
          failed_files: failureCount,
          changed_files: changedCount,
          sort_imports,
          remove_unused,
          group_imports,
          dry_run,
          results
        }
      };

    } catch (error: any) {
      return {
        success: false,
        error: `Import organization failed: ${error.message}`,
        metadata: { results }
      };
    }
  }
};

function organizeFileImports(content: string, options: {
  sortImports: boolean;
  removeUnused: boolean;
  groupImports: boolean;
}): string {
  const lines = content.split('\n');
  const importLines: string[] = [];
  const nonImportLines: string[] = [];
  
  let inImportSection = true;
  let hasSeenCode = false;

  // Separate imports from other code
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Skip empty lines and comments at the top
    if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
      if (!hasSeenCode) {
        nonImportLines.push(line);
        continue;
      }
    }
    
    // Check if this is an import line
    if (trimmedLine.startsWith('import ') && inImportSection) {
      importLines.push(line);
    } else {
      // Once we see non-import code, we're out of the import section
      if (trimmedLine && !trimmedLine.startsWith('//') && !trimmedLine.startsWith('/*')) {
        inImportSection = false;
        hasSeenCode = true;
      }
      nonImportLines.push(line);
    }
  }

  if (importLines.length === 0) {
    return content; // No imports to organize
  }

  let organizedImports = [...importLines];

  // Sort imports if requested
  if (options.sortImports) {
    organizedImports = sortImports(organizedImports);
  }

  // Group imports if requested  
  if (options.groupImports) {
    organizedImports = groupImports(organizedImports);
  }

  // Find where to insert the organized imports
  let insertIndex = 0;
  for (let i = 0; i < nonImportLines.length; i++) {
    const line = nonImportLines[i];
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
      insertIndex = i;
      break;
    }
  }

  // Reconstruct the file
  const beforeImports = nonImportLines.slice(0, insertIndex);
  const afterImports = nonImportLines.slice(insertIndex);
  
  const result = [
    ...beforeImports,
    ...organizedImports,
    ...afterImports
  ].join('\n');

  return result;
}

function sortImports(imports: string[]): string[] {
  return imports.sort((a, b) => {
    // Extract module names for comparison
    const getModuleName = (importLine: string): string => {
      const match = importLine.match(/from\s+['"]([^'"]+)['"]/);
      return match ? match[1] : importLine;
    };

    const moduleA = getModuleName(a);
    const moduleB = getModuleName(b);

    // Sort order: node modules, relative imports
    const isNodeModuleA = !moduleA.startsWith('.') && !moduleA.startsWith('/');
    const isNodeModuleB = !moduleB.startsWith('.') && !moduleB.startsWith('/');

    if (isNodeModuleA && !isNodeModuleB) return -1;
    if (!isNodeModuleA && isNodeModuleB) return 1;
    
    return moduleA.localeCompare(moduleB);
  });
}

function groupImports(imports: string[]): string[] {
  const groups: {
    nodeModules: string[];
    relatives: string[];
    absolute: string[];
  } = {
    nodeModules: [],
    relatives: [],
    absolute: []
  };

  imports.forEach(importLine => {
    const match = importLine.match(/from\s+['"]([^'"]+)['"]/);
    if (!match) {
      groups.nodeModules.push(importLine);
      return;
    }

    const moduleName = match[1];
    
    if (moduleName.startsWith('./') || moduleName.startsWith('../')) {
      groups.relatives.push(importLine);
    } else if (moduleName.startsWith('/')) {
      groups.absolute.push(importLine);
    } else {
      groups.nodeModules.push(importLine);
    }
  });

  const result: string[] = [];
  
  if (groups.nodeModules.length > 0) {
    result.push(...groups.nodeModules, '');
  }
  
  if (groups.absolute.length > 0) {
    result.push(...groups.absolute, '');
  }
  
  if (groups.relatives.length > 0) {
    result.push(...groups.relatives);
  }

  // Remove trailing empty line
  while (result.length > 0 && result[result.length - 1] === '') {
    result.pop();
  }

  return result;
}

export const organizeImportsTool: RegisteredTool = {
  name: "organize_imports",
  description: "Organize and sort import statements across files",
  schema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        items: { type: "string" },
        description: "Array of file paths to process"
      },
      file_pattern: {
        type: "string", 
        description: "File pattern to match (e.g., '*.ts', '**/*.js')"
      },
      sort_imports: {
        type: "boolean",
        description: "Sort imports alphabetically",
        default: true
      },
      remove_unused: {
        type: "boolean",
        description: "Remove unused imports (experimental)",
        default: false
      },
      group_imports: {
        type: "boolean",
        description: "Group imports by type (node_modules, relative)",
        default: true
      },
      dry_run: {
        type: "boolean",
        description: "Preview changes without applying them",
        default: false
      }
    }
  },
  safety: {
    require_approval: true,
    path_restrictions: ["!node_modules", "!.git", "!dist"],
    network_access: false,
    max_execution_time: 20000,
    allowed_in_ci: false
  },
  handler: organizeImportsHandler,
  metadata: {
    category: "file_operations",
    version: "1.0",
    author: "metis-team"
  }
};