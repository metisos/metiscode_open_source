import fs from "fs";
import path from "path";
import { Message } from "../providers/types";

export interface SessionContext {
  sessionId: string;
  messages: Message[];
  workingFiles: string[];
  currentTask?: string;
  previousTasks: string[];
  projectContext?: string;
  lastActivity: string;
  created: string;
  metadata?: Record<string, any>;
}

export class SessionMemory {
  private sessionsDir: string;
  private currentSession: SessionContext | null = null;
  
  constructor(workingDirectory: string) {
    this.sessionsDir = path.join(workingDirectory, ".metis", "sessions");
    this.ensureSessionsDirectory();
  }

  private ensureSessionsDirectory(): void {
    try {
      if (!fs.existsSync(this.sessionsDir)) {
        fs.mkdirSync(this.sessionsDir, { recursive: true });
      }
    } catch (error: any) {
      // Handle the case where .metis/sessions exists as a file instead of directory
      if (error.code === 'ENOTDIR') {
        const metisDir = path.dirname(this.sessionsDir);
        const sessionsPath = this.sessionsDir;

        // Check if .metis/sessions exists as a file
        if (fs.existsSync(sessionsPath) && fs.statSync(sessionsPath).isFile()) {
          console.warn(`Warning: ${sessionsPath} exists as a file, renaming to .backup`);
          fs.renameSync(sessionsPath, `${sessionsPath}.backup`);
        }

        // Now create the directory
        fs.mkdirSync(this.sessionsDir, { recursive: true });
      } else {
        throw error;
      }
    }
  }

  // Load or create a session
  loadSession(sessionId: string): SessionContext {
    const sessionPath = path.join(this.sessionsDir, `${sessionId}.json`);
    
    if (fs.existsSync(sessionPath)) {
      try {
        const data = fs.readFileSync(sessionPath, 'utf8');
        this.currentSession = JSON.parse(data);
        this.currentSession!.lastActivity = new Date().toISOString();
        return this.currentSession!;
      } catch (error) {
        console.warn(`Failed to load session ${sessionId}, creating new one`);
      }
    }
    
    // Create new session
    this.currentSession = {
      sessionId,
      messages: [],
      workingFiles: [],
      previousTasks: [],
      lastActivity: new Date().toISOString(),
      created: new Date().toISOString()
    };
    
    this.saveSession();
    return this.currentSession;
  }

  // Get current session or create a new one
  getCurrentSession(sessionId?: string): SessionContext {
    if (this.currentSession && (!sessionId || this.currentSession.sessionId === sessionId)) {
      return this.currentSession;
    }
    
    const id = sessionId || `session-${Date.now()}`;
    return this.loadSession(id);
  }

  // Add message to session history
  addMessage(message: Message): void {
    if (!this.currentSession) return;
    
    this.currentSession.messages.push(message);
    this.currentSession.lastActivity = new Date().toISOString();
    
    // Keep only last 20 messages to prevent memory bloat
    if (this.currentSession.messages.length > 20) {
      this.currentSession.messages = this.currentSession.messages.slice(-20);
    }
    
    this.saveSession();
  }

  // Add multiple messages
  addMessages(messages: Message[]): void {
    if (!this.currentSession) return;
    
    this.currentSession.messages.push(...messages);
    this.currentSession.lastActivity = new Date().toISOString();
    
    // Keep only last 20 messages
    if (this.currentSession.messages.length > 20) {
      this.currentSession.messages = this.currentSession.messages.slice(-20);
    }
    
    this.saveSession();
  }

  // Set current task
  setCurrentTask(task: string): void {
    if (!this.currentSession) return;
    
    // Move previous task to history
    if (this.currentSession.currentTask) {
      this.currentSession.previousTasks.push(this.currentSession.currentTask);
      
      // Keep only last 10 previous tasks
      if (this.currentSession.previousTasks.length > 10) {
        this.currentSession.previousTasks = this.currentSession.previousTasks.slice(-10);
      }
    }
    
    this.currentSession.currentTask = task;
    this.currentSession.lastActivity = new Date().toISOString();
    this.saveSession();
  }

