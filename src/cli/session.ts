import * as readline from 'readline';
import kleur from "kleur";
import fs from "fs";
import path from "path";
import os from "os";
import { runAgent } from "./commands/run";
import { runInit } from "./commands/init";
import { runStatus } from "./commands/status";
import { runConfig } from "./commands/config";
import { runAuth } from "./commands/auth";
import { runPersona } from "./commands/persona";
import { runAgentCommands } from "./commands/agentCommands";
import { runMcpConfig } from "./commands/mcpConfig";
import { runTools } from "./commands/tools";
import { runModels } from "./commands/models";
import { ResponseFormatter } from "./responseFormatter";
import { getSessionMemory } from "../runtime/sessionMemory";
import { getSessionPersistence } from "../runtime/sessionPersistence";
import { createMemoryManager } from "../runtime/memoryManager";
import { ToolCallingAgent } from "../agent/toolCallAgent";
import { createAgentMdIfNotExists } from "../utils/agentMdGenerator";
import { getProcessManager } from "../runtime/processManager";
import { getHookManager } from "../hooks/HookManager";

// Thinking terms for flavor (like Claude Code)
const THINKING_TERMS = [
  'Thinking',
  'Analyzing', 
  'Processing',
  'Contemplating',
  'Examining',
  'Exploring',
  'Understanding',
  'Evaluating',
  'Considering',
  'Pondering',
  'Reasoning',
  'Reflecting'
];

export class InteractiveSession {
  private rl: readline.Interface;
  private isSessionActive = true;
  private thinkingInterval?: NodeJS.Timeout;
  private currentThinkingIndex = 0;
  private sessionId: string;
  private agent: ToolCallingAgent;
  private sessionMemory = getSessionMemory();
  private sessionPersistence = getSessionPersistence();

  // Multi-line input support for seamless pasting
  private multiLineBuffer: string[] = [];
  private lastInputTime = 0;
  private multiLineTimeout?: NodeJS.Timeout;

  // Enhanced completion state
  private completionShown = false;

