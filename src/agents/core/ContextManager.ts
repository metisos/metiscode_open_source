import { EventEmitter } from 'events';

export interface AgentContext {
  id: string;
  isolated: boolean;
  memoryLimit: number;
  memory: Map<string, any>;
  getRelevantContext(task: string): string | null;
  getMemoryUsage(): number;
  addToMemory(key: string, value: any): void;
  clearMemory(): void;
}

export interface ContextShareRequest {
  fromAgentId: string;
  toAgentId: string;
  contextKey: string;
  permissions?: string[];
}

export class ContextManager extends EventEmitter {
  private contexts: Map<string, AgentContextImpl> = new Map();
  private sharedContexts: Map<string, any> = new Map();
  private sharePermissions: Map<string, Map<string, string[]>> = new Map();

  constructor() {
    super();
  }

  // Create isolated context for an agent
  createContext(agentId: string, config?: {
    isolated?: boolean;
    memoryLimit?: number;
  }): AgentContext {
    const context = new AgentContextImpl(
      agentId,
      config?.isolated ?? true,
      config?.memoryLimit ?? 1024 * 1024,
      this
    );

    this.contexts.set(agentId, context);
    this.emit('contextCreated', { agentId, isolated: context.isolated });

    return context;
  }

  // Remove agent context
  removeContext(agentId: string): void {
    const context = this.contexts.get(agentId);
    if (context) {
      context.clearMemory();
      this.contexts.delete(agentId);
      this.sharePermissions.delete(agentId);
      this.emit('contextRemoved', { agentId });
    }
  }

  // Get context for an agent
  getContext(agentId: string): AgentContext | null {
    return this.contexts.get(agentId) || null;
  }

  // Share context between agents
  shareContext(request: ContextShareRequest): boolean {
    const fromContext = this.contexts.get(request.fromAgentId);
    const toContext = this.contexts.get(request.toAgentId);

    if (!fromContext || !toContext) {
      return false;
    }

    // Check if source context allows sharing
    if (fromContext.isolated) {
      this.emit('contextShareDenied', { 
        reason: 'Source context is isolated',
        request 
      });
      return false;
    }

    // Check permissions
    if (!this.hasSharePermission(request.fromAgentId, request.toAgentId, request.contextKey)) {
      this.emit('contextShareDenied', { 
        reason: 'Insufficient permissions',
        request 
      });
      return false;
    }

    // Get the context value
    const contextValue = fromContext.memory.get(request.contextKey);
    if (contextValue === undefined) {
      this.emit('contextShareDenied', { 
        reason: 'Context key not found',
        request 
      });
      return false;
    }

    // Share the context
    toContext.addToMemory(`shared:${request.fromAgentId}:${request.contextKey}`, contextValue);
    
    this.emit('contextShared', {
      from: request.fromAgentId,
      to: request.toAgentId,
      key: request.contextKey,
      size: JSON.stringify(contextValue).length
    });

    return true;
  }

  // Set sharing permissions
  setSharePermission(fromAgentId: string, toAgentId: string, permissions: string[]): void {
    if (!this.sharePermissions.has(fromAgentId)) {
      this.sharePermissions.set(fromAgentId, new Map());
    }
    
    this.sharePermissions.get(fromAgentId)!.set(toAgentId, permissions);
    
    this.emit('permissionsUpdated', {
      from: fromAgentId,
      to: toAgentId,
      permissions
    });
  }

  // Check sharing permissions
  private hasSharePermission(fromAgentId: string, toAgentId: string, contextKey: string): boolean {
    const agentPermissions = this.sharePermissions.get(fromAgentId);
    if (!agentPermissions) {
      return false;
    }

    const permissions = agentPermissions.get(toAgentId);
    if (!permissions) {
      return false;
    }

    return permissions.includes('*') || permissions.includes(contextKey);
  }

  // Get global shared context (non-isolated)
  getSharedContext(key: string): any {
    return this.sharedContexts.get(key);
  }

  // Set global shared context
  setSharedContext(key: string, value: any): void {
    this.sharedContexts.set(key, value);
    this.emit('sharedContextUpdated', { key, size: JSON.stringify(value).length });
  }

