export interface Persona {
  name: string;
  version: string;
  description: string;
  system_prompt: string;
  capabilities?: string[];
  temperature?: number;
  model_preferences?: string[];
  personality?: PersonalityTraits;
  behavior?: string[];
  metadata?: Record<string, any>;
}

export interface PersonalityTraits {
  communication_style?: string;
  explanation_depth?: string;
  code_review_tone?: string;
  help_approach?: string;
  humor_level?: string;
  formality?: string;
  encouragement?: string;
}

export interface WorkflowStep {
  name: string;
  action: string;
  params?: Record<string, any>;
  condition?: string;
}

export interface Workflow {
  name: string;
  description: string;
  persona: string;
  skills?: string[];
  steps: WorkflowStep[];
  metadata?: Record<string, any>;
}

export interface Skill {
  name: string;
  description: string;
  tools: ToolDefinition[];
  safety?: SafetyPolicy;
  metadata?: Record<string, any>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  schema: any; // JSON Schema
  safety?: SafetyPolicy;
}

export interface SafetyPolicy {
  require_approval?: boolean;
  path_restrictions?: string[];
  network_access?: boolean;
  max_execution_time?: number;
  allowed_in_ci?: boolean;
}