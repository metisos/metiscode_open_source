import fs from 'fs';
import path from 'path';
import { CodePreview, FileChange } from './ApprovalGates';

export class PreviewGenerator {
  /**
   * Generate a code preview for write_file operations
   */
  static generateFileWritePreview(filePath: string, newContent: string, workingDirectory: string): CodePreview {
    const fullPath = path.resolve(workingDirectory, filePath);
    
    if (fs.existsSync(fullPath)) {
      // Existing file - show changes
      const oldContent = fs.readFileSync(fullPath, 'utf8');
      const changes = this.generateFileChange(filePath, oldContent, newContent, 'modify');
      
      return {
        type: 'file_change',
        changes: [changes]
      };
    } else {
      // New file
      return {
        type: 'file_create',
        newContent
      };
    }
  }

  /**
   * Generate a code preview for edit_file operations (search/replace)
   */
  static generateFileEditPreview(
    filePath: string, 
    searchPattern: string, 
    replacement: string,
    workingDirectory: string,
    lineNumber?: number
  ): CodePreview {
    const fullPath = path.resolve(workingDirectory, filePath);
    
    if (!fs.existsSync(fullPath)) {
      return {
        type: 'file_change',
        changes: []
      };
    }

    const originalContent = fs.readFileSync(fullPath, 'utf8');
    let newContent: string;

    if (lineNumber !== undefined) {
      // Line-specific edit
      const lines = originalContent.split('\n');
      const updatedLines = [...lines];
      
      if (lineNumber > 0 && lineNumber <= lines.length) {
        updatedLines[lineNumber - 1] = lines[lineNumber - 1].replace(searchPattern, replacement);
      }
      
      newContent = updatedLines.join('\n');
    } else {
      // Global search and replace
      const searchRegex = new RegExp(searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      newContent = originalContent.replace(searchRegex, replacement);
    }

    const changes = this.generateFileChange(filePath, originalContent, newContent, 'modify');
    
    return {
      type: 'file_change',
      changes: [changes]
    };
  }

  /**
   * Generate a code preview for multi-file operations
   */
  static generateMultiFilePreview(
    operations: Array<{
      file: string;
      searchPattern: string;
      replacement: string;
      changeType?: 'modify' | 'create' | 'delete';
    }>,
    workingDirectory: string
  ): CodePreview {
    const changes: FileChange[] = [];

    for (const op of operations) {
      const fullPath = path.resolve(workingDirectory, op.file);
      
      if (fs.existsSync(fullPath)) {
        const originalContent = fs.readFileSync(fullPath, 'utf8');
        const searchRegex = new RegExp(op.searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        const newContent = originalContent.replace(searchRegex, op.replacement);
        
        if (originalContent !== newContent) {
          const change = this.generateFileChange(op.file, originalContent, newContent, op.changeType || 'modify');
          changes.push(change);
        }
      }
    }

    return {
      type: 'multi_file',
      changes
    };
  }

  /**
   * Generate a code preview for shell commands
   */
  static generateCommandPreview(command: string): CodePreview {
    return {
      type: 'command_output',
      commandPreview: command
    };
  }

  /**
   * Generate a detailed file change with line-by-line diff
   */
  private static generateFileChange(
    filePath: string,
    beforeContent: string,
    afterContent: string,
    changeType: 'create' | 'modify' | 'delete' | 'rename'
  ): FileChange {
    const beforeLines = beforeContent.split('\n');
    const afterLines = afterContent.split('\n');
    
    const diffResult = this.computeLineDiff(beforeLines, afterLines);
    
    return {
      file: filePath,
      beforeContent,
      afterContent,
      changeType,
      previewLines: {
        before: diffResult.removed.map(line => ({
          lineNumber: line.lineNumber,
          content: line.content
        })),
        after: diffResult.added.map(line => ({
          lineNumber: line.lineNumber,
          content: line.content
        })),
        contextStart: diffResult.contextStart,
        contextEnd: diffResult.contextEnd
      }
    };
  }

  /**
   * Simple line-based diff computation
   */
  private static computeLineDiff(beforeLines: string[], afterLines: string[]): {
    removed: Array<{lineNumber: number; content: string}>;
    added: Array<{lineNumber: number; content: string}>;
    contextStart: number;
    contextEnd: number;
  } {
    const removed: Array<{lineNumber: number; content: string}> = [];
    const added: Array<{lineNumber: number; content: string}> = [];
    
    let contextStart = 1;
    let contextEnd = Math.max(beforeLines.length, afterLines.length);
    
    // Simple diff algorithm - find changed lines
    const maxLength = Math.max(beforeLines.length, afterLines.length);
    
    for (let i = 0; i < maxLength; i++) {
      const beforeLine = beforeLines[i] || '';
      const afterLine = afterLines[i] || '';
      
      if (beforeLine !== afterLine) {
        if (beforeLine && beforeLines[i] !== undefined) {
          removed.push({
            lineNumber: i + 1,
            content: beforeLine
          });
        }
        
        if (afterLine && afterLines[i] !== undefined) {
          added.push({
            lineNumber: i + 1,
            content: afterLine
          });
        }
        
        // Update context range
        if (removed.length === 1 && added.length <= 1) {
          contextStart = Math.max(1, i - 2);
        }
        
        contextEnd = Math.min(maxLength, i + 3);
      }
    }

    // If no changes found, but strings are different (whitespace, etc.)
    if (removed.length === 0 && added.length === 0 && beforeLines.join('\n') !== afterLines.join('\n')) {
      // Find first different line
      for (let i = 0; i < maxLength; i++) {
        const beforeLine = beforeLines[i] || '';
        const afterLine = afterLines[i] || '';
        
        if (beforeLine !== afterLine) {
          removed.push({ lineNumber: i + 1, content: beforeLine });
          added.push({ lineNumber: i + 1, content: afterLine });
          contextStart = Math.max(1, i - 1);
          contextEnd = Math.min(maxLength, i + 2);
          break;
        }
      }
    }

    return { removed, added, contextStart, contextEnd };
  }

  /**
   * Generate preview for batch operations
   */
  static generateBatchPreview(
    toolName: string,
    params: any,
    workingDirectory: string
  ): CodePreview | undefined {
    switch (toolName) {
      case 'write_file':
        return this.generateFileWritePreview(params.path, params.content, workingDirectory);
        
      case 'edit_file':
        return this.generateFileEditPreview(
          params.path,
          params.search,
          params.replace,
          workingDirectory,
          params.line_number
        );
        
      case 'multi_file_replace':
        if (params.files && params.files.length > 0) {
          const operations = params.files.map((file: string) => ({
            file,
            searchPattern: params.search,
            replacement: params.replace
          }));
          return this.generateMultiFilePreview(operations, workingDirectory);
        }
        break;
        
      case 'bash':
        return this.generateCommandPreview(params.command);
        
      case 'rename_symbol':
        if (params.files && params.files.length > 0) {
          const operations = params.files.map((file: string) => ({
            file,
            searchPattern: `\\b${params.old_name}\\b`,
            replacement: params.new_name
          }));
          return this.generateMultiFilePreview(operations, workingDirectory);
        }
        break;
    }
    
    return undefined;
  }
}