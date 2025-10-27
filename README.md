# Metis Code - AI-Powered Development Assistant

A comprehensive CLI tool powered by Groq that provides intelligent coding assistance with seamless tool integration, advanced session management, and specialized sub-agents. Built to achieve Claude Code parity with ultra-fast Groq inference.

## ✨ Key Features

- **🎯 Interactive Session Management**: Claude Code-like experience with persistent sessions and recovery
- **🤖 Headless Mode**: Run non-interactively in CI/CD, automation scripts, or when called by other AI agents
- **📋 Collaborative Planning Mode**: Define requirements and generate Agent.md files before coding
- **🚀 Sub-Agents Architecture**: Specialized AI agents with unique personas, skills, and workflows
- **🧠 Hierarchical Memory System**: Agent.md files with auto-compaction and intelligent context management
- **🔄 Advanced Permission System**: Approval gates with session-wide approvals and cycling modes
- **📁 Multi-file Operations**: Batch editing, symbol renaming, and cross-file refactoring
- **💾 Session Persistence**: Automatic state recovery across CLI restarts
- **🌐 MCP Protocol Support**: Extensible Model Context Protocol for server/client architecture
- **🔑 Global API Configuration**: One-time setup works across all projects
- **🎭 Persona System**: Specialized AI personalities for different development contexts
- **🔍 Code Preview**: Before/after diffs in approval dialogs like Claude Code
- **⚡ Enhanced Tool Registry**: Comprehensive file, git, search, and system operations
- **🛡️ Safety First**: Built-in safety features with intelligent approval workflows

## 📦 Installation

```bash
npm install -g metis-code
```

## 🚀 Quick Start

### 1. One-Time Global Setup

```bash
# Set up global Groq API key (works across all projects)
metiscode config set apikey gsk_your-groq-key-here
metiscode config set model llama-3.3-70b-versatile

# For headless/CI usage (optional)
export GROQ_API_KEY=gsk_your-groq-key-here
export METIS_HEADLESS=true  # Enable non-interactive mode
```

### 2. Interactive Session (Primary Interface)

```bash
# Start interactive session from any folder
metiscode

# Use natural language directly:
"Fix the authentication bug in login.ts"
"Create a React component for user profiles"  
"Add error handling to the API endpoints"
"Refactor the database connection logic"
```

### 3. Slash Commands (In Interactive Session)

```bash
/init      # Initialize Agent.md with project instructions
/plan      # Enter collaborative planning mode
/execute   # Exit planning mode and start coding
/status    # Show system status and session info
/config    # Manage configuration 
/memory    # View hierarchical memory system status
/reload    # Refresh Agent.md files
/help      # Show detailed help
/clear     # Clear session context
/compact   # Compress session history
/resume    # Resume previous session
/sessions  # List recent sessions
/approvals # View active session approvals
/mode      # Cycle permission modes
/exit      # Exit session
```

### 4. Planning Mode

Enter collaborative planning mode to define project requirements before coding:

```bash
metiscode
> /plan

# Planning Mode Activated
# I will help you plan your project requirements and generate tasks.
# This mode focuses on planning and will only generate Agent.md files.

# Tell me about your project or what you want to build:
> "I want to build a task management app with React and Node.js"

# AI helps you plan requirements, architecture, and generates Agent.md
# When ready to start coding:
> /execute

# AI switches to implementation mode
# Ready to start coding!
```

### 5. Headless Mode (CI/CD & Automation)

```bash
# Run non-interactively (perfect for CI/CD)
metiscode --headless "create unit tests for all functions in src/"

# Use in GitHub Actions
CI=true metiscode "review code and suggest improvements"

# Automation scripts
METIS_HEADLESS=true metiscode "fix all linting errors"

# Called by other AI agents (like Claude Code)
metiscode --auto-accept "implement error handling"
```

**Headless mode features:**
- ✅ **Auto-approves all operations** (no prompts)
- ✅ **Non-interactive** (perfect for scripts)
- ✅ **CI/CD ready** (auto-detects CI environments)
- ✅ **Safe by default** (dangerous commands still blocked)

**See [HEADLESS.md](./HEADLESS.md) for comprehensive guide on:**
- CI/CD integration (GitHub Actions, GitLab CI, Docker)
- Being called by other AI agents
- Automation scripts and batch processing
- Security best practices

## 🤖 Sub-Agents System

### Specialized AI Agents

Metis Code includes specialized sub-agents with unique personalities, skills, and workflows:

