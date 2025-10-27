import { agentRegistry } from '../../agents/core/AgentRegistry';
import { PersonaSystem } from '../../agents/personas/PersonaSystem';
import { SkillManager } from '../../agents/skills/SkillSet';
import kleur from 'kleur';
import { DropdownHelpers } from '../dropdowns/DropdownHelpers';

export async function runAgentCommands(args: string[]) {
  try {
    // If args provided, check if it's a direct command
    if (args.length > 0) {
      const action = args[0];

      // Handle direct commands for backwards compatibility or automation
      switch (action) {
        case 'list':
          await listAgents(args.slice(1));
          return;
        case 'create':
          await createAgent(args.slice(1));
          return;
        case 'show':
        case 'info':
          await showAgent(args.slice(1));
          return;
        case 'exec':
        case 'execute':
          await executeTask(args.slice(1));
          return;
        case 'remove':
        case 'rm':
          await removeAgent(args.slice(1));
          return;
        case 'templates':
          await listTemplates();
          return;
        case 'personas':
          await listPersonas();
          return;
        case 'skills':
          await listSkills(args.slice(1));
          return;
        case 'stats':
          await showStats();
          return;
        case 'health':
          await healthCheck();
          return;
        case 'cleanup':
          await cleanupAgents(args.slice(1));
          return;
        case 'help':
          showHelp();
          return;
        default:
          // Invalid action, fall through to interactive mode
          break;
      }
    }

    // Interactive mode - show main menu
    await runInteractiveAgentMenu();

  } catch (error: any) {
    DropdownHelpers.handleError(error, 'agent management');
    process.exitCode = 1;
  }
}

async function listAgents(args: string[]) {
  const filter = args[0]; // status, type, or all
  let agents = agentRegistry.list();
  
  if (filter && filter !== 'all') {
    if (['idle', 'busy', 'error', 'terminated'].includes(filter)) {
      agents = agentRegistry.listByStatus(filter as any);
    } else {
      agents = agentRegistry.listByType(filter);
    }
  }
  
  if (agents.length === 0) {
    console.log(kleur.gray('No agents found'));
    return;
  }
  
  console.log(kleur.cyan(`\n📋 Agents (${agents.length})`));
  console.log(kleur.gray('────────────────────────────────────────'));
  
  for (const agent of agents) {
    const stats = agent.getStats();
    const status = agent.getStatus();
    const statusColor = getStatusColor(status);
    
    console.log(`${kleur.bold(agent.name)} ${kleur.gray(`(${agent.id.substring(0, 8)}...)`)}`);
    console.log(`  Type: ${kleur.yellow(agent.type)}`);
    console.log(`  Status: ${statusColor(status)}`);
    console.log(`  Tasks: ${kleur.green(stats.tasksCompleted.toString())} completed, ${kleur.red(stats.errors.toString())} errors`);
    console.log(`  Success Rate: ${kleur.cyan(stats.successRate.toFixed(1) + '%')}`);
    console.log(`  Uptime: ${kleur.gray(formatDuration(stats.uptime))}`);
    console.log('');
  }
}

async function createAgent(args: string[]) {
  if (args.length < 2) {
    console.log(kleur.red('Error: Please specify template and agent name'));
    console.log('Usage: metiscode agents create <template> <name> [options]');
    console.log('\nAvailable templates:');
    agentRegistry.listTemplates().forEach(t => {
      console.log(`  ${kleur.yellow(t.name)} - ${t.description}`);
    });
    return;
  }
  
  const [templateName, agentName] = args;
  
  try {
    const agent = await agentRegistry.createFromTemplate(templateName, {
      name: agentName
    });
    
    console.log(kleur.green(`✅ Created agent: ${agent.name}`));
    console.log(`   ID: ${kleur.gray(agent.id)}`);
    console.log(`   Type: ${kleur.yellow(agent.type)}`);
    console.log(`   Status: ${kleur.cyan(agent.getStatus())}`);
    
  } catch (error: any) {
    console.log(kleur.red(`❌ Failed to create agent: ${error.message}`));
  }
}

