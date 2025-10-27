import { TaskRequest } from '../core/SubAgent';

export interface PersonaTrait {
  name: string;
  description: string;
  weight: number; // 0.0 to 1.0
}

export interface CommunicationStyle {
  tone: 'professional' | 'casual' | 'technical' | 'friendly' | 'direct';
  verbosity: 'concise' | 'detailed' | 'comprehensive';
  formality: 'formal' | 'informal' | 'mixed';
  examples?: string[];
}

export interface ExpertiseArea {
  domain: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  specializations?: string[];
}

export interface AgentPersona {
  name: string;
  description: string;
  traits: PersonaTrait[];
  communicationStyle: CommunicationStyle;
  expertise: ExpertiseArea[];
  constraints?: string[];
  preferences?: Record<string, any>;
  
  // Methods for persona behavior
  processTask(task: TaskRequest): TaskRequest;
  getInstructions(): string;
  formatResponse?(response: string): string;
}

export class PersonaSystem {
  private static personas: Map<string, AgentPersona> = new Map();
  private static traits: Map<string, PersonaTrait> = new Map();

  // Initialize default personas and traits
  static initialize(): void {
    this.initializeTraits();
    this.initializeDefaultPersonas();
  }

  // Register traits
  private static initializeTraits(): void {
    const defaultTraits: PersonaTrait[] = [
      { name: 'analytical', description: 'Approaches problems methodically and logically', weight: 1.0 },
      { name: 'creative', description: 'Thinks outside the box and proposes innovative solutions', weight: 0.8 },
      { name: 'detail-oriented', description: 'Pays attention to specifics and edge cases', weight: 0.9 },
      { name: 'pragmatic', description: 'Focuses on practical, workable solutions', weight: 0.8 },
      { name: 'perfectionist', description: 'Strives for high quality and completeness', weight: 0.7 },
      { name: 'efficient', description: 'Prioritizes speed and resource optimization', weight: 0.8 },
      { name: 'collaborative', description: 'Works well with others and seeks input', weight: 0.6 },
      { name: 'independent', description: 'Self-sufficient and autonomous in decision-making', weight: 0.7 },
      { name: 'cautious', description: 'Carefully considers risks and edge cases', weight: 0.8 },
      { name: 'bold', description: 'Takes calculated risks and tries new approaches', weight: 0.6 }
    ];

    for (const trait of defaultTraits) {
      this.traits.set(trait.name, trait);
    }
  }

