import { HookType, HookConfig, HookContext, HookResult, isValidHookType } from './types';
import { HookExecutor } from './HookExecutor';
import fs from 'fs';
import path from 'path';

export class HookManager {
  private hooks: Map<HookType, HookConfig[]> = new Map();
  private executor: HookExecutor;
  private configPath: string;

  constructor(workingDirectory?: string) {
    this.executor = new HookExecutor();
    const cwd = workingDirectory || process.cwd();
    this.configPath = path.join(cwd, '.metis', 'hooks.json');
    this.loadHooks();
  }

  private loadHooks(): void {
    if (!fs.existsSync(this.configPath)) {
      return;
    }

    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      const config = JSON.parse(content);

      for (const [hookType, hookConfig] of Object.entries(config)) {
        if (isValidHookType(hookType)) {
          const configs = Array.isArray(hookConfig) ? hookConfig : [hookConfig];
          this.hooks.set(hookType, configs as HookConfig[]);
        }
      }
    } catch (error: any) {
      console.error(`Failed to load hooks: ${error.message}`);
    }
  }

  async executeHooks(
    hookType: HookType,
    context: HookContext
  ): Promise<HookResult> {
    const hooks = this.hooks.get(hookType);

    if (!hooks || hooks.length === 0) {
      return { success: true };
    }

    for (const hook of hooks) {
      const result = await this.executor.execute(hook, context);

      if (!result.success && hook.blocking) {
        return {
          success: false,
          error: result.error,
          blocked: true
        };
      }

      if (result.modifiedParams) {
        context.params = result.modifiedParams;
      }
    }

    return { success: true, modifiedParams: context.params };
  }

  hasHooks(hookType: HookType): boolean {
    return this.hooks.has(hookType) && this.hooks.get(hookType)!.length > 0;
  }

  getHooks(hookType?: HookType): Map<HookType, HookConfig[]> | HookConfig[] | undefined {
    if (hookType) {
      return this.hooks.get(hookType);
    }
    return this.hooks;
  }

  reload(): void {
    this.hooks.clear();
    this.loadHooks();
  }

  getConfigPath(): string {
    return this.configPath;
  }

  getStats(): {
    totalHooks: number;
    hookTypes: number;
    configExists: boolean;
  } {
    let totalHooks = 0;
    for (const configs of this.hooks.values()) {
      totalHooks += configs.length;
    }

    return {
      totalHooks,
      hookTypes: this.hooks.size,
      configExists: fs.existsSync(this.configPath)
    };
  }
}

let hookManager: HookManager | null = null;

export function getHookManager(workingDirectory?: string): HookManager {
  if (!hookManager) {
    hookManager = new HookManager(workingDirectory);
  }
  return hookManager;
}

export function resetHookManager(): void {
  hookManager = null;
}