async function showAgent(args: string[]) {
  if (args.length === 0) {
    console.log(kleur.red('Error: Please specify agent name or ID'));
    return;
  }
  
  const identifier = args[0];
  let agent = agentRegistry.get(identifier);
  
  if (!agent) {
    agent = agentRegistry.getByName(identifier);
  }
  
  if (!agent) {
    console.log(kleur.red(`Agent not found: ${identifier}`));
    return;
  }
  
  const stats = agent.getStats();
  const config = agent.getConfig();
  const persona = agent.getPersona();
  const skills = agent.getSkills();
  const resourceUsage = agent.getResourceUsage();
  const currentTask = agent.getCurrentTask();
  
  console.log(kleur.cyan(`\n🤖 Agent: ${agent.name}`));
  console.log(kleur.gray('────────────────────────────────────────'));
  
  console.log(`ID: ${kleur.gray(agent.id)}`);
  console.log(`Type: ${kleur.yellow(agent.type)}`);
  console.log(`Status: ${getStatusColor(agent.getStatus())(agent.getStatus())}`);
  
  if (currentTask) {
    console.log(`Current Task: ${kleur.cyan(currentTask.task)}`);
  }
  
  console.log(`\n${kleur.bold('Persona:')}`);
  console.log(`  Name: ${kleur.yellow(persona.name)}`);
  console.log(`  Style: ${persona.communicationStyle.tone} / ${persona.communicationStyle.verbosity}`);
  console.log(`  Expertise: ${persona.expertise.map(e => `${e.domain}:${e.level}`).join(', ')}`);
  
  console.log(`\n${kleur.bold('Skills:')}`);
  const skillDetails = skills.getSkillDetails ? skills.getSkillDetails() : [];
  skillDetails.forEach(skill => {
    console.log(`  ${kleur.green(skill.name)} (${skill.level}) - ${skill.category}`);
  });
  
  console.log(`\n${kleur.bold('Performance:')}`);
  console.log(`  Tasks Completed: ${kleur.green(stats.tasksCompleted.toString())}`);
  console.log(`  Errors: ${kleur.red(stats.errors.toString())}`);
  console.log(`  Success Rate: ${kleur.cyan(stats.successRate.toFixed(1) + '%')}`);
  console.log(`  Avg Duration: ${kleur.gray(stats.averageTaskDuration.toFixed(0) + 'ms')}`);
  console.log(`  Uptime: ${kleur.gray(formatDuration(stats.uptime))}`);
  
  console.log(`\n${kleur.bold('Resources:')}`);
  console.log(`  Memory: ${kleur.gray(formatBytes(resourceUsage.memoryUsage))} / ${kleur.gray(formatBytes(resourceUsage.memoryLimit))}`);
  console.log(`  Load: ${kleur.cyan(resourceUsage.taskLoad.toString())}`);
}

async function executeTask(args: string[]) {
  if (args.length < 2) {
    console.log(kleur.red('Error: Please specify agent name and task'));
    console.log('Usage: metiscode agents exec <agent-name> "<task>" [params]');
    return;
  }
  
  const [agentIdentifier, task] = args;
  const params = args[2] ? JSON.parse(args[2]) : {};
  
  let agent = agentRegistry.get(agentIdentifier);
  if (!agent) {
    agent = agentRegistry.getByName(agentIdentifier);
  }
  
  if (!agent) {
    console.log(kleur.red(`Agent not found: ${agentIdentifier}`));
    return;
  }
  
  console.log(kleur.cyan(`🚀 Executing task with ${agent.name}...`));
  console.log(kleur.gray(`Task: ${task}`));
  
  try {
    const startTime = Date.now();
    const result = await agent.execute({
      id: `task-${Date.now()}`,
      task,
      params
    });
    
    const duration = Date.now() - startTime;
    
    if (result.success) {
      console.log(kleur.green(`✅ Task completed successfully (${duration}ms)`));
      console.log('Result:', result.result);
    } else {
      console.log(kleur.red(`❌ Task failed: ${result.error}`));
    }
    
    if (result.metadata) {
      console.log(kleur.gray(`Metadata: ${JSON.stringify(result.metadata, null, 2)}`));
    }
    
  } catch (error: any) {
    console.log(kleur.red(`❌ Execution error: ${error.message}`));
  }
}

