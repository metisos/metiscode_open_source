import { PermissionMode, PermissionModeManager } from './PermissionModes';
import { ApprovalGate, ApprovalRequest, ApprovalResult } from './ApprovalGates';
import { ExecutionContext } from '../tools/registry';
import { PreviewGenerator } from './PreviewGenerator';
import { getSessionPersistence } from '../runtime/sessionPersistence';
import kleur from 'kleur';
import * as readline from 'readline';

export interface PermissionPolicy {
  toolName: string;
  requiresApproval: boolean;
  allowedModes: PermissionMode[];
  riskLevel: 'low' | 'medium' | 'high';
}

export class PermissionManager {
  private modeManager: PermissionModeManager;
  private approvalGate: ApprovalGate;
  private policies = new Map<string, PermissionPolicy>();
  private sessionApprovals = new Set<string>(); // Track approved tool types for session
  
  constructor(initialMode: PermissionMode = PermissionMode.NORMAL, readlineInterface?: readline.Interface) {
    this.modeManager = new PermissionModeManager(initialMode);
    this.approvalGate = new ApprovalGate(this.modeManager, readlineInterface);
    this.initializeDefaultPolicies();

    // Only restore session state if not in headless mode (headless takes precedence)
    const isHeadless = initialMode === PermissionMode.AUTO_ACCEPT;
    if (!isHeadless) {
      this.restoreSessionState();
    }
  }

  private initializeDefaultPolicies(): void {
    // File operations - medium risk
    this.addPolicy({
      toolName: 'write_file',
      requiresApproval: true,
      allowedModes: [PermissionMode.NORMAL, PermissionMode.AUTO_ACCEPT, PermissionMode.PLAN_ONLY],
      riskLevel: 'medium'
    });

    this.addPolicy({
      toolName: 'edit_file',
      requiresApproval: true,
      allowedModes: [PermissionMode.NORMAL, PermissionMode.AUTO_ACCEPT, PermissionMode.PLAN_ONLY],
      riskLevel: 'medium'
    });

    this.addPolicy({
      toolName: 'move_file',
      requiresApproval: true,
      allowedModes: [PermissionMode.NORMAL, PermissionMode.AUTO_ACCEPT, PermissionMode.PLAN_ONLY],
      riskLevel: 'high'
    });

    // Git operations - medium to high risk
    this.addPolicy({
      toolName: 'git_commit',
      requiresApproval: true,
      allowedModes: [PermissionMode.NORMAL, PermissionMode.AUTO_ACCEPT, PermissionMode.PLAN_ONLY],
      riskLevel: 'medium'
    });

    this.addPolicy({
      toolName: 'git_add',
      requiresApproval: false,
      allowedModes: [PermissionMode.NORMAL, PermissionMode.AUTO_ACCEPT, PermissionMode.PLAN_ONLY],
      riskLevel: 'low'
    });

    // Shell operations - high risk
    this.addPolicy({
      toolName: 'bash',
      requiresApproval: true,
      allowedModes: [PermissionMode.NORMAL, PermissionMode.AUTO_ACCEPT, PermissionMode.PLAN_ONLY],
      riskLevel: 'high'
    });

    // Read operations - low risk
    this.addPolicy({
      toolName: 'read_file',
      requiresApproval: false,
      allowedModes: [PermissionMode.NORMAL, PermissionMode.AUTO_ACCEPT, PermissionMode.PLAN_ONLY],
      riskLevel: 'low'
    });

    this.addPolicy({
      toolName: 'list_files',
      requiresApproval: false,
      allowedModes: [PermissionMode.NORMAL, PermissionMode.AUTO_ACCEPT, PermissionMode.PLAN_ONLY],
      riskLevel: 'low'
    });

    this.addPolicy({
      toolName: 'git_status',
      requiresApproval: false,
      allowedModes: [PermissionMode.NORMAL, PermissionMode.AUTO_ACCEPT, PermissionMode.PLAN_ONLY],
      riskLevel: 'low'
    });
  }

