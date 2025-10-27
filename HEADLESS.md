# Headless Mode Usage Guide

Metis Code supports **headless mode** for non-interactive execution in CI/CD pipelines, automation scripts, or when being called by other AI agents (like Claude Code).

## What is Headless Mode?

Headless mode allows Metis Code to run **without any user interaction** by automatically approving all operations. This is essential for:

- **CI/CD pipelines** (GitHub Actions, GitLab CI, Jenkins, etc.)
- **Automation scripts** (cron jobs, scheduled tasks)
- **AI agent integration** (being called by other AI systems)
- **Batch processing** (processing multiple tasks sequentially)

## How to Enable Headless Mode

### Method 1: Command-Line Flag (Recommended)

```bash
# Using --headless flag
metiscode --headless "create a hello world function in utils.ts"

# Using --auto-accept flag (alias)
metiscode --auto-accept "fix the bug in login.ts"

# Combine with verbose mode for logging
metiscode --headless --verbose "add error handling to API endpoints"
```

### Method 2: Environment Variable

```bash
# Set environment variable
export METIS_HEADLESS=true
metiscode "your task here"

# Or use METIS_AUTO_ACCEPT
export METIS_AUTO_ACCEPT=true
metiscode "your task here"

# Or in CI environment (auto-detected)
export CI=true
metiscode "your task here"
```

### Method 3: Inline Environment Variable

```bash
# One-liner for scripts
METIS_HEADLESS=true metiscode "create test files"
```

## Auto-Detection

Metis Code **automatically detects** headless environments and enables auto-accept mode when:

1. `METIS_HEADLESS=true` is set
2. `CI=true` is set (standard CI environment variable)
3. `METIS_AUTO_ACCEPT=true` is set
4. Running in a non-TTY environment (`stdin` or `stdout` is not a terminal)

## CI/CD Examples

### GitHub Actions

```yaml
name: AI Code Review
on: [push]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install Metis Code
        run: npm install -g metis-code

      - name: Configure API Key
        run: |
          metiscode config set apikey ${{ secrets.GROQ_API_KEY }}
          metiscode config set model llama-3.3-70b-versatile

      - name: Run Code Review
        run: |
          # Headless mode auto-detected via CI=true
          metiscode --verbose "Review the changes in this PR and suggest improvements"

      - name: Run Tests
        run: |
          metiscode --headless "Run tests and fix any failures"
```

### GitLab CI

```yaml
stages:
  - ai-tasks

ai-code-generation:
  stage: ai-tasks
  script:
    - npm install -g metis-code
    - metiscode config set apikey $GROQ_API_KEY
    # CI=true is set by GitLab automatically
    - metiscode --verbose "Generate unit tests for all functions in src/"
```

### Docker Container

```dockerfile
FROM node:18-alpine

# Install Metis Code
RUN npm install -g metis-code

# Configure API key
ARG GROQ_API_KEY
RUN metiscode config set apikey ${GROQ_API_KEY}

# Set headless mode
ENV METIS_HEADLESS=true
ENV METIS_VERBOSE=true

# Your application code
WORKDIR /app
COPY . .

# Run headless task
CMD ["metiscode", "analyze code quality and generate report"]
```

### Shell Script

```bash
#!/bin/bash
# automated-refactor.sh

set -e  # Exit on error

# Configure Metis
export METIS_HEADLESS=true
export METIS_VERBOSE=true

# Set API key from environment or file
export GROQ_API_KEY=${GROQ_API_KEY:-$(cat ~/.groq_api_key)}

# Run multiple tasks
echo "🤖 Starting automated refactoring..."

metiscode "Refactor all functions in src/ to use TypeScript strict mode"
metiscode "Add JSDoc comments to all public functions"
metiscode "Fix all linting errors"
metiscode "Update dependencies to latest versions"

echo "✅ Refactoring complete!"
```

## Being Called by Claude Code (or other AI agents)

When Claude Code wants to use Metis Code as a tool, it can call it in headless mode:

```typescript
// Example: Claude Code calling Metis Code
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function useMetisCode(task: string) {
  try {
    // Call Metis Code in headless mode
    const { stdout, stderr } = await execAsync(
      `metiscode --headless --verbose "${task}"`,
      {
        env: {
          ...process.env,
          METIS_HEADLESS: 'true',
          GROQ_API_KEY: process.env.GROQ_API_KEY,
        }
      }
    );

    console.log('Metis Code output:', stdout);
    if (stderr) console.error('Metis Code errors:', stderr);

    return stdout;
  } catch (error) {
    console.error('Failed to execute Metis Code:', error);
    throw error;
  }
}

// Usage
await useMetisCode('create a REST API endpoint for user authentication');
```

### Python Integration

```python
import subprocess
import os

def run_metis_code(task: str) -> str:
    """Call Metis Code in headless mode from Python"""

    env = os.environ.copy()
    env['METIS_HEADLESS'] = 'true'
    env['METIS_VERBOSE'] = 'true'

    result = subprocess.run(
        ['metiscode', '--headless', task],
        capture_output=True,
        text=True,
        env=env,
        check=True
    )

    return result.stdout

# Usage
output = run_metis_code('add error handling to database queries')
print(output)
```