async function removeAgent(args: string[]) {
  if (args.length === 0) {
    console.log(kleur.red('Error: Please specify agent name or ID'));
    return;
  }
  
  const identifier = args[0];
  let agent = agentRegistry.get(identifier);
  
  if (!agent) {
    agent = agentRegistry.getByName(identifier);
  }
  
  if (!agent) {
    console.log(kleur.red(`Agent not found: ${identifier}`));
    return;
  }
  
  const agentName = agent.name;
  const success = await agentRegistry.remove(agent.id);
  
  if (success) {
    console.log(kleur.green(`✅ Removed agent: ${agentName}`));
  } else {
    console.log(kleur.red(`❌ Failed to remove agent: ${agentName}`));
  }
}

async function listTemplates() {
  const templates = agentRegistry.listTemplates();
  
  console.log(kleur.cyan(`\n📋 Agent Templates (${templates.length})`));
  console.log(kleur.gray('────────────────────────────────────────'));
  
  for (const template of templates) {
    console.log(`${kleur.bold(template.name)} - ${template.description}`);
    console.log(`  Type: ${kleur.yellow(template.type)}`);
    console.log(`  Persona: ${kleur.cyan(template.persona)}`);
    console.log(`  Skills: ${kleur.gray(template.skills.join(', '))}`);
    console.log('');
  }
}

async function listPersonas() {
  const personas = PersonaSystem.getAllPersonas();
  
  console.log(kleur.cyan(`\n👤 Available Personas (${personas.length})`));
  console.log(kleur.gray('────────────────────────────────────────'));
  
  for (const persona of personas) {
    console.log(`${kleur.bold(persona.name)} - ${persona.description}`);
    console.log(`  Style: ${persona.communicationStyle.tone} / ${persona.communicationStyle.verbosity}`);
    console.log(`  Traits: ${kleur.gray(persona.traits.map(t => t.name).join(', '))}`);
    console.log(`  Expertise: ${kleur.yellow(persona.expertise.map(e => `${e.domain}:${e.level}`).join(', '))}`);
    console.log('');
  }
}

async function listSkills(args: string[]) {
  const category = args[0];
  const skills = category ? 
    SkillManager.getSkillsByCategory(category) :
    SkillManager.listSkills().map(name => SkillManager.getSkill(name)).filter(Boolean);
  
  console.log(kleur.cyan(`\n🎯 Available Skills${category ? ` (${category})` : ''} (${skills.length})`));
  console.log(kleur.gray('────────────────────────────────────────'));
  
  const categories = new Map<string, any[]>();
  for (const skill of skills) {
    if (skill) {
      if (!categories.has(skill.category)) {
        categories.set(skill.category, []);
      }
      categories.get(skill.category)!.push(skill);
    }
  }
  
  for (const [cat, catSkills] of categories) {
    console.log(kleur.bold(`${cat.toUpperCase()}:`));
    for (const skill of catSkills) {
      const levelColor = skill.level === 'expert' ? kleur.green : 
                        skill.level === 'advanced' ? kleur.yellow : kleur.gray;
      console.log(`  ${kleur.cyan(skill.name)} ${levelColor(`(${skill.level})`)} - ${skill.description}`);
      if (skill.prerequisites?.length) {
        console.log(`    Prerequisites: ${kleur.gray(skill.prerequisites.join(', '))}`);
      }
    }
    console.log('');
  }
}

async function showStats() {
  const stats = agentRegistry.getStats();
  const resourceUsage = agentRegistry.getResourceUsage();
  
  console.log(kleur.cyan('\n📊 Agent Registry Statistics'));
  console.log(kleur.gray('────────────────────────────────────────'));
  
  console.log(`Total Agents: ${kleur.bold(stats.totalAgents.toString())}`);
  console.log(`Active Agents: ${kleur.green(stats.activeAgents.toString())}`);
  console.log(`Busy Agents: ${kleur.yellow(stats.busyAgents.toString())}`);
  console.log(`Error Agents: ${kleur.red(stats.errorAgents.toString())}`);
  
  console.log(`\nTask Statistics:`);
  console.log(`  Total Tasks: ${kleur.bold(stats.totalTasks.toString())}`);
  console.log(`  Completed: ${kleur.green(stats.completedTasks.toString())}`);
  console.log(`  Failed: ${kleur.red(stats.failedTasks.toString())}`);
  console.log(`  Avg Duration: ${kleur.gray(stats.averageTaskDuration.toFixed(0) + 'ms')}`);
  
  console.log(`\nResource Usage:`);
  console.log(`  Memory: ${kleur.gray(formatBytes(resourceUsage.totalMemory))} / ${kleur.gray(formatBytes(resourceUsage.maxTotalMemory))} (${resourceUsage.memoryUtilization.toFixed(1)}%)`);
  console.log(`  Tasks: ${kleur.cyan(resourceUsage.activeTasks.toString())} / ${resourceUsage.maxConcurrentTasks} (${resourceUsage.taskUtilization.toFixed(1)}%)`);
  console.log(`  Agents: ${kleur.bold(resourceUsage.agentCount.toString())} / ${resourceUsage.maxAgents}`);
}