```bash
# Create specialized agents
metiscode agents create developer mydev
metiscode agents create reviewer qa-expert  
metiscode agents create devops deploy-master
metiscode agents create documentation doc-writer
metiscode agents create debugging-specialist debugger

# Execute tasks with specific agents
metiscode agents exec mydev "implement user authentication"
metiscode agents exec qa-expert "review the auth code for security issues"
metiscode agents exec deploy-master "set up CI/CD pipeline"

# Monitor agent performance
metiscode agents stats
metiscode agents health
metiscode agents list busy
```

### Available Agent Types

**Developer Agent**
- **Focus**: Implementation and coding
- **Persona**: Pragmatic, solution-oriented, detail-focused
- **Skills**: TypeScript, JavaScript, React, file ops, git, testing
- **Use Case**: Feature development, bug fixes, code implementation

**Reviewer Agent**
- **Focus**: Quality assurance and code review
- **Persona**: Critical, thorough, standards-focused
- **Skills**: Code review, security analysis, testing, git workflows
- **Use Case**: Code quality checks, security audits, best practices

**DevOps Agent**
- **Focus**: Infrastructure and deployment
- **Persona**: Systems-oriented, reliability-focused, automated
- **Skills**: Docker, CI/CD, monitoring, infrastructure tools
- **Use Case**: Deployment, scaling, infrastructure management

**Documentation Agent**
- **Focus**: Technical writing and documentation
- **Persona**: Clear, comprehensive, user-focused
- **Skills**: Technical writing, markdown, documentation tools
- **Use Case**: API docs, README files, user guides

**Debugging Specialist**
- **Focus**: Problem-solving and troubleshooting
- **Persona**: Analytical, methodical, persistent
- **Skills**: Debugging, profiling, log analysis, system diagnostics
- **Use Case**: Bug investigation, performance issues, system analysis

### Agent Management

```bash
# List available agent templates
metiscode agents templates

# Show agent details
metiscode agents show mydev

# List active agents by status
metiscode agents list idle
metiscode agents list busy
metiscode agents list error

# Remove agents
metiscode agents remove mydev

# Health monitoring
metiscode agents health
metiscode agents cleanup
```

## 🌐 MCP (Model Context Protocol) Integration

### Connect to MCP Servers

```bash
# Add MCP server configuration
metiscode mcp add myserver '{
  "name": "My Server",
  "version": "1.0.0",
  "description": "Custom MCP server",
  "capabilities": {"tools": true, "resources": true},
  "transport": {
    "type": "stdio", 
    "command": "node",
    "args": ["server.js"]
  }
}'

# Connect to server
metiscode mcp connect myserver

# Test server capabilities
metiscode mcp test myserver

# Use MCP tools in interactive session
metiscode
> "Use the weather tool from myserver to get current conditions"
```

### MCP Server Management

```bash
# List configured servers
metiscode mcp show

# Add WebSocket server
metiscode mcp add wsserver '{
  "name": "WebSocket Server",
  "version": "1.0.0",
  "description": "WebSocket MCP server",
  "capabilities": {"tools": true},
  "transport": {
    "type": "websocket",
    "url": "ws://localhost:8080"
  }
}'

# Remove server
metiscode mcp remove myserver

# Disconnect from server
metiscode mcp disconnect myserver
```

## 🔑 Global API Configuration

### One-Time Setup

```bash
# Set API key globally (works in all projects)
metiscode config set apikey sk-your-openai-key-here

# Configure different providers
metiscode config set provider anthropic
metiscode config set apikey sk-ant-your-anthropic-key-here

# View current configuration
metiscode config show
```

### API Key Priority System

```
1. Environment variables (OPENAI_API_KEY, etc.) - highest priority
2. Global config (~/.metis/secrets.json) - recommended  
3. Local project config (./.metis/secrets.json) - legacy
```

### Migration from Local Config

```bash
# Migrate existing local API keys to global
metiscode migrate apikeys

# Shows current API key sources and migrates automatically
```

## ⚙️ Configuration System

### Provider & Model Configuration

```bash
# Set AI provider
metiscode config set provider openai        # OpenAI GPT models
metiscode config set provider anthropic     # Anthropic Claude models  
metiscode config set provider groq          # Groq models

# Set specific model
metiscode config set model gpt-4o                      # OpenAI
metiscode config set model claude-3-5-sonnet-20241022  # Anthropic
metiscode config set model llama-3.1-70b-versatile     # Groq

# Configure settings
metiscode config set temperature 0.7                   # Set temperature
metiscode config set apikey sk-proj-...                # Global API key

# View current configuration
metiscode config show
```

