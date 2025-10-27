import { Tool } from '../../tools/registry';
import { toolRegistry } from '../../tools/registry';

export interface Skill {
  name: string;
  description: string;
  category: string;
  level: 'basic' | 'intermediate' | 'advanced' | 'expert';
  tools: string[]; // Tool names this skill can use
  prerequisites?: string[]; // Other skills required
  metadata?: Record<string, any>;
}

export interface SkillSet {
  name: string;
  description: string;
  skills: string[];
  tools: Tool[];
  capabilities: string[];
  
  // Methods
  getTools(): Tool[];
  canExecute(toolName: string): boolean;
  getCapabilities(): string[];
  hasSkill(skillName: string): boolean;
  getSkillLevel(skillName: string): string | null;
}

export class SkillManager {
  private static skills: Map<string, Skill> = new Map();
  private static skillSets: Map<string, SkillSetImpl> = new Map();

  // Initialize default skills
  static initialize(): void {
    this.initializeDefaultSkills();
    this.initializeDefaultSkillSets();
  }

  // Initialize core skills
  private static initializeDefaultSkills(): void {
    const defaultSkills: Skill[] = [
      // Programming Skills
      {
        name: 'typescript',
        description: 'TypeScript programming and type system',
        category: 'programming',
        level: 'expert',
        tools: ['read_file', 'write_file', 'edit_file', 'grep', 'bash'],
        metadata: { languages: ['typescript', 'javascript'] }
      },
      {
        name: 'javascript',
        description: 'JavaScript programming and runtime',
        category: 'programming',
        level: 'expert',
        tools: ['read_file', 'write_file', 'edit_file', 'grep', 'bash'],
        metadata: { languages: ['javascript'] }
      },
      {
        name: 'node-js',
        description: 'Node.js runtime and ecosystem',
        category: 'programming',
        level: 'advanced',
        tools: ['read_file', 'write_file', 'bash', 'list_files'],
        prerequisites: ['javascript'],
        metadata: { runtime: 'node.js' }
      },
      {
        name: 'react',
        description: 'React framework and component development',
        category: 'frontend',
        level: 'advanced',
        tools: ['read_file', 'write_file', 'edit_file', 'multi_file_replace'],
        prerequisites: ['javascript', 'typescript'],
        metadata: { framework: 'react' }
      },

      // File Operations Skills
      {
        name: 'file-operations',
        description: 'File system operations and management',
        category: 'system',
        level: 'expert',
        tools: ['read_file', 'write_file', 'edit_file', 'list_files', 'create_directory', 'move_file'],
        metadata: { operations: ['read', 'write', 'edit', 'move', 'create'] }
      },
      {
        name: 'search-operations',
        description: 'Code search and pattern matching',
        category: 'system',
        level: 'advanced',
        tools: ['grep', 'find_files', 'batch_read'],
        metadata: { patterns: ['regex', 'glob', 'text-search'] }
      },

      // Git Skills
      {
        name: 'git-basics',
        description: 'Basic Git version control operations',
        category: 'version-control',
        level: 'advanced',
        tools: ['git_status', 'git_diff', 'git_log', 'git_add', 'git_commit'],
        metadata: { vcs: 'git' }
      },
      {
        name: 'git-advanced',
        description: 'Advanced Git operations and workflows',
        category: 'version-control',
        level: 'expert',
        tools: ['git_merge', 'git_stash', 'git_rebase', 'git_remote', 'git_branch', 'git_checkout'],
        prerequisites: ['git-basics'],
        metadata: { vcs: 'git', level: 'advanced' }
      },
      {
        name: 'github-ops',
        description: 'GitHub CLI and repository management',
        category: 'version-control',
        level: 'advanced',
        tools: ['github_pr', 'github_issue', 'github_repo', 'github_workflow'],
        prerequisites: ['git-basics'],
        metadata: { platform: 'github' }
      },

      // Testing Skills
      {
        name: 'testing',
        description: 'Software testing and quality assurance',
        category: 'quality',
        level: 'advanced',
        tools: ['bash', 'read_file', 'write_file', 'edit_file'],
        metadata: { frameworks: ['vitest', 'jest', 'cypress'] }
      },

      // Code Review Skills
      {
        name: 'code-review',
        description: 'Code review and quality analysis',
        category: 'quality',
        level: 'expert',
        tools: ['git_diff', 'grep', 'read_file', 'detect_conflicts', 'git_status_enhanced'],
        prerequisites: ['git-basics'],
        metadata: { focus: ['quality', 'security', 'performance'] }
      },

      // DevOps Skills
      {
        name: 'docker',
        description: 'Container management and orchestration',
        category: 'devops',
        level: 'advanced',
        tools: ['bash', 'read_file', 'write_file'],
        metadata: { containerization: 'docker' }
      },
      {
        name: 'ci-cd',
        description: 'Continuous integration and deployment',
        category: 'devops',
        level: 'advanced',
        tools: ['bash', 'read_file', 'write_file', 'github_workflow'],
        metadata: { automation: 'ci-cd' }
      },

      // Documentation Skills
      {
        name: 'technical-writing',
        description: 'Technical documentation and writing',
        category: 'documentation',
        level: 'advanced',
        tools: ['read_file', 'write_file', 'edit_file', 'organize_imports'],
        metadata: { formats: ['markdown', 'restructured-text'] }
      },

      // Debugging Skills
      {
        name: 'debugging',
        description: 'Problem diagnosis and troubleshooting',
        category: 'problem-solving',
        level: 'expert',
        tools: ['bash', 'grep', 'read_file', 'git_log', 'ps', 'env'],
        metadata: { techniques: ['logging', 'profiling', 'tracing'] }
      },

      // Project Management Skills
      {
        name: 'todo-management',
        description: 'Task and project organization',
        category: 'project-management',
        level: 'intermediate',
        tools: ['create_todo', 'update_todo', 'list_todos', 'delete_todo', 'clear_completed_todos'],
        metadata: { organization: 'task-management' }
      }
    ];

    for (const skill of defaultSkills) {
      this.skills.set(skill.name, skill);
    }
  }

