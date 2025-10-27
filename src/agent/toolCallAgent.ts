import { Provider, Message, ProviderResponse, FunctionDefinition } from "../providers/types";
import { makeProvider } from "./simpleAgent";
import { AssetLoader } from "../assets/loader";
import { Persona } from "../types/persona";
import kleur from "kleur";
import { toolRegistry, ExecutionContext, ToolResult } from "../tools/registry";
import { registerBuiltinTools } from "../tools/builtin";
import { summarizeRepo } from "../tools/repo";
import { loadConfig } from "../config";
import { getSessionMemory, SessionMemory } from "../runtime/sessionMemory";
import { getAgentMemory, AgentMemoryManager } from "../runtime/agentMemory";
import { MemoryManager, createMemoryManager } from "../runtime/memoryManager";
import { PermissionManager, PermissionMode } from "../permissions";
import * as readline from 'readline';
import { ErrorHandler } from "../errors/errorHandler";
import { TokenBudgetManager } from "../runtime/budgetManager";

export interface AgentResult {
  type: "completed" | "failed" | "max_iterations";
  content: string;
  iterations: number;
  toolCalls: number;
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
  context: ExecutionContext;
}

export class ToolCallingAgent {
  private provider: Provider;
  private context: ExecutionContext;
  private persona: Persona | null = null;
  private sessionMemory: SessionMemory;
  private agentMemory: AgentMemoryManager;
  private memoryManager: MemoryManager;
  private permissionManager: PermissionManager;
  private thinkingInterval?: NodeJS.Timeout;
  private currentAction: string = '';
  private recentOperations: Map<string, number> = new Map();
  private fileCache: Map<string, { content: string; timestamp: number }> = new Map();
  private completedOperations: Set<string> = new Set();
  private consecutiveNoToolCalls: number = 0;
  private currentTokenUsage: { prompt: number; completion: number; total: number } = { prompt: 0, completion: 0, total: 0 };
  private lastProgressLine: string = '';
  public budgetManager: TokenBudgetManager;

  constructor(sessionId?: string, readlineInterface?: readline.Interface) {
    this.provider = makeProvider();

    // Initialize permission system
    // Let PermissionManager auto-detect headless mode, or override with env var
    const isHeadless = process.env.METIS_AUTO_APPROVE === 'true' ||
                       process.env.METIS_HEADLESS === 'true' ||
                       process.env.CI === 'true';

    const initialMode = isHeadless
      ? PermissionMode.AUTO_ACCEPT
      : undefined;  // Let PermissionModeManager auto-detect headless mode

    this.permissionManager = new PermissionManager(initialMode, readlineInterface);
    this.budgetManager = new TokenBudgetManager(200000);

    this.context = {
      sessionId: sessionId || `session-${Date.now()}`,
      workingDirectory: process.cwd(),
      config: { autoApprove: process.env.METIS_AUTO_APPROVE === 'true' },
      traceEnabled: process.env.METIS_TRACE === 'true',
      verboseEnabled: process.env.METIS_VERBOSE === 'true',
      permissionManager: this.permissionManager,
      clearProgress: () => this.clearProgress()
    };

    // Initialize session memory and agent memory
    this.sessionMemory = getSessionMemory(this.context.workingDirectory);
    this.sessionMemory.loadSession(this.context.sessionId);

    // Initialize hierarchical agent memory
    this.agentMemory = getAgentMemory(this.context.workingDirectory);

    // Initialize advanced memory manager with AI-powered summarization
    this.memoryManager = createMemoryManager(
      this.context.workingDirectory,
      {
        maxContextTokens: 180000, // Conservative limit for most models
        autoCompactThreshold: 0.75, // Auto-compact at 75% capacity
        minMessagesBeforeCompact: 8,
        preserveRecentMessages: 4,
        compressionStrategy: {
          method: 'summarize',
          targetReduction: 0.6,
          preserveRecent: 4,
          preserveImportant: true
        }
      },
      // AI-powered summarization function
      async (messages, context) => {
        try {
          const conversationText = messages.map(m =>
            `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`
          ).join('\n\n');

          const summaryPrompt = `Create a concise summary of this development session, focusing on:
- Key tasks completed and their outcomes
- Important decisions and changes made
- Files and components that were modified
- Current progress and any pending work
- Technical context that should be preserved

${context ? `Session Context:\n${context}\n\n` : ''}Conversation:
${conversationText}

Summary:`;

          const summary = await this.provider.send([
            { role: 'system', content: 'You create concise, technical summaries of development conversations that preserve important context.' },
            { role: 'user', content: summaryPrompt }
          ]);

          return summary;
        } catch (error: any) {
          console.warn('AI summarization failed:', error.message);
          // Fallback to simple summarization
          const userMessages = messages.filter(m => m.role === 'user').map(m => m.content);
          const taskCount = userMessages.length;
          const recentTasks = userMessages.slice(-3);

          return [
            `Previous conversation included ${taskCount} user requests.`,
            recentTasks.length > 0 ? `Recent tasks: ${recentTasks.join('; ')}` : '',
            context || ''
          ].filter(Boolean).join(' ');
        }
      }
    );

    // Register built-in tools
    registerBuiltinTools();
  }