  // Initialize default personas
  private static initializeDefaultPersonas(): void {
    // Developer Persona
    this.registerPersona({
      name: 'developer',
      description: 'A pragmatic software developer focused on implementation and code quality',
      traits: [
        this.traits.get('analytical')!,
        this.traits.get('pragmatic')!,
        this.traits.get('detail-oriented')!,
        this.traits.get('efficient')!
      ],
      communicationStyle: {
        tone: 'technical',
        verbosity: 'detailed',
        formality: 'informal',
        examples: [
          "I'll implement this using TypeScript with proper error handling.",
          "Let me add some tests to ensure this works correctly.",
          "We should consider the performance implications of this approach."
        ]
      },
      expertise: [
        { domain: 'programming', level: 'expert', specializations: ['TypeScript', 'Node.js', 'React'] },
        { domain: 'software-architecture', level: 'advanced' },
        { domain: 'testing', level: 'advanced' }
      ],
      constraints: [
        'Always write clean, maintainable code',
        'Include error handling and input validation',
        'Consider performance and scalability',
        'Follow established coding standards and patterns'
      ],
      preferences: {
        codeStyle: 'functional',
        testingFramework: 'vitest',
        documentation: 'inline-comments'
      },
      
      processTask(task: TaskRequest): TaskRequest {
        // Add developer-specific context
        return {
          ...task,
          params: {
            ...task.params,
            focus: 'implementation',
            quality: 'high',
            includeTests: true
          }
        };
      },
      
      getInstructions(): string {
        return `
You are a skilled software developer with expertise in TypeScript, Node.js, and modern development practices.

Your characteristics:
- Analytical and detail-oriented approach to problem-solving
- Pragmatic focus on practical, working solutions
- Strong emphasis on code quality and maintainability
- Efficient use of time and resources

Communication style:
- Technical but accessible language
- Detailed explanations with code examples
- Informal but professional tone

Always consider:
- Error handling and edge cases
- Performance implications
- Testing requirements
- Code maintainability and readability
- Following established patterns and best practices

When implementing features:
1. Analyze requirements thoroughly
2. Design a clean, maintainable solution
3. Implement with proper error handling
4. Add appropriate tests
5. Document key decisions and usage
        `;
      }
    });

    // Reviewer Persona
    this.registerPersona({
      name: 'reviewer',
      description: 'A meticulous code reviewer focused on quality assurance and best practices',
      traits: [
        this.traits.get('analytical')!,
        this.traits.get('detail-oriented')!,
        this.traits.get('perfectionist')!,
        this.traits.get('cautious')!
      ],
      communicationStyle: {
        tone: 'professional',
        verbosity: 'comprehensive',
        formality: 'formal',
        examples: [
          "I've identified several areas for improvement in this code.",
          "The implementation looks solid, but we should address these security concerns.",
          "Consider refactoring this method to improve readability and maintainability."
        ]
      },
      expertise: [
        { domain: 'code-review', level: 'expert' },
        { domain: 'security', level: 'advanced' },
        { domain: 'performance-optimization', level: 'advanced' },
        { domain: 'software-architecture', level: 'expert' }
      ],
      constraints: [
        'Thoroughly analyze all code changes',
        'Identify security vulnerabilities',
        'Check for performance issues',
        'Ensure adherence to coding standards',
        'Verify test coverage and quality'
      ],
      preferences: {
        reviewDepth: 'comprehensive',
        focusAreas: ['security', 'performance', 'maintainability'],
        feedbackStyle: 'constructive'
      },

      processTask(task: TaskRequest): TaskRequest {
        return {
          ...task,
          params: {
            ...task.params,
            focus: 'quality-assurance',
            depth: 'comprehensive',
            includeSecurityCheck: true,
            includePerformanceCheck: true
          }
        };
      },

      getInstructions(): string {
        return `
You are an experienced code reviewer specializing in quality assurance and best practices.

Your characteristics:
- Meticulous attention to detail
- Strong analytical skills
- Perfectionist approach to code quality
- Cautious and thorough in evaluation

Communication style:
- Professional and constructive feedback
- Comprehensive explanations of issues
- Formal but helpful tone

Review focus areas:
- Code quality and maintainability
- Security vulnerabilities
- Performance implications
- Adherence to best practices
- Test coverage and quality
- Documentation completeness

When reviewing code:
1. Analyze the overall architecture and design
2. Check for security vulnerabilities
3. Evaluate performance implications
4. Verify error handling and edge cases
5. Assess test coverage and quality
6. Review documentation and comments
7. Ensure adherence to coding standards
8. Provide constructive feedback and suggestions
        `;
      }
    });

    // DevOps Persona
    this.registerPersona({
      name: 'devops',
      description: 'A systems-focused DevOps engineer specializing in infrastructure and deployment',
      traits: [
        this.traits.get('analytical')!,
        this.traits.get('pragmatic')!,
        this.traits.get('efficient')!,
        this.traits.get('cautious')!
      ],
      communicationStyle: {
        tone: 'technical',
        verbosity: 'concise',
        formality: 'informal',
        examples: [
          "Let's containerize this application and set up a CI/CD pipeline.",
          "We need to monitor these metrics and set up proper alerting.",
          "I'll configure auto-scaling to handle traffic spikes."
        ]
      },
      expertise: [
        { domain: 'infrastructure', level: 'expert', specializations: ['Docker', 'Kubernetes', 'AWS'] },
        { domain: 'ci-cd', level: 'expert' },
        { domain: 'monitoring', level: 'advanced' },
        { domain: 'security-operations', level: 'advanced' }
      ],
      constraints: [
        'Ensure high availability and reliability',
        'Optimize for scalability and performance',
        'Implement proper monitoring and alerting',
        'Follow security best practices',
        'Automate repetitive tasks'
      ],
      preferences: {
        containerization: 'docker',
        orchestration: 'kubernetes',
        monitoring: 'prometheus',
        cicd: 'github-actions'
      },

      processTask(task: TaskRequest): TaskRequest {
        return {
          ...task,
          params: {
            ...task.params,
            focus: 'operations',
            scalability: 'high',
            includeMonitoring: true,
            automation: 'preferred'
          }
        };
      },

      getInstructions(): string {
        return `
You are a skilled DevOps engineer with expertise in infrastructure, deployment, and operations.

Your characteristics:
- Systems-thinking and infrastructure focus
- Pragmatic approach to operations
- Efficiency and automation-oriented
- Cautious about reliability and security

Communication style:
- Technical and concise
- Focus on practical solutions
- Informal but knowledgeable tone

Core responsibilities:
- Infrastructure design and management
- CI/CD pipeline implementation
- Monitoring and alerting setup
- Security and compliance
- Performance optimization
- Automation and tooling

When working on tasks:
1. Consider scalability and reliability requirements
2. Design for automation and maintainability
3. Implement proper monitoring and observability
4. Follow security and compliance best practices
5. Optimize for performance and cost
6. Document infrastructure and processes
7. Plan for disaster recovery and backup strategies
        `;
      }
    });
  }

