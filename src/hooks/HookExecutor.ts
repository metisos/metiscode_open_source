import { spawn } from 'child_process';
import { HookConfig, HookContext, HookResult } from './types';

export class HookExecutor {
  async execute(
    config: HookConfig,
    context: HookContext
  ): Promise<HookResult> {
    const timeout = config.timeout || 30000;

    const command = this.replaceVariables(config.command, context);
    const args = config.args?.map(arg =>
      this.replaceVariables(arg, context)
    ) || [];

    return new Promise((resolve) => {
      const childProcess = spawn(command, args, {
        env: { ...process.env, ...config.env },
        shell: true,
        timeout
      });

      let stdout = '';
      let stderr = '';

      childProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      childProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      childProcess.on('close', (code) => {
        if (code === 0) {
          let modifiedParams;
          try {
            modifiedParams = JSON.parse(stdout);
          } catch {
            // Not JSON, that's fine
          }

          resolve({
            success: true,
            output: stdout,
            modifiedParams
          });
        } else {
          resolve({
            success: false,
            error: stderr || `Process exited with code ${code}`,
            output: stdout
          });
        }
      });

      childProcess.on('error', (error) => {
        resolve({
          success: false,
          error: error.message
        });
      });

      const timeoutId = setTimeout(() => {
        childProcess.kill();
        resolve({
          success: false,
          error: 'Hook execution timeout'
        });
      }, timeout);

      childProcess.on('exit', () => {
        clearTimeout(timeoutId);
      });
    });
  }

  private replaceVariables(str: string, context: HookContext): string {
    return str
      .replace(/\$\{hookType\}/g, context.hookType)
      .replace(/\$\{toolName\}/g, context.toolName || '')
      .replace(/\$\{filePath\}/g, context.filePath || '')
      .replace(/\$\{command\}/g, context.command || '')
      .replace(/\$\{content\}/g, context.content || '');
  }
}
