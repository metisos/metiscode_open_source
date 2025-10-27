# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Development:**
- Build: `npm run build` (uses tsup to compile TypeScript)
- Compile only: `npm run compile` (TypeScript compiler)
- Test: `npm test` (vitest test runner)
- Start CLI: `npm start` or `node dist/cli/index.js`

**CLI Usage:**
- `metiscode` - Start interactive session (primary interface)
- `metiscode --headless "task"` - Run in non-interactive mode (CI/CD ready)
- `metiscode --auto-accept "task"` - Auto-approve all operations
- Slash commands in interactive session:
  - `/init` - Initialize Agent.md with project instructions
  - `/status` - Show system status
  - `/config` - Show/manage configuration
  - `/help` - Show help
  - `/exit` - Exit session

**Legacy CLI Commands (still available):**
- `metiscode run "<task>"` - Generate a patch for the given task
- `metiscode diff` - Show staged patch and unified diffs  
- `metiscode apply` - Apply staged changes to workspace
- `metiscode scan` - Print concise repo summary
- `metiscode plan` - Analyze repo and propose implementation plan
- `metiscode auth` - Configure provider API keys
- `metiscode models` - List available models
- `metiscode exec` - Run shell commands with approval gate

## Architecture

**Core Structure:**
- `src/cli/` - Command-line interface with interactive session
- `src/providers/` - Groq AI provider integration for ultra-fast inference
- `src/tools/` - Comprehensive tool registry with builtin tools
- `src/config/` - Configuration and secrets management
- `src/agent/` - Unified agent with session memory and tool access
- `src/runtime/` - Session management and memory system
- `src/errors/` - Error handling with interactive session support

**Key Features:**
- Unified interactive session with natural language processing
- **Headless mode**: Run non-interactively in CI/CD, automation, or when called by other AI agents
- Powered by Groq: Ultra-fast inference with Llama 3.3, Mixtral, and other models
- Comprehensive tool set: file ops, git, bash, search, todo management
- Session memory and context persistence
- Todo management system for task tracking
- Persona-based AI behavior
- Built-in safety features and approval gates
- Enhanced security: Command injection prevention, improved token estimation, retry logic

**Tool Categories:**
- **File Operations**: read_file, write_file, edit_file, list_files, create_directory, move_file
- **Git Operations**: git_status, git_diff, git_log, git_add, git_commit, git_branch, git_checkout  
- **Search Operations**: grep (ripgrep), find_files
- **Bash Operations**: bash, ps, env, which
- **Todo Management**: create_todo, update_todo, list_todos, delete_todo, clear_completed_todos

**Configuration:**
- `metis.config.json` - Model, temperature, safety settings
- `~/.metis/secrets.json` - Global API keys (recommended)
- `.metis/secrets.json` - Local API keys (legacy, still supported)
- Environment variable: GROQ_API_KEY (highest priority)
- Default model: llama-3.3-70b-versatile

**API Key Priority (highest to lowest):**
1. Environment variable (GROQ_API_KEY)
2. Global config (~/.metis/secrets.json) - **recommended**
3. Local project config (./.metis/secrets.json) - legacy

**Session System:**
- Persistent session memory with message history
- Working file tracking
- Task and context management
- Automatic cleanup of old sessions