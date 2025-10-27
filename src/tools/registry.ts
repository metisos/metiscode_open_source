import { ToolDefinition, SafetyPolicy } from "../types/persona";
import { PermissionManager } from "../permissions/PermissionManager";
import { ErrorSuggestionEngine } from "../errors/ErrorSuggestions";
import { getHookManager } from "../hooks/HookManager";

export interface ToolHandler {
  execute(params: any, context: ExecutionContext): Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  content?: any;
  error?: string;
  metadata?: Record<string, any>;
}

export interface ExecutionContext {
  sessionId: string;
  workingDirectory: string;
  config: any;
  traceEnabled: boolean;
  verboseEnabled: boolean;
  permissionManager?: PermissionManager;
  clearProgress?: () => void;
}

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  register(tool: RegisteredTool) {
    this.tools.set(tool.name, tool);
    if (process.env.METIS_TRACE === 'true') {
      console.log(`Registered tool: ${tool.name}`);
    }
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  list(): string[] {
    return Array.from(this.tools.keys());
  }

  listByCategory(category?: string): RegisteredTool[] {
    const tools = Array.from(this.tools.values());
    if (!category) return tools;
    return tools.filter(t => t.metadata?.category === category);
  }

  async execute(
    toolName: string, 
    params: any, 
    context: ExecutionContext
  ): Promise<ToolResult> {
    const tool = this.get(toolName);
    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${toolName}`
      };
    }

    try {
      // Validate parameters against schema
      const validationResult = this.validateParams(tool, params);
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Parameter validation failed: ${validationResult.error}`
        };
      }

      // Check permission system first (new enhanced permissions)
      if (context.permissionManager) {
        // Clear any running progress indicators before showing approval prompts
        if (context.clearProgress) {
          context.clearProgress();
        }

        const permissionResult = await context.permissionManager.checkPermission(
          toolName,
          params,
          context
        );
        
        if (!permissionResult.allowed) {
          if (permissionResult.planOnly) {
            return {
              success: false,
              error: `Plan-only mode: ${toolName} operation planned but not executed`,
              metadata: { 
                planOnly: true,
                operation: toolName,
                params
              }
            };
          }
          return {
            success: false,
            error: permissionResult.reason || 'Permission denied'
          };
        }
      }

      // Check safety policies (legacy system for backwards compatibility)
      const safetyResult = await this.checkSafety(tool, params, context);
      if (!safetyResult.allowed) {
        return {
          success: false,
          error: `Safety check failed: ${safetyResult.reason}`
        };
      }

      if (context.traceEnabled) {
        console.log(`Executing tool: ${toolName} with params:`, params);
      }

      const hookManager = getHookManager(context.workingDirectory);

      if (hookManager.hasHooks('pre-tool')) {
        const hookResult = await hookManager.executeHooks('pre-tool', {
          hookType: 'pre-tool',
          toolName,
          params
        });

        if (hookResult.blocked) {
          return {
            success: false,
            error: `Operation blocked by pre-tool hook: ${hookResult.error}`
          };
        }

        if (hookResult.modifiedParams) {
          params = hookResult.modifiedParams;
        }
      }

      if (toolName === 'write_file' && hookManager.hasHooks('pre-write')) {
        const hookResult = await hookManager.executeHooks('pre-write', {
          hookType: 'pre-write',
          toolName,
          params,
          filePath: params.path || params.file_path,
          content: params.content
        });

        if (hookResult.blocked) {
          return {
            success: false,
            error: `Write blocked by hook: ${hookResult.error}`
          };
        }

        if (hookResult.modifiedParams) {
          params = hookResult.modifiedParams;
        }
      }

      if (toolName === 'bash' && hookManager.hasHooks('pre-bash')) {
        const hookResult = await hookManager.executeHooks('pre-bash', {
          hookType: 'pre-bash',
          toolName,
          params,
          command: params.command
        });

        if (hookResult.blocked) {
          return {
            success: false,
            error: `Bash command blocked by hook: ${hookResult.error}`
          };
        }

        if (hookResult.modifiedParams) {
          params = hookResult.modifiedParams;
        }
      }

      const startTime = Date.now();
      const result = await tool.handler.execute(params, context);
      const duration = Date.now() - startTime;

      if (hookManager.hasHooks('post-tool')) {
        await hookManager.executeHooks('post-tool', {
          hookType: 'post-tool',
          toolName,
          params,
          result
        });
      }

      if (toolName === 'write_file' && hookManager.hasHooks('post-write')) {
        await hookManager.executeHooks('post-write', {
          hookType: 'post-write',
          toolName,
          params,
          filePath: params.path || params.file_path,
          result
        });
      }

      if (toolName === 'bash' && hookManager.hasHooks('post-bash')) {
        await hookManager.executeHooks('post-bash', {
          hookType: 'post-bash',
          toolName,
          params,
          command: params.command,
          result
        });
      }

      if (context.traceEnabled) {
        console.log(`Tool ${toolName} completed in ${duration}ms:`, result.success ? 'success' : 'failed');
      }

      return {
        ...result,
        metadata: {
          ...result.metadata,
          duration,
          tool: toolName
        }
      };

    } catch (error: any) {
      const enhancedResult = ErrorSuggestionEngine.enhanceToolResult({
        success: false,
        error: error.message,
        metadata: {
          tool: toolName,
          stackTrace: error.stack
        }
      });
      
      return enhancedResult;
    }
  }

  private validateParams(tool: RegisteredTool, params: any): { valid: boolean; error?: string } {
    // Basic schema validation - would use proper JSON schema validator in production
    if (!tool.schema) return { valid: true };

    if (tool.schema.required) {
      for (const required of tool.schema.required) {
        if (!(required in params)) {
          return { valid: false, error: `Missing required parameter: ${required}` };
        }
      }
    }

    return { valid: true };
  }

  private async checkSafety(
    tool: RegisteredTool, 
    params: any, 
    context: ExecutionContext
  ): Promise<{ allowed: boolean; reason?: string }> {
    
    const safety = tool.safety;
    if (!safety) return { allowed: true };

    // Check CI restrictions
    if (process.env.CI && !safety.allowed_in_ci) {
      return { allowed: false, reason: "Tool not allowed in CI environment" };
    }

    // Check path restrictions
    if (safety.path_restrictions && params.path) {
      const path = params.path as string;
      for (const restriction of safety.path_restrictions) {
        if (restriction.startsWith('!') && path.includes(restriction.slice(1))) {
          return { allowed: false, reason: `Path restriction violated: ${restriction}` };
        }
      }
    }

    // Check approval requirements (simplified - just check auto-approve env var)
    if (safety.require_approval && process.env.METIS_AUTO_APPROVE !== 'true') {
      // In a real implementation, this would prompt the user
      if (process.env.CI) {
        return { allowed: false, reason: "Tool requires approval but running in CI" };
      }
      // For now, allow in interactive mode
    }

    return { allowed: true };
  }
}

export interface RegisteredTool extends ToolDefinition {
  handler: ToolHandler;
  metadata?: {
    category?: string;
    version?: string;
    author?: string;
  };
}

// Global registry instance
export const toolRegistry = new ToolRegistry();