  addPolicy(policy: PermissionPolicy): void {
    this.policies.set(policy.toolName, policy);
  }

  getPolicy(toolName: string): PermissionPolicy | undefined {
    return this.policies.get(toolName);
  }

  getCurrentMode(): PermissionMode {
    return this.modeManager.getCurrentMode();
  }


  cycleMode(): PermissionMode {
    const newMode = this.modeManager.cycleMode();
    this.saveSessionState();
    return newMode;
  }

  getModeDisplay(): string {
    return this.modeManager.getModeDisplay();
  }

  getModeDescription(): string {
    return this.modeManager.getModeDescription();
  }

  async checkPermission(
    toolName: string,
    params: any,
    context: ExecutionContext
  ): Promise<{ allowed: boolean; reason?: string; planOnly?: boolean }> {
    
    const policy = this.getPolicy(toolName);
    const currentMode = this.getCurrentMode();
    
    // If no policy exists, allow by default (for backwards compatibility)
    if (!policy) {
      return { allowed: true };
    }

    // Check if current mode is allowed for this tool
    if (!policy.allowedModes.includes(currentMode)) {
      return { 
        allowed: false, 
        reason: `Tool ${toolName} not allowed in ${currentMode} mode` 
      };
    }

    // In plan-only mode, show what would be done but don't execute
    if (currentMode === PermissionMode.PLAN_ONLY) {
      return { allowed: false, planOnly: true };
    }

    // Auto-accept mode skips approval
    if (currentMode === PermissionMode.AUTO_ACCEPT) {
      return { allowed: true };
    }

    // Normal mode - check if approval is needed
    if (!policy.requiresApproval) {
      return { allowed: true };
    }

    // Check if this tool type was approved for the session
    if (this.isApprovedForSession(toolName, policy)) {
      return { allowed: true };
    }

    // Generate code preview for the operation
    const preview = PreviewGenerator.generateBatchPreview(
      toolName,
      params,
      context.workingDirectory
    );

    // Request approval
    const approvalRequest: ApprovalRequest = {
      operation: `Execute ${toolName}`,
      description: this.getToolDescription(toolName, params),
      risk: policy.riskLevel,
      details: this.formatToolParams(params),
      files: this.extractFileList(toolName, params),
      preview,
      toolParams: params
    };

    const result = await this.approvalGate.requestApproval(approvalRequest);
    
    // Handle session approval
    if (result.approved && result.approveForSession) {
      this.addSessionApproval(toolName, policy);
    }
    
    // Handle mode changes from approval prompt
    if (result.newMode) {
      this.setMode(result.newMode);
    }

    return { 
      allowed: result.approved, 
      reason: result.reason,
      planOnly: result.newMode === PermissionMode.PLAN_ONLY
    };
  }

  private getToolDescription(toolName: string, params: any): string {
    switch (toolName) {
      case 'write_file':
        return `Write content to ${params.path || 'file'}`;
      case 'edit_file':
        return `Edit file ${params.path || 'unknown'}`;
      case 'move_file':
        return `Move ${params.from || 'file'} to ${params.to || 'destination'}`;
      case 'bash':
        return `Execute shell command: ${params.command || 'unknown command'}`;
      case 'git_commit':
        return `Commit changes with message: ${params.message || 'no message'}`;
      case 'git_add':
        return `Stage files for commit: ${params.files?.join(', ') || 'all changes'}`;
      default:
        return `Execute ${toolName} operation`;
    }
  }