  async executeWithTools(
    task: string,
    availableTools: string[] = [],
    maxIterations = 50  // Much higher limit like Claude Code
  ): Promise<AgentResult> {
    
    // Set current task in session memory
    this.sessionMemory.setCurrentTask(task);
    
    if (this.context.verboseEnabled) {
      console.log(`Session: ${this.context.sessionId}`);
      console.log(`Max steps: ${maxIterations}`);
    }

    // Load persona
    await this.loadPersona();

    // Check if provider supports tools
    if (!this.provider.supportsTools()) {
      // Fallback to simple agent behavior
      const { runSimpleAgent } = await import("./simpleAgent");
      const result = await runSimpleAgent("run", task);
      
      // Save to session memory
      this.sessionMemory.addMessage({ role: "user", content: task });
      this.sessionMemory.addMessage({ role: "assistant", content: result });
      
      return {
        type: "completed",
        content: result,
        iterations: 1,
        toolCalls: 0,
        context: this.context
      };
    }

    const tools = this.getAvailableTools(availableTools);
    const systemPrompt = this.buildSystemPrompt(tools);
    
    // Check if we need to compress memory using the advanced memory manager
    const compressionCheck = this.memoryManager.shouldCompress();
    if (compressionCheck.needed) {
      if (this.context.verboseEnabled) {
        const urgencyIcon = compressionCheck.urgency === 'high' ? '🚨' : compressionCheck.urgency === 'medium' ? '⚠️' : '🗜️';
        console.log(kleur.yellow(`${urgencyIcon} Auto-compressing memory: ${compressionCheck.reason}`));
      }

      try {
        const result = await this.memoryManager.compressMemory();

        if (result.success && this.context.verboseEnabled) {
          const efficiency = ((result.tokensReduced / (result.tokensReduced + this.memoryManager.getMemoryStats().tokenEstimate.total)) * 100).toFixed(1);
          console.log(kleur.green(`✅ Memory compressed: ${result.originalCount}→${result.newCount} messages (~${efficiency}% space saved)`));
        }
      } catch (error: any) {
        if (this.context.verboseEnabled) {
          console.log(kleur.yellow('⚠️  Memory compression failed, continuing...'));
        }
        console.warn('Failed to compress memory:', error.message);
      }
    }

    // Build messages with session context
    let messages: Message[] = this.buildMessagesWithContext(systemPrompt, task);

    let iterations = 0;
    let toolCalls = 0;
    let totalTokens = { prompt: 0, completion: 0, total: 0 };

    mainLoop: for (let i = 0; i < maxIterations; i++) {
      iterations++;
      
      if (this.context.traceEnabled) {
        console.log(`\n--- Iteration ${i + 1}/${maxIterations} ---`);
        console.log("Messages:", messages.length);
      }

      try {
        // Show thinking indicator when sending to AI
        if (i === 0) {
          this.showProgress('Analyzing request');
        } else {
          this.showProgress('Processing');
        }

        const response = await ErrorHandler.withNetworkRetry(
          () => this.provider.sendWithTools(messages, tools, {
            temperature: this.persona?.temperature,
            max_tokens: 16000  // Increased for large file contents and comprehensive responses
          }),
          'AI provider request'
        );

        // Clear progress once we get a response
        this.clearProgress();

        // Accumulate token usage and update display
        if (response.usage) {
          totalTokens.prompt += response.usage.prompt_tokens;
          totalTokens.completion += response.usage.completion_tokens;
          totalTokens.total += response.usage.total_tokens;

          // Update current token usage for real-time display
          this.currentTokenUsage = { ...totalTokens };

          // Track in budget manager
          this.budgetManager.addUsage({
            prompt: response.usage.prompt_tokens,
            completion: response.usage.completion_tokens,
            total: response.usage.total_tokens
          });

          // Auto-compact if needed
          if (this.budgetManager.shouldAutoCompact()) {
            console.log(kleur.yellow('\nToken budget at 75%, auto-compacting session history...\n'));
            await this.memoryManager.compactIfNeeded(messages, 'Token budget threshold reached');
            this.budgetManager.markCompacted();
          }
        }

        if (response.type === 'text') {
          // Track consecutive responses without tool calls
          this.consecutiveNoToolCalls++;

          // If we get 2 consecutive responses without tool calls, task is likely complete
          if (this.consecutiveNoToolCalls >= 2) {
            // Task appears complete
            this.clearProgress();
            this.sessionMemory.addMessages(messages);
            return {
              type: "completed",
              content: response.content,
              iterations,
              toolCalls,
              tokens: totalTokens,
              context: this.context
            };
          }
          // Check if the response contains inline function calls
          const functionCallPattern = /<function=([^>{\s]+)(\{[^}]+\})?[^>]*>/g;
          const matches = [...response.content.matchAll(functionCallPattern)];
          
          if (matches.length > 0) {
            // Extract and execute inline function calls
            for (const match of matches) {
              const functionName = match[1];
              const paramsStr = match[2];
              
              try {
                // Parse parameters
                let params = {};
                if (paramsStr && paramsStr.trim().startsWith('{')) {
                  params = JSON.parse(paramsStr);
                }
                
                // Create a pseudo tool call
                const toolCall = {
                  id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  type: 'function',
                  function: {
                    name: functionName,
                    arguments: JSON.stringify(params)
                  }
                };
                
                toolCalls++;
                
                // Execute the tool
                const result = await ErrorHandler.withQuickRetry(
                  () => this.executeTool(toolCall),
                  `tool execution: ${functionName}`
                );
                
                // Add tool result to messages
                const toolMessage: Message = {
                  role: "tool",
                  content: JSON.stringify(result),
                  tool_call_id: toolCall.id,
                  name: functionName
                };
                messages.push(toolMessage);
                
                // Continue to next iteration to process the tool result
                continue mainLoop;
              } catch (error) {
                console.error(`Failed to parse/execute inline function call: ${match[0]}`);
              }
            }
          }
          
          // No function calls found or all processed - return final answer
          // Remove function call syntax from the response
          const cleanContent = response.content.replace(/<function=[^>]*>/g, '').replace(/<\/function>/g, '');

          // If tools were used but response lacks summary, generate one
          let finalContent = cleanContent.trim() || response.content;
          if (toolCalls > 0 && (!finalContent || finalContent.length < 50)) {
            finalContent = this.generateMissingSummary(toolCalls, iterations) + (finalContent ? '\n\n' + finalContent : '');
          }

          // Format markdown for terminal display
          finalContent = this.formatMarkdownForTerminal(finalContent);

          // Save conversation to session memory
          this.sessionMemory.addMessages(messages);

          return {
            type: "completed",
            content: finalContent,
            iterations,
            toolCalls,
            tokens: totalTokens,
            context: this.context
          };
        }

        if (response.type === 'tool_call' && response.tool_calls) {
          // Reset the no-tool-call counter since we're using tools
          this.consecutiveNoToolCalls = 0;

          // Agent wants to call tools
          const assistantMessage: Message = {
            role: "assistant",
            content: response.content,
            tool_calls: response.tool_calls
          };
          messages.push(assistantMessage);

          // Execute each tool call
          for (let idx = 0; idx < response.tool_calls.length; idx++) {
            const toolCall = response.tool_calls[idx];
            toolCalls++;

            // Check for duplicate operations to prevent loops
            // But be more lenient with read operations since they're often needed
            const operationKey = `${toolCall.function.name}:${toolCall.function.arguments}`;
            const recentCount = this.recentOperations.get(operationKey) || 0;
            const maxAttempts = ['read_file', 'list_files', 'git_status'].includes(toolCall.function.name) ? 6 : 3;

            if (recentCount >= maxAttempts) {
              // Silently skip without showing confusing message to user
              const errorResult = {
                success: false,
                error: `Please try a different approach to complete this task.`
              };
              const toolMessage: Message = {
                role: "tool",
                content: JSON.stringify(errorResult),
                tool_call_id: toolCall.id,
                name: toolCall.function.name
              };
              messages.push(toolMessage);
              continue;
            }

            // Track this operation
            this.recentOperations.set(operationKey, recentCount + 1);

            // Clean up old operations (keep last 10)
            if (this.recentOperations.size > 10) {
              const firstKey = this.recentOperations.keys().next().value;
              this.recentOperations.delete(firstKey);
            }

            // Show progress indicator
            const nextTool = response.tool_calls[idx + 1];
            this.showProgress(toolCall.function.name, nextTool?.function.name);

            // Display tool call in Claude Code format
            if (!this.context.permissionManager || this.context.permissionManager.getCurrentMode() !== PermissionMode.NORMAL) {
              // Only show tool calls when not in normal mode (approval dialogs handle display)
              console.log(kleur.gray(`\n<function=${toolCall.function.name}>\n${this.formatToolParams(toolCall.function.arguments)}\n</function>\n`));
            }

            const result = await ErrorHandler.withQuickRetry(
              () => this.executeTool(toolCall),
              `tool execution: ${toolCall.function.name}`
            );

            // Display tool result in a clean format like Claude Code
            this.displayToolResult(toolCall.function.name, result);

            const toolMessage: Message = {
              role: "tool",
              content: JSON.stringify(result),
              tool_call_id: toolCall.id,
              name: toolCall.function.name
            };
            messages.push(toolMessage);
          }
          
          continue; // Continue the loop for next iteration
        }

      } catch (error: any) {
        console.error(`\nError in iteration ${i + 1}:`, error.message);

        // Check if this is a recoverable API error
        if (error.message.includes('500') || error.message.includes('502') || error.message.includes('503')) {
          console.log(kleur.yellow('\nAPI temporarily unavailable. Waiting before retry...'));
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Skip this iteration and try again
          if (i < maxIterations - 1) {
            continue;
          }
        }

        // Handle rate limits specifically
        if (error.message.includes('rate limit') || error.status === 429) {
          const waitTime = error.waitTime || 2000; // Use provided wait time or default to 2 seconds
          console.log(kleur.yellow(`\nRate limit reached. Waiting ${waitTime / 1000} seconds...`));
          await new Promise(resolve => setTimeout(resolve, waitTime));

          // Skip this iteration and try again
          if (i < maxIterations - 1) {
            continue;
          }
        }

        // For unrecoverable errors, return failure
        return {
          type: "failed",
          content: `Execution failed: ${error.message}`,
          iterations,
          toolCalls,
          tokens: totalTokens,
          context: this.context
        };
      }
    }

    // Max iterations reached
    this.clearProgress();

    return {
      type: "max_iterations",
      content: "Task did not complete within the maximum number of iterations",
      iterations,
      toolCalls,
      tokens: totalTokens,
      context: this.context
    };
  }