  // Add working file
  addWorkingFile(filePath: string): void {
    if (!this.currentSession) return;
    
    if (!this.currentSession.workingFiles.includes(filePath)) {
      this.currentSession.workingFiles.push(filePath);
      
      // Keep only last 15 files
      if (this.currentSession.workingFiles.length > 15) {
        this.currentSession.workingFiles = this.currentSession.workingFiles.slice(-15);
      }
      
      this.currentSession.lastActivity = new Date().toISOString();
      this.saveSession();
    }
  }

  // Remove working file
  removeWorkingFile(filePath: string): void {
    if (!this.currentSession) return;
    
    const index = this.currentSession.workingFiles.indexOf(filePath);
    if (index > -1) {
      this.currentSession.workingFiles.splice(index, 1);
      this.currentSession.lastActivity = new Date().toISOString();
      this.saveSession();
    }
  }

  // Set project context
  setProjectContext(context: string): void {
    if (!this.currentSession) return;
    
    this.currentSession.projectContext = context;
    this.currentSession.lastActivity = new Date().toISOString();
    this.saveSession();
  }

  // Get session summary for context
  getSessionSummary(): string {
    if (!this.currentSession) return "";
    
    const parts: string[] = [];
    
    if (this.currentSession.currentTask) {
      parts.push(`**Current Task:** ${this.currentSession.currentTask}`);
    }
    
    if (this.currentSession.previousTasks.length > 0) {
      const recentTasks = this.currentSession.previousTasks.slice(-3);
      parts.push(`**Recent Tasks:** ${recentTasks.join(", ")}`);
    }
    
    if (this.currentSession.workingFiles.length > 0) {
      const recentFiles = this.currentSession.workingFiles.slice(-5);
      parts.push(`**Working Files:** ${recentFiles.join(", ")}`);
    }
    
    if (this.currentSession.projectContext) {
      parts.push(`**Project Context:** ${this.currentSession.projectContext}`);
    }
    
    return parts.join("\n");
  }

  // Get conversation history
  getConversationHistory(): Message[] {
    if (!this.currentSession) return [];
    return this.currentSession.messages.slice(); // Return copy
  }

  // Get recent conversation for context (last N messages)
  getRecentConversation(messageCount: number = 6): Message[] {
    if (!this.currentSession) return [];
    return this.currentSession.messages.slice(-messageCount);
  }

  // Update metadata
  updateMetadata(key: string, value: any): void {
    if (!this.currentSession) return;
    
    if (!this.currentSession.metadata) {
      this.currentSession.metadata = {};
    }
    
    this.currentSession.metadata[key] = value;
    this.currentSession.lastActivity = new Date().toISOString();
    this.saveSession();
  }

  // Save session to disk
  private saveSession(): void {
    if (!this.currentSession) return;
    
    try {
      const sessionPath = path.join(this.sessionsDir, `${this.currentSession.sessionId}.json`);
      fs.writeFileSync(sessionPath, JSON.stringify(this.currentSession, null, 2), 'utf8');
    } catch (error) {
      console.warn("Failed to save session:", error);
    }
  }

  // Clear session context (like Claude Code /clear)
  clearSession(): void {
    if (!this.currentSession) return;
    
    // Keep session ID and basic info, but clear conversation
    const sessionId = this.currentSession.sessionId;
    const created = this.currentSession.created;
    
    this.currentSession = {
      sessionId,
      messages: [],
      workingFiles: [],
      previousTasks: [],
      lastActivity: new Date().toISOString(),
      created
    };
    
    this.saveSession();
  }

