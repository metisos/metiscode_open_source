import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import { HookManager, resetHookManager } from '../src/hooks/HookManager';
import { HookExecutor } from '../src/hooks/HookExecutor';
import { isValidHookType } from '../src/hooks/types';

const testDir = path.join(process.cwd(), 'tests', 'test-hooks');
const hooksConfigPath = path.join(testDir, '.metis', 'hooks.json');

describe('Hooks System', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(path.join(testDir, '.metis'), { recursive: true });

    resetHookManager();
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    resetHookManager();
  });

  describe('Hook Type Validation', () => {
    it('should validate correct hook types', () => {
      expect(isValidHookType('pre-tool')).to.be.true;
      expect(isValidHookType('post-tool')).to.be.true;
      expect(isValidHookType('pre-write')).to.be.true;
      expect(isValidHookType('post-write')).to.be.true;
      expect(isValidHookType('pre-bash')).to.be.true;
      expect(isValidHookType('post-bash')).to.be.true;
      expect(isValidHookType('pre-commit')).to.be.true;
      expect(isValidHookType('post-commit')).to.be.true;
      expect(isValidHookType('user-prompt-submit')).to.be.true;
    });

    it('should reject invalid hook types', () => {
      expect(isValidHookType('invalid')).to.be.false;
      expect(isValidHookType('pre-invalid')).to.be.false;
      expect(isValidHookType('')).to.be.false;
    });
  });

  describe('HookExecutor', () => {
    it('should execute simple command', async () => {
      const executor = new HookExecutor();

      const result = await executor.execute(
        {
          command: 'echo',
          args: ['test'],
          timeout: 5000
        },
        {
          hookType: 'pre-tool',
          toolName: 'write_file'
        }
      );

      expect(result.success).to.be.true;
      expect(result.output).to.exist;
    });

    it('should handle command timeout', async () => {
      const executor = new HookExecutor();

      const result = await executor.execute(
        {
          command: 'sleep',
          args: ['10'],
          timeout: 100
        },
        {
          hookType: 'pre-tool'
        }
      );

      expect(result.success).to.be.false;
      expect(result.error).to.contain('timeout');
    });

    it('should handle command failure', async () => {
      const executor = new HookExecutor();

      const result = await executor.execute(
        {
          command: 'invalid-command-that-does-not-exist',
          args: [],
          timeout: 5000
        },
        {
          hookType: 'pre-tool'
        }
      );

      expect(result.success).to.be.false;
      expect(result.error).to.exist;
    });

    it('should replace variables in command', async () => {
      const executor = new HookExecutor();

      const result = await executor.execute(
        {
          command: 'echo',
          args: ['${toolName}', '${hookType}'],
          timeout: 5000
        },
        {
          hookType: 'pre-write',
          toolName: 'write_file'
        }
      );

      expect(result.success).to.be.true;
      expect(result.output).to.include('write_file');
      expect(result.output).to.include('pre-write');
    });

    it('should parse JSON output as modified params', async () => {
      const executor = new HookExecutor();

      const result = await executor.execute(
        {
          command: 'echo',
          args: ['{"modified": true}'],
          timeout: 5000
        },
        {
          hookType: 'pre-tool'
        }
      );

      expect(result.success).to.be.true;
      expect(result.modifiedParams).to.exist;
      expect(result.modifiedParams.modified).to.be.true;
    });

    it('should pass environment variables', async () => {
      const executor = new HookExecutor();

      const result = await executor.execute(
        {
          command: process.platform === 'win32' ? 'echo' : 'printenv',
          args: process.platform === 'win32' ? ['%TEST_VAR%'] : ['TEST_VAR'],
          env: { TEST_VAR: 'test_value' },
          timeout: 5000
        },
        {
          hookType: 'pre-tool'
        }
      );

      expect(result.success).to.be.true;
    });
  });

  describe('HookManager', () => {
    it('should load hooks from configuration file', () => {
      const config = {
        'pre-write': {
          command: 'echo',
          args: ['test'],
          blocking: false
        }
      };

      fs.writeFileSync(hooksConfigPath, JSON.stringify(config, null, 2));

      const manager = new HookManager(testDir);

      expect(manager.hasHooks('pre-write')).to.be.true;
      expect(manager.hasHooks('pre-tool')).to.be.false;
    });

    it('should handle missing configuration file', () => {
      const manager = new HookManager(testDir);

      expect(manager.hasHooks('pre-write')).to.be.false;
    });

    it('should handle multiple hooks for same type', () => {
      const config = {
        'pre-write': [
          {
            command: 'echo',
            args: ['first']
          },
          {
            command: 'echo',
            args: ['second']
          }
        ]
      };

      fs.writeFileSync(hooksConfigPath, JSON.stringify(config, null, 2));

      const manager = new HookManager(testDir);
      const hooks = manager.getHooks('pre-write');

      expect(hooks).to.be.an('array');
      expect(hooks?.length).to.equal(2);
    });

    it('should reload configuration', () => {
      const config1 = {
        'pre-write': {
          command: 'echo',
          args: ['test1']
        }
      };

      fs.writeFileSync(hooksConfigPath, JSON.stringify(config1, null, 2));

      const manager = new HookManager(testDir);
      expect(manager.hasHooks('pre-write')).to.be.true;

      const config2 = {
        'post-write': {
          command: 'echo',
          args: ['test2']
        }
      };

      fs.writeFileSync(hooksConfigPath, JSON.stringify(config2, null, 2));

      manager.reload();

      expect(manager.hasHooks('pre-write')).to.be.false;
      expect(manager.hasHooks('post-write')).to.be.true;
    });

    it('should provide statistics', () => {
      const config = {
        'pre-write': {
          command: 'echo',
          args: ['test']
        },
        'post-write': {
          command: 'echo',
          args: ['test']
        }
      };

      fs.writeFileSync(hooksConfigPath, JSON.stringify(config, null, 2));

      const manager = new HookManager(testDir);
      const stats = manager.getStats();

      expect(stats.totalHooks).to.equal(2);
      expect(stats.hookTypes).to.equal(2);
      expect(stats.configExists).to.be.true;
    });

    it('should execute hooks and return results', async () => {
      const config = {
        'pre-tool': {
          command: 'echo',
          args: ['executed'],
          blocking: false
        }
      };

      fs.writeFileSync(hooksConfigPath, JSON.stringify(config, null, 2));

      const manager = new HookManager(testDir);

      const result = await manager.executeHooks('pre-tool', {
        hookType: 'pre-tool',
        toolName: 'test'
      });

      expect(result.success).to.be.true;
    });

    it('should block operation if blocking hook fails', async () => {
      const config = {
        'pre-tool': {
          command: 'exit',
          args: ['1'],
          blocking: true
        }
      };

      fs.writeFileSync(hooksConfigPath, JSON.stringify(config, null, 2));

      const manager = new HookManager(testDir);

      const result = await manager.executeHooks('pre-tool', {
        hookType: 'pre-tool',
        toolName: 'test'
      });

      expect(result.success).to.be.false;
      expect(result.blocked).to.be.true;
    });

    it('should not block if non-blocking hook fails', async () => {
      const config = {
        'pre-tool': {
          command: 'exit',
          args: ['1'],
          blocking: false
        }
      };

      fs.writeFileSync(hooksConfigPath, JSON.stringify(config, null, 2));

      const manager = new HookManager(testDir);

      const result = await manager.executeHooks('pre-tool', {
        hookType: 'pre-tool',
        toolName: 'test'
      });

      expect(result.success).to.be.true;
      expect(result.blocked).to.not.exist;
    });

    it('should pass modified params through chain', async () => {
      const config = {
        'pre-tool': {
          command: 'echo',
          args: ['{"newParam": "value"}'],
          blocking: false
        }
      };

      fs.writeFileSync(hooksConfigPath, JSON.stringify(config, null, 2));

      const manager = new HookManager(testDir);

      const result = await manager.executeHooks('pre-tool', {
        hookType: 'pre-tool',
        toolName: 'test',
        params: { original: true }
      });

      expect(result.success).to.be.true;
      expect(result.modifiedParams).to.exist;
      expect(result.modifiedParams.newParam).to.equal('value');
    });

    it('should ignore invalid hook types in config', () => {
      const config = {
        'invalid-hook-type': {
          command: 'echo',
          args: ['test']
        },
        'pre-write': {
          command: 'echo',
          args: ['valid']
        }
      };

      fs.writeFileSync(hooksConfigPath, JSON.stringify(config, null, 2));

      const manager = new HookManager(testDir);

      expect(manager.hasHooks('pre-write')).to.be.true;
      expect(manager.getStats().totalHooks).to.equal(1);
    });
  });

  describe('Hook Integration', () => {
    it('should execute multiple hooks in sequence', async () => {
      const config = {
        'pre-tool': [
          {
            command: 'echo',
            args: ['first']
          },
          {
            command: 'echo',
            args: ['second']
          }
        ]
      };

      fs.writeFileSync(hooksConfigPath, JSON.stringify(config, null, 2));

      const manager = new HookManager(testDir);

      const result = await manager.executeHooks('pre-tool', {
        hookType: 'pre-tool',
        toolName: 'test'
      });

      expect(result.success).to.be.true;
    });

    it('should stop on first blocking failure', async () => {
      const config = {
        'pre-tool': [
          {
            command: 'echo',
            args: ['first'],
            blocking: true
          },
          {
            command: 'exit',
            args: ['1'],
            blocking: true
          },
          {
            command: 'echo',
            args: ['third']
          }
        ]
      };

      fs.writeFileSync(hooksConfigPath, JSON.stringify(config, null, 2));

      const manager = new HookManager(testDir);

      const result = await manager.executeHooks('pre-tool', {
        hookType: 'pre-tool',
        toolName: 'test'
      });

      expect(result.success).to.be.false;
      expect(result.blocked).to.be.true;
    });
  });
});
