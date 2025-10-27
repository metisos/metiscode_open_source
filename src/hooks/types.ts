export type HookType =
  | 'pre-tool'
  | 'post-tool'
  | 'pre-write'
  | 'post-write'
  | 'pre-bash'
  | 'post-bash'
  | 'pre-commit'
  | 'post-commit'
  | 'user-prompt-submit';

export interface HookConfig {
  command: string;
  args?: string[];
  timeout?: number;
  blocking?: boolean;
  env?: Record<string, string>;
}

export interface HookContext {
  hookType: HookType;
  toolName?: string;
  params?: any;
  result?: any;
  filePath?: string;
  content?: string;
  command?: string;
}

export interface HookResult {
  success: boolean;
  output?: string;
  error?: string;
  blocked?: boolean;
  modifiedParams?: any;
}

export const VALID_HOOK_TYPES: readonly HookType[] = [
  'pre-tool',
  'post-tool',
  'pre-write',
  'post-write',
  'pre-bash',
  'post-bash',
  'pre-commit',
  'post-commit',
  'user-prompt-submit'
] as const;

export function isValidHookType(type: string): type is HookType {
  return (VALID_HOOK_TYPES as readonly string[]).includes(type);
}