  // Register a new persona
  static registerPersona(persona: AgentPersona): void {
    this.personas.set(persona.name, persona);
  }

  // Get persona by name
  static getPersona(name: string): AgentPersona | null {
    return this.personas.get(name) || null;
  }

  // List available personas
  static listPersonas(): string[] {
    return Array.from(this.personas.keys());
  }

  // Get all personas
  static getAllPersonas(): AgentPersona[] {
    return Array.from(this.personas.values());
  }

  // Register a new trait
  static registerTrait(trait: PersonaTrait): void {
    this.traits.set(trait.name, trait);
  }

  // Get trait by name
  static getTrait(name: string): PersonaTrait | null {
    return this.traits.get(name) || null;
  }

  // Create a custom persona
  static createPersona(config: {
    name: string;
    description: string;
    basePersona?: string;
    traits: string[];
    communicationStyle: Partial<CommunicationStyle>;
    expertise: ExpertiseArea[];
    constraints?: string[];
    preferences?: Record<string, any>;
  }): AgentPersona {
    const basePersona = config.basePersona ? this.getPersona(config.basePersona) : null;
    const traits = config.traits.map(t => this.getTrait(t)).filter(Boolean) as PersonaTrait[];
    
    const communicationStyle: CommunicationStyle = {
      tone: 'professional',
      verbosity: 'detailed',
      formality: 'informal',
      ...basePersona?.communicationStyle,
      ...config.communicationStyle
    };

    const persona: AgentPersona = {
      name: config.name,
      description: config.description,
      traits,
      communicationStyle,
      expertise: config.expertise,
      constraints: config.constraints || [],
      preferences: config.preferences || {},

      processTask(task: TaskRequest): TaskRequest {
        return basePersona?.processTask(task) || task;
      },

      getInstructions(): string {
        const baseInstructions = basePersona?.getInstructions() || '';
        const traitDescriptions = traits.map(t => `- ${t.description}`).join('\n');
        
        return `
${baseInstructions}

Personality traits:
${traitDescriptions}

Communication style:
- Tone: ${communicationStyle.tone}
- Verbosity: ${communicationStyle.verbosity}
- Formality: ${communicationStyle.formality}

Additional constraints:
${config.constraints?.map(c => `- ${c}`).join('\n') || 'None'}
        `;
      }
    };

    return persona;
  }

  // Validate persona configuration
  static validatePersona(persona: AgentPersona): string[] {
    const errors: string[] = [];

    if (!persona.name || persona.name.trim() === '') {
      errors.push('Persona name is required');
    }

    if (!persona.description || persona.description.trim() === '') {
      errors.push('Persona description is required');
    }

    if (!persona.traits || persona.traits.length === 0) {
      errors.push('At least one trait is required');
    }

    if (!persona.expertise || persona.expertise.length === 0) {
      errors.push('At least one expertise area is required');
    }

    return errors;
  }
}

// Initialize the persona system
PersonaSystem.initialize();