  private async loadPersona(): Promise<void> {
    const loader = new AssetLoader();

    try {
      // Priority 1: Check for project-specific persona (.metis/persona.yaml)
      const projectPersona = await loader.loadProjectPersona();
      if (projectPersona) {
        this.persona = projectPersona;
        if (this.context.verboseEnabled) {
          console.log(`Persona: ${this.persona.name} (project-specific)`);
        }
        return;
      }

      // Priority 2: Use environment variable or default persona
      const personaName = process.env.METIS_PERSONA || 'default';
      this.persona = await loader.loadPersona(personaName);
      if (this.context.verboseEnabled) {
        console.log(`Persona: ${this.persona.name} (${personaName === 'default' ? 'default' : 'environment'})`);
      }
    } catch (error: any) {
      // Fallback to default
      this.persona = {
        name: 'default',
        version: '1.0',
        description: 'Default persona',
        system_prompt: 'You are a helpful coding assistant with access to tools.',
        temperature: 0.2
      };
      if (this.context.verboseEnabled) {
        console.log('Persona: default (fallback)');
      }
    }
  }

  private getAvailableTools(requestedTools: string[]): FunctionDefinition[] {
    const allToolNames = toolRegistry.list();
    const toolsToUse = requestedTools.length > 0 ? requestedTools : allToolNames;

    const tools: FunctionDefinition[] = [];

    // Prioritize essential tools like read_file to encourage their use
    const priorityTools = ['read_file', 'write_file', 'edit_file'];
    const otherTools = toolsToUse.filter(t => !priorityTools.includes(t));
    const orderedTools = [...priorityTools.filter(t => toolsToUse.includes(t)), ...otherTools];

    for (const toolName of orderedTools) {
      const tool = toolRegistry.get(toolName);
      if (tool) {
        tools.push({
          name: tool.name,
          description: tool.description,
          parameters: tool.schema || {}
        });
      }
    }

    if (this.context.verboseEnabled) {
      console.log(`Tools: ${tools.length} available`);
    }

    return tools;
  }

