import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { MCPMessage, MCPConnection } from '../types';

export interface StdioTransportConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export class StdioTransport extends EventEmitter implements MCPConnection {
  private process: ChildProcess | null = null;
  private buffer = '';
  private connected = false;

  constructor(private config: StdioTransportConfig) {
    super();
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(this.config.command, this.config.args || [], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, ...this.config.env },
          cwd: this.config.cwd
        });

        this.process.on('error', (error) => {
          this.emit('error', error);
          reject(error);
        });

        this.process.on('exit', (code, signal) => {
          this.connected = false;
          this.emit('disconnect', { code, signal });
        });

        // Handle stdout messages
        this.process.stdout!.on('data', (chunk) => {
          this.buffer += chunk.toString();
          this.processBuffer();
        });

        // Handle stderr for logging
        this.process.stderr!.on('data', (chunk) => {
          this.emit('stderr', chunk.toString());
        });

        this.connected = true;
        this.emit('connect');
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message: MCPMessage = JSON.parse(line);
          this.emit('message', message);
        } catch (error) {
          this.emit('error', new Error(`Invalid JSON: ${line}`));
        }
      }
    }
  }

  async send(message: MCPMessage): Promise<void> {
    if (!this.isConnected || !this.process?.stdin?.writable) {
      throw new Error('Transport not connected');
    }

    const jsonMessage = JSON.stringify(message) + '\n';
    
    return new Promise((resolve, reject) => {
      this.process!.stdin!.write(jsonMessage, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async close(): Promise<void> {
    if (!this.isConnected || !this.process) {
      return;
    }

    return new Promise((resolve) => {
      if (this.process) {
        this.process.on('exit', () => {
          this.connected = false;
          this.emit('disconnect');
          resolve();
        });

        // Graceful shutdown
        this.process.stdin?.end();
        
        // Force kill after timeout
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.process.kill('SIGTERM');
            
            // Final force kill
            setTimeout(() => {
              if (this.process && !this.process.killed) {
                this.process.kill('SIGKILL');
              }
            }, 2000);
          }
        }, 5000);
      } else {
        resolve();
      }
    });
  }

  isConnected(): boolean {
    return this.connected && this.process !== null && !this.process.killed;
  }
}