## Behavior in Headless Mode

When running in headless mode, Metis Code:

### ✅ Auto-Approved Operations
- **File operations**: read, write, edit, delete, rename
- **Git operations**: status, diff, log, add, commit
- **Bash commands**: (except dangerous ones like `rm -rf`, `format`)
- **Network requests**: web search, API calls
- **Code generation**: creating new files, modifying existing code

### 🛡️ Safety Features (Still Active)
- **Dangerous command blocking**: `rm -rf`, `shutdown`, `format`, etc. are BLOCKED
- **Command injection prevention**: All security checks remain active
- **Path traversal prevention**: Cannot access files outside working directory
- **Sensitive file warnings**: Warns when modifying .env, credentials, etc.

### 📊 Output
- **Progress indicators**: Still shown (can be disabled with `--quiet`)
- **Tool execution logs**: Visible in verbose mode
- **Final results**: Returned to stdout
- **Errors**: Sent to stderr with exit code 1

## Best Practices

### 1. **Always Use with Verbose Mode in CI**
```bash
metiscode --headless --verbose "your task"
```
This ensures you can see what the agent is doing in CI logs.

### 2. **Set Timeouts in Scripts**
```bash
# Use timeout command to prevent hanging
timeout 10m metiscode --headless "complex task"
```

### 3. **Validate Output**
```bash
# Check exit code
metiscode --headless "run tests" && echo "Success!" || echo "Failed!"
```

### 4. **Use Environment Variables for Secrets**
```bash
# Never hardcode API keys
export GROQ_API_KEY=$(vault read -field=key secret/groq)
metiscode --headless "your task"
```

### 5. **Limit Scope in Automated Environments**
```bash
# Use specific, focused tasks
metiscode --headless "fix TypeScript errors in src/utils.ts only"

# Instead of broad tasks that could modify too much
# metiscode --headless "refactor the entire codebase" # ❌ Too broad
```

## Debugging Headless Mode

### Enable Trace Mode
```bash
metiscode --headless --trace --verbose "your task"
```

### Check Mode Detection
```bash
# The agent will log:
# [Headless] Auto-detected headless environment, using AUTO_ACCEPT mode

# Force headless detection check
METIS_HEADLESS=true metiscode --verbose "echo test"
```

### Test Locally
```bash
# Simulate CI environment locally
CI=true metiscode "your task"

# Or force non-TTY
echo "your task" | metiscode --headless -
```

## Limitations

1. **Interactive prompts are skipped**: You cannot ask for user input
2. **Slash commands may not work**: Some interactive commands like `/persona` won't work
3. **Session recovery limited**: Interactive sessions cannot be resumed in headless mode
4. **Approval required for custom prompts**: If the task is ambiguous, it may fail

## Security Considerations

⚠️ **Important**: Headless mode auto-approves ALL operations. Only use when:

- Running in a **controlled environment** (CI/CD, container, sandbox)
- You **trust the task description** (not from untrusted user input)
- You have **backups** or version control enabled
- You understand the **scope of the task**

### Recommended Security Settings

```bash
# Run in a clean git branch
git checkout -b ai-changes
metiscode --headless "your task"
git diff  # Review changes
git commit -am "AI-generated changes"

# Or use Docker for isolation
docker run --rm -v $(pwd):/app metis-code \
  metiscode --headless "your task"
```

## Examples

### Generate Code Documentation
```bash
metiscode --headless "Generate comprehensive JSDoc comments for all public functions in src/"
```

### Automated Testing
```bash
metiscode --headless "Create unit tests for all functions in src/utils/"
```

### Code Quality Fixes
```bash
metiscode --headless "Fix all ESLint errors and warnings"
```

### Batch Processing
```bash
# Process multiple files
for file in src/**/*.ts; do
  metiscode --headless "Add error handling to $file"
done
```

### API Integration Test
```bash
metiscode --headless "Test all API endpoints and report any failures"
```

## Troubleshooting

### Issue: Agent hangs waiting for input
**Solution**: Ensure `METIS_HEADLESS=true` or `CI=true` is set

### Issue: Permission denied errors
**Solution**: Check file permissions in CI environment
```bash
chmod -R u+w .
metiscode --headless "your task"
```

### Issue: API key not found
**Solution**: Verify environment variable is set
```bash
echo $GROQ_API_KEY  # Should not be empty
metiscode config get apikey  # Check configured key
```

### Issue: Dangerous command blocked
**Solution**: This is expected. Use specific tools instead:
```bash
# Instead of: metiscode --headless "delete all temp files with rm -rf"
# Use: metiscode --headless "use file operations to clean temp directory"
```

## Summary

Headless mode makes Metis Code a powerful tool for:
- ✅ **CI/CD integration**
- ✅ **Automation workflows**
- ✅ **AI agent collaboration** (being called by Claude Code, etc.)
- ✅ **Batch processing**
- ✅ **Scheduled tasks**

With proper security controls and focused task descriptions, you can safely automate complex coding tasks!

---

**Need Help?** Check the main README or run `metiscode --help`