  private buildSystemPrompt(tools: FunctionDefinition[]): string {
    const repoSummary = summarizeRepo(60);
    const sessionSummary = this.sessionMemory.getSessionSummary();
    const basePrompt = this.persona?.system_prompt || "You are a helpful coding assistant.";

    // Check for Agent.md updates and load hierarchical instructions
    this.agentMemory.refreshIfNeeded();
    const projectInstructions = this.agentMemory.getCurrentProjectInstructions();
    const projectContext = this.agentMemory.generateProjectContext(false);

    // Check if we're in planning mode
    const currentMode = this.permissionManager.getCurrentMode();
    const isInPlanningMode = currentMode === 'plan_only';

    // Apply personality traits if available
    let personalityPrompt = '';
    if (this.persona?.personality) {
      const traits = this.persona.personality;
      personalityPrompt = `\n\nPERSONALITY TRAITS:`;

      if (traits.communication_style) {
        personalityPrompt += `\n- Communication Style: ${traits.communication_style}`;
      }
      if (traits.explanation_depth) {
        personalityPrompt += `\n- Explanation Depth: ${traits.explanation_depth}`;
      }
      if (traits.code_review_tone) {
        personalityPrompt += `\n- Code Review Tone: ${traits.code_review_tone}`;
      }
      if (traits.help_approach) {
        personalityPrompt += `\n- Help Approach: ${traits.help_approach}`;
      }
      if (traits.humor_level) {
        personalityPrompt += `\n- Humor Level: ${traits.humor_level}`;
      }
      if (traits.formality) {
        personalityPrompt += `\n- Formality: ${traits.formality}`;
      }
      if (traits.encouragement) {
        personalityPrompt += `\n- Encouragement Level: ${traits.encouragement}`;
      }
    }

    // Apply behavior guidelines if available
    let behaviorPrompt = '';
    if (this.persona?.behavior && this.persona.behavior.length > 0) {
      behaviorPrompt = `\n\nBEHAVIOR GUIDELINES:`;
      this.persona.behavior.forEach(guideline => {
        behaviorPrompt += `\n- ${guideline}`;
      });
    }

    let systemPrompt = `${basePrompt}${personalityPrompt}${behaviorPrompt}

You have access to tools that allow you to read files, write files, check git status, and perform other operations to help complete coding tasks.

PLATFORM AWARENESS:
- Current platform: ${process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux'}
- Use platform-appropriate commands:
  - Windows: del (not rm), dir (not ls), copy (not cp), move (not mv)
  - Unix/Mac: rm, ls, cp, mv
- Always use forward slashes in file paths for consistency
- The system will handle path conversion automatically

IMPORTANT BEHAVIORAL GUIDELINES:

1. EFFICIENT TOOL USAGE:
   - Only use tools when necessary to complete the user's request
   - Don't use list_files unless you need to understand project structure
   - Don't use read_file unless you need to see current file contents
   - For simple questions, respond directly without tool usage
   - Combine related operations when possible

2. SMART DECISION MAKING:
   - If user asks "create a file", just create it - don't list directories first
   - If user provides specific code, use it directly - don't read existing files unless needed
   - When user says "add X to file Y", go straight to editing if the addition is clear
   - Use read_file only when you need to understand existing code structure

3. CLEAN OUTPUT:
   - Be conversational and natural like Claude Code
   - Don't show intermediate steps unless they add value
   - Silent success for read operations - only show important results
   - Integrate tool usage seamlessly into responses

4. ALWAYS SUMMARIZE CHANGES:
   - After editing files, ALWAYS summarize what you changed
   - After creating files, briefly describe what you created
   - After making any modifications, explain the purpose and impact
   - Example: "I added a powerup system with 3 types: speed boost, size increase, and extra points"
   - Example: "I updated the config.py to reduce powerup spawn time from 300 to 180 seconds"
   - Be specific about what changed, not just "I made some changes"

5. WHEN TO USE TOOLS:
   - read_file: ALWAYS use this to read file contents (NOT grep or search tools)
   - edit_file: ALWAYS read the file FIRST with read_file, then edit
   - write_file: For creating new files or completely replacing content
   - list_files: Only when you need to understand project structure
   - grep/search: Only for finding patterns across multiple files
   - git_*: When user requests git operations or you're making commits

6. ASKING USER QUESTIONS (ask_user_question tool):
   Use this tool when you need user input to make decisions during execution.

   WHEN TO USE:
   - Multiple valid approaches exist (e.g., "Should we use JWT or sessions?")
   - Requirements are ambiguous (e.g., "Which styling approach?")
   - User preferences needed (e.g., "Which library should we use?")
   - Trade-offs require user decision (e.g., "Performance vs simplicity?")

   WHEN NOT TO USE:
   - For trivial decisions you can make yourself
   - When the user already specified their preference
   - In headless/CI mode (will error)
   - For yes/no questions that don't need options

   FORMAT:
   {
     "questions": [{
       "question": "Which authentication method should we use?",
       "header": "Auth method",
       "options": [
         {
           "label": "JWT",
           "description": "Stateless, scalable, good for APIs and mobile apps"
         },
         {
           "label": "Sessions",
           "description": "Server-side, more secure, traditional approach"
         },
         {
           "label": "OAuth",
           "description": "Third-party authentication via Google, GitHub, etc"
         }
       ],
       "multiSelect": false
     }]
   }

   IMPORTANT:
   - Provide 2-4 options with clear descriptions
   - Keep headers under 12 characters
   - Use multiSelect: true only when multiple choices make sense
   - An "Other" option is automatically provided
   - Maximum 4 questions per call

7. TASK DELEGATION AND THOROUGHNESS (task tool):
   Use the task tool to delegate complex, multi-step tasks to specialized sub-agents.
   The thoroughness parameter controls how deeply the sub-agent explores:

   THOROUGHNESS LEVELS:
   - "quick": Basic searches and direct approaches
     Use when you need a fast answer to a specific question
     Example: "Find the main function in index.ts"

   - "medium": Moderate exploration with balanced depth (default)
     Use for standard exploration tasks
     Example: "Understand how authentication works in this codebase"

   - "very thorough": Comprehensive analysis across multiple locations and naming conventions
     Use when you need exhaustive searches or complex analysis
     Example: "Find all error handling patterns across the entire codebase"

   WHEN TO SPECIFY THOROUGHNESS:
   - Omit for standard tasks (defaults to "medium")
   - Set to "quick" when time/token budget is limited
   - Set to "very thorough" when completeness is critical

   FORMAT:
   {
     "description": "Analyze auth system",
     "prompt": "Explore and document the authentication system implementation",
     "subagent_type": "general-purpose",
     "thoroughness": "medium"
   }

CRITICAL: When editing a specific file:
1. Use read_file to see the current contents
2. Use edit_file to make changes
NEVER use grep/search tools just to look at a single file's content!

Available tools:
${tools.map(tool => `- ${tool.name}: ${tool.description}`).join("\n")}

CRITICAL TOOL PARAMETER RULES:
- edit_file: Use ONLY "path", "search", "replace" parameters. NEVER use line_start, line_end, old_string, new_string
- multi_edit: Use ONLY "file_path" and "edits" array with "old_string", "new_string" in each edit
- write_file: Use ONLY "path" and "content" parameters
- read_file: Use ONLY "path" parameter (optionally line_start, line_end for partial reads)
- Follow the exact parameter names in tool schemas - do not invent or substitute parameters

PROJECT ANALYSIS RULES:
- When analyzing or summarizing projects for users, NEVER mention Agent.md files
- Agent.md is internal documentation for the AI agent - users don't need to see it
- Focus on actual project files: source code, configs, docs, tests, etc.
- If asked about project structure, exclude Agent.md from listings and summaries

MANDATORY TASK COMPLETION SUMMARY:
When you finish a task that involved using tools, you MUST provide a clear summary including:
- What files were created, modified, or deleted
- What specific changes were made
- The outcome or result of the work
- Any important notes or next steps
Example: "✅ Task completed! I modified 3 files: updated the API configuration in config.py, added error handling to main.py, and created a new utility function in utils.py. The changes implement proper logging and error handling as requested."`;

    if (isInPlanningMode) {
      systemPrompt += `

🎯 PLANNING MODE ACTIVE 🎯

You are currently in PLANNING MODE. Your role is to help the user plan their project requirements and create comprehensive Agent.md files.

PLANNING MODE GUIDELINES:
- Focus ONLY on planning and documentation - DO NOT implement actual code
- When the user describes their project, ALWAYS create an Agent.md file using the write_file tool
- Ask clarifying questions to understand project requirements
- Help break down projects into manageable tasks and phases
- Provide architecture guidance and best practices suggestions
- Generate comprehensive Agent.md files with:
  * Project description and context
  * Technical requirements and architecture choices
  * Development guidelines and coding standards
  * Task breakdown and implementation phases
  * Best practices and conventions

AGENT.MD STRUCTURE:
When creating Agent.md files, include:
\`\`\`markdown
# Project: [Project Name]

## Context
[Brief description of what the project does]

## Technical Requirements
- [List key technologies, frameworks, etc.]
- [Database, APIs, external services]
- [Performance and scalability requirements]

## Architecture
[High-level architecture description]

## Development Guidelines
- [Coding standards and conventions]
- [File organization patterns]
- [Testing requirements]
- [Error handling approaches]

## Implementation Phases
1. [Phase 1: Core functionality]
2. [Phase 2: Additional features]
3. [Phase 3: Polish and optimization]

## Tasks Breakdown
- [Specific implementable tasks]
- [Dependencies between tasks]
- [Priority levels]
\`\`\`

IMPORTANT: Always use the write_file tool to create Agent.md files when the user describes their project requirements.

When creating Agent.md files, use EXACTLY this filename: "Agent.md" (capital A, capital M, .md extension).`;
    } else {
      systemPrompt += `

IMPORTANT: Only use tools when the user explicitly asks for coding tasks, file operations, or technical work. For simple greetings, questions, or general conversation, respond normally without using tools.

When the user asks you to implement something or work with code:
1. ANALYZE the request to understand what needs to be done
2. READ relevant files using read_file tool (NOT grep/search) to see current content
3. CHECK git status if needed to see what's already changed
4. IMPLEMENT the changes by writing/updating files directly
5. PROVIDE a clear summary of what you accomplished

CRITICAL FILE EDITING WORKFLOW:
- To edit a file: FIRST use read_file, THEN use edit_file
- To view a file: use read_file (NOT grep, NOT search)
- To find text across many files: use grep
- Never use grep/search just to read a single file!

Use tools appropriately - don't use them for casual conversation or when they're not needed.`;
    }

    systemPrompt += `

TODO MANAGEMENT - IMPORTANT:
You have access to todo management tools (create_todo, update_todo, list_todos, delete_todo, clear_completed_todos).
Use these proactively for ANY task that involves multiple steps or when the user specifically asks for todo/task management.

ALWAYS use todos when:
- User asks to "create a todo" or "make a todo list" or mentions "tasks"
- Multi-step implementation requests
- Complex feature development
- Planning or organizing work

Example workflow:
1. User: "Implement user authentication with login and signup"
2. You: Use create_todo for "Implement login functionality", create_todo for "Implement signup functionality", etc.
3. As you work: Use update_todo to mark items as "in_progress" then "completed"
4. Use list_todos to show progress to user

The user expects you to use these tools when appropriate!

Repository summary:
${repoSummary}`;

    // Add project-specific instructions from Agent.md files
    if (projectInstructions.trim()) {
      systemPrompt += `\n\n=== PROJECT-SPECIFIC INSTRUCTIONS ===\n${projectInstructions}`;
    }
    
    // Add project context information
    if (projectContext.trim()) {
      systemPrompt += `\n\nPROJECT CONTEXT:\n${projectContext}`;
    }

    // Add session context if available
    if (sessionSummary.trim()) {
      systemPrompt += `\n\nSESSION CONTEXT:\n${sessionSummary}`;
    }

    systemPrompt += `\n\nComplete the user's task by taking action with the available tools${isInPlanningMode ? ' (focus on planning and Agent.md creation)' : ''}.`;
    
    return systemPrompt;
  }

