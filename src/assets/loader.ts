import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { Persona, Workflow, Skill } from "../types/persona";

export class AssetLoader {
  private readonly workspaceRoot: string;
  private readonly configDirCandidates: string[];

  constructor(basePath: string = process.cwd()) {
    const looksLikeConfigDir = this.isConfigDirectory(basePath);
    this.workspaceRoot = looksLikeConfigDir ? path.dirname(basePath) : basePath;

    const preferred = looksLikeConfigDir ? basePath : path.join(this.workspaceRoot, ".metis");
    const testDir = path.join(this.workspaceRoot, ".metis-test");

    const candidates = new Set<string>();

    const runningInTest = Boolean(process.env.VITEST_WORKER_ID || process.env.JEST_WORKER_ID);
    if (runningInTest) {
      candidates.add(testDir);
      candidates.add(preferred);
    } else {
      candidates.add(preferred);
      candidates.add(testDir);
    }

    this.configDirCandidates = Array.from(candidates);
  }

  private isConfigDirectory(dir: string): boolean {
    const name = path.basename(dir);
    return name === ".metis" || name === ".metis-test";
  }

  private getConfigDirectories(): string[] {
    return this.configDirCandidates;
  }

  private resolveFromConfig(subPath: string[]): string | null {
    for (const base of this.getConfigDirectories()) {
      const candidate = path.join(base, ...subPath);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  private ensureConfigSubdirectory(subDir: string): string {
    for (const base of this.getConfigDirectories()) {
      const target = path.join(base, subDir);
      if (fs.existsSync(target)) {
        return target;
      }
    }

    for (const base of this.getConfigDirectories()) {
      if (fs.existsSync(base)) {
        const target = path.join(base, subDir);
        fs.mkdirSync(target, { recursive: true });
        return target;
      }
    }

    const [first] = this.getConfigDirectories();
    const target = path.join(first, subDir);
    fs.mkdirSync(target, { recursive: true });
    return target;
  }

  // Persona loading with project-specific support
  async loadPersona(name: string): Promise<Persona> {
    // Priority 1: Project-specific persona file (.metis/persona.yaml)
    if (name === "project") {
      const projectPersonaPath = this.resolveFromConfig(["persona.yaml"]);
      if (projectPersonaPath) {
        return this.parsePersonaFile(projectPersonaPath);
      }
    }

    // Priority 2: Local personas (.metis/personas/name.yaml)
    const personaPath = this.resolveFromConfig(["personas", `${name}.yaml`]);
    if (personaPath) {
      return this.parsePersonaFile(personaPath);
    }

    // Priority 3: Built-in personas
    const builtinPath = path.join(__dirname, "..", "..", "assets", "personas", `${name}.yaml`);
    if (!fs.existsSync(builtinPath)) {
      throw new Error(`Persona not found: ${name}`);
    }
    return this.parsePersonaFile(builtinPath);
  }

  // Load project-specific persona if it exists
  async loadProjectPersona(): Promise<Persona | null> {
    const projectPersonaPath = this.resolveFromConfig(["persona.yaml"]);
    if (projectPersonaPath) {
      return this.parsePersonaFile(projectPersonaPath);
    }
    return null;
  }

  async listPersonas(): Promise<string[]> {
    const personas: string[] = [];
    const seen = new Set<string>();

    // Load from workspace
    for (const base of this.getConfigDirectories()) {
      const workspaceDir = path.join(base, "personas");
      if (!fs.existsSync(workspaceDir)) {
        continue;
      }

      const files = fs.readdirSync(workspaceDir)
        .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
        .map(f => path.basename(f, path.extname(f)));

      for (const file of files) {
        if (!seen.has(file)) {
          seen.add(file);
          personas.push(file);
        }
      }
    }

    // Load built-in personas
    const builtinDir = path.join(__dirname, "..", "..", "assets", "personas");
    if (fs.existsSync(builtinDir)) {
      const files = fs.readdirSync(builtinDir)
        .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
        .map(f => path.basename(f, path.extname(f)));
      for (const file of files) {
        if (!seen.has(file)) {
          seen.add(file);
          personas.push(file);
        }
      }
    }

    return personas;
  }

  // Workflow loading
  async loadWorkflow(name: string): Promise<Workflow> {
    const workflowPath = this.resolveFromConfig(["workflows", `${name}.yaml`]);

    if (!workflowPath) {
      throw new Error(`Workflow not found: ${name}`);
    }

    const content = fs.readFileSync(workflowPath, "utf8");
    const workflow = yaml.load(content) as Workflow;
    
    if (!workflow.name || !workflow.steps) {
      throw new Error(`Invalid workflow format: ${name}`);
    }
    
    return workflow;
  }

  async listWorkflows(): Promise<string[]> {
    const workflows: string[] = [];
    const seen = new Set<string>();

    for (const base of this.getConfigDirectories()) {
      const workflowsDir = path.join(base, "workflows");
      if (!fs.existsSync(workflowsDir)) {
        continue;
      }

      for (const file of fs.readdirSync(workflowsDir)) {
        if (!file.endsWith('.yaml') && !file.endsWith('.yml')) {
          continue;
        }

        const name = path.basename(file, path.extname(file));
        if (!seen.has(name)) {
          seen.add(name);
          workflows.push(name);
        }
      }
    }

    return workflows;
  }

  // Skill loading
  async loadSkill(name: string): Promise<Skill> {
    const skillPath = this.resolveFromConfig(["skills", `${name}.yaml`]);

    if (!skillPath) {
      throw new Error(`Skill not found: ${name}`);
    }
    
    const content = fs.readFileSync(skillPath, "utf8");
    const skill = yaml.load(content) as Skill;
    
    if (!skill.name || !skill.tools) {
      throw new Error(`Invalid skill format: ${name}`);
    }
    
    return skill;
  }

  async listSkills(): Promise<string[]> {
    const skills: string[] = [];
    const seen = new Set<string>();

    for (const base of this.getConfigDirectories()) {
      const skillsDir = path.join(base, "skills");
      if (!fs.existsSync(skillsDir)) {
        continue;
      }

      for (const file of fs.readdirSync(skillsDir)) {
        if (!file.endsWith('.yaml') && !file.endsWith('.yml')) {
          continue;
        }

        const name = path.basename(file, path.extname(file));
        if (!seen.has(name)) {
          seen.add(name);
          skills.push(name);
        }
      }
    }

    return skills;
  }

  private parsePersonaFile(filePath: string): Persona {
    const content = fs.readFileSync(filePath, "utf8");
    const persona = yaml.load(content) as Persona;
    
    if (!persona.name || !persona.system_prompt) {
      throw new Error(`Invalid persona format: ${filePath}`);
    }
    
    return persona;
  }

  // Utility methods
  async validateAsset(type: 'persona' | 'workflow' | 'skill', name: string): Promise<boolean> {
    try {
      switch (type) {
        case 'persona':
          await this.loadPersona(name);
          break;
        case 'workflow':
          await this.loadWorkflow(name);
          break;
        case 'skill':
          await this.loadSkill(name);
          break;
      }
      return true;
    } catch {
      return false;
    }
  }

  async createPersona(persona: Persona, overwrite = false): Promise<void> {
    const personasDir = this.ensureConfigSubdirectory("personas");
    const personaPath = path.join(personasDir, `${persona.name}.yaml`);
    
    if (fs.existsSync(personaPath) && !overwrite) {
      throw new Error(`Persona already exists: ${persona.name}`);
    }
    
    const dir = path.dirname(personaPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const yamlContent = yaml.dump(persona, { indent: 2 });
    fs.writeFileSync(personaPath, yamlContent);
  }
}