### Supported Models

**OpenAI:**
- `gpt-4o` (recommended)
- `gpt-4o-mini`
- `gpt-4-turbo`
- `gpt-4`
- `gpt-3.5-turbo`

**Anthropic:**
- `claude-3-5-sonnet-20241022` (recommended)
- `claude-3-5-haiku-20241022`
- `claude-3-opus-20240229`

**Groq:**
- `llama-3.1-70b-versatile`
- `llama-3.1-8b-instant`
- `mixtral-8x7b-32768`

## 🛡️ Permission System

### Permission Modes

Press `Tab` to cycle through modes or use `/mode`:

- **Normal**: Prompt for approval on risky operations
- **Auto-Accept**: Automatically approve operations
- **Plan-Only**: Show what would be done without executing

### Planning Mode

Use `/plan` to enter collaborative planning mode:

- **Focus**: Define project requirements and architecture
- **Output**: Generates comprehensive Agent.md files
- **No Code Execution**: Planning only, no actual implementation
- **Exit**: Use `/execute` to switch to implementation mode

### Session Approvals

When prompted for approval, you can:
- `y/yes` - Approve this operation
- `n/no` - Deny this operation
- `s/session` - **Approve similar operations for rest of session**
- `a/auto` - Switch to auto-accept mode
- `p/plan` - Switch to plan-only mode
- `v/view` - View detailed code preview

### Code Previews

Get Claude Code-style before/after diffs:

```
🔒 Approval Required

Operation: Execute write_file
Description: Write content to example.ts
Risk Level: ⚡ MEDIUM

👀 Code Preview:
📝 example.ts (modify)
Lines 1-5:
- 1: const oldFunction = () => {
- 2:   return "old value";  
+ 1: const newFunction = () => {
+ 2:   return "new value";

Options: [y/n/s/a/p/v/Tab]
```

## 📁 Advanced Features

### Multi-file Operations

```bash
# In interactive session:
"Rename the function 'getUserData' to 'fetchUserProfile' across all TypeScript files"
"Replace all instances of 'API_URL' with 'BASE_URL' in the src/ directory"
"Organize imports in all React components"
```

### Session Management  

```bash
# List recent sessions with enhanced info
/sessions

# Resume a specific session
/resume session-12345

# Continue the last session
/continue

# View active session approvals
/approvals
```

### Memory & Context Commands

```bash
/clear     # Clear conversation history
/compact   # Compress context (summarize old messages)  
/resume    # Resume previous session with full context
/memory    # View hierarchical memory system status
/memory agent # View detailed Agent.md hierarchy
/reload    # Force refresh Agent.md files from disk
```

## 🧠 Hierarchical Memory System

### Agent.md Files

Metis Code automatically discovers and loads Agent.md files throughout your project hierarchy:

```
my-project/
├── Agent.md                    # Project-level instructions (highest priority)
├── src/
│   ├── Agent.md               # Directory-level instructions  
│   └── components/
│       └── Agent.md           # Subdirectory-level instructions
└── docs/
    └── Agent.md               # Documentation-specific instructions
```

**Key Features:**
- **Hierarchical Loading**: Instructions cascade from project root → directories → subdirectories
- **Auto-Detection**: Files are discovered automatically when the AI runs
- **Real-time Updates**: Changes to Agent.md files are detected and reloaded
- **Project Awareness**: AI understands project structure and conventions from Agent.md

### Memory Management

```bash
# View memory system status
/memory
📝 Session Memory: 15 messages (healthy)
🎯 Project Memory: ✅ Agent.md loaded (127 lines)

# View detailed Agent.md hierarchy  
/memory agent
🎯 Agent.md Hierarchy
1. Agent.md (project)
   Location: project root
   Size: 89 lines, Modified: 2024-01-15 10:30

2. Agent.md (directory)  
   Location: src
   Size: 38 lines, Modified: 2024-01-15 09:15

# Force refresh Agent.md files
/reload
🔄 Agent.md Files Refreshed
✅ Loaded 2 Agent.md file(s)
```

## 🔧 Built-in Tools & Capabilities

### File Operations
- **read_file**: Read and analyze file contents
- **write_file**: Create or modify files with previews
- **edit_file**: Make targeted edits to existing files
- **list_files**: Directory listing with smart filtering
- **move_file**: Rename/move files with approval gates

