import * as readline from 'readline';
import kleur from 'kleur';
import { PermissionMode, PermissionModeManager } from './PermissionModes';

export interface ApprovalRequest {
  operation: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
  details?: string;
  command?: string;
  files?: string[];
  preview?: CodePreview;
  toolParams?: any; // Tool parameters for direct access
}

export interface CodePreview {
  type: 'file_change' | 'file_create' | 'command_output' | 'multi_file';
  changes?: FileChange[];
  newContent?: string;
  commandPreview?: string;
}

export interface FileChange {
  file: string;
  beforeContent?: string;
  afterContent?: string;
  changeType: 'create' | 'modify' | 'delete' | 'rename';
  previewLines?: {
    before: Array<{lineNumber: number; content: string}>;
    after: Array<{lineNumber: number; content: string}>;
    contextStart: number;
    contextEnd: number;
  };
}

export interface ApprovalResult {
  approved: boolean;
  reason?: string;
  newMode?: PermissionMode;
  approveForSession?: boolean;
}

export class ApprovalGate {
  private rl: readline.Interface;
  private permissionManager: PermissionModeManager;
  private ownedRL: boolean = false;

  // Commands that are considered risky and need approval
  private static RISKY_COMMANDS = new Set([
    'rm', 'del', 'delete', 'rmdir', 'rd',
    'mv', 'move', 'cp', 'copy', 'xcopy',
    'curl', 'wget', 'invoke-webrequest',
    'chmod', 'chown', 'attrib',
    'git reset --hard', 'git clean', 'git rebase',
    'npm install', 'npm uninstall', 'pip install',
    'docker run', 'docker exec',
    'sudo', 'su', 'runas'
  ]);

  // File patterns that are sensitive
  private static SENSITIVE_PATHS = [
    /^\/etc\//,
    /^\/usr\/bin\//,
    /^\/usr\/local\/bin\//,
    /^C:\\Windows\\/,
    /^C:\\Program Files/,
    /\.env$/,
    /\.key$/,
    /\.pem$/,
    /\.p12$/,
    /secrets/i,
    /password/i,
    /credentials/i
  ];

