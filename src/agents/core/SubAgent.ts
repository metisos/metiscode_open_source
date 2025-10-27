import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { toolRegistry } from '../../tools/registry';
import { AgentPersona } from '../personas/PersonaSystem';
import { SkillSet } from '../skills/SkillSet';
import { AgentContext } from './ContextManager';

export interface SubAgentConfig {
  id?: string;
  name: string;
  type: string;
  persona: string | AgentPersona;
  skills: string[] | SkillSet;
  context?: {
    isolated?: boolean;
    memoryLimit?: number;
    timeoutMs?: number;
  };
  provider?: {
    name: string;
    model: string;
    temperature?: number;
  };
  tools?: string[];
  maxTokens?: number;
}

export interface TaskRequest {
  id: string;
  task: string;
  params?: any;
  context?: any;
  workflow?: string;
  priority?: number;
}

export interface TaskResult {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
  metadata?: {
    duration: number;
    tokensUsed?: number;
    toolCalls?: number;
    memoryUsage?: number;
  };
}

export type AgentStatus = 'idle' | 'busy' | 'error' | 'terminated';

export class SubAgent extends EventEmitter {
  public readonly id: string;
  public readonly name: string;
  public readonly type: string;
  
  private persona: AgentPersona;
  private skills: SkillSet;
  private context: AgentContext;
  private status: AgentStatus = 'idle';
  private currentTask: TaskRequest | null = null;
  private config: SubAgentConfig;
  
  // Performance metrics
  private stats = {
    tasksCompleted: 0,
    totalDuration: 0,
    tokensUsed: 0,
    toolCalls: 0,
    errors: 0,
    createdAt: Date.now(),
    lastActive: Date.now()
  };

  constructor(config: SubAgentConfig) {
    super();
    
    this.id = config.id || uuidv4();
    this.name = config.name;
    this.type = config.type;
    this.config = config;
    
    // Initialize components (will be implemented in follow-up files)
    this.persona = this.initializePersona(config.persona);
    this.skills = this.initializeSkills(config.skills);
    this.context = this.initializeContext(config.context);
    
    this.emit('created', { id: this.id, name: this.name, type: this.type });
  }

  // Core execution method
  async execute(request: TaskRequest): Promise<TaskResult> {
    if (this.status === 'busy') {
      throw new Error(`Agent ${this.name} is already executing a task`);
    }
    
    if (this.status === 'terminated') {
      throw new Error(`Agent ${this.name} has been terminated`);
    }

    this.status = 'busy';
    this.currentTask = request;
    this.stats.lastActive = Date.now();
    
    const startTime = Date.now();
    
    try {
      this.emit('taskStarted', { agentId: this.id, taskId: request.id, task: request.task });
      
      // Apply persona context to the task
      const personalizedRequest = this.persona.processTask(request);
      
      // Execute the task with skills and tools
      const result = await this.executeTask(personalizedRequest);
      
      // Update statistics
      const duration = Date.now() - startTime;
      this.stats.tasksCompleted++;
      this.stats.totalDuration += duration;
      
      const taskResult: TaskResult = {
        id: request.id,
        success: true,
        result,
        metadata: {
          duration,
          tokensUsed: result.tokensUsed || 0,
          toolCalls: result.toolCalls || 0,
          memoryUsage: this.context.getMemoryUsage()
        }
      };
      
      this.stats.tokensUsed += taskResult.metadata!.tokensUsed!;
      this.stats.toolCalls += taskResult.metadata!.toolCalls!;
      
      this.status = 'idle';
      this.currentTask = null;
      
      this.emit('taskCompleted', { agentId: this.id, taskId: request.id, result: taskResult });
      
      return taskResult;
      
    } catch (error: any) {
      this.stats.errors++;
      this.status = 'error';
      this.currentTask = null;
      
      const errorResult: TaskResult = {
        id: request.id,
        success: false,
        error: error.message,
        metadata: {
          duration: Date.now() - startTime,
          memoryUsage: this.context.getMemoryUsage()
        }
      };
      
      this.emit('taskFailed', { agentId: this.id, taskId: request.id, error: error.message });
      
      return errorResult;
    }
  }

  // Task execution implementation
  private async executeTask(request: TaskRequest): Promise<any> {
    // Get available tools from skills
    const availableTools = this.skills.getTools();
    
    // Filter tools based on agent configuration
    const allowedTools = this.config.tools ? 
      availableTools.filter(tool => this.config.tools!.includes(tool.name)) :
      availableTools;
    
    // Create execution context with persona instructions
    const instructions = this.persona.getInstructions();
    const contextualPrompt = this.buildContextualPrompt(request, instructions);
    
    // Execute with AI provider (placeholder - will integrate with existing providers)
    const result = await this.callAIProvider({
      prompt: contextualPrompt,
      tools: allowedTools,
      maxTokens: this.config.maxTokens || 4000,
      temperature: this.config.provider?.temperature || 0.2
    });
    
    return result;
  }