  private buildMessagesWithContext(systemPrompt: string, currentTask: string): Message[] {
    const messages: Message[] = [
      { role: "system", content: systemPrompt }
    ];

    // Add recent conversation history for context (but not too much to avoid token overload)
    const recentMessages = this.sessionMemory.getRecentConversation(4); // Last 4 messages
    
    if (recentMessages.length > 0) {
      // Skip system messages from history to avoid duplication
      const conversationHistory = recentMessages.filter(msg => msg.role !== "system");
      messages.push(...conversationHistory);
    }

    // Add current user message
    messages.push({ role: "user", content: currentTask });

    return messages;
  }

  private displayToolResult(toolName: string, result: ToolResult): void {
    // Clear any running progress indicator first
    this.clearProgress();

    // Only show results for operations that matter to the user
    // Silent operations: read_file, list_files, git_status (unless they fail)
    if (result.success) {
      const silentOps = ['read_file', 'list_files', 'list_directory', 'git_status', 'git_diff', 'git_log', 'grep', 'find_files'];

      if (silentOps.includes(toolName)) {
        // Silent success - don't show anything for successful read operations
        return;
      }

      // Show clean, minimal results for important operations
      this.showCleanToolResult(toolName, result);
    } else {
      // Show errors with helpful guidance
      this.showErrorWithGuidance(toolName, result);
    }
  }