### Multi-file Operations  
- **multi_file_replace**: Replace text across multiple files
- **batch_read**: Read multiple files efficiently
- **rename_symbol**: Rename functions/variables across codebase
- **organize_imports**: Clean up import statements

### Git Operations (Enhanced)
- **git_status**: Repository status and changes
- **git_diff**: File differences and staging info
- **git_log**: Commit history with details
- **git_add**: Stage files for commit
- **git_commit**: Create commits with smart messages
- **git_merge**: Advanced merge operations
- **git_stash**: Stash management
- **git_rebase**: Interactive rebasing
- **git_remote**: Remote repository management

### GitHub Integration
- **github_pr**: Pull request management
- **github_issue**: Issue tracking
- **github_repo**: Repository operations
- **github_workflow**: CI/CD workflow management

### MCP Operations
- **connect_mcp_server**: Connect to MCP servers
- **list_mcp_resources**: List available MCP resources
- **call_mcp_tool**: Execute tools on MCP servers
- **get_mcp_resource**: Retrieve MCP resource content

### Search & Navigation
- **grep**: Advanced search with ripgrep
- **find_files**: Locate files by name/pattern

### System Operations
- **bash**: Execute shell commands (with approval)
- **ps**: Process listing
- **env**: Environment variables

### Todo Management
- **create_todo**: Add tasks to session todo list
- **update_todo**: Modify existing todos  
- **list_todos**: View active todos
- **delete_todo**: Remove completed todos

## 🎭 Persona System

Metis Code features a sophisticated persona system that allows you to customize AI behavior and personality traits for different development contexts.

### Built-in Personas

**Default** (`default`)
- Balanced general-purpose coding assistant
- Temperature: 0.2

**Friendly Mentor** (`friendly-mentor`)
- Encouraging and patient coding mentor who teaches concepts
- Focus on teaching and explaining the 'why' behind suggestions
- High encouragement level with detailed explanations
- Temperature: 0.3

**Senior Developer** (`senior-dev`)
- Expert code reviews and architecture guidance
- Focus on best practices and maintainable code
- Temperature: 0.1

**Security Expert** (`security-expert`)
- Specialized security analysis and secure coding
- Vulnerability assessment and threat modeling
- Temperature: 0.1

### AI-Powered Persona Generation

Generate custom personas tailored to your specific needs using AI assistance:

```bash
# Generate a specialized persona
metiscode persona generate frontend-expert "A React and TypeScript specialist"
metiscode persona generate devops-guru "Expert in Docker, Kubernetes, and CI/CD"
metiscode persona generate data-scientist "Python data analysis and machine learning expert"

# Generate a persona with specific traits
metiscode persona generate patient-teacher "An encouraging mentor who explains concepts step-by-step"
metiscode persona generate code-reviewer "A thorough reviewer focused on security and performance"
```

### Interactive Session Persona Management

```bash
# In interactive session (/persona commands)
/persona list                                    # List all available personas
/persona show friendly-mentor                    # Show persona details
/persona generate api-expert "REST API specialist" # Generate new persona
```

### Project-Specific Personas

Create project-specific personas that override global settings:

**`.metis/persona.yaml`** (Project-specific persona)
```yaml
name: "marketing-expert"
version: "1.0"
description: "Marketing-focused coding assistant for business applications"
system_prompt: |
  You are a marketing-focused coding assistant who specializes in building
  business and marketing applications. You understand both technical
  implementation and business requirements.

capabilities:
  - code_generation
  - business_logic
  - user_experience
  - marketing_optimization

temperature: 0.4

personality:
  communication_style: "business-friendly and solution-focused"
  explanation_depth: "balanced with business context"
  code_review_tone: "constructive with ROI considerations"
  help_approach: "focus on business outcomes and user impact"
  humor_level: "professional with light touches"
  formality: "professional but approachable"
  encouragement: "high with business success focus"

behavior:
  - "Always consider business impact and user experience"
  - "Explain how code changes affect user flow and conversion"
  - "Suggest marketing-friendly features and analytics integration"
  - "Focus on maintainable code that supports rapid iteration"

model_preferences:
  - "claude-3-5-sonnet-20241022"
  - "gpt-4o"
```

### Persona Loading Priority

1. **Project-specific** (`.metis/persona.yaml`) - highest priority
2. **Environment variable** (`METIS_PERSONA=persona-name`)
3. **Default persona** - fallback