  private formatToolParams(params: any): string {
    const formatted = Object.entries(params)
      .filter(([key, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join(', ');
    
    return formatted || 'No parameters';
  }

  private extractFileList(toolName: string, params: any): string[] {
    const files: string[] = [];
    
    if (params.path) files.push(params.path);
    if (params.from) files.push(params.from);
    if (params.to) files.push(params.to);
    if (params.files && Array.isArray(params.files)) files.push(...params.files);
    
    return files;
  }

  private isApprovedForSession(toolName: string, policy: PermissionPolicy): boolean {
    // Check specific tool approval
    if (this.sessionApprovals.has(`tool:${toolName}`)) {
      return true;
    }

    // Check category-based approvals
    const categoryApprovals = [
      // File operations
      ['write_file', 'edit_file', 'append_to_file', 'move_file'].includes(toolName) 
        ? `category:file_operations:${policy.riskLevel}` : null,
      
      // Git operations  
      toolName.startsWith('git_') 
        ? `category:git_operations:${policy.riskLevel}` : null,
        
      // Multi-file operations
      ['multi_file_replace', 'rename_symbol', 'organize_imports'].includes(toolName)
        ? `category:multi_file_operations:${policy.riskLevel}` : null
    ].filter(Boolean);

    // Check if any category approval matches
    return categoryApprovals.some(key => key && this.sessionApprovals.has(key));
  }


  getSessionApprovals(): string[] {
    return Array.from(this.sessionApprovals);
  }


  hasSessionApprovals(): boolean {
    return this.sessionApprovals.size > 0;
  }

  onModeChanged(callback: (mode: PermissionMode) => void): void {
    this.modeManager.onModeChanged(callback);
  }

  // Restore session state from persistence
  private restoreSessionState(): void {
    try {
      const persistence = getSessionPersistence();
      const state = persistence.getPermissionState();
      
      // Restore permission mode
      if (state.mode && Object.values(PermissionMode).includes(state.mode as PermissionMode)) {
        this.setMode(state.mode as PermissionMode);
      }
      
      // Restore session approvals
      if (state.sessionApprovals && Array.isArray(state.sessionApprovals)) {
        this.sessionApprovals = new Set(state.sessionApprovals);
        if (this.sessionApprovals.size > 0) {
          console.log(kleur.blue(`🔄 Restored ${this.sessionApprovals.size} session approvals from previous session`));
        }
      }
    } catch (error) {
      console.warn('Failed to restore session state:', error.message);
    }
  }

  // Save current state to persistence
  private saveSessionState(): void {
    try {
      const persistence = getSessionPersistence();
      persistence.savePermissionState(
        this.getCurrentMode(),
        Array.from(this.sessionApprovals)
      );
    } catch (error) {
      console.warn('Failed to save session state:', error.message);
    }
  }

  // Override setMode to save state
  setMode(mode: PermissionMode): void {
    this.modeManager.setMode(mode);
    this.saveSessionState();
  }

  // Override addSessionApproval to save state
  private addSessionApproval(toolName: string, policy: PermissionPolicy): void {
    // Add multiple approval patterns
    this.sessionApprovals.add(`tool:${toolName}`);
    
    // For file operations, approve all file operations of same risk level
    if (['write_file', 'edit_file', 'append_to_file', 'move_file'].includes(toolName)) {
      this.sessionApprovals.add(`category:file_operations:${policy.riskLevel}`);
    }
    
    // For git operations, approve all git operations of same risk level  
    if (toolName.startsWith('git_')) {
      this.sessionApprovals.add(`category:git_operations:${policy.riskLevel}`);
    }

    // For multi-file operations, approve similar batch operations
    if (['multi_file_replace', 'rename_symbol', 'organize_imports'].includes(toolName)) {
      this.sessionApprovals.add(`category:multi_file_operations:${policy.riskLevel}`);
    }

    console.log(kleur.blue(`📋 Session approval added: similar ${toolName} operations will be auto-approved`));
    
    // Save state after adding approval
    this.saveSessionState();
  }

  // Override clearSessionApprovals to save state
  clearSessionApprovals(): void {
    const count = this.sessionApprovals.size;
    this.sessionApprovals.clear();
    
    if (count > 0) {
      console.log(kleur.gray(`🧹 Cleared ${count} session approvals`));
    }
    
    this.saveSessionState();
  }

  close(): void {
    this.saveSessionState();
    this.approvalGate.close();
  }
}