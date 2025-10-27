import fs from "fs";
import path from "path";
import { SessionMemory, SessionContext } from './sessionMemory';
import { getSessionMemory } from './sessionMemory';
import kleur from 'kleur';

export interface SessionState {
  permissions: {
    mode: string;
    sessionApprovals: string[];
  };
  workingDirectory: string;
  activeSession: string | null;
  interruption?: {
    timestamp: string;
    context: string;
    pendingOperation?: any;
    recoverable: boolean;
  };
  metadata: {
    lastExitType: 'clean' | 'interrupted' | 'error';
    totalSessions: number;
    lastSessionDuration: number;
    crashCount: number;
  };
}

export interface SessionRecoveryOptions {
  restorePermissions: boolean;
  resumeLastTask: boolean;
  showRecoveryPrompt: boolean;
}

export class SessionPersistence {
  private stateFile: string;
  private sessionMemory: SessionMemory;
  private currentState: SessionState;
  private readlineInterface?: any;
  
  constructor(workingDirectory: string) {
    this.stateFile = path.join(workingDirectory, ".metis", "session-state.json");
    this.sessionMemory = getSessionMemory(workingDirectory);
    
    // Ensure .metis directory exists
    const metisDir = path.dirname(this.stateFile);
    if (!fs.existsSync(metisDir)) {
      fs.mkdirSync(metisDir, { recursive: true });
    }
    
    this.currentState = this.loadState();
    this.setupGracefulShutdown();
  }