  private showCleanToolResult(toolName: string, result: ToolResult): void {
    const path = result.metadata?.path || '';

    switch(toolName) {
      case 'write_file':
      case 'create_file':
        if (result.metadata?.created) {
          console.log(kleur.gray(`\nCreate(${path})`));
          if (result.content) {
            console.log(kleur.dim(`  → ${result.content}`));
          }
        } else {
          console.log(kleur.gray(`\nUpdate(${path})`));
          if (result.content) {
            console.log(kleur.dim(`  → ${result.content}`));
          }
        }
        break;

      case 'edit_file':
      case 'multi_edit':
        console.log(kleur.gray(`\nUpdate(${path})`));
        if (result.metadata?.changes) {
          console.log(kleur.dim(`  → Made ${result.metadata.changes} changes`));
        } else if (result.content) {
          console.log(kleur.dim(`  → ${result.content}`));
        }
        break;

      case 'git_add':
        // Silent success
        break;

      case 'git_commit':
        console.log(kleur.gray(`\nCommit created`));
        break;

      case 'bash':
      case 'run_command':
        if (result.content && result.content.trim()) {
          console.log(kleur.gray(`\nBash output:`));
          console.log(result.content);
        }
        break;

      case 'notebook_edit':
        console.log(kleur.gray(`\nNotebook(${path})`));
        break;

      default:
        // Generic success message for other tools
        if (result.content && typeof result.content === 'string' && result.content.length < 200) {
          console.log(kleur.gray(`\n${result.content}`));
        }
        break;
    }
  }