  // Build contextual prompt with persona and task
  private buildContextualPrompt(request: TaskRequest, instructions: string): string {
    const contextInfo = this.context.getRelevantContext(request.task);
    
    return `
${instructions}

TASK: ${request.task}

${request.params ? `PARAMETERS: ${JSON.stringify(request.params, null, 2)}` : ''}

${contextInfo ? `CONTEXT: ${contextInfo}` : ''}

Please execute this task according to your persona and expertise. Use available tools as needed.
`;
  }

  // AI Provider integration (placeholder)
  private async callAIProvider(params: any): Promise<any> {
    // This will integrate with existing provider system
    // For now, return a placeholder result
    return {
      content: `Executed task: ${params.prompt.split('\n')[2]}`,
      tokensUsed: 100,
      toolCalls: 0
    };
  }

  // Initialize persona from config
  private initializePersona(personaConfig: string | AgentPersona): AgentPersona {
    if (typeof personaConfig === 'string') {
      // Load persona by name (will be implemented)
      return {
        name: personaConfig,
        traits: [],
        communicationStyle: 'professional',
        expertise: [],
        processTask: (task) => task,
        getInstructions: () => `You are a ${personaConfig} assistant.`
      } as AgentPersona;
    }
    return personaConfig;
  }

  // Initialize skills from config
  private initializeSkills(skillsConfig: string[] | SkillSet): SkillSet {
    if (Array.isArray(skillsConfig)) {
      // Create SkillSet from string array (will be implemented)
      return {
        skills: skillsConfig,
        getTools: () => [],
        canExecute: () => true,
        getCapabilities: () => skillsConfig
      } as SkillSet;
    }
    return skillsConfig;
  }

  // Initialize context from config
  private initializeContext(contextConfig?: any): AgentContext {
    return {
      id: this.id,
      isolated: contextConfig?.isolated ?? true,
      memoryLimit: contextConfig?.memoryLimit ?? 1024 * 1024, // 1MB default
      memory: new Map(),
      getRelevantContext: () => null,
      getMemoryUsage: () => 0,
      addToMemory: () => {},
      clearMemory: () => {}
    } as AgentContext;
  }

  // Agent control methods
  async pause(): Promise<void> {
    if (this.status === 'busy') {
      this.emit('paused', { agentId: this.id });
    }
  }

  async resume(): Promise<void> {
    if (this.status === 'idle' || this.status === 'error') {
      this.status = 'idle';
      this.emit('resumed', { agentId: this.id });
    }
  }

  async terminate(): Promise<void> {
    this.status = 'terminated';
    this.context.clearMemory();
    this.emit('terminated', { agentId: this.id, stats: this.stats });
  }

  // Getters for agent state
  getStatus(): AgentStatus {
    return this.status;
  }

  getCurrentTask(): TaskRequest | null {
    return this.currentTask;
  }

  getStats() {
    return {
      ...this.stats,
      averageTaskDuration: this.stats.tasksCompleted > 0 ? 
        this.stats.totalDuration / this.stats.tasksCompleted : 0,
      successRate: this.stats.tasksCompleted > 0 ? 
        ((this.stats.tasksCompleted - this.stats.errors) / this.stats.tasksCompleted) * 100 : 0,
      uptime: Date.now() - this.stats.createdAt
    };
  }

  getConfig(): SubAgentConfig {
    return { ...this.config };
  }

  getPersona(): AgentPersona {
    return this.persona;
  }

  getSkills(): SkillSet {
    return this.skills;
  }

  // Communication with other agents
  async sendMessage(targetAgentId: string, message: any): Promise<void> {
    this.emit('messageToAgent', {
      from: this.id,
      to: targetAgentId,
      message
    });
  }

  // Handle incoming messages from other agents
  handleMessage(fromAgentId: string, message: any): void {
    this.emit('messageReceived', {
      from: fromAgentId,
      to: this.id,
      message
    });
  }

  // Context sharing
  async shareContext(targetAgentId: string, contextKey: string): Promise<void> {
    if (this.context.isolated) {
      throw new Error('Cannot share context from isolated agent');
    }
    
    this.emit('shareContext', {
      from: this.id,
      to: targetAgentId,
      contextKey
    });
  }

  // Health check
  isHealthy(): boolean {
    return this.status !== 'terminated' && this.status !== 'error';
  }

  // Resource usage check
  getResourceUsage() {
    return {
      memoryUsage: this.context.getMemoryUsage(),
      memoryLimit: this.config.context?.memoryLimit || 1024 * 1024,
      uptime: Date.now() - this.stats.createdAt,
      taskLoad: this.status === 'busy' ? 1 : 0
    };
  }
}