  private loadState(): SessionState {
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = fs.readFileSync(this.stateFile, 'utf8');
        const state = JSON.parse(data);
        
        // Validate state structure
        if (this.isValidState(state)) {
          return state;
        }
      }
    } catch (error) {
      console.warn('Failed to load session state:', error.message);
    }
    
    // Return default state
    return this.createDefaultState();
  }

  private createDefaultState(): SessionState {
    return {
      permissions: {
        mode: 'normal',
        sessionApprovals: []
      },
      workingDirectory: process.cwd(),
      activeSession: null,
      metadata: {
        lastExitType: 'clean',
        totalSessions: 0,
        lastSessionDuration: 0,
        crashCount: 0
      }
    };
  }

  private isValidState(state: any): boolean {
    return state && 
           typeof state === 'object' &&
           state.permissions &&
           state.workingDirectory &&
           state.metadata;
  }

  private saveState(): void {
    try {
      fs.writeFileSync(this.stateFile, JSON.stringify(this.currentState, null, 2), 'utf8');
    } catch (error) {
      console.warn('Failed to save session state:', error.message);
    }
  }

  // Set readline interface for recovery prompts
  setReadlineInterface(rl: any): void {
    this.readlineInterface = rl;
  }

  // Enhanced session initialization with recovery check
  async initializeSession(sessionId?: string, options: Partial<SessionRecoveryOptions> = {}): Promise<{
    session: SessionContext;
    wasRecovered: boolean;
    recoveryData?: any;
  }> {
    const defaultOptions: SessionRecoveryOptions = {
      restorePermissions: true,
      resumeLastTask: true,
      showRecoveryPrompt: true,
      ...options
    };

    // Check for interrupted session
    const wasInterrupted = this.detectInterruption();
    let recoveryData: any = null;
    
    if (wasInterrupted && defaultOptions.showRecoveryPrompt) {
      recoveryData = await this.offerRecovery(this.readlineInterface);
    }

    // Load or create session
    let session: SessionContext;
    if (recoveryData?.resumeSession && this.currentState.activeSession) {
      session = this.sessionMemory.resumeSession(this.currentState.activeSession) || 
                this.sessionMemory.getCurrentSession(sessionId);
    } else {
      session = this.sessionMemory.getCurrentSession(sessionId);
    }

    // Update state tracking
    this.currentState.activeSession = session.sessionId;
    this.currentState.metadata.totalSessions++;
    this.currentState.metadata.lastExitType = 'clean'; // Reset until proven otherwise
    
    // Track session start time
    this.updateMetadata('sessionStart', Date.now());
    
    this.saveState();
    
    return {
      session,
      wasRecovered: wasInterrupted && recoveryData?.resumeSession,
      recoveryData
    };
  }

  // Detect if last session was interrupted
  private detectInterruption(): boolean {
    return this.currentState.metadata.lastExitType === 'interrupted' || 
           this.currentState.interruption?.recoverable === true;
  }

  // Offer recovery options to user  
  private async offerRecovery(existingRL?: any): Promise<any> {
    if (!this.currentState.interruption) return null;

    const interruptionTime = new Date(this.currentState.interruption.timestamp).toLocaleString();
    
    console.log(kleur.yellow("🔄 Session Interruption Detected"));
    console.log(kleur.gray(`Last session was interrupted at ${interruptionTime}`));
    
    if (this.currentState.interruption.context) {
      console.log(kleur.gray(`Context: ${this.currentState.interruption.context}`));
    }
    
    console.log();
    console.log(kleur.white("Recovery Options:"));
    console.log(kleur.cyan("  r/resume") + kleur.gray(" - Resume interrupted session"));
    console.log(kleur.cyan("  n/new") + kleur.gray("    - Start fresh session"));
    console.log();

    return new Promise((resolve) => {
      let rl: any;
      let shouldCloseRL = false;
      
      if (existingRL) {
        rl = existingRL;
      } else {
        const readline = require('readline');
        rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        shouldCloseRL = true;
      }

      rl.question(kleur.blue('Choose recovery option [r/n]: '), (answer: string) => {
        if (shouldCloseRL) {
          rl.close();
        }
        
        const choice = answer.toLowerCase().trim();
        const resumeSession = choice === 'r' || choice === 'resume';
        
        if (resumeSession) {
          console.log(kleur.green("✅ Resuming interrupted session..."));
        } else {
          console.log(kleur.blue("🆕 Starting fresh session..."));
          this.clearInterruption();
        }
        
        resolve({ resumeSession });
      });
    });
  }

  // Save current permissions state (called by PermissionManager)
  savePermissionState(mode: string, sessionApprovals: string[]): void {
    this.currentState.permissions = {
      mode,
      sessionApprovals: [...sessionApprovals]
    };
    this.saveState();
  }

  // Restore permissions state
  getPermissionState(): { mode: string; sessionApprovals: string[] } {
    return {
      mode: this.currentState.permissions.mode,
      sessionApprovals: [...this.currentState.permissions.sessionApprovals]
    };
  }

  // Mark session as cleanly exited
  markCleanExit(): void {
    const sessionStart = this.getMetadata('sessionStart');
    if (sessionStart) {
      this.currentState.metadata.lastSessionDuration = Date.now() - sessionStart;
    }
    
    this.currentState.metadata.lastExitType = 'clean';
    this.clearInterruption();
    this.saveState();
  }

  // Mark session as interrupted (called by error handlers)
  markInterruption(context: string, pendingOperation?: any, recoverable: boolean = true): void {
    this.currentState.metadata.lastExitType = 'interrupted';
    this.currentState.metadata.crashCount++;
    
    this.currentState.interruption = {
      timestamp: new Date().toISOString(),
      context,
      pendingOperation,
      recoverable
    };
    
    this.saveState();
  }

  // Clear interruption data
  clearInterruption(): void {
    delete this.currentState.interruption;
    this.saveState();
  }

  // Update session metadata
  updateMetadata(key: string, value: any): void {
    this.sessionMemory.updateMetadata(key, value);
    this.saveState();
  }

  // Get session metadata
  getMetadata(key: string): any {
    const session = this.sessionMemory.getCurrentSession();
    return session.metadata?.[key];
  }

  // Get session statistics for status display
  getSessionStats(): {
    totalSessions: number;
    currentSessionId: string | null;
    lastSessionDuration: number;
    crashCount: number;
    hasActiveApprovals: boolean;
  } {
    return {
      totalSessions: this.currentState.metadata.totalSessions,
      currentSessionId: this.currentState.activeSession,
      lastSessionDuration: this.currentState.metadata.lastSessionDuration,
      crashCount: this.currentState.metadata.crashCount,
      hasActiveApprovals: this.currentState.permissions.sessionApprovals.length > 0
    };
  }

  // Enhanced session switching with state preservation
  async switchSession(targetSessionId: string): Promise<SessionContext | null> {
    // Save current session state before switching
    if (this.currentState.activeSession) {
      const currentSession = this.sessionMemory.getCurrentSession();
      this.sessionMemory.updateMetadata('lastPermissionMode', this.currentState.permissions.mode);
      this.sessionMemory.updateMetadata('lastApprovals', this.currentState.permissions.sessionApprovals);
    }

    // Switch to target session
    const newSession = this.sessionMemory.resumeSession(targetSessionId);
    if (newSession) {
      this.currentState.activeSession = targetSessionId;
      
      // Restore session-specific permissions if available
      const savedMode = newSession.metadata?.lastPermissionMode;
      const savedApprovals = newSession.metadata?.lastApprovals;
      
      if (savedMode) {
        this.currentState.permissions.mode = savedMode;
      }
      if (savedApprovals && Array.isArray(savedApprovals)) {
        this.currentState.permissions.sessionApprovals = savedApprovals;
      }
      
      this.saveState();
    }
    
    return newSession;
  }

  // Get enhanced session list with activity indicators
  getEnhancedSessionList(limit: number = 10): Array<{
    sessionId: string;
    lastActivity: string;
    currentTask?: string;
    isActive: boolean;
    workingFiles: number;
    messageCount: number;
    duration?: string;
  }> {
    const sessions = this.sessionMemory.listRecentSessions(limit);
    
    return sessions.map(session => {
      const isActive = session.sessionId === this.currentState.activeSession;
      
      // Try to get additional session details
      let workingFiles = 0;
      let messageCount = 0;
      let duration: string | undefined;
      
      try {
        const sessionPath = path.join(path.dirname(this.stateFile), 'sessions', `${session.sessionId}.json`);
        if (fs.existsSync(sessionPath)) {
          const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
          workingFiles = sessionData.workingFiles?.length || 0;
          messageCount = sessionData.messages?.length || 0;
          
          if (sessionData.created) {
            const created = new Date(sessionData.created);
            const lastActivity = new Date(session.lastActivity);
            const diff = lastActivity.getTime() - created.getTime();
            const minutes = Math.round(diff / (1000 * 60));
            duration = minutes > 0 ? `${minutes}m` : '<1m';
          }
        }
      } catch (error) {
        // Ignore errors reading session details
      }
      
      return {
        ...session,
        isActive,
        workingFiles,
        messageCount,
        duration
      };
    });
  }

  // Setup graceful shutdown handling
  private setupGracefulShutdown(): void {
    const gracefulShutdown = () => {
      this.markCleanExit();
      process.exit(0);
    };

    const interruptedShutdown = (signal: string) => {
      this.markInterruption(`Process received ${signal}`, null, true);
      process.exit(1);
    };

    // Clean shutdown signals
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    
    // Interrupted shutdown signals  
    process.on('SIGHUP', () => interruptedShutdown('SIGHUP'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.markInterruption(`Uncaught exception: ${error.message}`, { error: error.stack }, true);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      this.markInterruption(`Unhandled rejection: ${reason}`, { reason }, true);
      process.exit(1);
    });
  }

  // Public interface for integration with session manager
  close(): void {
    this.markCleanExit();
  }
}

// Global persistence instance
let globalPersistence: SessionPersistence | null = null;

export function getSessionPersistence(workingDirectory?: string): SessionPersistence {
  if (!globalPersistence) {
    globalPersistence = new SessionPersistence(workingDirectory || process.cwd());
  }
  return globalPersistence;
}