  private showErrorWithGuidance(toolName: string, result: ToolResult): void {
    const error = result.error || 'Unknown error';

    // Provide specific guidance based on common error patterns
    let guidance = '';

    if (error.includes('Path outside workspace')) {
      guidance = '\nTip: Try using a relative path within the current directory';
    } else if (error.includes('File not found') || error.includes('ENOENT')) {
      guidance = '\nTip: Check the file path spelling and ensure the file exists';
    } else if (error.includes('Permission denied') || error.includes('EACCES')) {
      guidance = '\nTip: You may not have permission to access this file/directory';
    } else if (error.includes('Directory not empty')) {
      guidance = '\nTip: Use a different directory or ensure it\'s empty first';
    } else if (error.includes('already exists')) {
      guidance = '\nTip: File already exists - use edit_file to modify or choose a different name';
    } else if (error.includes('Invalid notebook format')) {
      guidance = '\nTip: The file may be corrupted or not a valid Jupyter notebook';
    } else if (error.includes('Tool call validation failed')) {
      guidance = '\nTip: Check the parameters passed to the tool';
    } else if (error.includes('Command failed')) {
      guidance = '\nTip: The shell command encountered an error - check the command syntax';
    }

    console.log(kleur.red(`\nError: ${this.formatTaskName(toolName)} failed: ${error}${guidance}`));
  }

  private displayDiff(oldText: string, newText: string, lineNumber?: number): void {
    // Display a simple diff preview
    const maxLength = 80;
    const oldDisplay = oldText.length > maxLength ? oldText.substring(0, maxLength) + '...' : oldText;
    const newDisplay = newText.length > maxLength ? newText.substring(0, maxLength) + '...' : newText;

    if (lineNumber) {
      console.log(kleur.gray(`       ${lineNumber} `) + kleur.red(`- ${oldDisplay}`));
      console.log(kleur.gray(`       ${lineNumber} `) + kleur.green(`+ ${newDisplay}`));
    } else {
      // Show simplified diff for global replacements
      console.log(kleur.red(`       - ${oldDisplay}`));
      console.log(kleur.green(`       + ${newDisplay}`));
    }
  }

  private showProgress(currentTask: string, nextTask?: string): void {
    // Clear any existing progress indicator
    this.clearProgress();

    // Format the task name for display
    const taskDisplay = this.formatTaskName(currentTask);
    this.lastProgressLine = `${taskDisplay}...`;

    // Simple, clean thinking indicator like Claude Code
    const symbols = ['◐', '◓', '◑', '◒'];
    let symbolIndex = 0;
    let lastTokenCount = this.currentTokenUsage.total;

    const showIndicator = () => {
      // Only update if tokens changed or symbol needs rotation
      const currentTokenCount = this.currentTokenUsage.total;
      const hasTokenUpdate = currentTokenCount !== lastTokenCount;

      if (hasTokenUpdate || symbolIndex % 2 === 0) {
        const tokenInfo = currentTokenCount > 0
          ? ` ${kleur.gray(`[${this.formatTokenCount(currentTokenCount)}]`)}`
          : '';

        // Simple, clean format like Claude Code
        const line = `${kleur.cyan(symbols[symbolIndex])} ${kleur.gray(taskDisplay)}${tokenInfo}`;

        // Clear previous line and write new one
        process.stdout.write('\r\x1b[K' + line);

        lastTokenCount = currentTokenCount;
      }

      symbolIndex = (symbolIndex + 1) % symbols.length;
    };

    // Initial display
    showIndicator();

    // Update less frequently for cleaner output (1 second vs 500ms)
    this.thinkingInterval = setInterval(showIndicator, 1000);

    // Show next task if available (cleaner format)
    if (nextTask) {
      process.stdout.write('\n');
      console.log(kleur.gray(`  → ${this.formatTaskName(nextTask)}`));
    }
  }

  private clearProgress(): void {
    if (this.thinkingInterval) {
      clearInterval(this.thinkingInterval);
      this.thinkingInterval = undefined;
      // Clear the line using ANSI escape codes (more reliable)
      process.stdout.write('\r\x1b[K');
    }
    this.lastProgressLine = '';
  }

  private formatTaskName(toolName: string): string {
    // Convert tool names to user-friendly descriptions
    const taskNames: Record<string, string> = {
      'write_file': 'Writing file',
      'read_file': 'Reading file',
      'edit_file': 'Editing file',
      'list_files': 'Listing files',
      'create_directory': 'Creating directory',
      'git_status': 'Checking git status',
      'git_commit': 'Creating commit',
      'bash': 'Executing command',
      'grep': 'Searching files',
      'find_files': 'Finding files',
      'create_todo': 'Creating todo',
      'update_todo': 'Updating todo',
      'list_todos': 'Listing todos'
    };

    return taskNames[toolName] || `Executing ${toolName}`;
  }

  private formatToolParams(paramsJson: string): string {
    try {
      const params = JSON.parse(paramsJson);
      // Format parameters cleanly, one per line
      return Object.entries(params)
        .map(([key, value]) => {
          const valueStr = typeof value === 'string' 
            ? value 
            : JSON.stringify(value, null, 2);
          return `${key}: ${valueStr}`;
        })
        .join('\n');
    } catch {
      return paramsJson;
    }
  }

