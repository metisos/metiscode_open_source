import { spawn } from 'child_process';
import yaml from 'js-yaml';
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
          const modifiedParams = this.extractModifiedParams(stdout);

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

  private extractModifiedParams(stdout: string) {
    const trimmed = stdout.trim();

    if (!trimmed) {
      return undefined;
    }

    const candidates = new Set<string>();
    candidates.add(trimmed);
    candidates.add(trimmed.replace(/'/g, '"'));
    candidates.add(
      trimmed.replace(/([{,]\s*)([A-Za-z0-9_-]+)\s*:/g, (_, prefix, key) => `${prefix}"${key}":`)
    );

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch {
        try {
          const parsed = yaml.load(candidate);
          if (parsed && typeof parsed === 'object') {
            return parsed;
          }
        } catch {
          continue;
        }
      }
    }

    return undefined;
  }
}