  constructor(permissionManager: PermissionModeManager, existingRL?: readline.Interface) {
    this.permissionManager = permissionManager;

    // Check if running in headless mode (CI/CD or non-interactive)
    const isHeadless = process.env.METIS_HEADLESS === 'true' ||
                       process.env.CI === 'true' ||
                       !process.stdin.isTTY;

    if (existingRL) {
      this.rl = existingRL;
      this.ownedRL = false;
    } else if (isHeadless) {
      // In headless mode, create a minimal readline interface that won't block
      // This prevents prompts from hanging the process
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false  // Don't treat as terminal in headless mode
      });
      this.ownedRL = true;
    } else {
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      this.ownedRL = true;
    }
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalResult> {
    const currentMode = this.permissionManager.getCurrentMode();
    const config = this.permissionManager.getCurrentConfig();

    // Handle different permission modes
    if (currentMode === PermissionMode.PLAN_ONLY) {
      // Planning mode: Allow all file operations but show what's being planned
      const planningApprovalBox = this.createBox([
        kleur.blue('Planning Mode - Operation Approved'),
        '',
        kleur.green('✅ Approved: Planning mode allows all operations'),
        kleur.gray('All operations are permitted in planning mode'),
        '',
        kleur.white(`Operation: ${request.description}`),
        kleur.gray(`Details: ${request.details || 'No additional details'}`)
      ], 'blue');
      
      console.log(planningApprovalBox);
      console.log();
      
      return { approved: true, reason: 'All operations allowed in planning mode' };
    }

      if (currentMode === PermissionMode.AUTO_ACCEPT) {
      const terminalWidth = process.stdout.columns || 120;
      const borderWidth = terminalWidth - 4;
      console.log('');
      console.log('+' + '='.repeat(borderWidth) + '+');
      console.log(`| ${kleur.green('⚡ AUTO-EXECUTING:')} ${request.operation}`.padEnd(borderWidth + 16) + '|');
      console.log('+' + '='.repeat(borderWidth) + '+');
      console.log('');
      return { approved: true };
    }

    // Normal mode - request approval
    return await this.showApprovalPrompt(request);
  }

  private showPlanOnly(request: ApprovalRequest): void {
    const terminalWidth = process.stdout.columns || 120;
    const borderWidth = terminalWidth - 4;
    
    console.log('');
    console.log('+' + '='.repeat(borderWidth) + '+');
    console.log(`| ${kleur.blue('PLAN MODE - Would Execute:')}`.padEnd(borderWidth + 18) + '|');
    console.log('+' + '='.repeat(borderWidth) + '+');
    console.log(`| Operation: ${request.operation}`.padEnd(borderWidth) + '|');
    console.log(`| Description: ${request.description}`.padEnd(borderWidth) + '|');
    if (request.command) {
      console.log(`| Command: ${request.command}`.padEnd(borderWidth) + '|');
    }
    if (request.files?.length) {
      console.log(`| Files: ${request.files.join(', ')}`.padEnd(borderWidth) + '|');
    }
    if (request.details) {
      console.log(`| Details: ${request.details}`.padEnd(borderWidth) + '|');
    }
    console.log('+' + '-'.repeat(borderWidth) + '+');
    console.log(`| ${kleur.gray('Use "auto" to execute operations or "normal" to approve individually')}`.padEnd(borderWidth + 9) + '|');
    console.log('+' + '='.repeat(borderWidth) + '+');
    console.log('');
  }

  private async showApprovalPrompt(request: ApprovalRequest): Promise<ApprovalResult> {
    // Clean inline approval like Claude Code
    console.log();
    console.log(kleur.yellow('Approval required'));
    console.log(kleur.gray(`Operation: ${request.operation}`));
    if (request.description !== request.operation) {
      console.log(kleur.gray(`Description: ${request.description}`));
    }

    if (request.command) {
      console.log(kleur.gray(`Command: ${request.command}`));
    }

    if (request.files?.length) {
      console.log(kleur.gray(`Files: ${request.files.join(', ')}`));
    }

    // Show simple code preview if available
    if (request.preview) {
      try {
        this.showSimplePreview(request.preview);
      } catch (error) {
        // Don't let preview errors break the approval flow
        console.log(kleur.gray('\nPreview unavailable:'), error.message);
      }
    } else {
      // Debug: Show when no preview is available
      if (process.env.METIS_TRACE === 'true') {
        console.log(kleur.gray('\nNo preview available for this operation'));
      }
    }

    // Interactive menu selection
    return this.showInteractiveMenu(request);
  }

  private async showInteractiveMenu(request: ApprovalRequest): Promise<ApprovalResult> {
    const options = [
      { label: 'Yes', value: 'yes', description: 'Approve this operation' },
      { label: 'Yes for the rest of the session', value: 'session', description: 'Approve similar operations' },
      { label: 'No', value: 'no', description: 'Deny this operation' },
      { label: 'Tell MetisCode something different', value: 'tell', description: 'Provide different instructions' }
    ];

    let selectedIndex = 0;

    // Hide cursor and enable raw mode for arrow key input
    process.stdout.write('\x1B[?25l'); // Hide cursor

    const displayMenu = () => {
      // Clear previous menu lines
      process.stdout.write('\x1B[2K\x1B[G'); // Clear current line
      for (let i = 0; i < options.length; i++) {
        process.stdout.write('\x1B[1A\x1B[2K'); // Move up and clear
      }

      // Display the menu
      console.log(kleur.gray('\nSelect an option (use arrow keys, press Enter to confirm):'));
      options.forEach((option, index) => {
        const isSelected = index === selectedIndex;
        const prefix = isSelected ? kleur.cyan('▸ ') : '  ';
        const text = isSelected ? kleur.cyan(option.label) : kleur.gray(option.label);
        console.log(prefix + text);
      });
    };

    displayMenu();

    return new Promise((resolve) => {
      // Enable keypress mode
      if (this.rl.input.isTTY) {
        this.rl.input.setRawMode(true);
      }
      this.rl.input.resume();

      const handleKeypress = (chunk: Buffer) => {
        const key = chunk.toString();

        if (key === '\x1B[A' || key === '\x1B[D') {
          // Up arrow or left arrow
          selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : options.length - 1;
          displayMenu();
        } else if (key === '\x1B[B' || key === '\x1B[C') {
          // Down arrow or right arrow
          selectedIndex = (selectedIndex + 1) % options.length;
          displayMenu();
        } else if (key === '\r' || key === '\n') {
          // Enter key - confirm selection
          cleanup();
          const selected = options[selectedIndex];

          switch (selected.value) {
            case 'yes':
              resolve({ approved: true });
              break;
            case 'session':
              resolve({ approved: true, approveForSession: true });
              break;
            case 'no':
              resolve({ approved: false, reason: 'User denied approval' });
              break;
            case 'tell':
              console.log(kleur.yellow('\nPlease provide your instructions to MetisCode:'));
              resolve({ approved: false, reason: 'User wants to provide different instructions' });
              break;
          }
        } else if (key === '\x03' || key === '\x1B') {
          // Ctrl+C or ESC - cancel
          cleanup();
          resolve({ approved: false, reason: 'User cancelled' });
        } else if (key >= '1' && key <= '4') {
          // Number keys for quick selection
          selectedIndex = parseInt(key) - 1;
          displayMenu();
          // Auto-confirm on number press
          setTimeout(() => {
            cleanup();
            const selected = options[selectedIndex];
            switch (selected.value) {
              case 'yes':
                resolve({ approved: true });
                break;
              case 'session':
                resolve({ approved: true, approveForSession: true });
                break;
              case 'no':
                resolve({ approved: false, reason: 'User denied approval' });
                break;
              case 'tell':
                console.log(kleur.yellow('\nPlease provide your instructions to MetisCode:'));
                resolve({ approved: false, reason: 'User wants to provide different instructions' });
                break;
            }
          }, 100);
        }
      };

      const cleanup = () => {
        // Restore terminal state
        process.stdout.write('\x1B[?25h'); // Show cursor
        if (this.rl.input.isTTY) {
          this.rl.input.setRawMode(false);
        }
        this.rl.input.off('data', handleKeypress);
        // Don't call resume() here - let the caller handle input state
      };

      // Listen for keypress events
      this.rl.input.on('data', handleKeypress);
    });
  }

  // Analyze operation to determine risk level
  static analyzeRisk(request: Partial<ApprovalRequest>): 'low' | 'medium' | 'high' {
    let risk: 'low' | 'medium' | 'high' = 'low';

    // Check command risk
    if (request.command) {
      const commandLower = request.command.toLowerCase();
      for (const riskyCmd of ApprovalGate.RISKY_COMMANDS) {
        if (commandLower.includes(riskyCmd)) {
          risk = 'high';
          break;
        }
      }
    }

    // Check file path risk
    if (request.files) {
      for (const file of request.files) {
        for (const sensitivePattern of ApprovalGate.SENSITIVE_PATHS) {
          if (sensitivePattern.test(file)) {
            risk = 'high';
            break;
          }
        }
        if (risk === 'high') break;
      }
    }

    // Check operation type
    if (request.operation) {
      const opLower = request.operation.toLowerCase();
      if (opLower.includes('delete') || opLower.includes('remove') || opLower.includes('destroy')) {
        risk = Math.max(risk === 'low' ? 'medium' : risk, 'medium') as 'medium' | 'high';
      }
    }

    return risk;
  }

  private createBox(lines: string[], borderColor: 'red' | 'blue' | 'green' | 'yellow' | 'gray' = 'gray'): string {
    const width = Math.max(...lines.map(line => this.stripAnsi(line).length)) + 4;
    const colorFn = borderColor === 'red' ? kleur.red : 
                   borderColor === 'blue' ? kleur.blue :
                   borderColor === 'green' ? kleur.green :
                   borderColor === 'yellow' ? kleur.yellow : kleur.gray;
    
    // Use simple ASCII characters instead of Unicode box drawing
    const topBorder = colorFn('+' + '-'.repeat(width - 2) + '+');
    const bottomBorder = colorFn('+' + '-'.repeat(width - 2) + '+');
    
    const boxedLines = lines.map(line => {
      const padding = width - this.stripAnsi(line).length - 3;
      return colorFn('| ') + line + ' '.repeat(padding) + colorFn('|');
    });
    
    return [topBorder, ...boxedLines, bottomBorder].join('\n');
  }

  private showSimplePreview(preview: CodePreview): void {
    // Clean preview like Claude Code - safely handle null/undefined
    if (!preview) return;

    console.log(); // Add spacing

    switch (preview.type) {
      case 'file_change':
        if (preview.changes && preview.changes.length > 0 && preview.changes[0]) {
          const change = preview.changes[0];
          console.log(kleur.gray(`File: ${change.file}`));
          console.log(kleur.gray('Changes:'));

          // Show diff preview with proper colors
          if (change.changeType === 'create') {
            // For new files, show all content as additions
            const lines = (change.afterContent || '').split('\n').slice(0, 25);
            lines.forEach((line, index) => {
              const lineNum = (index + 1).toString().padStart(3, ' ');
              console.log(kleur.green(`${lineNum}│ + ${line}`));
            });
            if (change.afterContent && change.afterContent.split('\n').length > 25) {
              console.log(kleur.gray(`  ...and ${change.afterContent.split('\n').length - 25} more lines`));
            }
          } else if (change.afterContent && change.beforeContent) {
            // For modifications, show deletions and additions
            const beforeLines = change.beforeContent.split('\n').slice(0, 15);
            const afterLines = change.afterContent.split('\n').slice(0, 15);

            // Show what's being removed
            if (beforeLines.length > 0 && beforeLines.some(l => l.trim())) {
              beforeLines.forEach((line, index) => {
                const lineNum = (index + 1).toString().padStart(3, ' ');
                console.log(kleur.red(`${lineNum}│ - ${line}`));
              });
            }

            // Show what's being added
            if (afterLines.length > 0 && afterLines.some(l => l.trim())) {
              afterLines.forEach((line, index) => {
                const lineNum = (index + 1).toString().padStart(3, ' ');
                console.log(kleur.green(`${lineNum}│ + ${line}`));
              });
            }
          }
        }
        break;

      case 'file_create':
        if (preview.newContent) {
          const lines = preview.newContent.split('\n');
          const previewLines = lines.slice(0, 25); // Show more lines for new files
          console.log(kleur.gray('New file content:'));
          previewLines.forEach((line, index) => {
            const lineNum = (index + 1).toString().padStart(3, ' ');
            console.log(kleur.green(`${lineNum}│ + ${line}`));
          });
          if (lines.length > 25) {
            console.log(kleur.gray(`  ...and ${lines.length - 25} more lines`));
          }
        }
        break;

      default:
        console.log(kleur.gray(`Preview type: ${preview.type}`));
    }
  }

  private showCodePreview(preview: CodePreview): void {
    console.log('\n' + kleur.blue('👀 Code Preview:'));
    
    switch (preview.type) {
      case 'file_change':
        this.showFileChangePreview(preview.changes || []);
        break;
      case 'file_create':
        this.showFileCreatePreview(preview.newContent || '');
        break;
      case 'command_output':
        this.showCommandPreview(preview.commandPreview || '');
        break;
      case 'multi_file':
        this.showMultiFilePreview(preview.changes || []);
        break;
    }
  }

  private showDetailedCodePreview(preview: CodePreview): void {
    switch (preview.type) {
      case 'file_change':
        this.showDetailedFileChanges(preview.changes || []);
        break;
      case 'file_create':
        this.showDetailedFileCreate(preview.newContent || '');
        break;
      case 'command_output':
        this.showDetailedCommandPreview(preview.commandPreview || '');
        break;
      case 'multi_file':
        this.showDetailedMultiFilePreview(preview.changes || []);
        break;
    }
  }

  private showFileChangePreview(changes: FileChange[]): void {
    if (changes.length === 0) return;
    
    const change = changes[0]; // Show first change in summary
    console.log(kleur.cyan(`📝 ${change.file} (${change.changeType})`));
    
    if (change.previewLines) {
      const { before, after, contextStart, contextEnd } = change.previewLines;
      
      console.log(kleur.gray(`Lines ${contextStart}-${contextEnd}:`));
      
      const maxLines = 5;
      const beforeLines = before.slice(0, maxLines);
      const afterLines = after.slice(0, maxLines);
      
      beforeLines.forEach(line => {
        console.log(kleur.red(`- ${line.lineNumber}: ${line.content}`));
      });
      
      afterLines.forEach(line => {
        console.log(kleur.green(`+ ${line.lineNumber}: ${line.content}`));
      });
      
      if (before.length > maxLines || after.length > maxLines) {
        console.log(kleur.gray(`... and ${Math.max(before.length, after.length) - maxLines} more lines (use 'v' to view all)`));
      }
    }
  }

  private showFileCreatePreview(content: string): void {
    const lines = content.split('\n');
    const previewLines = lines.slice(0, 10);
    
    console.log(kleur.green('📄 New file content:'));
    previewLines.forEach((line, index) => {
      console.log(kleur.green(`+ ${index + 1}: ${line}`));
    });
    
    if (lines.length > 10) {
      console.log(kleur.gray(`... and ${lines.length - 10} more lines`));
    }
  }

  private showCommandPreview(command: string): void {
    console.log(kleur.yellow('💻 Command to execute:'));
    console.log(kleur.yellow(`$ ${command}`));
  }

  private showMultiFilePreview(changes: FileChange[]): void {
    console.log(kleur.cyan(`📁 ${changes.length} files will be modified:`));
    
    const preview = changes.slice(0, 3);
    preview.forEach(change => {
      console.log(kleur.cyan(`  • ${change.file} (${change.changeType})`));
    });
    
    if (changes.length > 3) {
      console.log(kleur.gray(`  ... and ${changes.length - 3} more files`));
    }
  }

  private showDetailedFileChanges(changes: FileChange[]): void {
    changes.forEach((change, index) => {
      console.log(kleur.cyan(`\n📝 File ${index + 1}: ${change.file} (${change.changeType})`));
      
      if (change.previewLines) {
        const { before, after, contextStart, contextEnd } = change.previewLines;
        
        console.log(kleur.gray(`Lines ${contextStart}-${contextEnd}:`));
        
        // Show unified diff style
        const maxBefore = Math.max(...before.map(l => l.lineNumber));
        const maxAfter = Math.max(...after.map(l => l.lineNumber));
        const lineWidth = Math.max(maxBefore, maxAfter).toString().length;
        
        before.forEach(line => {
          const paddedNum = line.lineNumber.toString().padStart(lineWidth);
          console.log(kleur.red(`- ${paddedNum}: ${line.content}`));
        });
        
        after.forEach(line => {
          const paddedNum = line.lineNumber.toString().padStart(lineWidth);
          console.log(kleur.green(`+ ${paddedNum}: ${line.content}`));
        });
      } else if (change.beforeContent && change.afterContent) {
        // Simple before/after
        console.log(kleur.red('Before:'));
        console.log(change.beforeContent.split('\n').slice(0, 20).map((line, i) => 
          kleur.red(`- ${i + 1}: ${line}`)
        ).join('\n'));
        
        console.log(kleur.green('\nAfter:'));
        console.log(change.afterContent.split('\n').slice(0, 20).map((line, i) => 
          kleur.green(`+ ${i + 1}: ${line}`)
        ).join('\n'));
      }
    });
  }

  private showDetailedFileCreate(content: string): void {
    const lines = content.split('\n');
    
    console.log(kleur.green('\n📄 Complete file content:'));
    console.log(kleur.gray('-'.repeat(60)));
    
    lines.forEach((line, index) => {
      const lineNum = (index + 1).toString().padStart(3);
      console.log(kleur.green(`${lineNum}: ${line}`));
    });
    
    console.log(kleur.gray('-'.repeat(60)));
    console.log(kleur.green(`Total: ${lines.length} lines`));
  }

  private showDetailedCommandPreview(command: string): void {
    console.log(kleur.yellow('\n💻 Command details:'));
    console.log(kleur.gray('-'.repeat(60)));
    console.log(kleur.yellow(`Command: ${command}`));
    console.log(kleur.gray(`Working directory: ${process.cwd()}`));
    console.log(kleur.gray(`User: ${process.env.USER || process.env.USERNAME || 'unknown'}`));
    console.log(kleur.gray('-'.repeat(60)));
  }

  private showDetailedMultiFilePreview(changes: FileChange[]): void {
    console.log(kleur.cyan(`\n📁 All ${changes.length} file changes:`));
    
    changes.forEach((change, index) => {
      console.log(kleur.cyan(`\n${index + 1}. ${change.file} (${change.changeType})`));
      
      if (change.previewLines) {
        const { before, after } = change.previewLines;
        const changeCount = Math.max(before.length, after.length);
        console.log(kleur.gray(`   ${changeCount} lines modified`));
        
        // Show first few changes
        const preview = Math.min(3, changeCount);
        before.slice(0, preview).forEach(line => {
          console.log(kleur.red(`   - ${line.lineNumber}: ${line.content.substring(0, 60)}...`));
        });
        after.slice(0, preview).forEach(line => {
          console.log(kleur.green(`   + ${line.lineNumber}: ${line.content.substring(0, 60)}...`));
        });
        
        if (changeCount > preview) {
          console.log(kleur.gray(`   ... ${changeCount - preview} more changes`));
        }
      }
    });
  }

  private addCodePreviewToLines(preview: CodePreview, lines: string[]): void {
    const terminalWidth = process.stdout.columns || 120;
    const borderWidth = terminalWidth - 4;
    
    switch (preview.type) {
      case 'file_change':
        if (preview.changes && preview.changes.length > 0) {
          const change = preview.changes[0];
          lines.push('');
          lines.push('+' + '='.repeat(borderWidth) + '+');
          lines.push(`| ${kleur.cyan(change.file)} ${kleur.magenta('(' + change.changeType + ')')}`.padEnd(borderWidth + 18) + '|');
          lines.push('+' + '='.repeat(borderWidth) + '+');
          if (change.previewLines) {
            const { before, after } = change.previewLines;
            
            // Show removed lines with better formatting
            if (before.length > 0) {
              lines.push(`| ${kleur.red('REMOVED:')}`.padEnd(borderWidth + 12) + '|');
              before.slice(0, 3).forEach(line => {
                const lineNum = kleur.gray(`${line.lineNumber}`.padStart(4) + ':');
                const content = line.content.substring(0, borderWidth - 15);
                const displayLine = `| ${lineNum} ${kleur.red('- ' + content)}`;
                const padding = Math.max(0, borderWidth - this.stripAnsi(displayLine).length + 21);
                lines.push(displayLine + ' '.repeat(padding) + '|');
              });
            }
            
            // Show added lines with better formatting  
            if (after.length > 0) {
              lines.push(`| ${kleur.green('ADDED:')}`.padEnd(borderWidth + 12) + '|');
              after.slice(0, 3).forEach(line => {
                const lineNum = kleur.gray(`${line.lineNumber}`.padStart(4) + ':');
                const content = line.content.substring(0, borderWidth - 15);
                const displayLine = `| ${lineNum} ${kleur.green('+ ' + content)}`;
                const padding = Math.max(0, borderWidth - this.stripAnsi(displayLine).length + 22);
                lines.push(displayLine + ' '.repeat(padding) + '|');
              });
            }
            
            if (before.length > 3 || after.length > 3) {
              lines.push(`| ${kleur.yellow('Use "view" for complete preview')}`.padEnd(borderWidth + 14) + '|');
            }
          }
          lines.push('+' + '='.repeat(borderWidth) + '+');
        }
        break;
      case 'file_create':
        lines.push('');
        lines.push('+' + '='.repeat(borderWidth) + '+');
        lines.push(`| ${kleur.green('NEW FILE CONTENT:')}`.padEnd(borderWidth + 16) + '|');
        lines.push('+' + '='.repeat(borderWidth) + '+');
        if (preview.newContent) {
          const contentLines = preview.newContent.split('\n');
          contentLines.slice(0, 5).forEach((line, i) => {
            const lineNum = kleur.gray(`${i + 1}`.padStart(4) + ':');
            const content = line.substring(0, borderWidth - 15);
            const displayLine = `| ${lineNum} ${kleur.green('+ ' + content)}`;
            const padding = Math.max(0, borderWidth - this.stripAnsi(displayLine).length + 22);
            lines.push(displayLine + ' '.repeat(padding) + '|');
          });
          if (contentLines.length > 5) {
            lines.push(`| ${kleur.yellow('Use "view" for complete preview')}`.padEnd(borderWidth + 14) + '|');
          }
        }
        lines.push('+' + '='.repeat(borderWidth) + '+');
        break;
      case 'command_output':
        lines.push('');
        lines.push('+' + '-'.repeat(borderWidth) + '+');
        lines.push(`| Command: ${preview.commandPreview || ''}`.padEnd(borderWidth) + '|');
        lines.push('+' + '-'.repeat(borderWidth) + '+');
        break;
      case 'multi_file':
        if (preview.changes) {
          lines.push('');
          lines.push('+' + '-'.repeat(borderWidth) + '+');
          lines.push(`| ${preview.changes.length} files will be modified`.padEnd(borderWidth) + '|');
          lines.push('+' + '-'.repeat(borderWidth) + '+');
          preview.changes.slice(0, 3).forEach(change => {
            lines.push(`|   ${change.file} (${change.changeType})`.padEnd(borderWidth) + '|');
          });
          if (preview.changes.length > 3) {
            lines.push(`| ... (use "view" for complete preview)`.padEnd(borderWidth) + '|');
          }
          lines.push('+' + '-'.repeat(borderWidth) + '+');
        }
        break;
    }
  }

  private stripAnsi(str: string): string {
    return str.replace(/\u001b\[[0-9;]*m/g, '');
  }

  close(): void {
    if (this.ownedRL) {
      this.rl.close();
    }
  }
}