  // Initialize default skill sets
  private static initializeDefaultSkillSets(): void {
    // Developer Skill Set
    this.registerSkillSet({
      name: 'developer',
      description: 'Comprehensive development skills for coding and implementation',
      skills: [
        'typescript',
        'javascript', 
        'node-js',
        'react',
        'file-operations',
        'search-operations',
        'git-basics',
        'git-advanced',
        'testing',
        'debugging',
        'todo-management'
      ]
    });

    // Reviewer Skill Set
    this.registerSkillSet({
      name: 'reviewer',
      description: 'Code review and quality assurance skills',
      skills: [
        'typescript',
        'javascript',
        'file-operations',
        'search-operations',
        'git-basics',
        'git-advanced',
        'code-review',
        'testing',
        'debugging'
      ]
    });

    // DevOps Skill Set
    this.registerSkillSet({
      name: 'devops',
      description: 'Infrastructure and deployment skills',
      skills: [
        'file-operations',
        'search-operations',
        'git-basics',
        'docker',
        'ci-cd',
        'github-ops',
        'debugging',
        'todo-management'
      ]
    });

    // Documentation Skill Set
    this.registerSkillSet({
      name: 'documentation',
      description: 'Technical writing and documentation skills',
      skills: [
        'technical-writing',
        'file-operations',
        'search-operations',
        'git-basics',
        'todo-management'
      ]
    });

    // Debugging Specialist Skill Set
    this.registerSkillSet({
      name: 'debugging-specialist',
      description: 'Specialized problem-solving and debugging skills',
      skills: [
        'debugging',
        'typescript',
        'javascript',
        'file-operations',
        'search-operations',
        'git-basics',
        'git-advanced',
        'testing'
      ]
    });
  }

