export enum PermissionMode {
  NORMAL = 'normal',
  AUTO_ACCEPT = 'auto_accept', 
  PLAN_ONLY = 'plan_only'
}

export interface PermissionModeConfig {
  mode: PermissionMode;
  description: string;
  icon: string;
  allowExecution: boolean;
  requireApproval: boolean;
}

export const PERMISSION_MODE_CONFIGS: Record<PermissionMode, PermissionModeConfig> = {
  [PermissionMode.NORMAL]: {
    mode: PermissionMode.NORMAL,
    description: 'Normal mode - Ask for approval on sensitive operations',
    icon: '🔒',
    allowExecution: true,
    requireApproval: true
  },
  [PermissionMode.AUTO_ACCEPT]: {
    mode: PermissionMode.AUTO_ACCEPT,
    description: 'Auto-accept - Execute operations without asking',
    icon: '🚀',
    allowExecution: true,
    requireApproval: false
  },
  [PermissionMode.PLAN_ONLY]: {
    mode: PermissionMode.PLAN_ONLY,
    description: 'Plan only - Show what would be done but don\'t execute',
    icon: '📋',
    allowExecution: false,
    requireApproval: false
  }
};

export class PermissionModeManager {
  private currentMode: PermissionMode = PermissionMode.NORMAL;
  private onModeChange?: (mode: PermissionMode) => void;

  constructor(initialMode?: PermissionMode) {
    // Auto-detect headless mode and set appropriate default
    const isHeadless = this.isHeadlessEnvironment();

    if (initialMode !== undefined) {
      this.currentMode = initialMode;
    } else if (isHeadless) {
      // In headless mode, default to AUTO_ACCEPT to prevent blocking
      this.currentMode = PermissionMode.AUTO_ACCEPT;
      if (process.env.METIS_VERBOSE === 'true') {
        console.log('[Headless] Auto-detected headless environment, using AUTO_ACCEPT mode');
      }
    } else {
      this.currentMode = PermissionMode.NORMAL;
    }
  }

  /**
   * Detect if running in a headless/non-interactive environment
   */
  private isHeadlessEnvironment(): boolean {
    return (
      process.env.METIS_HEADLESS === 'true' ||
      process.env.CI === 'true' ||
      process.env.METIS_AUTO_ACCEPT === 'true' ||
      !process.stdin.isTTY ||
      !process.stdout.isTTY
    );
  }

  getCurrentMode(): PermissionMode {
    return this.currentMode;
  }

  getCurrentConfig(): PermissionModeConfig {
    return PERMISSION_MODE_CONFIGS[this.currentMode];
  }

  setMode(mode: PermissionMode): void {
    if (this.currentMode !== mode) {
      this.currentMode = mode;
      this.onModeChange?.(mode);
    }
  }

  cycleMode(): PermissionMode {
    const modes = Object.values(PermissionMode);
    const currentIndex = modes.indexOf(this.currentMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    const nextMode = modes[nextIndex];
    
    this.setMode(nextMode);
    return nextMode;
  }

  onModeChanged(callback: (mode: PermissionMode) => void): void {
    this.onModeChange = callback;
  }

  canExecute(): boolean {
    return this.getCurrentConfig().allowExecution;
  }

  shouldRequestApproval(): boolean {
    return this.getCurrentConfig().requireApproval;
  }

  getModeDisplay(): string {
    const config = this.getCurrentConfig();
    return `${config.icon} ${config.mode.toUpperCase()}`;
  }

  getModeDescription(): string {
    return this.getCurrentConfig().description;
  }
}