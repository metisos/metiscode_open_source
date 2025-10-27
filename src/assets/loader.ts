import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { Persona, Workflow, Skill } from "../types/persona";

export class AssetLoader {
  private basePath: string;

  constructor(basePath: string = process.cwd()) {
    this.basePath = path.join(basePath, ".metis");
  }

  // Persona loading with project-specific support
  async loadPersona(name: string): Promise<Persona> {
    // Priority 1: Project-specific persona file (.metis/persona.yaml)
    const projectPersonaPath = path.join(this.basePath, "persona.yaml");
    if (name === "project" && fs.existsSync(projectPersonaPath)) {
      return this.parsePersonaFile(projectPersonaPath);
    }

    // Priority 2: Local personas (.metis/personas/name.yaml)
    const personaPath = path.join(this.basePath, "personas", `${name}.yaml`);
    if (fs.existsSync(personaPath)) {
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
    const projectPersonaPath = path.join(this.basePath, "persona.yaml");
    if (fs.existsSync(projectPersonaPath)) {
      return this.parsePersonaFile(projectPersonaPath);
    }
    return null;
  }

  async listPersonas(): Promise<string[]> {
    const personas: string[] = [];
    
    // Load from workspace
    const workspaceDir = path.join(this.basePath, "personas");
    if (fs.existsSync(workspaceDir)) {
      const files = fs.readdirSync(workspaceDir)
        .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
        .map(f => path.basename(f, path.extname(f)));
      personas.push(...files);
    }
    
    // Load built-in personas
    const builtinDir = path.join(__dirname, "..", "..", "assets", "personas");
    if (fs.existsSync(builtinDir)) {
      const files = fs.readdirSync(builtinDir)
        .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
        .map(f => path.basename(f, path.extname(f)));
      personas.push(...files.filter(f => !personas.includes(f)));
    }
    
    return personas;
  }

  // Workflow loading
  async loadWorkflow(name: string): Promise<Workflow> {
    const workflowPath = path.join(this.basePath, "workflows", `${name}.yaml`);
    
    if (!fs.existsSync(workflowPath)) {
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
    const workflowsDir = path.join(this.basePath, "workflows");
    if (!fs.existsSync(workflowsDir)) {
      return [];
    }
    
    return fs.readdirSync(workflowsDir)
      .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
      .map(f => path.basename(f, path.extname(f)));
  }

  // Skill loading
  async loadSkill(name: string): Promise<Skill> {
    const skillPath = path.join(this.basePath, "skills", `${name}.yaml`);
    
    if (!fs.existsSync(skillPath)) {
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
    const skillsDir = path.join(this.basePath, "skills");
    if (!fs.existsSync(skillsDir)) {
      return [];
    }
    
    return fs.readdirSync(skillsDir)
      .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
      .map(f => path.basename(f, path.extname(f)));
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
    const personaPath = path.join(this.basePath, "personas", `${persona.name}.yaml`);
    
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