  // Compact session (summarize and compress context like Claude Code /compact)
  async compactSession(summarizerFunction?: (messages: Message[]) => Promise<string>): Promise<void> {
    if (!this.currentSession || this.currentSession.messages.length <= 5) return;
    
    try {
      // Default summarizer if none provided
      const summarize = summarizerFunction || this.defaultSummarizer;
      
      // Keep the last 3 messages and summarize the rest
      const messagesToSummarize = this.currentSession.messages.slice(0, -3);
      const recentMessages = this.currentSession.messages.slice(-3);
      
      if (messagesToSummarize.length > 0) {
        const summary = await summarize(messagesToSummarize);
        
        // Create a summary message
        const summaryMessage: Message = {
          role: 'system',
          content: `[CONVERSATION SUMMARY - ${messagesToSummarize.length} messages]\n${summary}`
        };
        
        // Replace old messages with summary + recent messages
        this.currentSession.messages = [summaryMessage, ...recentMessages];
        this.currentSession.lastActivity = new Date().toISOString();
        this.saveSession();
      }
    } catch (error) {
      console.warn('Failed to compact session:', error.message);
    }
  }

  // Default summarizer that creates a simple summary
  private defaultSummarizer = async (messages: Message[]): Promise<string> => {
    const userMessages = messages.filter(m => m.role === 'user').map(m => m.content);
    const taskCount = userMessages.length;
    const recentTasks = userMessages.slice(-3);
    
    const summary = [
      `Previous conversation included ${taskCount} user requests.`,
      recentTasks.length > 0 ? `Recent tasks: ${recentTasks.join('; ')}` : '',
      `Working files: ${this.currentSession?.workingFiles.slice(-5).join(', ') || 'none'}`
    ].filter(Boolean).join(' ');
    
    return summary;
  }

  // Resume a specific session
  resumeSession(sessionId: string): SessionContext | null {
    try {
      const sessionPath = path.join(this.sessionsDir, `${sessionId}.json`);
      
      if (!fs.existsSync(sessionPath)) {
        return null;
      }
      
      const data = fs.readFileSync(sessionPath, 'utf8');
      const session: SessionContext = JSON.parse(data);
      
      // Update last activity and set as current
      session.lastActivity = new Date().toISOString();
      this.currentSession = session;
      this.saveSession();
      
      return session;
    } catch (error) {
      return null;
    }
  }

  // Get the most recent session (for /continue command)  
  getLastSession(): {sessionId: string; lastActivity: string; currentTask?: string} | null {
    const sessions = this.listRecentSessions(1);
    return sessions.length > 0 ? sessions[0] : null;
  }

  // Check if session context is getting too large (for auto-compact)
  shouldAutoCompact(threshold: number = 0.95): boolean {
    if (!this.currentSession) return false;
    
    // Rough estimation: average 100 chars per message * token ratio
    const estimatedTokens = this.currentSession.messages.reduce((total, msg) => {
      return total + (msg.content?.length || 0);
    }, 0) / 3; // Rough char-to-token conversion
    
    const maxTokens = 200000; // Claude's context window
    return (estimatedTokens / maxTokens) > threshold;
  }

  // Clean up old sessions (older than 7 days)
  cleanupOldSessions(): void {
    try {
      const files = fs.readdirSync(this.sessionsDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        const sessionPath = path.join(this.sessionsDir, file);
        const stats = fs.statSync(sessionPath);
        
        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(sessionPath);
        }
      }
    } catch (error) {
      console.warn("Failed to cleanup old sessions:", error);
    }
  }

  // List recent sessions
  listRecentSessions(limit: number = 10): Array<{sessionId: string, lastActivity: string, currentTask?: string}> {
    try {
      const files = fs.readdirSync(this.sessionsDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const sessionPath = path.join(this.sessionsDir, f);
          try {
            const data = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            return {
              sessionId: data.sessionId,
              lastActivity: data.lastActivity,
              currentTask: data.currentTask,
              file: f
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .sort((a, b) => new Date(b!.lastActivity).getTime() - new Date(a!.lastActivity).getTime())
        .slice(0, limit);
      
      return files.map(f => ({
        sessionId: f!.sessionId,
        lastActivity: f!.lastActivity,
        currentTask: f!.currentTask
      }));
    } catch {
      return [];
    }
  }
}

// Global session memory instance
let globalSessionMemory: SessionMemory | null = null;

export function getSessionMemory(workingDirectory?: string): SessionMemory {
  if (!globalSessionMemory) {
    globalSessionMemory = new SessionMemory(workingDirectory || process.cwd());
  }
  return globalSessionMemory;
}