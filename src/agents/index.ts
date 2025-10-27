// Sub-Agents Architecture - Main Export
export { SubAgent } from './core/SubAgent';
export type { SubAgentConfig, TaskRequest, TaskResult, AgentStatus } from './core/SubAgent';

export { AgentRegistry, agentRegistry } from './core/AgentRegistry';
export type { AgentTemplate, AgentStats } from './core/AgentRegistry';

export { ContextManager } from './core/ContextManager';
export type { AgentContext, ContextShareRequest } from './core/ContextManager';

export { PersonaSystem } from './personas/PersonaSystem';
export type { AgentPersona, PersonaTrait, CommunicationStyle, ExpertiseArea } from './personas/PersonaSystem';

export { SkillManager } from './skills/SkillSet';
export type { Skill, SkillSet } from './skills/SkillSet';