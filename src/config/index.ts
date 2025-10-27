import fs from "fs";
import path from "path";
import os from "os";

export type MetisConfig = {
  provider: string;
  model: string;
  temperature?: number;
  safety?: { dryRun?: boolean; requireExecApproval?: boolean };
  ignore?: string[];
};

export type Secrets = Record<string, string>;

// Get global config directory
function getGlobalConfigDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.metis');
}

// Get global secrets path
function getGlobalSecretsPath(): string {
  return path.join(getGlobalConfigDir(), 'secrets.json');
}

// Get global config path
function getGlobalConfigPath(): string {
  return path.join(getGlobalConfigDir(), 'config.json');
}

export function loadConfig(): MetisConfig {
  const globalConfigPath = getGlobalConfigPath();
  let base: MetisConfig = {
    provider: "groq", // Always use Groq
    model: process.env.METIS_MODEL || "openai/gpt-oss-20b",
    temperature: process.env.METIS_TEMPERATURE
      ? Number(process.env.METIS_TEMPERATURE)
      : 0.2,
    safety: { dryRun: false, requireExecApproval: true },
    ignore: ["node_modules/**", ".git/**", "dist/**", ".metis/sessions/**"],
  };

  // Only load from global config
  if (fs.existsSync(globalConfigPath)) {
    try {
      const disk = JSON.parse(fs.readFileSync(globalConfigPath, "utf8"));
      base = { ...base, ...disk };
      // Force provider to always be groq
      base.provider = "groq";
    } catch (e) {
      console.warn("Failed to parse global config; using defaults.");
    }
  }
  return base;
}

export function saveGlobalConfig(config: MetisConfig): void {
  const globalConfigPath = getGlobalConfigPath();
  const globalDir = getGlobalConfigDir();
  
  // Ensure global directory exists
  if (!fs.existsSync(globalDir)) {
    fs.mkdirSync(globalDir, { recursive: true });
  }
  
  fs.writeFileSync(globalConfigPath, JSON.stringify(config, null, 2));
}

export function getGlobalConfigLocation(): string {
  return getGlobalConfigPath();
}

export function loadSecrets(cwd = process.cwd()): Secrets {
  const out: Secrets = {};

  // Priority 1: Environment variable (highest priority)
  if (process.env.GROQ_API_KEY) out.groq = process.env.GROQ_API_KEY;

  // Priority 2: Global secrets file (~/.metis/secrets.json)
  const globalSecretsPath = getGlobalSecretsPath();
  if (fs.existsSync(globalSecretsPath)) {
    try {
      const globalSecrets = JSON.parse(fs.readFileSync(globalSecretsPath, "utf8"));
      // Only add groq key if not already set by environment variable
      if (!out.groq && globalSecrets.groq) {
        out.groq = globalSecrets.groq;
      }
    } catch {
      // ignore parsing errors
    }
  }

  // Priority 3: Local project secrets file (lowest priority, for backward compatibility)
  const localMetisDir = path.join(cwd, ".metis");
  const localSecretsPath = path.join(localMetisDir, "secrets.json");
  if (fs.existsSync(localSecretsPath)) {
    try {
      const localSecrets = JSON.parse(fs.readFileSync(localSecretsPath, "utf8"));
      // Only add groq key if not already set by environment variable or global config
      if (!out.groq && localSecrets.groq) {
        out.groq = localSecrets.groq;
      }
    } catch {
      // ignore parsing errors
    }
  }

  return out;
}

// Save secrets to global location
export function saveGlobalSecrets(secrets: Secrets): void {
  const globalConfigDir = getGlobalConfigDir();
  const globalSecretsPath = getGlobalSecretsPath();
  
  // Ensure global config directory exists
  if (!fs.existsSync(globalConfigDir)) {
    fs.mkdirSync(globalConfigDir, { recursive: true });
  }
  
  // Load existing secrets
  let existingSecrets: Secrets = {};
  if (fs.existsSync(globalSecretsPath)) {
    try {
      existingSecrets = JSON.parse(fs.readFileSync(globalSecretsPath, 'utf8'));
    } catch {
      // ignore parsing errors, start fresh
    }
  }
  
  // Merge with new secrets
  const mergedSecrets = { ...existingSecrets, ...secrets };
  
  // Save to global location
  fs.writeFileSync(globalSecretsPath, JSON.stringify(mergedSecrets, null, 2) + "\n");
  
  // Set restrictive permissions (Unix-like systems)
  try {
    fs.chmodSync(globalSecretsPath, 0o600);
  } catch {
    // Ignore permission errors on Windows
  }
}

// Get global secrets path for display purposes
export function getGlobalSecretsLocation(): string {
  return getGlobalSecretsPath();
}