  private async executeTool(toolCall: any): Promise<ToolResult> {
    try {
      const params = JSON.parse(toolCall.function.arguments);

      // Check file cache for read operations
      if (toolCall.function.name === 'read_file' && params.file_path) {
        const cached = this.fileCache.get(params.file_path);
        if (cached && Date.now() - cached.timestamp < 60000) { // 1 minute cache
          return {
            success: true,
            content: cached.content,
            metadata: { path: params.file_path, cached: true }
          };
        }
      }

      const result = await toolRegistry.execute(
        toolCall.function.name,
        params,
        this.context
      );

      // Cache file contents for read operations
      if (toolCall.function.name === 'read_file' && result.success) {
        this.fileCache.set(params.file_path, {
          content: result.content,
          timestamp: Date.now()
        });

        // Limit cache size
        if (this.fileCache.size > 20) {
          const firstKey = this.fileCache.keys().next().value;
          this.fileCache.delete(firstKey);
        }
      }

      // Invalidate cache on write operations
      if (['write_file', 'edit_file', 'multi_edit'].includes(toolCall.function.name)) {
        this.fileCache.delete(params.file_path || params.path);
      }

      // Track file operations in session memory
      this.trackFileOperations(toolCall.function.name, params);

      return result;
    } catch (error: any) {
      return {
        success: false,
        error: `Tool execution failed: ${error.message}`,
        metadata: {
          tool: toolCall.function.name,
          error_type: error.constructor.name
        }
      };
    }
  }

  private trackFileOperations(toolName: string, params: any): void {
    // Track files that are being worked on
    const fileTools = ['read_file', 'write_file', 'edit_file', 'append_to_file'];
    
    if (fileTools.includes(toolName) && params.path) {
      this.sessionMemory.addWorkingFile(params.path);
    } else if (toolName === 'move_file') {
      if (params.from) this.sessionMemory.addWorkingFile(params.from);
      if (params.to) this.sessionMemory.addWorkingFile(params.to);
    }
  }

  // Permission system methods
  getPermissionManager(): PermissionManager {
    return this.permissionManager;
  }

  getCurrentPermissionMode(): PermissionMode {
    return this.permissionManager.getCurrentMode();
  }

  setPermissionMode(mode: PermissionMode): void {
    this.permissionManager.setMode(mode);
  }

  private formatTokenCount(count: number): string {
    if (count < 1000) return count.toString();
    if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
    return `${Math.round(count / 1000)}k`;
  }

  private formatMarkdownForTerminal(text: string): string {
    // Convert markdown formatting to terminal colors
    return text
      // Bold text: **text** or **`code`** -> bright white
      .replace(/\*\*`([^`]+)`\*\*/g, kleur.cyan().bold('$1'))
      .replace(/\*\*([^*]+)\*\*/g, kleur.white().bold('$1'))
      // Inline code: `code` -> cyan
      .replace(/`([^`]+)`/g, kleur.cyan('$1'))
      // List items: - item -> • item (with proper spacing)
      .replace(/^- (.+)$/gm, kleur.gray('•') + ' $1')
      // Replace checkmark for consistency
      .replace(/✅/g, '🚀');
  }

  private generateMissingSummary(toolCalls: number, iterations: number): string {
    const toolText = toolCalls === 1 ? '1 operation' : `${toolCalls} operations`;
    const stepText = iterations === 1 ? '1 step' : `${iterations} steps`;

    return `🚀 Task completed! I performed ${toolText} across ${stepText} to implement the requested changes. The files have been updated successfully.`;
  }

  cleanup(): void {
    this.clearProgress();
    this.permissionManager.close();
  }

  cyclePermissionMode(): PermissionMode {
    return this.permissionManager.cycleMode();
  }

  getPermissionModeDisplay(): string {
    return this.permissionManager.getModeDisplay();
  }

  // Persona management methods
  getPersona(): Persona | null {
    return this.persona;
  }

  async switchPersona(personaName: string): Promise<void> {
    const { AssetLoader } = await import('../assets/loader');
    const loader = new AssetLoader();

    try {
      // Try to load the specified persona
      const newPersona = await loader.loadPersona(personaName);
      this.persona = newPersona;

      if (this.context.verboseEnabled) {
        console.log(`✅ Persona switched to: ${this.persona.name}`);
      }
    } catch (error: any) {
      throw new Error(`Failed to load persona '${personaName}': ${error.message}`);
    }
  }

  async reloadPersona(): Promise<void> {
    const { AssetLoader } = await import('../assets/loader');
    const loader = new AssetLoader();

    try {
      // Priority 1: Try to load project-specific persona first
      const projectPersona = await loader.loadProjectPersona();
      if (projectPersona) {
        this.persona = projectPersona;
        if (this.context.verboseEnabled) {
          console.log(`✅ Persona reloaded: ${this.persona.name} (project-specific)`);
        }
        return;
      }

      // Priority 2: Use environment variable or default persona
      const personaName = process.env.METIS_PERSONA || 'default';
      this.persona = await loader.loadPersona(personaName);
      if (this.context.verboseEnabled) {
        console.log(`✅ Persona reloaded: ${this.persona.name} (${personaName === 'default' ? 'default' : 'environment'})`);
      }
    } catch (error: any) {
      // Fallback to default
      this.persona = {
        name: 'default',
        version: '1.0',
        description: 'Default persona',
        system_prompt: 'You are a helpful coding assistant with access to tools.',
        temperature: 0.2
      };

      if (this.context.verboseEnabled) {
        console.log(`⚠️ Failed to reload persona, using fallback: ${error.message}`);
      }
    }
  }
}