  // Clean up contexts with memory pressure
  cleanup(options?: { 
    maxAge?: number;
    maxMemoryUsage?: number;
  }): void {
    const maxAge = options?.maxAge || 24 * 60 * 60 * 1000; // 24 hours
    const maxMemory = options?.maxMemoryUsage || 10 * 1024 * 1024; // 10MB

    const now = Date.now();
    let totalMemory = 0;

    for (const [agentId, context] of this.contexts) {
      const memoryUsage = context.getMemoryUsage();
      totalMemory += memoryUsage;

      // Remove old contexts
      if (context.lastAccessed && (now - context.lastAccessed > maxAge)) {
        this.removeContext(agentId);
        continue;
      }

      // Clean up large contexts
      if (memoryUsage > context.memoryLimit * 0.8) {
        context.compactMemory();
      }
    }

    // Global memory pressure cleanup
    if (totalMemory > maxMemory) {
      this.performGlobalCleanup();
    }

    this.emit('cleanupCompleted', {
      totalMemory,
      activeContexts: this.contexts.size,
      removedContexts: 0
    });
  }

  // Perform aggressive cleanup when memory pressure is high
  private performGlobalCleanup(): void {
    const contexts = Array.from(this.contexts.entries())
      .sort(([, a], [, b]) => (a.lastAccessed || 0) - (b.lastAccessed || 0));

    // Remove least recently used contexts
    const removeCount = Math.floor(contexts.length * 0.2);
    for (let i = 0; i < removeCount; i++) {
      const [agentId] = contexts[i];
      this.removeContext(agentId);
    }
  }

  // Get statistics
  getStats() {
    let totalMemory = 0;
    let totalKeys = 0;
    
    for (const context of this.contexts.values()) {
      totalMemory += context.getMemoryUsage();
      totalKeys += context.memory.size;
    }

    return {
      activeContexts: this.contexts.size,
      totalMemory,
      totalKeys,
      sharedContexts: this.sharedContexts.size,
      sharePermissions: this.sharePermissions.size
    };
  }
}

// Implementation of AgentContext
class AgentContextImpl implements AgentContext {
  public readonly id: string;
  public readonly isolated: boolean;
  public readonly memoryLimit: number;
  public readonly memory: Map<string, any> = new Map();
  public lastAccessed: number = Date.now();

  private manager: ContextManager;

  constructor(
    id: string, 
    isolated: boolean, 
    memoryLimit: number,
    manager: ContextManager
  ) {
    this.id = id;
    this.isolated = isolated;
    this.memoryLimit = memoryLimit;
    this.manager = manager;
  }

  getRelevantContext(task: string): string | null {
    this.lastAccessed = Date.now();
    
    // Search for relevant context based on task keywords
    const taskLower = task.toLowerCase();
    const relevantEntries: string[] = [];
    
    for (const [key, value] of this.memory) {
      if (key.toLowerCase().includes(taskLower) || 
          JSON.stringify(value).toLowerCase().includes(taskLower)) {
        relevantEntries.push(`${key}: ${JSON.stringify(value)}`);
      }
    }
    
    if (relevantEntries.length === 0) {
      return null;
    }
    
    return relevantEntries.join('\n');
  }

  getMemoryUsage(): number {
    let total = 0;
    for (const [key, value] of this.memory) {
      total += key.length + JSON.stringify(value).length;
    }
    return total;
  }

  addToMemory(key: string, value: any): void {
    this.lastAccessed = Date.now();
    
    // Check memory limits
    const newSize = key.length + JSON.stringify(value).length;
    if (this.getMemoryUsage() + newSize > this.memoryLimit) {
      this.compactMemory();
      
      // If still over limit, reject the addition
      if (this.getMemoryUsage() + newSize > this.memoryLimit) {
        throw new Error(`Memory limit exceeded for agent ${this.id}`);
      }
    }
    
    this.memory.set(key, value);
    
    this.manager.emit('memoryUpdated', {
      agentId: this.id,
      key,
      size: newSize,
      totalSize: this.getMemoryUsage()
    });
  }

  clearMemory(): void {
    const size = this.getMemoryUsage();
    this.memory.clear();
    
    this.manager.emit('memoryCleared', {
      agentId: this.id,
      clearedSize: size
    });
  }

  // Remove least recently used items to free memory
  compactMemory(): void {
    const entries = Array.from(this.memory.entries());
    const sortedEntries = entries.sort((a, b) => {
      // Simple LRU based on key names (could be improved with actual access tracking)
      return a[0].localeCompare(b[0]);
    });

    // Remove oldest 25% of entries
    const removeCount = Math.floor(sortedEntries.length * 0.25);
    for (let i = 0; i < removeCount; i++) {
      this.memory.delete(sortedEntries[i][0]);
    }

    this.manager.emit('memoryCompacted', {
      agentId: this.id,
      removedItems: removeCount,
      newSize: this.getMemoryUsage()
    });
  }
}