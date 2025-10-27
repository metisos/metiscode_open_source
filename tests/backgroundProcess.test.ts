import { expect } from 'chai';
import { ProcessManager, getProcessManager } from '../src/runtime/processManager';
import { bashTool } from '../src/tools/builtin/bashOps';
import { bashOutputTool, killShellTool } from '../src/tools/builtin/backgroundProcessOps';
import { ExecutionContext } from '../src/tools/registry';

const mockContext: ExecutionContext = {
  workingDirectory: process.cwd(),
  verbose: false
};

describe('ProcessManager', () => {
  let processManager: ProcessManager;

  beforeEach(() => {
    processManager = new ProcessManager();
  });

  afterEach(() => {
    processManager.cleanupAll();
  });

  it('should start a background process', () => {
    const processId = processManager.startProcess('echo', ['test']);

    expect(processId).toBeDefined();
    expect(typeof processId).toBe('string');

    const process = processManager.getProcess(processId);
    expect(process).toBeDefined();
    expect(process?.command).toBe('echo');
    expect(process?.args).toEqual(['test']);
    expect(process?.status).toBe('running');
  });

  it('should capture process output', async () => {
    const processId = processManager.startProcess('echo', ['hello world']);

    await new Promise(resolve => setTimeout(resolve, 500));

    const output = processManager.getOutput(processId);
    expect(output).toBeDefined();
    expect(output?.output.length).toBeGreaterThan(0);
  });

  it('should track process completion', async () => {
    const processId = processManager.startProcess('echo', ['test']);

    await new Promise(resolve => setTimeout(resolve, 500));

    const process = processManager.getProcess(processId);
    expect(process?.status).toBe('completed');
    expect(process?.exitCode).toBe(0);
  });

  test('should kill running process', async () => {
    const processId = processManager.startProcess('sleep', ['10']);

    await new Promise(resolve => setTimeout(resolve, 100));

    const killed = processManager.killProcess(processId);
    expect(killed).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 200));

    const process = processManager.getProcess(processId);
    expect(process?.status).toBe('killed');
  });

  test('should list all processes', () => {
    const id1 = processManager.startProcess('echo', ['test1']);
    const id2 = processManager.startProcess('echo', ['test2']);

    const processes = processManager.listProcesses();
    expect(processes.length).toBeGreaterThanOrEqual(2);

    const ids = processes.map(p => p.id);
    expect(ids).toContain(id1);
    expect(ids).toContain(id2);
  });

  test('should filter processes by status', async () => {
    const id1 = processManager.startProcess('echo', ['test']);
    const id2 = processManager.startProcess('sleep', ['10']);

    await new Promise(resolve => setTimeout(resolve, 500));

    const runningProcs = processManager.listProcesses({ status: 'running' });
    expect(runningProcs.some(p => p.id === id2)).toBe(true);

    const completedProcs = processManager.listProcesses({ status: 'completed' });
    expect(completedProcs.some(p => p.id === id1)).toBe(true);

    processManager.killProcess(id2);
  });

  test('should provide process statistics', () => {
    processManager.startProcess('echo', ['test1']);
    processManager.startProcess('echo', ['test2']);

    const stats = processManager.getStats();
    expect(stats.total).toBeGreaterThanOrEqual(2);
    expect(stats.running).toBeGreaterThanOrEqual(0);
  });

  test('should cleanup old processes', async () => {
    const id = processManager.startProcess('echo', ['test']);

    await new Promise(resolve => setTimeout(resolve, 500));

    const cleaned = processManager.cleanup(0);
    expect(cleaned).toBeGreaterThan(0);

    const process = processManager.getProcess(id);
    expect(process).toBeUndefined();
  });

  test('should filter output with regex', async () => {
    const processId = processManager.startProcess('echo', ['hello\nworld\ntest']);

    await new Promise(resolve => setTimeout(resolve, 500));

    const output = processManager.getOutput(processId, { filter: 'world' });
    expect(output).toBeDefined();
    expect(output?.output.some(line => line.includes('world'))).toBe(true);
  });

  test('should track new output only', async () => {
    const processId = processManager.startProcess('echo', ['line1\nline2\nline3']);

    await new Promise(resolve => setTimeout(resolve, 500));

    const firstRead = processManager.getOutput(processId, { sinceLastCheck: true });
    expect(firstRead?.output.length).toBeGreaterThan(0);

    const secondRead = processManager.getOutput(processId, { sinceLastCheck: true });
    expect(secondRead?.output.length).toBe(0);
  });
});

