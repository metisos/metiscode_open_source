import { ChildProcess, spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';

export interface BackgroundProcess {
  id: string;
  command: string;
  args: string[];
  pid?: number;
  startTime: number;
  status: 'running' | 'completed' | 'failed' | 'killed';
  output: string[];
  errorOutput: string[];
  exitCode?: number;
  lastOutputIndex: number;
  terminationRequested?: boolean;
}

export class ProcessManager {
  private processes: Map<string, BackgroundProcess> = new Map();
  private childProcesses: Map<string, ChildProcess> = new Map();
  private outputBufferLimit = 10000;

  startProcess(command: string, args: string[] = [], options?: {
    cwd?: string;
    env?: Record<string, string>;
    shell?: boolean;
  }): string {
    const processId = uuidv4();

    const bgProcess: BackgroundProcess = {
      id: processId,
      command,
      args,
      startTime: Date.now(),
      status: 'running',
      output: [],
      errorOutput: [],
      lastOutputIndex: 0
    };

    const childProcess = spawn(command, args, {
      cwd: options?.cwd || process.cwd(),
      env: options?.env ? { ...process.env, ...options.env } : process.env,
      shell: options?.shell ?? false
    });

    bgProcess.pid = childProcess.pid;

    childProcess.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n').filter((line: string) => line.trim());
      bgProcess.output.push(...lines);

      if (bgProcess.output.length > this.outputBufferLimit) {
        bgProcess.output = bgProcess.output.slice(-this.outputBufferLimit);
      }
    });

    childProcess.stderr?.on('data', (data) => {
      const lines = data.toString().split('\n').filter((line: string) => line.trim());
      bgProcess.errorOutput.push(...lines);

      if (bgProcess.errorOutput.length > this.outputBufferLimit) {
        bgProcess.errorOutput = bgProcess.errorOutput.slice(-this.outputBufferLimit);
      }
    });

    childProcess.on('exit', (code, signal) => {
      if (code !== null) {
        bgProcess.exitCode = code;
      }

      if (bgProcess.status !== 'killed') {
        if (bgProcess.terminationRequested || signal === 'SIGTERM' || signal === 'SIGKILL') {
          bgProcess.status = 'killed';
        } else {
          bgProcess.status = code === 0 ? 'completed' : 'failed';
        }
      }

      this.childProcesses.delete(processId);
    });

    childProcess.on('error', (error) => {
      bgProcess.errorOutput.push(`Process error: ${error.message}`);
      bgProcess.status = 'failed';
      this.childProcesses.delete(processId);
    });

    this.processes.set(processId, bgProcess);
    this.childProcesses.set(processId, childProcess);

    return processId;
  }

  getProcess(processId: string): BackgroundProcess | undefined {
    return this.processes.get(processId);
  }

  getOutput(processId: string, options?: {
    filter?: string;
    sinceLastCheck?: boolean;
  }): { output: string[]; errorOutput: string[]; newOutputOnly: boolean } | null {
    const process = this.processes.get(processId);

    if (!process) {
      return null;
    }

    let output = process.output;
    let errorOutput = process.errorOutput;

    if (options?.sinceLastCheck) {
      output = process.output.slice(process.lastOutputIndex);
      process.lastOutputIndex = process.output.length;
    }

    if (options?.filter) {
      try {
        const regex = new RegExp(options.filter);
        output = output.filter(line => regex.test(line));
        errorOutput = errorOutput.filter(line => regex.test(line));
      } catch (error) {
        // Invalid regex, return unfiltered
      }
    }

    return {
      output,
      errorOutput,
      newOutputOnly: options?.sinceLastCheck || false
    };
  }

  killProcess(processId: string): boolean {
    const childProcess = this.childProcesses.get(processId);
    const bgProcess = this.processes.get(processId);

    if (!childProcess || !bgProcess) {
      return false;
    }

    try {
      const terminated = childProcess.kill('SIGTERM');

      if (!terminated) {
        return false;
      }

      bgProcess.terminationRequested = true;

      setTimeout(() => {
        if (childProcess.killed === false) {
          childProcess.kill('SIGKILL');
        }
      }, 5000);

      bgProcess.status = 'killed';
      bgProcess.exitCode = undefined;
      return true;
    } catch (error) {
      return false;
    }
  }

  listProcesses(filter?: {
    status?: BackgroundProcess['status'];
    activeOnly?: boolean;
  }): BackgroundProcess[] {
    let processes = Array.from(this.processes.values());

    if (filter?.status) {
      processes = processes.filter(p => p.status === filter.status);
    }

    if (filter?.activeOnly) {
      processes = processes.filter(p => p.status === 'running');
    }

    return processes.sort((a, b) => b.startTime - a.startTime);
  }

  cleanup(olderThan?: number): number {
    const threshold = olderThan ?? 3600000; // 1 hour default
    const now = Date.now();
    let cleaned = 0;

    for (const [id, process] of this.processes.entries()) {
      if (process.status !== 'running') {
        const age = now - process.startTime;
        if (age > threshold) {
          this.processes.delete(id);
          this.childProcesses.delete(id);
          cleaned++;
        }
      }
    }

    return cleaned;
  }

  cleanupAll(): void {
    for (const [id, childProcess] of this.childProcesses.entries()) {
      try {
        childProcess.kill('SIGTERM');
      } catch (error) {
        // Process may already be dead
      }
    }

    this.processes.clear();
    this.childProcesses.clear();
  }

  getStats(): {
    total: number;
    running: number;
    completed: number;
    failed: number;
    killed: number;
  } {
    const processes = Array.from(this.processes.values());

    return {
      total: processes.length,
      running: processes.filter(p => p.status === 'running').length,
      completed: processes.filter(p => p.status === 'completed').length,
      failed: processes.filter(p => p.status === 'failed').length,
      killed: processes.filter(p => p.status === 'killed').length
    };
  }
}

let processManager: ProcessManager | null = null;

export function getProcessManager(): ProcessManager {
  if (!processManager) {
    processManager = new ProcessManager();
  }
  return processManager;
}