async function healthCheck() {
  const health = await agentRegistry.healthCheck();
  
  console.log(kleur.cyan('\n🏥 Agent Registry Health Check'));
  console.log(kleur.gray('────────────────────────────────────────'));
  
  const healthColor = health.healthy ? kleur.green : kleur.red;
  const healthIcon = health.healthy ? '✅' : '❌';
  
  console.log(`Status: ${healthIcon} ${healthColor(health.healthy ? 'Healthy' : 'Issues detected')}`);
  
  if (health.issues.length > 0) {
    console.log(`\nIssues:`);
    for (const issue of health.issues) {
      console.log(`  ${kleur.red('•')} ${issue}`);
    }
  }
  
  console.log(`\nQuick Stats:`);
  console.log(`  Active Agents: ${kleur.green(health.stats.activeAgents.toString())}`);
  console.log(`  Memory Usage: ${kleur.gray(health.resourceUsage.memoryUtilization.toFixed(1) + '%')}`);
  console.log(`  Task Load: ${kleur.cyan(health.resourceUsage.taskUtilization.toFixed(1) + '%')}`);
}

async function cleanupAgents(args: string[]) {
  const force = args.includes('--force');
  const removeIdle = args.includes('--idle') || force;
  const removeError = args.includes('--error') || force;
  
  console.log(kleur.cyan('🧹 Cleaning up agents...'));
  
  const removedCount = await agentRegistry.cleanup({
    removeIdleAgents: removeIdle,
    removeErrorAgents: removeError,
    maxIdleTime: 30 * 60 * 1000 // 30 minutes
  });
  
  console.log(kleur.green(`✅ Cleanup completed. Removed ${removedCount} agents.`));
  
  const stats = agentRegistry.getStats();
  console.log(kleur.gray(`Remaining agents: ${stats.totalAgents}`));
}

function showHelp() {
  console.log(kleur.cyan(`
🤖 Agent Management Commands

Usage: metiscode agents <action> [options]

Actions:
  list [filter]              List all agents or filter by status/type
  create <template> <name>   Create new agent from template
  show <name/id>             Show detailed agent information
  exec <name> "<task>"       Execute task with specific agent
  remove <name/id>           Remove agent
  
  templates                  List available agent templates
  personas                   List available personas  
  skills [category]          List available skills
  
  stats                      Show registry statistics
  health                     Run health check
  cleanup [--idle|--error]   Clean up idle/error agents

Examples:
  metiscode agents create developer mydev
  metiscode agents list busy
  metiscode agents exec mydev "implement user authentication"
  metiscode agents show mydev
  metiscode agents remove mydev

Filters for list:
  all, idle, busy, error, terminated (by status)
  developer, reviewer, devops (by type)
`));
}

