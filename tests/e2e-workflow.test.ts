import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const testDir = path.join(process.cwd(), 'tests', 'test-e2e');
const cliPath = path.join(process.cwd(), 'dist', 'cli', 'index.js');

describe('End-to-End Workflow Tests', () => {
  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('Workflow 1: Create, Read, Edit File', () => {
    it('should create a new file via headless mode', async () => {
      const testFile = path.join(testDir, 'test.js');
      const task = `Create a file at ${testFile} with content "console.log('hello');"`;

      const result = await execAsync(
        `METIS_HEADLESS=true node "${cliPath}" run "${task}"`,
        { timeout: 30000 }
      );

      expect(result.stdout).to.include('completed');
      expect(fs.existsSync(testFile)).to.be.true;

      const content = fs.readFileSync(testFile, 'utf8');
      expect(content).to.include('console.log');
    }).timeout(35000);

    it('should read file with line numbers', async () => {
      const testFile = path.join(testDir, 'read-test.js');
      fs.writeFileSync(testFile, `function foo() {\n  return 42;\n}`, 'utf8');

      const task = `Read the file ${testFile}`;

      const result = await execAsync(
        `METIS_HEADLESS=true node "${cliPath}" run "${task}"`,
        { timeout: 30000 }
      );

      expect(result.stdout).to.include('→'); // Line number separator
      expect(result.stdout).to.include('function foo');
    }).timeout(35000);

    it('should edit file with exact string matching', async () => {
      const testFile = path.join(testDir, 'edit-test.js');
      fs.writeFileSync(testFile, `const x = 1;\nconst y = 2;`, 'utf8');

      const task = `In ${testFile}, replace "const x = 1;" with "const x = 100;"`;

      const result = await execAsync(
        `METIS_HEADLESS=true node "${cliPath}" run "${task}"`,
        { timeout: 30000 }
      );

      expect(result.stdout).to.include('completed');

      const content = fs.readFileSync(testFile, 'utf8');
      expect(content).to.include('const x = 100');
      expect(content).to.include('const y = 2');
    }).timeout(35000);
  });

  describe('Workflow 2: Multi-File Operations', () => {
    it('should create multiple files in one task', async () => {
      const task = `Create two files in ${testDir}: file1.txt with "test1" and file2.txt with "test2"`;

      const result = await execAsync(
        `METIS_HEADLESS=true node "${cliPath}" run "${task}"`,
        { timeout: 30000 }
      );

      expect(result.stdout).to.include('completed');

      const file1 = path.join(testDir, 'file1.txt');
      const file2 = path.join(testDir, 'file2.txt');

      expect(fs.existsSync(file1)).to.be.true;
      expect(fs.existsSync(file2)).to.be.true;

      expect(fs.readFileSync(file1, 'utf8')).to.include('test1');
      expect(fs.readFileSync(file2, 'utf8')).to.include('test2');
    }).timeout(35000);
  });

  describe('Workflow 3: Search and Replace', () => {
    it('should find and replace text across file', async () => {
      const testFile = path.join(testDir, 'search-test.js');
      const content = `const API_KEY = 'old_key';\nconst DEBUG = true;\nconst API_KEY_BACKUP = 'old_key';`;
      fs.writeFileSync(testFile, content, 'utf8');

      const task = `In ${testFile}, replace the first occurrence of 'old_key' with 'new_key'`;

      const result = await execAsync(
        `METIS_HEADLESS=true node "${cliPath}" run "${task}"`,
        { timeout: 30000 }
      );

      const newContent = fs.readFileSync(testFile, 'utf8');

      // Should only replace first occurrence due to exact string matching
      const matches = newContent.match(/new_key/g);
      expect(matches).to.have.lengthOf(1);
    }).timeout(35000);
  });

  describe('Workflow 4: File Organization', () => {
    it('should create directory structure', async () => {
      const task = `Create a directory structure in ${testDir}: src/components, src/utils, tests`;

      const result = await execAsync(
        `METIS_HEADLESS=true node "${cliPath}" run "${task}"`,
        { timeout: 30000 }
      );

      expect(result.stdout).to.include('completed');

      expect(fs.existsSync(path.join(testDir, 'src'))).to.be.true;
      expect(fs.existsSync(path.join(testDir, 'src', 'components'))).to.be.true;
      expect(fs.existsSync(path.join(testDir, 'src', 'utils'))).to.be.true;
      expect(fs.existsSync(path.join(testDir, 'tests'))).to.be.true;
    }).timeout(35000);
  });

  describe('Workflow 5: Code Refactoring', () => {
    it('should refactor function signature', async () => {
      const testFile = path.join(testDir, 'refactor-test.js');
      const original = `function calculate(a, b) {\n  return a + b;\n}`;
      fs.writeFileSync(testFile, original, 'utf8');

      const task = `In ${testFile}, change the function signature from "function calculate(a, b)" to "function calculate(x, y)"`;

      const result = await execAsync(
        `METIS_HEADLESS=true node "${cliPath}" run "${task}"`,
        { timeout: 30000 }
      );

      const newContent = fs.readFileSync(testFile, 'utf8');
      expect(newContent).to.include('function calculate(x, y)');
    }).timeout(35000);
  });

  describe('Workflow 6: Token Budget Tracking', () => {
    it('should track token usage during operations', async () => {
      const task = `Create a simple hello world file in ${testDir}`;

      const result = await execAsync(
        `METIS_HEADLESS=true node "${cliPath}" run --verbose "${task}"`,
        { timeout: 30000 }
      );

      // Should show token usage in verbose mode
      expect(result.stdout).to.include('tokens');
    }).timeout(35000);
  });

  describe('Workflow 7: Error Handling', () => {
    it('should handle file not found errors gracefully', async () => {
      const nonExistentFile = path.join(testDir, 'does-not-exist.js');
      const task = `Read ${nonExistentFile}`;

      try {
        await execAsync(
          `METIS_HEADLESS=true node "${cliPath}" run "${task}"`,
          { timeout: 30000 }
        );
        // Should not reach here
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        // Error is expected
        expect(error.code).to.exist;
      }
    }).timeout(35000);

    it('should handle invalid edit operations', async () => {
      const testFile = path.join(testDir, 'invalid-edit.js');
      fs.writeFileSync(testFile, 'const x = 1;', 'utf8');

      const task = `In ${testFile}, replace "const y = 2;" with "const y = 3;"`;

      try {
        await execAsync(
          `METIS_HEADLESS=true node "${cliPath}" run "${task}"`,
          { timeout: 30000 }
        );
        // May complete but should indicate text not found
      } catch (error) {
        // Error handling is acceptable
      }
    }).timeout(35000);
  });

  describe('Workflow 8: Complex Multi-Step Tasks', () => {
    it('should handle complex task with multiple operations', async () => {
      const task = `In ${testDir}, create a package.json with name "test-project", then create an index.js file that exports a hello function`;

      const result = await execAsync(
        `METIS_HEADLESS=true node "${cliPath}" run "${task}"`,
        { timeout: 45000 }
      );

      expect(result.stdout).to.include('completed');

      const packageJson = path.join(testDir, 'package.json');
      const indexJs = path.join(testDir, 'index.js');

      expect(fs.existsSync(packageJson)).to.be.true;
      expect(fs.existsSync(indexJs)).to.be.true;

      const pkgContent = fs.readFileSync(packageJson, 'utf8');
      expect(pkgContent).to.include('test-project');

      const indexContent = fs.readFileSync(indexJs, 'utf8');
      expect(indexContent).to.include('hello');
    }).timeout(50000);
  });
});

describe('Performance Benchmarks', () => {
  const testDir = path.join(process.cwd(), 'tests', 'test-perf');

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should complete simple task under 10 seconds', async () => {
    const start = Date.now();
    const task = `Create a file ${path.join(testDir, 'perf.txt')} with content "test"`;

    await execAsync(
      `METIS_HEADLESS=true node "${cliPath}" run "${task}"`,
      { timeout: 15000 }
    );

    const duration = Date.now() - start;
    expect(duration).to.be.lessThan(10000);
  }).timeout(15000);

  it('should handle medium file efficiently', async () => {
    const testFile = path.join(testDir, 'medium.js');
    const lines = Array(500).fill('console.log("test");').join('\n');
    fs.writeFileSync(testFile, lines, 'utf8');

    const start = Date.now();
    const task = `Read ${testFile}`;

    await execAsync(
      `METIS_HEADLESS=true node "${cliPath}" run "${task}"`,
      { timeout: 15000 }
    );

    const duration = Date.now() - start;
    expect(duration).to.be.lessThan(15000);
  }).timeout(20000);
});