### Managing Personas

```bash
# CLI Commands
metiscode persona list                           # List all personas
metiscode persona show <name>                    # Show persona details
metiscode persona generate <name> [description]  # Generate new persona
metiscode persona validate <name>                # Validate persona format

# Use specific persona in session
METIS_PERSONA=security-expert metiscode

# Interactive session commands
/persona list                                    # List personas
/persona show senior-dev                        # Show details
/persona generate my-expert "Custom description" # Generate persona
```

### Generated Persona Features

AI-generated personas automatically include:

- **Comprehensive system prompts** tailored to the specified role
- **Personality traits** (communication style, humor level, formality, etc.)
- **Behavior guidelines** specific to the persona's expertise
- **Relevant capabilities** array for the domain
- **Optimal temperature** settings for the use case
- **Model preferences** for best performance
- **Validation** to ensure proper YAML format

### Persona Examples

**Generate a Testing Expert:**
```bash
metiscode persona generate qa-expert "Quality assurance specialist focused on testing strategies"
```

**Generate a Frontend Specialist:**
```bash
metiscode persona generate react-ninja "React expert with modern hooks and TypeScript expertise"
```

**Generate a Database Expert:**
```bash
metiscode persona generate db-architect "Database design and optimization specialist"
```

## 💾 Session Persistence

### Automatic Features
- **Session Recovery**: Detects interrupted sessions and offers recovery
- **Permission Restoration**: Maintains approval states across restarts
- **Context Preservation**: Saves working files and conversation history
- **Crash Detection**: Intelligent recovery from unexpected exits

### Manual Session Control
```bash
# Resume last interrupted session
metiscode --resume

# Start with specific session ID
metiscode --session my-session-id

# View session statistics
/sessions  # Shows duration, file count, message count
```

## 📋 Legacy CLI Commands

For backwards compatibility and automation:

```bash
# Execute single tasks
metiscode run "Add input validation to user registration"

# Repository analysis
metiscode scan          # Concise repo summary
metiscode plan          # Implementation plan
metiscode diff          # Show staged changes
metiscode apply         # Apply changes

# Configuration management  
metiscode auth          # Configure API keys (legacy)
metiscode status        # System health check
metiscode models        # List available models

# Tool testing
metiscode exec "ls -la" # Execute shell commands

# Agent management
metiscode agents list   # List sub-agents
metiscode agents stats  # Agent performance

# MCP management
metiscode mcp show      # List MCP servers

# Migration tools
metiscode migrate apikeys  # Move to global config
```

## 📝 Configuration Files

### Global Configuration

**`~/.metis/secrets.json`** (Global API Keys - Recommended)
```json
{
  "openai": "sk-proj-...",
  "anthropic": "sk-ant-...", 
  "groq": "gsk_..."
}
```

### Project Configuration

**`metis.config.json`**
```json
{
  "provider": "openai",
  "model": "gpt-4o", 
  "temperature": 0.2,
  "safety": {
    "dryRun": false,
    "requireExecApproval": true
  },
  "ignore": [
    "node_modules/**",
    ".git/**",
    "dist/**"
  ]
}
```

**`.metis/mcp-servers.json`** (MCP Server Configurations)
```json
{
  "myserver": {
    "serverConfig": {
      "name": "My Server",
      "version": "1.0.0",
      "description": "Custom MCP server",
      "capabilities": {"tools": true, "resources": true}
    },
    "transport": {
      "type": "stdio",
      "command": "node", 
      "args": ["server.js"]
    }
  }
}
```

**`Agent.md`** (Project Instructions)
```markdown
# Project: My Application

## Context
This is a React TypeScript application with Node.js backend.

## Guidelines
- Use TypeScript strict mode
- Follow React hooks patterns
- Implement comprehensive error handling
- Write tests for new features

## Architecture
- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL with Prisma ORM

## Sub-Agents Usage
- Use developer agents for implementation
- Use reviewer agents for code quality
- Use devops agents for deployment
```

## 🔍 Usage Examples

### Multi-Agent Workflow
```bash
# Start interactive session
metiscode

# Create specialized team
metiscode agents create developer backend-dev
metiscode agents create reviewer security-reviewer
metiscode agents create devops deploy-engineer

# Coordinate development workflow
> "backend-dev: implement user authentication with JWT"
> "security-reviewer: review the auth implementation for vulnerabilities"  
> "deploy-engineer: set up secure deployment pipeline for the auth service"
```

