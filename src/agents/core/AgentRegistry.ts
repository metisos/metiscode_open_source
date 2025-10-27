import { EventEmitter } from 'events';
import { SubAgent, SubAgentConfig, TaskRequest, TaskResult, AgentStatus } from './SubAgent';
import { ContextManager } from './ContextManager';
import { PersonaSystem } from '../personas/PersonaSystem';
import { SkillManager } from '../skills/SkillSet';

export interface AgentTemplate {
  name: string;
  description: string;
  type: string;
  persona: string;
  skills: string[];
  defaultConfig?: Partial<SubAgentConfig>;
}

export interface AgentStats {
  totalAgents: number;
  activeAgents: number;
  busyAgents: number;
  errorAgents: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageTaskDuration: number;
}

export class AgentRegistry extends EventEmitter {
  private static instance: AgentRegistry | null = null;
  
  private agents: Map<string, SubAgent> = new Map();
  private templates: Map<string, AgentTemplate> = new Map();
  private contextManager: ContextManager;
  private resourceLimits = {
    maxAgents: 10,
    maxMemoryPerAgent: 1024 * 1024, // 1MB
    maxTotalMemory: 10 * 1024 * 1024, // 10MB
    maxConcurrentTasks: 5
  };

  private constructor() {
    super();
    this.contextManager = new ContextManager();
    this.initializeDefaultTemplates();
    this.setupCleanupScheduler();
  }

