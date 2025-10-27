import { PlatformCommands } from "../../utils/platformCommands";
import { execSync } from "child_process";

/**
 * Git error handler with automatic recovery strategies
 */
export class GitErrorHandler {
  /**
   * Handle common git errors and attempt recovery
   */
  static async handleGitError(error: string, context: any): Promise<{
    recovered: boolean;
    suggestion: string;
    command?: string;
  }> {
    // Git lock file error
    if (error.includes('index.lock') && error.includes('File exists')) {
      const lockPath = this.extractLockPath(error);
      if (lockPath) {
        return {
          recovered: false,
          suggestion: `Git lock file exists. The previous git operation may have crashed.`,
          command: PlatformCommands.deleteFile(lockPath)
        };
      }
    }

    // Permission denied errors
    if (error.includes('Permission denied') || error.includes('EACCES')) {
      return {
        recovered: false,
        suggestion: 'Permission denied. You may need to run with administrator privileges or check file permissions.'
      };
    }

    // Repository not found
    if (error.includes('not a git repository')) {
      return {
        recovered: false,
        suggestion: 'Not a git repository. Run "git init" to initialize a repository.'
      };
    }

    // Merge conflicts
    if (error.includes('CONFLICT') || error.includes('fix conflicts')) {
      return {
        recovered: false,
        suggestion: 'Merge conflicts detected. Resolve conflicts manually or use "git merge --abort" to cancel.'
      };
    }

    // Uncommitted changes
    if (error.includes('Your local changes') || error.includes('would be overwritten')) {
      return {
        recovered: false,
        suggestion: 'Uncommitted changes detected. Commit, stash, or discard changes before proceeding.'
      };
    }

    // Network/remote errors
    if (error.includes('Could not read from remote') || error.includes('Connection')) {
      return {
        recovered: false,
        suggestion: 'Network error. Check your internet connection and repository remote URL.'
      };
    }

    // Authentication errors
    if (error.includes('Authentication failed') || error.includes('Invalid username or password')) {
      return {
        recovered: false,
        suggestion: 'Authentication failed. Check your git credentials or SSH keys.'
      };
    }

    // Detached HEAD
    if (error.includes('detached HEAD')) {
      return {
        recovered: false,
        suggestion: 'You are in detached HEAD state. Create a branch with "git checkout -b branch-name" to save changes.'
      };
    }

    // Large file errors
    if (error.includes('exceeds GitHub\'s file size limit') || error.includes('large file')) {
      return {
        recovered: false,
        suggestion: 'File too large for Git. Consider using Git LFS (Large File Storage) for large files.'
      };
    }

    // Default case
    return {
      recovered: false,
      suggestion: 'Git operation failed. Check the error message for details.'
    };
  }

  /**
   * Extract lock file path from error message
   */
  private static extractLockPath(error: string): string | null {
    const match = error.match(/Unable to create '([^']+\.lock)'/);
    if (match && match[1]) {
      return match[1];
    }

    const match2 = error.match(/(\S+\.lock).*File exists/);
    if (match2 && match2[1]) {
      return match2[1];
    }

    return null;
  }

  /**
   * Check git repository status
   */
  static checkGitStatus(): { isRepo: boolean; hasChanges: boolean; branch: string | null } {
    try {
      const status = execSync('git status --porcelain', { encoding: 'utf8' });
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();

      return {
        isRepo: true,
        hasChanges: status.length > 0,
        branch
      };
    } catch (error) {
      return {
        isRepo: false,
        hasChanges: false,
        branch: null
      };
    }
  }

  /**
   * Attempt to recover from common git issues
   */
  static async attemptRecovery(error: string): Promise<boolean> {
    const result = await this.handleGitError(error, {});

    if (result.command) {
      console.log(`Attempting recovery: ${result.suggestion}`);
      try {
        execSync(result.command, { encoding: 'utf8' });
        console.log('Recovery successful');
        return true;
      } catch (recoveryError) {
        console.log('Recovery failed:', recoveryError.message);
        return false;
      }
    }

    console.log(`Git error: ${result.suggestion}`);
    return false;
  }
}

export default GitErrorHandler;