import * as os from 'os';

/**
 * Cross-platform command utilities
 * Provides platform-specific commands that work on Windows, Mac, and Linux
 */

export class PlatformCommands {
  private static isWindows = os.platform() === 'win32';
  private static isMac = os.platform() === 'darwin';
  private static isLinux = os.platform() === 'linux';

  /**
   * Get the correct delete file command for the platform
   */
  static deleteFile(filepath: string): string {
    if (this.isWindows) {
      // Windows: use del with quotes for paths with spaces
      return `del /f "${filepath.replace(/\//g, '\\')}"`;
    } else {
      // Unix-like: use rm
      return `rm -f "${filepath}"`;
    }
  }

  /**
   * Get the correct delete directory command for the platform
   */
  static deleteDirectory(dirpath: string): string {
    if (this.isWindows) {
      // Windows: use rmdir or rd
      return `rmdir /s /q "${dirpath.replace(/\//g, '\\')}"`;
    } else {
      // Unix-like: use rm -rf
      return `rm -rf "${dirpath}"`;
    }
  }

  /**
   * Get the correct copy command for the platform
   */
  static copyFile(source: string, destination: string): string {
    if (this.isWindows) {
      return `copy "${source.replace(/\//g, '\\')}" "${destination.replace(/\//g, '\\')}"`;
    } else {
      return `cp "${source}" "${destination}"`;
    }
  }

  /**
   * Get the correct move/rename command for the platform
   */
  static moveFile(source: string, destination: string): string {
    if (this.isWindows) {
      return `move "${source.replace(/\//g, '\\')}" "${destination.replace(/\//g, '\\')}"`;
    } else {
      return `mv "${source}" "${destination}"`;
    }
  }

  /**
   * Get the correct list directory command for the platform
   */
  static listDirectory(dirpath: string = '.'): string {
    if (this.isWindows) {
      return `dir "${dirpath.replace(/\//g, '\\')}"`;
    } else {
      return `ls -la "${dirpath}"`;
    }
  }

  /**
   * Get the correct command to check if file exists
   */
  static checkFileExists(filepath: string): string {
    if (this.isWindows) {
      return `if exist "${filepath.replace(/\//g, '\\')}" (echo EXISTS) else (echo NOT_FOUND)`;
    } else {
      return `if [ -f "${filepath}" ]; then echo EXISTS; else echo NOT_FOUND; fi`;
    }
  }

  /**
   * Get the correct clear screen command
   */
  static clearScreen(): string {
    return this.isWindows ? 'cls' : 'clear';
  }

  /**
   * Get the correct which/where command to find executables
   */
  static which(command: string): string {
    return this.isWindows ? `where ${command}` : `which ${command}`;
  }

  /**
   * Get platform information
   */
  static getPlatformInfo(): {
    platform: string;
    isWindows: boolean;
    isMac: boolean;
    isLinux: boolean;
    shell: string;
  } {
    return {
      platform: os.platform(),
      isWindows: this.isWindows,
      isMac: this.isMac,
      isLinux: this.isLinux,
      shell: this.isWindows ? 'cmd.exe' : process.env.SHELL || '/bin/bash'
    };
  }

  /**
   * Convert Unix-style path to platform-specific path
   */
  static normalizePath(path: string): string {
    if (this.isWindows) {
      return path.replace(/\//g, '\\');
    }
    return path;
  }

  /**
   * Get environment variable in a cross-platform way
   */
  static getEnvVar(name: string): string | undefined {
    // Windows env vars are case-insensitive
    if (this.isWindows) {
      const upperName = name.toUpperCase();
      for (const [key, value] of Object.entries(process.env)) {
        if (key.toUpperCase() === upperName) {
          return value;
        }
      }
      return undefined;
    }
    return process.env[name];
  }
}

export default PlatformCommands;