describe('Bash Tool Background Execution', () => {
  let processManager: ProcessManager;

  beforeEach(() => {
    processManager = getProcessManager();
  });

  afterEach(() => {
    processManager.cleanupAll();
  });

  test('should start process in background mode', async () => {
    const result = await bashTool.handler.execute(
      {
        command: 'echo',
        args: ['background test'],
        run_in_background: true
      },
      mockContext
    );

    expect(result.success).toBe(true);
    expect(result.metadata?.bash_id).toBeDefined();
    expect(result.metadata?.status).toBe('running');
  });

  test('should execute synchronously when run_in_background is false', async () => {
    const result = await bashTool.handler.execute(
      {
        command: 'echo',
        args: ['sync test'],
        run_in_background: false
      },
      mockContext
    );

    expect(result.success).toBe(true);
    expect(result.content).toBeDefined();
    expect(result.metadata?.bash_id).toBeUndefined();
  });

  test('should block dangerous commands even in background', async () => {
    const result = await bashTool.handler.execute(
      {
        command: 'rm',
        args: ['-rf', '/'],
        run_in_background: true
      },
      mockContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Dangerous command blocked');
  });
});

describe('BashOutput Tool', () => {
  let processManager: ProcessManager;
  let processId: string;

  beforeEach(async () => {
    processManager = getProcessManager();
    processId = processManager.startProcess('echo', ['output test']);
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  afterEach(() => {
    processManager.cleanupAll();
  });

  test('should retrieve process output', async () => {
    const result = await bashOutputTool.handler.execute(
      { bash_id: processId },
      mockContext
    );

    expect(result.success).toBe(true);
    expect(result.content).toBeDefined();
    expect(result.metadata?.bash_id).toBe(processId);
  });

  test('should return error for invalid process id', async () => {
    const result = await bashOutputTool.handler.execute(
      { bash_id: 'invalid-id' },
      mockContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Process not found');
  });

  test('should filter output with regex', async () => {
    const id = processManager.startProcess('echo', ['hello\nworld\ntest']);
    await new Promise(resolve => setTimeout(resolve, 500));

    const result = await bashOutputTool.handler.execute(
      { bash_id: id, filter: 'world' },
      mockContext
    );

    expect(result.success).toBe(true);
  });

  test('should include process metadata in response', async () => {
    const result = await bashOutputTool.handler.execute(
      { bash_id: processId },
      mockContext
    );

    expect(result.metadata?.status).toBeDefined();
    expect(result.metadata?.pid).toBeDefined();
  });
});

describe('KillShell Tool', () => {
  let processManager: ProcessManager;
  let processId: string;

  beforeEach(() => {
    processManager = getProcessManager();
    processId = processManager.startProcess('sleep', ['10']);
  });

  afterEach(() => {
    processManager.cleanupAll();
  });

  test('should kill running process', async () => {
    await new Promise(resolve => setTimeout(resolve, 100));

    const result = await killShellTool.handler.execute(
      { shell_id: processId },
      mockContext
    );

    expect(result.success).toBe(true);
    expect(result.metadata?.current_status).toBe('killed');
  });

  test('should return error for invalid process id', async () => {
    const result = await killShellTool.handler.execute(
      { shell_id: 'invalid-id' },
      mockContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Process not found');
  });

  test('should return error when trying to kill non-running process', async () => {
    const completedId = processManager.startProcess('echo', ['test']);
    await new Promise(resolve => setTimeout(resolve, 500));

    const result = await killShellTool.handler.execute(
      { shell_id: completedId },
      mockContext
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not running');
  });
});

describe('Integration: Background Process Workflow', () => {
  let processManager: ProcessManager;

  beforeEach(() => {
    processManager = getProcessManager();
  });

  afterEach(() => {
    processManager.cleanupAll();
  });

  test('should handle complete workflow: start, monitor, kill', async () => {
    const startResult = await bashTool.handler.execute(
      {
        command: 'sleep',
        args: ['30'],
        run_in_background: true
      },
      mockContext
    );

    expect(startResult.success).toBe(true);
    const bashId = startResult.metadata?.bash_id;
    expect(bashId).toBeDefined();

    await new Promise(resolve => setTimeout(resolve, 100));

    const outputResult = await bashOutputTool.handler.execute(
      { bash_id: bashId },
      mockContext
    );
    expect(outputResult.success).toBe(true);
    expect(outputResult.metadata?.status).toBe('running');

    const killResult = await killShellTool.handler.execute(
      { shell_id: bashId },
      mockContext
    );
    expect(killResult.success).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 200));

    const finalOutput = await bashOutputTool.handler.execute(
      { bash_id: bashId },
      mockContext
    );
    expect(finalOutput.metadata?.status).toBe('killed');
  });

  test('should handle multiple concurrent background processes', async () => {
    const ids: string[] = [];

    for (let i = 0; i < 3; i++) {
      const result = await bashTool.handler.execute(
        {
          command: 'echo',
          args: [`process ${i}`],
          run_in_background: true
        },
        mockContext
      );
      ids.push(result.metadata?.bash_id);
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    const stats = processManager.getStats();
    expect(stats.total).toBeGreaterThanOrEqual(3);

    ids.forEach(id => {
      processManager.killProcess(id);
    });
  });
});