  // Singleton pattern
  static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry();
    }
    return AgentRegistry.instance;
  }

  // Initialize default agent templates
  private initializeDefaultTemplates(): void {
    const defaultTemplates: AgentTemplate[] = [
      {
        name: 'developer',
        description: 'A pragmatic software developer focused on implementation',
        type: 'developer',
        persona: 'developer',
        skills: ['typescript', 'javascript', 'node-js', 'react', 'file-operations', 'git-basics', 'testing']
      },
      {
        name: 'reviewer',
        description: 'A meticulous code reviewer focused on quality assurance',
        type: 'reviewer', 
        persona: 'reviewer',
        skills: ['code-review', 'typescript', 'javascript', 'file-operations', 'git-basics', 'testing']
      },
      {
        name: 'devops',
        description: 'A systems-focused DevOps engineer',
        type: 'devops',
        persona: 'devops', 
        skills: ['docker', 'ci-cd', 'file-operations', 'git-basics', 'debugging']
      },
      {
        name: 'documentation',
        description: 'A technical writer focused on documentation',
        type: 'documentation',
        persona: 'developer', // Use developer persona as base
        skills: ['technical-writing', 'file-operations', 'git-basics']
      },
      {
        name: 'debugging-specialist',
        description: 'A problem-solving specialist for debugging',
        type: 'debugging',
        persona: 'developer',
        skills: ['debugging', 'typescript', 'javascript', 'file-operations', 'git-basics', 'testing']
      }
    ];

    for (const template of defaultTemplates) {
      this.templates.set(template.name, template);
    }
  }

  // Create agent from template
  async createFromTemplate(templateName: string, config?: Partial<SubAgentConfig>): Promise<SubAgent> {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Unknown agent template: ${templateName}`);
    }

    const agentConfig: SubAgentConfig = {
      name: config?.name || `${template.name}-${Date.now()}`,
      type: template.type,
      persona: template.persona,
      skills: template.skills,
      context: { isolated: true, ...config?.context },
      ...template.defaultConfig,
      ...config
    };

    return this.create(agentConfig);
  }

  // Create new agent
  async create(config: SubAgentConfig): Promise<SubAgent> {
    // Check resource limits
    if (this.agents.size >= this.resourceLimits.maxAgents) {
      throw new Error(`Maximum number of agents (${this.resourceLimits.maxAgents}) reached`);
    }

    // Validate persona exists
    const persona = PersonaSystem.getPersona(config.persona as string);
    if (!persona && typeof config.persona === 'string') {
      throw new Error(`Unknown persona: ${config.persona}`);
    }

    // Validate skills
    const skillNames = Array.isArray(config.skills) ? config.skills : [];
    const skillErrors = SkillManager.validateSkillDependencies(skillNames);
    if (skillErrors.length > 0) {
      throw new Error(`Skill validation errors: ${skillErrors.join(', ')}`);
    }

    // Create agent
    const agent = new SubAgent(config);
    
    // Create isolated context
    const context = this.contextManager.createContext(agent.id, config.context);
    
    // Set up event listeners
    this.setupAgentEventListeners(agent);
    
    // Register agent
    this.agents.set(agent.id, agent);
    
    this.emit('agentCreated', {
      id: agent.id,
      name: agent.name,
      type: agent.type,
      config: agent.getConfig()
    });

    return agent;
  }

  // Get agent by ID
  get(agentId: string): SubAgent | null {
    return this.agents.get(agentId) || null;
  }

  // Get agent by name
  getByName(name: string): SubAgent | null {
    for (const agent of this.agents.values()) {
      if (agent.name === name) {
        return agent;
      }
    }
    return null;
  }

  // List all agents
  list(): SubAgent[] {
    return Array.from(this.agents.values());
  }

  // List agents by status
  listByStatus(status: AgentStatus): SubAgent[] {
    return this.list().filter(agent => agent.getStatus() === status);
  }

  // List agents by type
  listByType(type: string): SubAgent[] {
    return this.list().filter(agent => agent.type === type);
  }

  // Remove agent
  async remove(agentId: string): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return false;
    }

    // Terminate agent
    await agent.terminate();
    
    // Remove context
    this.contextManager.removeContext(agentId);
    
    // Remove from registry
    this.agents.delete(agentId);
    
    this.emit('agentRemoved', {
      id: agentId,
      name: agent.name,
      stats: agent.getStats()
    });

    return true;
  }

  // Execute task with specific agent
  async executeTask(agentId: string, request: TaskRequest): Promise<TaskResult> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    return agent.execute(request);
  }

  // Find best agent for task
  findBestAgent(task: string, type?: string): SubAgent | null {
    let candidates = this.listByStatus('idle');
    
    // Filter by type if specified
    if (type) {
      candidates = candidates.filter(agent => agent.type === type);
    }

    if (candidates.length === 0) {
      return null;
    }

    // Simple selection based on success rate and load
    candidates.sort((a, b) => {
      const aStats = a.getStats();
      const bStats = b.getStats();
      
      // Prefer agents with higher success rates
      const aSuccessRate = aStats.successRate;
      const bSuccessRate = bStats.successRate;
      
      if (aSuccessRate !== bSuccessRate) {
        return bSuccessRate - aSuccessRate;
      }
      
      // If equal success rates, prefer less loaded agents
      return aStats.tasksCompleted - bStats.tasksCompleted;
    });

    return candidates[0];
  }

  // Auto-delegate task to best available agent
  async delegateTask(request: TaskRequest, agentType?: string): Promise<TaskResult> {
    const agent = this.findBestAgent(request.task, agentType);
    if (!agent) {
      throw new Error(`No available agent found for task type: ${agentType || 'any'}`);
    }

    return agent.execute(request);
  }

  // Set up event listeners for agent
  private setupAgentEventListeners(agent: SubAgent): void {
    agent.on('taskStarted', (data) => {
      this.emit('taskStarted', data);
    });

    agent.on('taskCompleted', (data) => {
      this.emit('taskCompleted', data);
    });

    agent.on('taskFailed', (data) => {
      this.emit('taskFailed', data);
    });

    agent.on('messageToAgent', (data) => {
      // Route message to target agent
      const targetAgent = this.agents.get(data.to);
      if (targetAgent) {
        targetAgent.handleMessage(data.from, data.message);
      }
    });

    agent.on('shareContext', (data) => {
      // Handle context sharing request
      this.contextManager.shareContext({
        fromAgentId: data.from,
        toAgentId: data.to,
        contextKey: data.contextKey
      });
    });
  }

  // Get registry statistics
  getStats(): AgentStats {
    const agents = this.list();
    const totalTasks = agents.reduce((sum, agent) => sum + agent.getStats().tasksCompleted, 0);
    const failedTasks = agents.reduce((sum, agent) => sum + agent.getStats().errors, 0);
    const totalDuration = agents.reduce((sum, agent) => sum + agent.getStats().totalDuration, 0);

    return {
      totalAgents: agents.length,
      activeAgents: this.listByStatus('idle').length + this.listByStatus('busy').length,
      busyAgents: this.listByStatus('busy').length,
      errorAgents: this.listByStatus('error').length,
      totalTasks,
      completedTasks: totalTasks - failedTasks,
      failedTasks,
      averageTaskDuration: totalTasks > 0 ? totalDuration / totalTasks : 0
    };
  }

  // Get resource usage
  getResourceUsage() {
    const agents = this.list();
    let totalMemory = 0;
    let activeTasks = 0;

    for (const agent of agents) {
      const usage = agent.getResourceUsage();
      totalMemory += usage.memoryUsage;
      activeTasks += usage.taskLoad;
    }

    return {
      totalMemory,
      maxTotalMemory: this.resourceLimits.maxTotalMemory,
      memoryUtilization: (totalMemory / this.resourceLimits.maxTotalMemory) * 100,
      activeTasks,
      maxConcurrentTasks: this.resourceLimits.maxConcurrentTasks,
      taskUtilization: (activeTasks / this.resourceLimits.maxConcurrentTasks) * 100,
      agentCount: agents.length,
      maxAgents: this.resourceLimits.maxAgents
    };
  }

  // Template management
  registerTemplate(template: AgentTemplate): void {
    this.templates.set(template.name, template);
    this.emit('templateRegistered', template);
  }

  getTemplate(name: string): AgentTemplate | null {
    return this.templates.get(name) || null;
  }

  listTemplates(): AgentTemplate[] {
    return Array.from(this.templates.values());
  }

  // Configuration
  setResourceLimits(limits: Partial<typeof this.resourceLimits>): void {
    this.resourceLimits = { ...this.resourceLimits, ...limits };
    this.emit('resourceLimitsUpdated', this.resourceLimits);
  }

  getResourceLimits() {
    return { ...this.resourceLimits };
  }

  // Cleanup and maintenance
  async cleanup(options?: {
    removeIdleAgents?: boolean;
    maxIdleTime?: number;
    removeErrorAgents?: boolean;
  }): Promise<number> {
    const maxIdleTime = options?.maxIdleTime || 30 * 60 * 1000; // 30 minutes
    const now = Date.now();
    let removedCount = 0;

    const agentsToRemove: string[] = [];

    for (const [id, agent] of this.agents) {
      const stats = agent.getStats();
      const idleTime = now - stats.lastActive;

      // Remove idle agents
      if (options?.removeIdleAgents && 
          agent.getStatus() === 'idle' && 
          idleTime > maxIdleTime) {
        agentsToRemove.push(id);
      }

      // Remove error agents
      if (options?.removeErrorAgents && agent.getStatus() === 'error') {
        agentsToRemove.push(id);
      }
    }

    // Remove identified agents
    for (const agentId of agentsToRemove) {
      await this.remove(agentId);
      removedCount++;
    }

    // Cleanup contexts
    this.contextManager.cleanup();

    this.emit('cleanupCompleted', {
      removedAgents: removedCount,
      remainingAgents: this.agents.size
    });

    return removedCount;
  }

  // Set up periodic cleanup
  private setupCleanupScheduler(): void {
    // Cleanup every 15 minutes
    setInterval(() => {
      this.cleanup({
        removeIdleAgents: true,
        maxIdleTime: 30 * 60 * 1000, // 30 minutes
        removeErrorAgents: false // Keep error agents for debugging
      });
    }, 15 * 60 * 1000);
  }

  // Shutdown all agents
  async shutdown(): Promise<void> {
    const agents = Array.from(this.agents.keys());
    
    await Promise.all(
      agents.map(agentId => this.remove(agentId))
    );

    this.emit('registryShutdown');
  }

  // Health check
  async healthCheck(): Promise<{
    healthy: boolean;
    issues: string[];
    stats: AgentStats;
    resourceUsage: any;
  }> {
    const stats = this.getStats();
    const resourceUsage = this.getResourceUsage();
    const issues: string[] = [];

    // Check for issues
    if (stats.errorAgents > 0) {
      issues.push(`${stats.errorAgents} agents in error state`);
    }

    if (resourceUsage.memoryUtilization > 80) {
      issues.push('High memory usage');
    }

    if (resourceUsage.taskUtilization > 90) {
      issues.push('High task load');
    }

    // Check agent health
    for (const agent of this.list()) {
      if (!agent.isHealthy()) {
        issues.push(`Agent ${agent.name} is unhealthy`);
      }
    }

    return {
      healthy: issues.length === 0,
      issues,
      stats,
      resourceUsage
    };
  }
}

// Export singleton instance
export const agentRegistry = AgentRegistry.getInstance();