// Utility functions
function getStatusColor(status: string) {
  switch (status) {
    case 'idle': return kleur.green;
    case 'busy': return kleur.yellow;
    case 'error': return kleur.red;
    case 'terminated': return kleur.gray;
    default: return kleur.gray;
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function runInteractiveAgentMenu() {
  while (true) {
    const action = await DropdownHelpers.selectOne({
      message: 'What would you like to do with agents?',
      choices: DropdownHelpers.createIconChoices([
        { item: 'list', icon: '📋', name: 'List agents', description: 'View all agents or filter by status/type' },
        { item: 'create', icon: '✨', name: 'Create agent', description: 'Create a new agent from template' },
        { item: 'show', icon: '👀', name: 'Show agent details', description: 'View detailed agent information' },
        { item: 'execute', icon: '🚀', name: 'Execute task', description: 'Run a task with a specific agent' },
        { item: 'remove', icon: '🗑️', name: 'Remove agent', description: 'Delete an agent' },
        { item: 'templates', icon: '📄', name: 'List templates', description: 'View available agent templates' },
        { item: 'personas', icon: '👤', name: 'List personas', description: 'View available personas' },
        { item: 'skills', icon: '🎯', name: 'List skills', description: 'View available skills' },
        { item: 'stats', icon: '📊', name: 'Show statistics', description: 'View agent registry statistics' },
        { item: 'health', icon: '🏥', name: 'Health check', description: 'Run agent registry health check' },
        { item: 'cleanup', icon: '🧹', name: 'Cleanup agents', description: 'Remove idle or error agents' },
        { item: 'exit', icon: '🚪', name: 'Exit', description: 'Return to main menu' }
      ])
    });

    switch (action) {
      case 'list':
        await listAgentsInteractive();
        break;

      case 'create':
        await createAgentInteractive();
        break;

      case 'show':
        await showAgentInteractive();
        break;

      case 'execute':
        await executeTaskInteractive();
        break;

      case 'remove':
        await removeAgentInteractive();
        break;

      case 'templates':
        await listTemplates();
        break;

      case 'personas':
        await listPersonas();
        break;

      case 'skills':
        await listSkillsInteractive();
        break;

      case 'stats':
        await showStats();
        break;

      case 'health':
        await healthCheck();
        break;

      case 'cleanup':
        await cleanupAgentsInteractive();
        break;

      case 'exit':
        return;
    }

    console.log(); // Add some spacing
  }
}

async function listAgentsInteractive() {
  const filter = await DropdownHelpers.selectOne({
    message: 'How would you like to filter the agents?',
    choices: DropdownHelpers.createIconChoices([
      { item: 'all', icon: '📋', name: 'All agents', description: 'Show all agents' },
      { item: 'idle', icon: '⚪', name: 'Idle agents', description: 'Show only idle agents' },
      { item: 'busy', icon: '🟡', name: 'Busy agents', description: 'Show only busy agents' },
      { item: 'error', icon: '🔴', name: 'Error agents', description: 'Show only agents with errors' },
      { item: 'terminated', icon: '⚫', name: 'Terminated agents', description: 'Show only terminated agents' },
      { item: 'developer', icon: '💻', name: 'Developer agents', description: 'Show only developer type agents' },
      { item: 'reviewer', icon: '🔍', name: 'Reviewer agents', description: 'Show only reviewer type agents' },
      { item: 'devops', icon: '⚙️', name: 'DevOps agents', description: 'Show only devops type agents' }
    ])
  });

  await listAgents(filter === 'all' ? [] : [filter]);
}

async function createAgentInteractive() {
  const templates = agentRegistry.listTemplates();

  if (templates.length === 0) {
    console.log(kleur.gray('No agent templates found.'));
    return;
  }

  const selectedTemplate = await DropdownHelpers.selectOne({
    message: 'Which template would you like to use?',
    choices: templates.map(template => ({
      name: `${template.name} - ${template.description}`,
      value: template.name,
      short: template.name
    }))
  });

  const agentName = await DropdownHelpers.inputText({
    message: 'Enter the agent name:',
    validate: (input) => {
      if (!input.trim()) return 'Agent name is required';
      if (!/^[a-zA-Z0-9_-]+$/.test(input)) return 'Agent name can only contain letters, numbers, hyphens, and underscores';

      // Check if name already exists
      if (agentRegistry.getByName(input)) return 'An agent with this name already exists';

      return true;
    },
    filter: (input) => input.trim()
  });

  const confirmed = await DropdownHelpers.confirm(
    `Create agent "${agentName}" from template "${selectedTemplate}"?`,
    true
  );

  if (confirmed) {
    await createAgent([selectedTemplate, agentName]);
  } else {
    console.log(kleur.gray('Agent creation cancelled.'));
  }
}

async function showAgentInteractive() {
  const agents = agentRegistry.list();

  if (agents.length === 0) {
    console.log(kleur.gray('No agents found. Create an agent first.'));
    return;
  }

  const choices = agents.map(agent => {
    const status = agent.getStatus();
    return {
      item: agent.id,
      icon: getStatusIcon(status),
      name: agent.name,
      description: `${agent.type} - ${status}`
    };
  });

  const selectedAgentId = await DropdownHelpers.selectOne({
    message: 'Which agent would you like to view?',
    choices: DropdownHelpers.createIconChoices(choices)
  });

  if (selectedAgentId) {
    await showAgent([selectedAgentId]);
  }
}

async function executeTaskInteractive() {
  const agents = agentRegistry.list().filter(agent => agent.getStatus() === 'idle');

  if (agents.length === 0) {
    console.log(kleur.gray('No idle agents available for task execution.'));
    return;
  }

  const choices = agents.map(agent => ({
    item: agent.id,
    icon: '🤖',
    name: agent.name,
    description: `${agent.type} agent`
  }));

  const selectedAgentId = await DropdownHelpers.selectOne({
    message: 'Which agent would you like to execute the task with?',
    choices: DropdownHelpers.createIconChoices(choices)
  });

  if (!selectedAgentId) return;

  const task = await DropdownHelpers.inputText({
    message: 'Enter the task description:',
    validate: (input) => {
      if (!input.trim()) return 'Task description is required';
      return true;
    }
  });

  const confirmed = await DropdownHelpers.confirm(
    `Execute task "${task}" with agent "${agents.find(a => a.id === selectedAgentId)?.name}"?`,
    true
  );

  if (confirmed) {
    const agent = agents.find(a => a.id === selectedAgentId);
    if (agent) {
      await executeTask([agent.name, task]);
    }
  } else {
    console.log(kleur.gray('Task execution cancelled.'));
  }
}

async function removeAgentInteractive() {
  const agents = agentRegistry.list();

  if (agents.length === 0) {
    console.log(kleur.gray('No agents found to remove.'));
    return;
  }

  const choices = agents.map(agent => {
    const status = agent.getStatus();
    return {
      item: agent.id,
      icon: getStatusIcon(status),
      name: agent.name,
      description: `${agent.type} - ${status}`
    };
  });

  const selectedAgentId = await DropdownHelpers.selectOne({
    message: 'Which agent would you like to remove?',
    choices: DropdownHelpers.createIconChoices(choices)
  });

  if (!selectedAgentId) return;

  const agent = agents.find(a => a.id === selectedAgentId);
  if (!agent) return;

  const confirmed = await DropdownHelpers.confirm(
    kleur.red(`Are you sure you want to remove agent "${agent.name}"?`),
    false
  );

  if (confirmed) {
    await removeAgent([selectedAgentId]);
  } else {
    console.log(kleur.gray('Agent removal cancelled.'));
  }
}

async function listSkillsInteractive() {
  const categories = ['all', 'coding', 'analysis', 'deployment', 'testing', 'documentation'];

  const selectedCategory = await DropdownHelpers.selectOne({
    message: 'Which skill category would you like to view?',
    choices: categories.map(category => ({
      name: category === 'all' ? 'All skills' : `${category.charAt(0).toUpperCase() + category.slice(1)} skills`,
      value: category,
      short: category
    }))
  });

  await listSkills(selectedCategory === 'all' ? [] : [selectedCategory]);
}

async function cleanupAgentsInteractive() {
  const options = await DropdownHelpers.selectMultiple({
    message: 'What type of cleanup would you like to perform?',
    choices: [
      { name: 'Remove idle agents (inactive for 30+ minutes)', value: '--idle', checked: true },
      { name: 'Remove agents with errors', value: '--error', checked: false },
      { name: 'Force cleanup (includes both idle and error)', value: '--force', checked: false }
    ],
    validate: (answers) => {
      if (answers.length === 0) return 'Please select at least one cleanup option';
      if (answers.includes('--force') && (answers.includes('--idle') || answers.includes('--error'))) {
        return 'Force cleanup includes both idle and error - select only force or individual options';
      }
      return true;
    }
  });

  const confirmed = await DropdownHelpers.confirm(
    'Are you sure you want to proceed with agent cleanup?',
    false
  );

  if (confirmed) {
    await cleanupAgents(options);
  } else {
    console.log(kleur.gray('Agent cleanup cancelled.'));
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'idle': return '⚪';
    case 'busy': return '🟡';
    case 'error': return '🔴';
    case 'terminated': return '⚫';
    default: return '❓';
  }
}