  // Register a new skill
  static registerSkill(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  // Get skill by name
  static getSkill(name: string): Skill | null {
    return this.skills.get(name) || null;
  }

  // List available skills
  static listSkills(category?: string): string[] {
    const skills = Array.from(this.skills.values());
    const filteredSkills = category ? 
      skills.filter(s => s.category === category) : 
      skills;
    return filteredSkills.map(s => s.name);
  }

  // Get skills by category
  static getSkillsByCategory(category: string): Skill[] {
    return Array.from(this.skills.values()).filter(s => s.category === category);
  }

  // Register a skill set
  static registerSkillSet(config: {
    name: string;
    description: string;
    skills: string[];
  }): SkillSet {
    const skillSet = new SkillSetImpl(config.name, config.description, config.skills);
    this.skillSets.set(config.name, skillSet);
    return skillSet;
  }

  // Get skill set by name
  static getSkillSet(name: string): SkillSet | null {
    return this.skillSets.get(name) || null;
  }

  // List available skill sets
  static listSkillSets(): string[] {
    return Array.from(this.skillSets.keys());
  }

  // Create custom skill set
  static createSkillSet(name: string, description: string, skills: string[]): SkillSet {
    return this.registerSkillSet({ name, description, skills });
  }

  // Validate skill dependencies
  static validateSkillDependencies(skillNames: string[]): string[] {
    const errors: string[] = [];
    const providedSkills = new Set(skillNames);

    for (const skillName of skillNames) {
      const skill = this.getSkill(skillName);
      if (!skill) {
        errors.push(`Unknown skill: ${skillName}`);
        continue;
      }

      if (skill.prerequisites) {
        for (const prereq of skill.prerequisites) {
          if (!providedSkills.has(prereq)) {
            errors.push(`Skill '${skillName}' requires prerequisite '${prereq}'`);
          }
        }
      }
    }

    return errors;
  }
}

// Implementation of SkillSet
class SkillSetImpl implements SkillSet {
  public readonly name: string;
  public readonly description: string;
  public readonly skills: string[];
  public readonly tools: Tool[];
  public readonly capabilities: string[];

  constructor(name: string, description: string, skills: string[]) {
    this.name = name;
    this.description = description;
    this.skills = skills;
    
    // Collect tools from all skills
    const toolNames = new Set<string>();
    const capabilities = new Set<string>();
    
    for (const skillName of skills) {
      const skill = SkillManager.getSkill(skillName);
      if (skill) {
        for (const toolName of skill.tools) {
          toolNames.add(toolName);
        }
        capabilities.add(`${skill.category}:${skill.level}`);
      }
    }
    
    // Get actual tool instances
    this.tools = Array.from(toolNames)
      .map(toolName => toolRegistry.get(toolName))
      .filter(tool => tool !== null) as Tool[];
    
    this.capabilities = Array.from(capabilities);
  }

  getTools(): Tool[] {
    return [...this.tools];
  }

  canExecute(toolName: string): boolean {
    return this.tools.some(tool => tool.name === toolName);
  }

  getCapabilities(): string[] {
    return [...this.capabilities];
  }

  hasSkill(skillName: string): boolean {
    return this.skills.includes(skillName);
  }

  getSkillLevel(skillName: string): string | null {
    if (!this.hasSkill(skillName)) {
      return null;
    }
    
    const skill = SkillManager.getSkill(skillName);
    return skill?.level || null;
  }

  // Get skill details for this skill set
  getSkillDetails(): Array<{ name: string; level: string; category: string }> {
    return this.skills
      .map(skillName => {
        const skill = SkillManager.getSkill(skillName);
        return skill ? {
          name: skill.name,
          level: skill.level,
          category: skill.category
        } : null;
      })
      .filter(Boolean) as Array<{ name: string; level: string; category: string }>;
  }

  // Check if skill set can handle a specific domain
  canHandle(domain: string): boolean {
    return this.skills.some(skillName => {
      const skill = SkillManager.getSkill(skillName);
      return skill?.category === domain || skill?.metadata?.domain === domain;
    });
  }

  // Get tools by category
  getToolsByCategory(category: string): Tool[] {
    const categorySkills = this.skills
      .map(name => SkillManager.getSkill(name))
      .filter(skill => skill?.category === category);
    
    const toolNames = new Set<string>();
    for (const skill of categorySkills) {
      if (skill) {
        for (const toolName of skill.tools) {
          toolNames.add(toolName);
        }
      }
    }
    
    return Array.from(toolNames)
      .map(toolName => toolRegistry.get(toolName))
      .filter(tool => tool !== null) as Tool[];
  }
}

// Initialize the skill manager
SkillManager.initialize();