  constructor() {
    this.sessionId = `interactive-${Date.now()}`;

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.createPrompt(),
      completer: this.completeSlashCommands.bind(this),
      terminal: true
    });

    // Add real-time slash command auto-completion like Claude Code
    this.setupRealTimeAutoCompletion();

    this.agent = new ToolCallingAgent(this.sessionId, this.rl);
    this.sessionPersistence.setReadlineInterface(this.rl);
  }

  private createPrompt(): string {
    // Simple, clean prompt like Claude Code
    return kleur.gray('> ');
  }

  private setupRealTimeAutoCompletion() {
    // Simple tab completion for slash commands like Claude Code
    console.log(kleur.gray('💡 Type slash commands and press Tab for completion'));
    console.log(kleur.gray('    Example: /h<Tab> → /help, /c<Tab> → shows /clear, /config, etc.'));
    console.log();
  }

  private completeSlashCommands(line: string): [string[], string] {
    // List of available slash commands
    const slashCommands = [
      '/agents', '/approvals', '/auth', '/bashes', '/clear', '/compact', '/config', '/continue',
      '/execute', '/exit', '/git', '/github', '/help', '/hooks', '/init', '/memory', '/mcp',
      '/mode', '/models', '/permissions', '/persona', '/plan', '/reload', '/resume',
      '/sessions', '/status', '/tools'
    ];

    // Only provide completions for slash commands
    if (line.startsWith('/')) {
      // Filter commands that start with the typed text
      const matches = slashCommands.filter(cmd => cmd.startsWith(line));

      // If there's exactly one match, complete it
      if (matches.length === 1) {
        // Return the complete match to auto-complete
        return [matches, matches[0]];
      }

      // If there are multiple matches, show them and return the matches
      if (matches.length > 1) {
        console.log('\n' + kleur.cyan('Available completions:'));
        matches.forEach(cmd => {
          const desc = this.getCommandDescription(cmd);
          console.log(`  ${kleur.yellow(cmd)} ${kleur.gray('- ' + desc)}`);
        });
        console.log();

        // Find common prefix for partial completion
        const commonPrefix = this.findCommonPrefix(matches);
        if (commonPrefix.length > line.length) {
          return [matches, commonPrefix];
        }
      }

      return [matches, line];
    }

    // For non-slash commands, don't provide completions
    return [[], line];
  }

  private findCommonPrefix(strings: string[]): string {
    if (strings.length === 0) return '';
    if (strings.length === 1) return strings[0];

    let prefix = strings[0];
    for (let i = 1; i < strings.length; i++) {
      while (strings[i].indexOf(prefix) !== 0) {
        prefix = prefix.substring(0, prefix.length - 1);
        if (prefix === '') return '';
      }
    }
    return prefix;
  }


  private getCommandDescription(cmd: string): string {
    const descriptions: Record<string, string> = {
      '/persona': 'Interactive persona management',
      '/config': 'Interactive configuration',
      '/auth': 'Interactive API key management',
      '/agents': 'Interactive agent operations',
      '/mcp': 'Interactive MCP server management',
      '/tools': 'Interactive tool discovery',
      '/models': 'Interactive model browsing',
      '/init': 'Initialize project',
      '/plan': 'Enter planning mode',
      '/execute': 'Exit planning mode',
      '/status': 'Show system status',
      '/help': 'Show all commands',
      '/exit': 'Exit session',
      '/mode': 'Cycle permission modes',
      '/permissions': 'Show permission info',
      '/clear': 'Clear conversation',
      '/compact': 'Compact session context',
      '/resume': 'Resume previous session',
      '/continue': 'Continue last session',
      '/sessions': 'List recent sessions',
      '/approvals': 'Show approval status',
      '/memory': 'View memory status',
      '/reload': 'Refresh Agent.md files',
      '/git': 'Git operations',
      '/github': 'GitHub operations',
      '/bashes': 'List background processes',
      '/hooks': 'Manage hooks system'
    };
    return descriptions[cmd] || 'Command';
  }


  private async showSlashCommandMenu() {
    console.log(kleur.cyan('\n📋 Available slash commands:'));
    console.log();

    const { DropdownHelpers } = await import('./dropdowns/DropdownHelpers');

    const commands = [
      { item: '/persona', icon: '🎭', name: 'Persona Management', description: 'Interactive persona management' },
      { item: '/config', icon: '⚙️', name: 'Configuration', description: 'Interactive configuration' },
      { item: '/auth', icon: '🔑', name: 'API Keys', description: 'Interactive API key management' },
      { item: '/agents', icon: '🤖', name: 'Agent Operations', description: 'Interactive agent operations' },
      { item: '/mcp', icon: '🔌', name: 'MCP Servers', description: 'Interactive MCP server management' },
      { item: '/tools', icon: '🛠️', name: 'Tools', description: 'Interactive tool discovery' },
      { item: '/models', icon: '🧠', name: 'Models', description: 'Interactive model browsing' },
      { item: '/help', icon: '❓', name: 'Help', description: 'Show all commands' },
      { item: '/status', icon: '📊', name: 'Status', description: 'Show system status' },
      { item: '/exit', icon: '🚪', name: 'Exit', description: 'Exit session' }
    ];

    try {
      const selectedCommand = await DropdownHelpers.selectOne({
        message: 'Which command would you like to run?',
        choices: DropdownHelpers.createIconChoices(commands)
      });

      if (selectedCommand) {
        console.log(kleur.gray(`Running: ${selectedCommand}`));
        console.log();
        await this.handleSlashCommand(selectedCommand);
      }
    } catch (error) {
      // User cancelled, just continue
      console.log(kleur.gray('Command selection cancelled.'));
    }

    if (this.isSessionActive) {
      console.log();
      this.prompt();
    }
  }

  private async ensureAgentMd(): Promise<void> {
    try {
      const result = await createAgentMdIfNotExists(process.cwd());
      if (result.created) {
        // Add a small pause to let the user see the message
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log();
      }
    } catch (error) {
      // Don't block session start if Agent.md creation fails
      console.log(kleur.yellow('Note: Could not create Agent.md file'));
    }
  }

  private showInputContainer() {
    // No containers - keep it clean
    return;
  }

  async start() {
    // Set interactive mode flag to prevent process.exit() calls
    process.env.METIS_INTERACTIVE = 'true';

    try {
      // Auto-create Agent.md if it doesn't exist (like Claude Code does with CLAUDE.md)
      await this.ensureAgentMd();
    } catch (error) {
      // Don't block session start if Agent.md creation fails
      if (process.env.METIS_VERBOSE === 'true') {
        console.log(kleur.yellow('Note: Could not create Agent.md file'));
      }
    }

    try {
      // Initialize session with enhanced persistence and recovery
      const initialization = await this.sessionPersistence.initializeSession(this.sessionId, {
        restorePermissions: true,
        resumeLastTask: true,
        showRecoveryPrompt: false  // Temporarily disable to test
      });

      const session = initialization.session;

      // Show recovery info if session was recovered
      if (initialization.wasRecovered) {
        console.log(kleur.gray("Session recovered"));
        console.log();
      }

      this.showWelcome(session);
      this.setupEventHandlers();
      this.prompt();

    } catch (error: any) {
      // Fallback - continue with basic session
      if (process.env.METIS_VERBOSE === 'true') {
        console.log(kleur.yellow(`Session initialization warning: ${error?.message || 'Unknown error'}`));
      }
      this.showWelcome();
      this.setupEventHandlers();
      this.prompt();
    }

    // Keep the session running
    return new Promise<void>((resolve) => {
      this.rl.on('close', () => {
        console.log(kleur.gray('\nGoodbye'));

        // Clean up permission system
        try {
          this.agent.cleanup();
        } catch (e) {
          // Ignore cleanup errors
        }

        // Mark clean session exit
        try {
          this.sessionPersistence.markCleanExit();
        } catch (e) {
          // Ignore
        }

        // Clean up old sessions on exit
        try {
          this.sessionMemory.cleanupOldSessions();
        } catch (e) {
          // Ignore
        }

        resolve();
      });
    });
  }

  private showWelcome(session?: any) {
    console.log(kleur.cyan(`
███╗   ███╗███████╗████████╗██╗███████╗     ██████╗ ██████╗ ██████╗ ███████╗
████╗ ████║██╔════╝╚══██╔══╝██║██╔════╝    ██╔════╝██╔═══██╗██╔══██╗██╔════╝
██╔████╔██║█████╗     ██║   ██║███████╗    ██║     ██║   ██║██║  ██║█████╗  
██║╚██╔╝██║██╔══╝     ██║   ██║╚════██║    ██║     ██║   ██║██║  ██║██╔══╝  
██║ ╚═╝ ██║███████╗   ██║   ██║███████║    ╚██████╗╚██████╔╝██████╔╝███████╗
╚═╝     ╚═╝╚══════╝   ╚═╝   ╚═╝╚══════╝     ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝
`));

    const pkg = require("../../package.json");
    console.log(kleur.gray(`                    AI Coding Agent v${pkg.version}`));
    console.log();
    
    // Simple help text without boxes
    console.log(kleur.gray("Type your coding requests in natural language."));
    console.log(kleur.gray("Use /help for available commands."));
    console.log();
    
    // Show session context if available (clean, no boxes)
    if (session && session.currentTask) {
      console.log(kleur.gray(`Resuming: ${session.currentTask}`));
      console.log();
    }
    
    // Check if project is configured
    const hasConfig = this.checkConfiguration();
    if (!hasConfig) {
      console.log(kleur.gray("Project not configured. Run /init to get started."));
      console.log();
    }
  }

  private checkConfiguration(): boolean {
    // Check if we have API keys available from any source
    const hasEnvKeys = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY;
    if (hasEnvKeys) return true;

    // Check global config
    const globalSecretsPath = path.join(os.homedir(), '.metis', 'secrets.json');
    if (fs.existsSync(globalSecretsPath)) {
      try {
        const secrets = JSON.parse(fs.readFileSync(globalSecretsPath, 'utf8'));
        if (Object.keys(secrets).length > 0) return true;
      } catch {}
    }

    // Check local config (legacy)
    const cwd = process.cwd();
    const localSecretsPath = path.join(cwd, ".metis", "secrets.json");
    if (fs.existsSync(localSecretsPath)) {
      try {
        const secrets = JSON.parse(fs.readFileSync(localSecretsPath, 'utf8'));
        if (Object.keys(secrets).length > 0) return true;
      } catch {}
    }

    return false;
  }

  private setupEventHandlers() {
    this.rl.on('line', async (input) => {
      const currentTime = Date.now();
      const timeSinceLastInput = currentTime - this.lastInputTime;

      // Detect rapid input (likely paste operation)
      const isPasteLikeInput = timeSinceLastInput < 50; // Less than 50ms between inputs

      this.lastInputTime = currentTime;

      // Handle empty input
      if (!input.trim() && this.multiLineBuffer.length === 0) {
        this.prompt();
        return;
      }

      // Special case: if user just typed '/', show interactive command menu
      if (input.trim() === '/') {
        await this.showSlashCommandMenu();
        return;
      }

      // If we detect rapid input or we already have buffered content, add to buffer
      if (isPasteLikeInput || this.multiLineBuffer.length > 0) {
        this.addToMultiLineBuffer(input);
        return;
      }

      // Single line input - process immediately
      try {
        await this.handleInput(input.trim());
      } catch (error: any) {
        this.formatError(`Error: ${error.message}`);
      }

      if (this.isSessionActive) {
        console.log();
        this.prompt();
      }
    });

    this.rl.on('SIGINT', () => {
      this.stopThinking();

      if (this.multiLineBuffer.length > 0) {
        console.log(kleur.yellow('\nMulti-line input cancelled'));
        this.clearMultiLineBuffer();
      } else {
        console.log(kleur.gray('\nUse /exit to quit or Ctrl+C again to force exit'));
      }

      this.prompt();
    });
  }

  private prompt() {
    this.rl.setPrompt(this.createPrompt());
    this.rl.prompt();
  }

  private async handleInput(input: string) {
    // Handle slash commands
    if (input.startsWith('/')) {
      await this.handleSlashCommand(input);
      return;
    }

    // Handle natural language requests
    await this.handleNaturalLanguage(input);
  }

  // Seamless multi-line input handling for paste operations
  private addToMultiLineBuffer(input: string): void {
    this.multiLineBuffer.push(input);

    // Clear any existing timeout
    if (this.multiLineTimeout) {
      clearTimeout(this.multiLineTimeout);
    }

    // Show immediate feedback on first line
    if (this.multiLineBuffer.length === 1) {
      console.log(kleur.cyan('📋 Multi-line input detected, collecting lines...'));
    }

    // Set timeout to process buffer after a pause in input
    this.multiLineTimeout = setTimeout(async () => {
      await this.processMultiLineBuffer();
    }, 200); // Wait 200ms after last input

    this.prompt();
  }

  private async processMultiLineBuffer(): Promise<void> {
    if (this.multiLineBuffer.length === 0) return;

    const combinedInput = this.multiLineBuffer.join('\n').trim();
    const lineCount = this.multiLineBuffer.length;

    // Clear buffer first
    this.clearMultiLineBuffer();

    // Show what we received
    console.log(kleur.green(`✅ Processing ${lineCount} lines of input:`));
    console.log(kleur.gray('─'.repeat(50)));

    // Show preview (first 3 lines and last line if more than 4 lines)
    const lines = combinedInput.split('\n');
    if (lines.length <= 4) {
      console.log(combinedInput);
    } else {
      console.log(lines.slice(0, 3).join('\n'));
      console.log(kleur.gray(`... (${lines.length - 4} more lines) ...`));
      console.log(lines[lines.length - 1]);
    }

    console.log(kleur.gray('─'.repeat(50)));
    console.log();

    try {
      await this.handleInput(combinedInput);
    } catch (error: any) {
      this.formatError(`Error: ${error.message}`);
    }

    if (this.isSessionActive) {
      console.log();
      this.prompt();
    }
  }

  private clearMultiLineBuffer(): void {
    this.multiLineBuffer = [];
    if (this.multiLineTimeout) {
      clearTimeout(this.multiLineTimeout);
      this.multiLineTimeout = undefined;
    }
  }

  private async handleSlashCommand(command: string) {
    const [cmd, ...args] = command.slice(1).split(' ');
    
    switch (cmd.toLowerCase()) {
      case 'init':
        console.log(kleur.gray('Initializing project...'));
        await runInit(['--agent-md']);
        break;

      case 'plan':
        await this.enterPlanningMode();
        break;
        
      case 'execute':
      case 'exec':
        await this.exitPlanningMode();
        break;
        
      case 'status':
        await runStatus([], this.agent);
        break;
        
      case 'config':
        // Always trigger interactive mode for config - it's more user friendly
        await runConfig([]);
        break;

      case 'persona':
        // Always trigger interactive mode for persona - it's more user friendly
        await runPersona([]);
        break;

      case 'auth':
        // Trigger interactive mode for auth
        await runAuth([]);
        break;

      case 'agents':
        // Trigger interactive mode for agents
        await runAgentCommands([]);
        break;

      case 'mcp':
        // Trigger interactive mode for MCP
        await runMcpConfig([]);
        break;

      case 'tools':
        // Trigger interactive mode for tools
        await runTools([]);
        break;

      case 'models':
        // Trigger interactive mode for models
        await runModels([]);
        break;

      case 'help':
        this.showHelp();
        break;
        
      case 'exit':
      case 'quit':
      case 'q':
        console.log(kleur.green('Session ended'));
        this.isSessionActive = false;
        this.rl.close();
        break;
        
      case 'clear':
        this.handleClearCommand();
        break;

      case 'permissions':
      case 'perm':
        this.showPermissionInfo();
        break;

      case 'mode':
        if (args.length > 0) {
          const requestedMode = args[0].toLowerCase();
          try {
            const validModes = ['normal', 'auto_accept', 'plan_only'];
            if (validModes.includes(requestedMode)) {
              const mode = requestedMode as any;
              this.agent.setPermissionMode(mode);
              const modeDisplay = this.agent.getPermissionModeDisplay();
              console.log(kleur.green(`✅ Permission mode set to: ${modeDisplay}`));
              console.log(kleur.gray(this.agent.getPermissionManager().getModeDescription()));
            } else {
              this.formatError(`Invalid mode. Available: ${validModes.join(', ')}`);
            }
          } catch (error) {
            this.formatError(`Failed to set mode: ${error.message}`);
          }
        } else {
          const newMode = this.agent.cyclePermissionMode();
          const modeDisplay = this.agent.getPermissionModeDisplay();
          console.log(kleur.cyan(`🔄 Permission mode cycled to: ${modeDisplay}`));
          console.log(kleur.gray(this.agent.getPermissionManager().getModeDescription()));
        }
        break;

      case 'compact':
        await this.handleCompactCommand();
        break;

      case 'resume':
        await this.handleResumeCommand(args);
        break;

      case 'continue':
        await this.handleContinueCommand();
        break;

      case 'sessions':
        this.handleSessionsCommand();
        break;

      case 'approvals':
        this.handleApprovalsCommand();
        break;

      case 'memory':
      case 'agent':
        await this.handleMemoryCommand(args);
        break;

      case 'reload':
      case 'refresh':
        this.handleReloadCommand();
        break;

      case 'git':
        this.handleGitCommand(args);
        break;

      case 'github':
      case 'gh':
        this.handleGithubCommand(args);
        break;

      case 'bashes':
        this.handleBashesCommand(args);
        break;

      case 'hooks':
        this.handleHooksCommand(args);
        break;

      default:
        this.formatError(`Unknown command: /${cmd}\nAvailable: /init, /plan, /execute, /status, /config, /persona, /auth, /agents, /mcp, /tools, /models, /help, /exit, /mode, /permissions, /clear, /compact, /resume, /continue, /sessions, /approvals, /memory, /reload, /git, /github, /bashes, /hooks`);
    }
  }

  private async handleNaturalLanguage(input: string) {
    try {
      // Use the persistent agent with session memory
      const result = await this.agent.executeWithTools(input);
      
      if (result.type === 'completed') {
        // Ensure agent cleans up properly
        this.agent.cleanup();

        // Add spacing before agent response
        console.log();
        console.log(result.content);

        // Show additional context and token usage
        const details = [];
        if (result.iterations > 1) {
          details.push(`${result.iterations} steps`);
        }
        if (result.tokens && result.tokens.total > 0) {
          const tokenStr = result.tokens.total < 1000
            ? `${result.tokens.total} tokens`
            : `${(result.tokens.total / 1000).toFixed(1)}k tokens`;
          details.push(tokenStr);
        }

        if (details.length > 0) {
          console.log(kleur.gray(`\nCompleted in ${details.join(', ')}`));
        }
      } else if (result.type === 'failed') {
        this.agent.cleanup();
        this.formatError(`Task failed: ${result.content}`);
      } else if (result.type === 'max_iterations') {
        this.agent.cleanup();
        this.formatError('Task exceeded maximum iterations. Try breaking it into smaller steps.');
      }
      
    } catch (error: any) {
      this.agent.cleanup();
      this.stopThinking();
      this.formatError(`Failed to process request: ${error?.message || 'Unknown error'}`);
    }
  }

  private startThinking() {
    // Disable thinking animation to prevent interference with approval dialogs
    // Just show a simple static message
    console.log(kleur.blue('Processing...'));
  }

  private stopThinking() {
    // No need to clear anything since we're not using animation
    // Just ensure we have a clean line for the response
  }

  private formatError(message: string) {
    // Minimal formatting like Claude Code
    console.log(kleur.red('❌ Error: ') + message);
  }

  private createBox(lines: string[], borderColor: 'red' | 'blue' | 'green' | 'gray' = 'gray'): string {
    const width = Math.max(...lines.map(line => this.stripAnsi(line).length)) + 4;
    const colorFn = borderColor === 'red' ? kleur.red : 
                   borderColor === 'blue' ? kleur.blue :
                   borderColor === 'green' ? kleur.green : kleur.gray;
    
    const topBorder = colorFn('+' + '-'.repeat(width - 2) + '+');
    const bottomBorder = colorFn('+' + '-'.repeat(width - 2) + '+');
    
    const boxedLines = lines.map(line => {
      const padding = width - this.stripAnsi(line).length - 3;
      return colorFn('| ') + line + ' '.repeat(padding) + colorFn('|');
    });
    
    return [topBorder, ...boxedLines, bottomBorder].join('\n');
  }

  private stripAnsi(str: string): string {
    return str.replace(/\u001b\[[0-9;]*m/g, '');
  }

  private handleClearCommand() {
    const clearBox = this.createBox([
      kleur.white("🔄 Clearing Session Context"),
      "",
      kleur.gray("This will clear the conversation history but keep:"),
      kleur.cyan("  • Session ID and basic info"),
      kleur.cyan("  • Permission settings"),
      kleur.cyan("  • Project configuration"),
      "",
      kleur.yellow("⚠️  Conversation history will be lost")
    ], 'yellow');
    
    console.log(clearBox);
    
    // Clear session memory
    this.sessionMemory.clearSession();
    
    // Clear screen and show fresh welcome
    console.clear();
    this.showWelcome();
    
    console.log(kleur.green("✅ Session context cleared successfully"));
  }

  private async handleCompactCommand() {
    const agent = this.agent as any;
    const memoryManager = agent.memoryManager;

    // Show pre-compression status
    const preStats = memoryManager.getMemoryStats();
    const compressionCheck = memoryManager.shouldCompress();

    const compactBox = this.createBox([
      kleur.white("🗜️  Advanced Memory Compression"),
      "",
      kleur.gray("Using Claude Code-style intelligent compression:"),
      kleur.cyan("  • Classify messages by importance"),
      kleur.cyan("  • AI-powered summarization"),
      kleur.cyan("  • Preserve critical context"),
      kleur.cyan("  • Maintain recent conversation"),
      "",
      kleur.white(`Current: ${preStats.messageCount} messages (${preStats.tokenEstimate.percentage.toFixed(1)}% of limit)`)
    ], 'blue');

    console.log(compactBox);

    try {
      // Force compression even if not needed for manual /compact
      const result = await memoryManager.compressMemory(true);

      if (result.success) {
        const efficiency = ((result.tokensReduced / (result.tokensReduced + preStats.tokenEstimate.total)) * 100).toFixed(1);
        console.log(kleur.green("✅ Memory compression completed successfully"));
        console.log(kleur.gray(`   ${result.originalCount} → ${result.newCount} messages`));
        console.log(kleur.gray(`   ~${efficiency}% space saved using ${result.method}`));
        console.log(kleur.gray(`   ${result.tokensReduced.toLocaleString()} tokens freed`));
      } else {
        console.log(kleur.yellow("⚠️  No compression needed - memory is healthy"));
        console.log(kleur.gray(`   Current usage: ${preStats.tokenEstimate.percentage.toFixed(1)}% of limit`));
      }

    } catch (error: any) {
      console.log(kleur.red("❌ Failed to compress memory:"), error.message);
    }
  }

  private async handleResumeCommand(args: string[]) {
    if (args.length === 0) {
      // Show available sessions
      this.handleSessionsCommand();
      console.log();
      console.log(kleur.white("💡 Usage: ") + kleur.cyan("/resume <session-id>"));
      return;
    }
    
    const sessionId = args[0];
    
    try {
      const resumedSession = await this.sessionPersistence.switchSession(sessionId);
      
      if (!resumedSession) {
        console.log(kleur.red("❌ Session not found: ") + sessionId);
        console.log(kleur.gray("   Use /sessions to see available sessions"));
        return;
      }
      
      // Update current session ID
      this.sessionId = sessionId;
      
      const resumeBox = this.createBox([
        kleur.white("📂 Enhanced Session Resumed"),
        "",
        kleur.white(`Session ID: ${resumedSession.sessionId}`),
        resumedSession.currentTask ? kleur.cyan(`Current Task: ${resumedSession.currentTask}`) : '',
        resumedSession.workingFiles.length ? kleur.gray(`Working Files: ${resumedSession.workingFiles.slice(-3).join(', ')}`) : '',
        kleur.gray(`Messages: ${resumedSession.messages.length}`),
        kleur.gray(`Last Activity: ${new Date(resumedSession.lastActivity).toLocaleString()}`),
        "",
        kleur.blue("✅ Permissions and approvals restored from previous session")
      ].filter(Boolean), 'green');
      
      console.log(resumeBox);
      
      // Update agent's session
      this.agent['context'].sessionId = resumedSession.sessionId;
      this.sessionId = resumedSession.sessionId;
      
    } catch (error) {
      console.log(kleur.red("❌ Failed to resume session:"), error.message);
    }
  }

  private async handleContinueCommand() {
    try {
      const lastSession = this.sessionMemory.getLastSession();
      
      if (!lastSession) {
        console.log(kleur.yellow("⚠️  No previous sessions found"));
        return;
      }
      
      if (lastSession.sessionId === this.sessionId) {
        console.log(kleur.yellow("⚠️  Already in the most recent session"));
        return;
      }
      
      // Resume the last session
      await this.handleResumeCommand([lastSession.sessionId]);
      
    } catch (error) {
      console.log(kleur.red("❌ Failed to continue last session:"), error.message);
    }
  }

  private handleSessionsCommand() {
    const sessions = this.sessionPersistence.getEnhancedSessionList(10);
    
    if (sessions.length === 0) {
      console.log(kleur.yellow("⚠️  No sessions found"));
      return;
    }
    
    const sessionLines = [kleur.white("📋 Enhanced Session History")];
    sessionLines.push("");
    
    // Add session statistics
    const stats = this.sessionPersistence.getSessionStats();
    sessionLines.push(kleur.gray(`Total sessions: ${stats.totalSessions} | Active approvals: ${stats.hasActiveApprovals ? 'Yes' : 'No'}`));
    if (stats.crashCount > 0) {
      sessionLines.push(kleur.yellow(`⚠️  Recent interruptions: ${stats.crashCount}`));
    }
    sessionLines.push("");
    
    sessions.forEach((session, index) => {
      const indicator = session.isActive ? kleur.green("●") : kleur.gray("○");
      const age = this.formatTimeAgo(session.lastActivity);
      
      sessionLines.push(
        `${indicator} ${kleur.cyan(session.sessionId.substring(0, 12))}... ${kleur.gray(age)}`
      );
      
      if (session.currentTask) {
        sessionLines.push(`   ${kleur.yellow(session.currentTask)}`);
      }
      
      // Enhanced session info
      const details = [];
      if (session.workingFiles > 0) details.push(`${session.workingFiles} files`);
      if (session.messageCount > 0) details.push(`${session.messageCount} msgs`);
      if (session.duration) details.push(`${session.duration}`);
      
      if (details.length > 0) {
        sessionLines.push(`   ${kleur.gray(details.join(" • "))}`);
      }
    });
    
    sessionLines.push("");
    sessionLines.push(kleur.white("Commands:"));
    sessionLines.push(kleur.cyan("  /resume <session-id>") + kleur.gray(" - Resume a specific session"));
    sessionLines.push(kleur.cyan("  /continue") + kleur.gray("           - Continue the last session"));
    sessionLines.push(kleur.cyan("  /approvals") + kleur.gray("         - View active session approvals"));
    
    const sessionBox = this.createBox(sessionLines, 'blue');
    console.log(sessionBox);
  }

  private handleApprovalsCommand() {
    const manager = this.agent.getPermissionManager();
    const approvals = manager.getSessionApprovals();
    
    if (approvals.length === 0) {
      const noApprovalsBox = this.createBox([
        kleur.white("📋 Session Approvals"),
        "",
        kleur.gray("No session approvals active"),
        "",
        kleur.white("💡 How it works:"),
        kleur.gray("When prompted for approval, choose 's/session' to approve"),
        kleur.gray("similar operations for the rest of this session.")
      ], 'blue');
      
      console.log(noApprovalsBox);
      return;
    }
    
    const approvalLines = [kleur.white("📋 Active Session Approvals")];
    approvalLines.push("");
    approvalLines.push(kleur.green(`✅ ${approvals.length} approval(s) active for this session:`));
    approvalLines.push("");
    
    approvals.forEach((approval, index) => {
      const parts = approval.split(':');
      if (parts[0] === 'tool') {
        approvalLines.push(`${index + 1}. ${kleur.cyan('Tool:')} ${kleur.yellow(parts[1])}`);
      } else if (parts[0] === 'category') {
        const category = parts[1];
        const riskLevel = parts[2] || 'unknown';
        approvalLines.push(`${index + 1}. ${kleur.cyan('Category:')} ${kleur.yellow(category)} ${kleur.gray(`(${riskLevel} risk)`)}`);
      } else {
        approvalLines.push(`${index + 1}. ${kleur.gray(approval)}`);
      }
    });
    
    approvalLines.push("");
    approvalLines.push(kleur.white("Commands:"));
    approvalLines.push(kleur.red("  /mode normal") + kleur.gray(" - Reset to normal approval mode"));
    approvalLines.push(kleur.gray("  Session approvals clear automatically when session ends"));
    
    const approvalsBox = this.createBox(approvalLines, 'green');
    console.log(approvalsBox);
  }

  private formatTimeAgo(timestamp: string): string {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = now.getTime() - time.getTime();
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  }

  private showPermissionInfo() {
    const manager = this.agent.getPermissionManager();
    const currentMode = manager.getCurrentMode();
    const currentConfig = manager.getCurrentConfig();
    
    const permissionBox = this.createBox([
      kleur.white("🔒 Permission System"),
      "",
      kleur.white(`Current Mode: ${currentConfig.icon} ${currentMode.toUpperCase()}`),
      kleur.gray(currentConfig.description),
      "",
      kleur.white("Available Modes:"),
      kleur.green("  🔒 NORMAL    - Ask approval for sensitive operations"),
      kleur.yellow("  🚀 AUTO_ACCEPT - Execute operations without asking"),  
      kleur.blue("  📋 PLAN_ONLY  - Show plans but don't execute"),
      "",
      kleur.white("Commands:"),
      kleur.cyan("  /mode") + kleur.gray("        - Cycle through permission modes"),
      kleur.cyan("  /mode normal") + kleur.gray(" - Set specific mode"),
      kleur.gray("  Shift+Tab    - Quick mode cycling (in approval prompts)")
    ], 'blue');
    
    console.log(permissionBox);
  }

  private async handleMemoryCommand(args: string[]) {
    const subCommand = args[0] || 'show';
    
    switch (subCommand.toLowerCase()) {
      case 'show':
      case 'status':
        this.showMemoryStatus();
        break;
        
      case 'agent':
      case 'agentmd':
        this.showAgentMdStatus();
        break;
        
      case 'compact':
        await this.handleCompactCommand();
        break;

      case 'stats':
      case 'statistics':
        this.showDetailedMemoryStats();
        break;

      default:
        this.formatError(`Unknown memory command: ${subCommand}\nAvailable: show, agent, compact, stats`);
    }
  }

  private showMemoryStatus() {
    const agent = this.agent as any;
    const sessionMemory = agent.sessionMemory;
    const agentMemory = agent.agentMemory;
    const memoryManager = agent.memoryManager;

    // Get detailed memory statistics
    const currentSession = sessionMemory.getCurrentSession();
    const memoryStats = memoryManager.getMemoryStats();
    const compressionCheck = memoryManager.shouldCompress();

    // Get project context
    const projectContext = agentMemory.generateProjectContext(true);
    const projectInstructions = agentMemory.getCurrentProjectInstructions();

    const memoryLines = [kleur.white("🧠 Advanced Memory System Status")];
    memoryLines.push("");

    // Session Memory with Token Analysis
    memoryLines.push(kleur.blue("📝 Session Memory:"));
    memoryLines.push(`   Messages: ${memoryStats.messageCount} ${this.getMemoryHealthIcon(compressionCheck)}`);
    memoryLines.push(`   Estimated Tokens: ${memoryStats.tokenEstimate.total.toLocaleString()} (${memoryStats.tokenEstimate.percentage.toFixed(1)}% of limit)`);
    memoryLines.push(`   Working Files: ${currentSession.workingFiles.length}`);
    memoryLines.push(`   Current Task: ${currentSession.currentTask || kleur.gray('none')}`);

    // Memory Health Status
    if (compressionCheck.needed) {
      const urgencyColor = compressionCheck.urgency === 'high' ? kleur.red : compressionCheck.urgency === 'medium' ? kleur.yellow : kleur.cyan;
      memoryLines.push(`   Status: ${urgencyColor(`${compressionCheck.urgency.toUpperCase()} - ${compressionCheck.reason}`)}`);
    } else {
      memoryLines.push(`   Status: ${kleur.green('HEALTHY - ' + compressionCheck.reason)}`);
    }

    // Last Compression Info
    if (memoryStats.lastCompression) {
      const comp = memoryStats.lastCompression;
      const timeAgo = this.getTimeAgo(comp.timestamp);
      memoryLines.push(`   Last Compression: ${timeAgo} (${comp.method}, ${comp.originalCount}→${comp.newCount} messages)`);
    }

    memoryLines.push("");

    // Project Memory (Agent.md)
    memoryLines.push(kleur.blue("🎯 Project Memory:"));
    if (projectInstructions.trim()) {
      const instructionLines = projectInstructions.split('\n').length;
      memoryLines.push(`   ${kleur.green('✅ Agent.md loaded')} (${instructionLines} lines)`);
    } else {
      memoryLines.push(`   ${kleur.gray('No Agent.md files found')}`);
    }
    memoryLines.push(`   ${projectContext}`);
    memoryLines.push("");

    // Memory Actions
    memoryLines.push(kleur.white("🔧 Available Actions:"));
    memoryLines.push(kleur.cyan("  /memory agent") + kleur.gray("    - View Agent.md file details"));
    memoryLines.push(kleur.cyan("  /memory compact") + kleur.gray("  - Intelligent memory compression"));
    memoryLines.push(kleur.cyan("  /memory stats") + kleur.gray("   - Detailed token analysis"));
    memoryLines.push(kleur.cyan("  /reload") + kleur.gray("          - Refresh Agent.md files"));
    memoryLines.push(kleur.cyan("  /clear") + kleur.gray("           - Clear session context"));

    const memoryBox = this.createBox(memoryLines, 'blue');
    console.log(memoryBox);
  }

  private getMemoryHealthIcon(compressionCheck: any): string {
    if (!compressionCheck.needed) return kleur.green('✅ Healthy');
    if (compressionCheck.urgency === 'high') return kleur.red('🚨 Critical');
    if (compressionCheck.urgency === 'medium') return kleur.yellow('⚠️ Warning');
    return kleur.cyan('🗜️ Ready for compression');
  }

  private getTimeAgo(timestamp: string): string {
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  private showDetailedMemoryStats() {
    const agent = this.agent as any;
    const memoryManager = agent.memoryManager;
    const sessionMemory = agent.sessionMemory;

    const currentSession = sessionMemory.getCurrentSession();
    const memoryStats = memoryManager.getMemoryStats();
    const compressionCheck = memoryManager.shouldCompress();

    const statsLines = [kleur.white("📊 Detailed Memory Analysis")];
    statsLines.push("");

    // Token Breakdown
    statsLines.push(kleur.blue("🔢 Token Analysis:"));
    statsLines.push(`   Total Estimated: ${memoryStats.tokenEstimate.total.toLocaleString()}`);
    statsLines.push(`   Message Content: ${memoryStats.tokenEstimate.messages.toLocaleString()}`);
    statsLines.push(`   System Prompts: ${memoryStats.tokenEstimate.system.toLocaleString()}`);
    statsLines.push(`   Context Usage: ${memoryStats.tokenEstimate.percentage.toFixed(1)}% of ${memoryManager.config?.maxContextTokens?.toLocaleString() || '180,000'} limit`);
    statsLines.push("");

    // Message Classification (if available)
    const messages = currentSession.messages;
    if (messages.length > 0) {
      const userMsgs = messages.filter(m => m.role === 'user').length;
      const assistantMsgs = messages.filter(m => m.role === 'assistant').length;
      const systemMsgs = messages.filter(m => m.role === 'system').length;

      statsLines.push(kleur.blue("💬 Message Breakdown:"));
      statsLines.push(`   User Messages: ${userMsgs}`);
      statsLines.push(`   Assistant Messages: ${assistantMsgs}`);
      statsLines.push(`   System Messages: ${systemMsgs}`);
      statsLines.push(`   Total Messages: ${messages.length}`);

      // Average message length
      const avgLength = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0) / messages.length;
      statsLines.push(`   Average Length: ${Math.round(avgLength)} characters`);
      statsLines.push("");
    }

    // Compression Recommendation
    statsLines.push(kleur.blue("🎯 Compression Analysis:"));
    if (compressionCheck.needed) {
      const urgencyColor = compressionCheck.urgency === 'high' ? kleur.red : compressionCheck.urgency === 'medium' ? kleur.yellow : kleur.cyan;
      statsLines.push(`   Status: ${urgencyColor(`COMPRESSION RECOMMENDED (${compressionCheck.urgency.toUpperCase()})`)}`);
      statsLines.push(`   Reason: ${compressionCheck.reason}`);

      // Estimate compression benefits
      const estimatedReduction = Math.floor(messages.length * 0.6); // 60% reduction estimate
      statsLines.push(`   Estimated Reduction: ~${estimatedReduction} messages`);
    } else {
      statsLines.push(`   Status: ${kleur.green('HEALTHY - No compression needed')}`);
      statsLines.push(`   Reason: ${compressionCheck.reason}`);
    }

    // Last compression details
    if (memoryStats.lastCompression) {
      const comp = memoryStats.lastCompression;
      statsLines.push("");
      statsLines.push(kleur.blue("🕒 Last Compression:"));
      statsLines.push(`   Time: ${this.getTimeAgo(comp.timestamp)}`);
      statsLines.push(`   Method: ${comp.method}`);
      statsLines.push(`   Reduction: ${comp.originalCount} → ${comp.newCount} messages`);
      const tokensFreed = comp.originalTokens - comp.newTokens;
      statsLines.push(`   Tokens Freed: ${tokensFreed?.toLocaleString() || 'unknown'}`);
    }

    const statsBox = this.createBox(statsLines, 'blue');
    console.log(statsBox);
  }

  private showAgentMdStatus() {
    const agent = this.agent as any;
    const agentMemory = agent.agentMemory;
    
    // Force refresh and get hierarchy
    agentMemory.clearCache();
    const hierarchy = agentMemory.loadHierarchicalAgentMd();
    
    const agentMdLines = [kleur.white("🎯 Agent.md Hierarchy")];
    agentMdLines.push("");
    
    if (hierarchy.agentMdFiles.length === 0) {
      agentMdLines.push(kleur.gray("No Agent.md files found in project hierarchy"));
      agentMdLines.push("");
      agentMdLines.push(kleur.white("💡 To create an Agent.md file:"));
      agentMdLines.push(kleur.cyan("  /init") + kleur.gray(" - Generate intelligent Agent.md for this project"));
    } else {
      agentMdLines.push(kleur.green(`Found ${hierarchy.agentMdFiles.length} Agent.md file(s):`));
      agentMdLines.push("");
      
      hierarchy.agentMdFiles.forEach((agentMd, index) => {
        const relativePath = path.relative(process.cwd(), path.dirname(agentMd.filePath));
        const location = relativePath || 'project root';
        const fileName = path.basename(agentMd.filePath);
        const lines = agentMd.content.split('\n').length;
        const modified = agentMd.lastModified.toLocaleString();
        
        agentMdLines.push(`${index + 1}. ${kleur.cyan(fileName)} ${kleur.gray(`(${agentMd.level})`)}`);
        agentMdLines.push(`   ${kleur.gray(`Location: ${location}`)}`);
        agentMdLines.push(`   ${kleur.gray(`Size: ${lines} lines, Modified: ${modified}`)}`);
        agentMdLines.push("");
      });
      
      // Show a preview of the combined instructions
      const instructionPreview = hierarchy.projectInstructions.substring(0, 200);
      agentMdLines.push(kleur.white("📄 Combined Instructions Preview:"));
      agentMdLines.push(kleur.gray(instructionPreview + (hierarchy.projectInstructions.length > 200 ? '...' : '')));
    }
    
    const agentMdBox = this.createBox(agentMdLines, 'blue');
    console.log(agentMdBox);
  }

  private handleReloadCommand() {
    const agent = this.agent as any;
    const agentMemory = agent.agentMemory;
    
    // Force refresh Agent.md files
    agentMemory.clearCache();
    const hierarchy = agentMemory.loadHierarchicalAgentMd();
    
    const reloadBox = this.createBox([
      kleur.white("🔄 Agent.md Files Refreshed"),
      "",
      hierarchy.agentMdFiles.length > 0 
        ? kleur.green(`✅ Loaded ${hierarchy.agentMdFiles.length} Agent.md file(s)`)
        : kleur.gray("No Agent.md files found"),
      "",
      kleur.white("Changes will take effect on next AI interaction")
    ], 'green');
    
    console.log(reloadBox);
  }

  private handleGitCommand(args: string[]) {
    const subCommand = args[0] || 'status';
    
    switch (subCommand.toLowerCase()) {
      case 'status':
      case 's':
        this.executeNaturalLanguageCommand("Show enhanced git status with conflicts and operation info");
        break;
        
      case 'conflicts':
      case 'conflict':
        this.executeNaturalLanguageCommand("Detect and show all merge conflicts in the repository");
        break;
        
      case 'stash':
        if (args[1] === 'save' || args[1] === 'push') {
          const message = args.slice(2).join(' ') || 'Work in progress';
          this.executeNaturalLanguageCommand(`Stash current changes with message: "${message}"`);
        } else if (args[1] === 'pop') {
          this.executeNaturalLanguageCommand("Pop the most recent stash");
        } else if (args[1] === 'list') {
          this.executeNaturalLanguageCommand("List all git stashes");
        } else {
          this.executeNaturalLanguageCommand("Show git stash list");
        }
        break;
        
      case 'branch':
      case 'branches':
        if (args[1] === 'create' && args[2]) {
          this.executeNaturalLanguageCommand(`Create and switch to new branch: ${args[2]}`);
        } else {
          this.executeNaturalLanguageCommand("List all git branches");
        }
        break;
        
      case 'commit':
        const commitMessage = args.slice(1).join(' ');
        if (commitMessage) {
          this.executeNaturalLanguageCommand(`Generate and create a git commit with message: "${commitMessage}"`);
        } else {
          this.executeNaturalLanguageCommand("Generate an intelligent commit message based on staged changes and create commit");
        }
        break;
        
      case 'merge':
        if (args[1]) {
          this.executeNaturalLanguageCommand(`Merge branch ${args[1]} into current branch`);
        } else {
          this.showGitHelp();
        }
        break;
        
      case 'remote':
        this.executeNaturalLanguageCommand("Show git remote repositories with URLs");
        break;
        
      case 'help':
      default:
        this.showGitHelp();
    }
  }

  private handleGithubCommand(args: string[]) {
    const subCommand = args[0] || 'help';
    
    switch (subCommand.toLowerCase()) {
      case 'pr':
      case 'pull':
        if (args[1] === 'create') {
          const title = args.slice(2).join(' ');
          if (title) {
            this.executeNaturalLanguageCommand(`Create a GitHub pull request with title: "${title}"`);
          } else {
            this.executeNaturalLanguageCommand("Create a GitHub pull request with an intelligent title and description based on recent commits");
          }
        } else if (args[1] === 'list') {
          this.executeNaturalLanguageCommand("List all GitHub pull requests for this repository");
        } else {
          this.executeNaturalLanguageCommand("List GitHub pull requests");
        }
        break;
        
      case 'issue':
      case 'issues':
        if (args[1] === 'create') {
          const title = args.slice(2).join(' ');
          if (title) {
            this.executeNaturalLanguageCommand(`Create a GitHub issue with title: "${title}"`);
          } else {
            this.showGithubHelp();
          }
        } else if (args[1] === 'list') {
          this.executeNaturalLanguageCommand("List all open GitHub issues for this repository");
        } else {
          this.executeNaturalLanguageCommand("List GitHub issues");
        }
        break;
        
      case 'workflow':
      case 'actions':
        if (args[1] === 'list') {
          this.executeNaturalLanguageCommand("List all GitHub Actions workflows");
        } else if (args[1] === 'run' && args[2]) {
          this.executeNaturalLanguageCommand(`Run GitHub Actions workflow: ${args[2]}`);
        } else {
          this.executeNaturalLanguageCommand("Show GitHub Actions workflows status");
        }
        break;
        
      case 'repo':
        this.executeNaturalLanguageCommand("Show GitHub repository information and statistics");
        break;
        
      case 'help':
      default:
        this.showGithubHelp();
    }
  }

  private handleBashesCommand(args: string[]) {
    const processManager = getProcessManager();
    const subCommand = args[0];

    if (subCommand === 'cleanup') {
      const cleaned = processManager.cleanup();
      console.log(kleur.green(`Cleaned up ${cleaned} completed process(es)`));
      return;
    }

    if (subCommand === 'stats') {
      const stats = processManager.getStats();
      console.log(kleur.cyan('\nBackground Process Statistics\n'));
      console.log(`Total: ${stats.total}`);
      console.log(`Running: ${kleur.green(stats.running.toString())}`);
      console.log(`Completed: ${kleur.gray(stats.completed.toString())}`);
      console.log(`Failed: ${kleur.red(stats.failed.toString())}`);
      console.log(`Killed: ${kleur.yellow(stats.killed.toString())}`);
      return;
    }

    const processes = processManager.listProcesses();

    if (processes.length === 0) {
      console.log(kleur.gray('\nNo background processes\n'));
      return;
    }

    console.log(kleur.cyan('\nBackground Processes\n'));

    processes.forEach(proc => {
      const statusSymbol = proc.status === 'running'
        ? kleur.green('RUNNING')
        : proc.status === 'completed'
        ? kleur.gray('COMPLETED')
        : proc.status === 'failed'
        ? kleur.red('FAILED')
        : kleur.yellow('KILLED');

      const runtime = Math.floor((Date.now() - proc.startTime) / 1000);
      const timeStr = runtime < 60
        ? `${runtime}s`
        : `${Math.floor(runtime / 60)}m ${runtime % 60}s`;

      console.log(`${statusSymbol} ${kleur.yellow(proc.id)}`);
      console.log(`  Command: ${proc.command} ${proc.args.join(' ')}`);
      console.log(`  Runtime: ${timeStr}`);

      if (proc.pid) {
        console.log(`  PID: ${proc.pid}`);
      }

      if (proc.exitCode !== undefined) {
        console.log(`  Exit Code: ${proc.exitCode}`);
      }

      const outputLines = proc.output.length + proc.errorOutput.length;
      if (outputLines > 0) {
        console.log(`  Output Lines: ${outputLines}`);
      }

      console.log();
    });

    console.log(kleur.gray('Commands: /bashes cleanup, /bashes stats'));
  }

  private handleHooksCommand(args: string[]) {
    const hookManager = getHookManager(process.cwd());
    const subCommand = args[0];

    if (subCommand === 'reload') {
      hookManager.reload();
      console.log(kleur.green('Hooks configuration reloaded'));
      return;
    }

    if (subCommand === 'list') {
      const hooks = hookManager.getHooks();

      if (hooks instanceof Map && hooks.size === 0) {
        console.log(kleur.gray('\nNo hooks configured\n'));
        console.log(kleur.gray(`Configuration file: ${hookManager.getConfigPath()}`));
        return;
      }

      console.log(kleur.cyan('\nConfigured Hooks\n'));

      for (const [hookType, configs] of hooks as Map<string, any[]>) {
        console.log(kleur.yellow(hookType));

        configs.forEach((config, index) => {
          console.log(`  ${index + 1}. ${config.command} ${config.args?.join(' ') || ''}`);
          if (config.blocking) {
            console.log(`     ${kleur.red('BLOCKING')}`);
          }
          if (config.timeout) {
            console.log(`     Timeout: ${config.timeout}ms`);
          }
        });
        console.log();
      }

      console.log(kleur.gray(`Configuration: ${hookManager.getConfigPath()}`));
      return;
    }

    if (subCommand === 'stats') {
      const stats = hookManager.getStats();
      console.log(kleur.cyan('\nHooks Statistics\n'));
      console.log(`Total Hooks: ${stats.totalHooks}`);
      console.log(`Hook Types: ${stats.hookTypes}`);
      console.log(`Config Exists: ${stats.configExists ? kleur.green('Yes') : kleur.red('No')}`);
      console.log(`Config Path: ${hookManager.getConfigPath()}`);
      return;
    }

    if (subCommand === 'help') {
      this.displayHooksHelp();
      return;
    }

    this.displayHooksHelp();
  }

  private displayHooksHelp(): void {
    console.log(kleur.cyan('\nHooks System\n'));
    console.log('Hooks allow you to run custom scripts at specific points in tool execution.\n');

    console.log(kleur.yellow('Configuration:'));
    console.log('  Create .metis/hooks.json in your project\n');

    console.log(kleur.yellow('Example:'));
    console.log('  {');
    console.log('    "pre-write": {');
    console.log('      "command": "prettier",');
    console.log('      "args": ["--write", "${filePath}"],');
    console.log('      "blocking": false');
    console.log('    },');
    console.log('    "post-commit": {');
    console.log('      "command": "npm",');
    console.log('      "args": ["run", "lint"],');
    console.log('      "blocking": true');
    console.log('    }');
    console.log('  }\n');

    console.log(kleur.yellow('Available Hook Types:'));
    console.log('  pre-tool       - Before any tool executes');
    console.log('  post-tool      - After tool completes');
    console.log('  pre-write      - Before file writes');
    console.log('  post-write     - After file writes');
    console.log('  pre-bash       - Before bash execution');
    console.log('  post-bash      - After bash execution');
    console.log('  pre-commit     - Before git commit');
    console.log('  post-commit    - After git commit\n');

    console.log(kleur.yellow('Available Variables:'));
    console.log('  ${hookType}  - Type of hook');
    console.log('  ${toolName}  - Tool being executed');
    console.log('  ${filePath}  - File being modified');
    console.log('  ${command}   - Command being run');
    console.log('  ${content}   - File content\n');

    console.log(kleur.yellow('Commands:'));
    console.log('  /hooks list   - Show configured hooks');
    console.log('  /hooks reload - Reload hooks configuration');
    console.log('  /hooks stats  - Show statistics');
    console.log('  /hooks help   - Show this help\n');
  }

  private executeNaturalLanguageCommand(command: string) {
    // Execute the command as if it was typed naturally
    this.handleNaturalLanguage(command);
  }

  private showGitHelp() {
    const gitHelpBox = this.createBox([
      kleur.white("🔧 Git Commands"),
      "",
      kleur.blue("Basic Operations:"),
      kleur.cyan("  /git status") + kleur.gray("     - Enhanced git status with conflicts"),
      kleur.cyan("  /git conflicts") + kleur.gray("  - Detect and analyze merge conflicts"),
      kleur.cyan("  /git branch") + kleur.gray("     - List all branches"),
      kleur.cyan("  /git remote") + kleur.gray("     - Show remote repositories"),
      "",
      kleur.blue("Branch Management:"),
      kleur.cyan("  /git branch create <name>") + kleur.gray(" - Create new branch"),
      kleur.cyan("  /git merge <branch>") + kleur.gray("      - Merge branch"),
      "",
      kleur.blue("Stash Operations:"),
      kleur.cyan("  /git stash") + kleur.gray("        - List stashes"),
      kleur.cyan("  /git stash save <msg>") + kleur.gray(" - Save current changes"),
      kleur.cyan("  /git stash pop") + kleur.gray("      - Apply most recent stash"),
      "",
      kleur.blue("Commit Operations:"),
      kleur.cyan("  /git commit") + kleur.gray("       - Smart commit with generated message"),
      kleur.cyan("  /git commit <msg>") + kleur.gray("  - Commit with specific message"),
      "",
      kleur.white("💡 All commands use AI-powered git operations with approval gates")
    ], 'blue');
    
    console.log(gitHelpBox);
  }

  private showGithubHelp() {
    const githubHelpBox = this.createBox([
      kleur.white("🐙 GitHub Commands"),
      "",
      kleur.blue("Pull Requests:"),
      kleur.cyan("  /github pr") + kleur.gray("           - List pull requests"),
      kleur.cyan("  /github pr create") + kleur.gray("    - Create new PR"),
      kleur.cyan("  /github pr create <title>") + kleur.gray(" - Create PR with title"),
      "",
      kleur.blue("Issues:"),
      kleur.cyan("  /github issue") + kleur.gray("        - List open issues"),
      kleur.cyan("  /github issue create <title>") + kleur.gray(" - Create new issue"),
      "",
      kleur.blue("Actions & Workflows:"),
      kleur.cyan("  /github workflow") + kleur.gray("     - List workflows"),
      kleur.cyan("  /github workflow run <name>") + kleur.gray(" - Run workflow"),
      "",
      kleur.blue("Repository:"),
      kleur.cyan("  /github repo") + kleur.gray("         - Show repository info"),
      "",
      kleur.white("⚠️  Requires GitHub CLI (gh) to be installed and authenticated"),
      kleur.gray("   Install: https://cli.github.com/"),
      kleur.gray("   Login: gh auth login")
    ], 'blue');
    
    console.log(githubHelpBox);
  }

  private showHelp() {
    const helpBox = this.createBox([
      kleur.white("📚 Metis Code Help"),
      "",
      kleur.white("💬 Natural Language:"),
      kleur.gray("Just type what you want to do:"),
      kleur.yellow('  "Add error handling to the API endpoints"'),
      kleur.yellow('  "Create a React component for user profiles"'),
      kleur.yellow('  "Fix the TypeScript errors in the codebase"'),
      "",
      kleur.white("⚡ Slash Commands:"),
      kleur.cyan("  /init") + kleur.gray("        - Initialize project with Agent.md"),
      kleur.cyan("  /plan") + kleur.gray("        - Enter collaborative planning mode"),
      kleur.cyan("  /execute") + kleur.gray("      - Exit planning mode and start coding"),
      kleur.cyan("  /status") + kleur.gray("      - Show system status"),
      kleur.cyan("  /config") + kleur.gray("      - Show/manage configuration"),
      kleur.cyan("  /persona") + kleur.gray("     - Interactive persona management"),
      kleur.cyan("  /auth") + kleur.gray("        - Interactive API key management (local)"),
      kleur.cyan("  /agents") + kleur.gray("      - Interactive agent operations"),
      kleur.cyan("  /mcp") + kleur.gray("         - Interactive MCP server management"),
      kleur.cyan("  /tools") + kleur.gray("       - Interactive tool discovery and execution"),
      kleur.cyan("  /models") + kleur.gray("      - Interactive model browsing and selection"),
      kleur.cyan("  /permissions") + kleur.gray(" - Show permission system info"),
      kleur.cyan("  /mode") + kleur.gray("        - Cycle permission modes"),
      kleur.cyan("  /clear") + kleur.gray("       - Clear conversation context"),
      kleur.cyan("  /compact") + kleur.gray("     - Compact/summarize session context"), 
      kleur.cyan("  /resume") + kleur.gray("      - Resume a previous session"),
      kleur.cyan("  /continue") + kleur.gray("     - Continue the last session"),
      kleur.cyan("  /sessions") + kleur.gray("    - List recent sessions"),
      kleur.cyan("  /memory") + kleur.gray("      - View memory system status"),
      kleur.cyan("  /reload") + kleur.gray("      - Refresh Agent.md files"),
      kleur.cyan("  /git") + kleur.gray("         - Git operations (type /git help)"),
      kleur.cyan("  /github") + kleur.gray("      - GitHub operations (type /github help)"),
      kleur.cyan("  /help") + kleur.gray("        - Show this help"),
      kleur.cyan("  /exit") + kleur.gray("        - Exit session"),
      "",
      kleur.white("🔒 Permission System:"),
      kleur.gray("• Three modes: Normal (ask), Auto-accept, Plan-only"),
      kleur.gray("• Use /mode to cycle or /mode <name> to set specific"),
      kleur.gray("• Current mode shows in prompt"),
      "",
      kleur.white("💡 Tips:"),
      kleur.gray("• Be specific about files or components to work with"),
      kleur.gray("• AI automatically reads and modifies files as needed"),
      kleur.gray("• Use Agent.md to customize AI behavior for your project")
    ], 'blue');
    
    console.log(helpBox);
  }

  private async enterPlanningMode() {
    const planBox = this.createBox([
      kleur.blue('Planning Mode Activated'),
      '',
      kleur.white('I will help you plan your project requirements and generate tasks.'),
      kleur.gray('This mode focuses on planning and will only generate Agent.md files.'),
      '',
      kleur.yellow('Tell me about your project or what you want to build:'),
      '',
      kleur.gray('When ready to start coding, use: /execute')
    ], 'blue');
    
    console.log(planBox);
    console.log();
    
    // Set the agent to planning mode
    this.agent.setPermissionMode('plan_only');
    
    // Show updated prompt
    this.rl.setPrompt(this.createPrompt());
    
    // Planning mode is now active - the agent will handle planning requests differently
  }

  private async exitPlanningMode() {
    const currentMode = this.agent.getPermissionManager().getCurrentMode();
    
    if (currentMode !== 'plan_only') {
      const notInPlanningBox = this.createBox([
        kleur.yellow('Not in Planning Mode'),
        '',
        kleur.gray('You are not currently in planning mode.'),
        kleur.white(`Current mode: ${this.agent.getPermissionModeDisplay()}`)
      ], 'yellow');
      
      console.log(notInPlanningBox);
      return;
    }
    
    const executeBox = this.createBox([
      kleur.green('Exiting Planning Mode'),
      '',
      kleur.white('Switching to execution mode.'),
      kleur.gray('You can now ask me to implement the planned features.'),
      '',
      kleur.cyan('Ready to start coding!')
    ], 'green');
    
    console.log(executeBox);
    console.log();
    
    // Switch back to normal mode
    this.agent.setPermissionMode('normal');
    
    // Show updated prompt
    this.rl.setPrompt(this.createPrompt());
    
    // No need to call AI here - just let the user make their next request
  }

  private async handlePersonaCommand(args: string[]) {
    if (args.length === 0) {
      // Show current persona
      const currentPersona = this.agent.getPersona();
      console.log(`Current persona: ${currentPersona?.name || 'default'}`);
      console.log(`Description: ${currentPersona?.description || 'Default persona'}`);
      return;
    }

    const [action, ...actionArgs] = args;

    switch (action) {
      case 'list':
        await runPersona(['list']);
        break;

      case 'show':
        await runPersona(['show', ...actionArgs]);
        break;

      case 'set':
      case 'switch':
        if (actionArgs.length === 0) {
          console.log('Usage: /persona set <name>');
          console.log('Example: /persona set senior-dev');
          return;
        }

        const personaName = actionArgs[0];
        try {
          await this.agent.switchPersona(personaName);
          console.log(`✅ Switched to persona: ${personaName}`);
        } catch (error: any) {
          console.error(`❌ Failed to switch persona: ${error.message}`);
        }
        break;

      default:
        console.log('Usage: /persona [action] [args]');
        console.log('Actions:');
        console.log('  (no args)  - Show current persona');
        console.log('  list       - List available personas');
        console.log('  show <name> - Show persona details');
        console.log('  set <name>  - Switch to persona');
        console.log('');
        console.log('Examples:');
        console.log('  /persona');
        console.log('  /persona list');
        console.log('  /persona set senior-dev');
    }
  }

}