### MCP Integration
```bash
# Add weather service MCP server
metiscode mcp add weather '{
  "name": "Weather Service",
  "version": "1.0.0", 
  "description": "Weather data provider",
  "capabilities": {"tools": true},
  "transport": {
    "type": "websocket",
    "url": "ws://weather-api.example.com"
  }
}'

# Use in session
metiscode
> "Check the weather in New York using the weather service and suggest appropriate clothing"
```

### Global Configuration Setup
```bash
# One-time global setup
metiscode config set apikey sk-your-openai-key
metiscode config set provider openai
metiscode config set model gpt-4o

# Now works from any project folder
cd ~/project1
metiscode "implement user auth"

cd ~/project2  
metiscode "fix the deployment script"

cd ~/project3
metiscode "add unit tests"
```

### Bug Fixing with Debugging Specialist
```bash
metiscode agents create debugging-specialist debugger
metiscode agents exec debugger "The application crashes when processing large files. Investigate and fix the memory issue."
```

### Code Review with Security Expert
```bash
metiscode agents create reviewer security-expert  
metiscode agents exec security-expert "Review the payment processing code in src/payments/ for security vulnerabilities and suggest fixes."
```

### DevOps Automation
```bash
metiscode agents create devops infra-engineer
metiscode agents exec infra-engineer "Set up a Docker containerization strategy for this Node.js application with multi-stage builds."
```

## 🔧 Development Setup

### Prerequisites
- Node.js 18+
- npm or yarn

### Local Development
```bash
# Clone repository
git clone https://github.com/your-repo/metis-code
cd metis-code

# Install dependencies
npm install

# Build project
npm run build

# Run tests
npm test

# Start locally
npm start

# Test CLI locally
node dist/cli/index.js --help
```

### Project Structure
```
src/
├── cli/                 # Command-line interface
│   ├── session.ts       # Interactive session management
│   └── commands/        # CLI commands
├── agents/              # Sub-agents architecture
│   ├── core/           # Core agent classes
│   ├── personas/       # Agent personalities
│   └── skills/         # Agent skill sets
├── mcp/                # MCP protocol implementation
│   ├── client.ts       # MCP client
│   ├── server.ts       # MCP server
│   └── transport/      # Transport layers
├── agent/              # Core AI agent logic
├── tools/              # Built-in tool registry
├── providers/          # AI provider integrations
├── permissions/        # Permission system & approval gates
├── runtime/            # Session memory & persistence
├── config/             # Configuration management
└── errors/             # Error handling system

assets/
└── personas/           # Built-in AI personas

tests/                  # Test suite
docs/                   # Documentation
```

## 🐛 Troubleshooting

### Common Issues

**API Key Not Configured**
```
❌ OpenAI API key missing
Solution: metiscode config set apikey your-api-key
```

**Agent Creation Failed**
```
❌ Failed to create agent: Maximum number of agents (10) reached
Solution: metiscode agents cleanup --idle
```

**MCP Server Connection Failed**
```
❌ MCP server connection failed: Connection refused
Solution: Check server status and configuration
```

**Permission Denied**
```
❌ Operation denied by permission system
Solution: Use 'y' to approve or switch to auto-accept mode with 'a'
```

### Migration from Local Config

If you have existing local API keys:
```bash
# Migrate to global configuration
metiscode migrate apikeys

# Shows what will be migrated and confirms
✅ Successfully migrated API keys to global config
Global location: ~/.metis/secrets.json
```

### Getting Help

```bash
# General help
metiscode --help

# Session help
metiscode
> /help

# Check system status
metiscode status

# Agent system help
metiscode agents help

# MCP system help
metiscode mcp help

# View configuration
metiscode config show

# List available models
metiscode models
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes with tests
4. Run the test suite: `npm test`
5. Build the project: `npm run build`
6. Submit a pull request

### Development Guidelines
- Follow TypeScript strict mode
- Add tests for new features
- Update documentation for API changes
- Use conventional commit messages
- Ensure all CI checks pass

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.

---

## 🔗 Links

- **npm Package**: [metis-code](https://www.npmjs.com/package/metis-code)
- **Issues & Features**: [GitHub Issues](https://github.com/your-repo/metis-code/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-repo/metis-code/discussions)

---

*Metis Code - Advanced AI-powered development assistant with sub-agents, MCP integration, and Claude Code parity features.*