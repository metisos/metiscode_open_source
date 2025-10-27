import fs from "fs";
import path from "path";
import kleur from "kleur";
import { summarizeRepo } from "../../tools/repo";
import { makeProvider } from "../../agent/simpleAgent";

// Analyze project structure and generate smart Agent.md
async function analyzeProjectAndGenerateAgentMd(projectPath: string): Promise<string> {
  console.log(kleur.blue("🔍 Analyzing project structure..."));
  
  try {
    const provider = makeProvider();
    const repoSummary = summarizeRepo(120); // Get detailed repo summary
    
    const analysisPrompt = `You are an expert software architect and development consultant. Analyze this project deeply and generate a comprehensive, professional Agent.md file that will make an AI assistant exceptionally effective at working with this specific codebase.

PROJECT ANALYSIS:
${repoSummary}

Create a detailed, actionable Agent.md that includes:

## CRITICAL REQUIREMENTS:
1. **Project Identity & Purpose**: What exactly does this project do? What problem does it solve?
2. **Technical Architecture**: Detailed breakdown of the tech stack, frameworks, libraries, and design patterns
3. **Code Organization**: File structure, module organization, naming conventions, and architectural patterns
4. **Development Standards**: Specific coding style, formatting rules, documentation requirements
5. **Key Business Logic**: Core functionality, algorithms, data flow, and critical components
6. **Testing Strategy**: Test structure, coverage expectations, testing patterns and tools
7. **Security Considerations**: Authentication, authorization, data protection, input validation
8. **Performance Requirements**: Optimization patterns, scalability considerations, performance monitoring
9. **Dependencies & Integration**: External APIs, databases, services, and how they're used
10. **Deployment & Operations**: Build process, environment setup, deployment patterns

## AGENT INSTRUCTIONS:
Make the Agent.md extremely specific and actionable. Include:
- Exact file naming patterns and directory structures to follow
- Specific coding patterns and anti-patterns for this project
- Required error handling and logging patterns
- Database/API interaction standards
- Security best practices specific to this project type
- Performance optimization guidelines
- Code review criteria and quality gates

Format as a comprehensive markdown file with clear sections, code examples, and specific, actionable guidance that will make the AI assistant work like a senior developer who knows this project intimately.`;

    const agentMdContent = await provider.send([
      { role: "system", content: "You are an expert software architect analyzing projects to create comprehensive development guidelines." },
      { role: "user", content: analysisPrompt }
    ]);

    return agentMdContent;
  } catch (error) {
    console.log(kleur.yellow("⚠️  Failed to analyze project with AI, using fallback template"));
    return generateFallbackAgentMd();
  }
}

function generateFallbackAgentMd(): string {
  return `# Agent Instructions

This file provides comprehensive guidance to the AI assistant for working effectively with this project.

## Project Overview

**Purpose**: Software development project requiring intelligent AI assistance
**Type**: General development project
**Last Updated**: ${new Date().toISOString().split('T')[0]}

## Development Standards

### Code Quality Requirements
- **Readability First**: Write self-documenting code with clear variable and function names
- **Consistency**: Follow established patterns throughout the codebase
- **Error Handling**: Implement comprehensive error handling with meaningful messages
- **Input Validation**: Validate all inputs at boundaries (API endpoints, user inputs, external data)
- **Documentation**: Include docstrings/comments for complex logic and public APIs

### Architecture Principles
- **Separation of Concerns**: Keep business logic, data access, and presentation layers distinct
- **Single Responsibility**: Each function/class should have one clear purpose
- **DRY Principle**: Avoid code duplication through proper abstraction
- **SOLID Principles**: Follow object-oriented design principles where applicable

### Security Standards
- **Input Sanitization**: Sanitize all external inputs to prevent injection attacks
- **Authentication**: Implement proper authentication and authorization checks
- **Sensitive Data**: Never commit API keys, passwords, or personal data
- **HTTPS**: Use secure connections for all external communications
- **Dependency Security**: Keep dependencies updated and scan for vulnerabilities

### Testing Requirements
- **Unit Tests**: Write tests for all business logic functions
- **Integration Tests**: Test API endpoints and database interactions
- **Edge Cases**: Test error conditions, boundary values, and unusual inputs
- **Coverage**: Maintain minimum 80% test coverage for critical code paths
- **Test Organization**: Follow clear naming conventions and organize tests logically

### Performance Guidelines
- **Database Queries**: Optimize queries and use proper indexing
- **Caching**: Implement caching for frequently accessed data
- **Resource Management**: Properly close connections and clean up resources
- **Async Operations**: Use asynchronous patterns for I/O operations where appropriate

### Code Review Criteria

When reviewing or generating code, ensure:
1. **Functionality**: Code works as intended and handles edge cases
2. **Security**: No security vulnerabilities or sensitive data exposure
3. **Performance**: Efficient algorithms and resource usage
4. **Maintainability**: Code is easy to understand and modify
5. **Testing**: Adequate test coverage and quality
6. **Documentation**: Clear comments and documentation where needed

## Implementation Guidelines

### File Organization
- Group related functionality into logical modules/packages
- Use consistent naming conventions for files and directories
- Separate configuration, utilities, and core business logic
- Keep file sizes reasonable (typically under 500 lines)

### Error Handling Patterns
- Use appropriate exception types for different error conditions
- Log errors with sufficient context for debugging
- Provide user-friendly error messages
- Implement graceful degradation where possible

### Logging Standards
- Use structured logging with appropriate log levels
- Include correlation IDs for tracing requests
- Log important business events and error conditions
- Avoid logging sensitive information

## AI Assistant Instructions

When working with this project:
1. **Analyze First**: Always examine existing code patterns before implementing new features
2. **Follow Conventions**: Maintain consistency with established coding styles and patterns
3. **Security Focus**: Consider security implications of every change
4. **Test Coverage**: Include tests with every new feature or significant change
5. **Documentation**: Update documentation when adding new functionality
6. **Performance**: Consider performance impact of implementation choices
7. **Code Review**: Write code as if it will be reviewed by a senior developer

---

*Generated by Metis Code - Customize this file for project-specific requirements*`;
}

export async function runInit(args: string[]) {
  const cwd = process.cwd();
  const metisDir = path.join(cwd, ".metis");
  const sessionsDir = path.join(metisDir, "sessions");
  const secretsFile = path.join(metisDir, "secrets.json");
  const cfgPath = path.join(cwd, "metis.config.json");
  const agentMdPath = path.join(cwd, "Agent.md");

  if (!fs.existsSync(metisDir)) fs.mkdirSync(metisDir);
  if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir);

  if (!fs.existsSync(cfgPath)) {
    fs.writeFileSync(
      cfgPath,
      JSON.stringify(
        {
          provider: "openai",
          model: "gpt-4o",
          temperature: 0.2,
          safety: { dryRun: true, requireExecApproval: true },
          ignore: ["node_modules/**", ".git/**", "dist/**", ".metis/sessions/**"],
        },
        null,
        2
      ) + "\n"
    );
    console.log(`Created config: ${path.relative(cwd, cfgPath)}`);
  } else {
    console.log(`Config exists: ${path.relative(cwd, cfgPath)}`);
  }

  if (!fs.existsSync(secretsFile)) {
    fs.writeFileSync(secretsFile, JSON.stringify({}, null, 2) + "\n");
    console.log(`Created secrets store: ${path.relative(cwd, secretsFile)}`);
  } else {
    console.log(`Secrets store exists: ${path.relative(cwd, secretsFile)}`);
  }

  // Always create Agent.md with intelligent project analysis
  if (!fs.existsSync(agentMdPath)) {
    console.log();
    console.log(kleur.cyan("🤖 Generating intelligent Agent.md based on your project..."));
    
    try {
      const agentMdContent = await analyzeProjectAndGenerateAgentMd(cwd);
      fs.writeFileSync(agentMdPath, agentMdContent);
      console.log(kleur.green("✅ ") + `Created ${kleur.yellow("Agent.md")} with project-specific instructions`);
      console.log(kleur.gray("   The AI analyzed your project structure and generated tailored guidelines"));
    } catch (error) {
      console.log(kleur.red("❌ ") + "Failed to generate Agent.md");
      console.log(kleur.gray(`   Error: ${error.message}`));
    }
  } else {
    console.log(kleur.yellow("⚠️  ") + `Agent.md already exists: ${path.relative(cwd, agentMdPath)}`);
    console.log(kleur.gray("   Delete it and run init again to regenerate with project analysis"));
  }

  console.log();
  console.log(kleur.green("🎉 Metis workspace initialized!"));
  
  console.log();
  console.log(kleur.white("Next steps:"));
  console.log(kleur.gray("1. ") + `Review and customize ${kleur.yellow("Agent.md")} (AI-generated project guidelines)`);
  console.log(kleur.gray("2. ") + `Configure your API key: ${kleur.cyan("metiscode auth set openai YOUR_API_KEY")}`);
  console.log(kleur.gray("3. ") + `Start coding: ${kleur.cyan('metiscode run "your task"')}`);
  
  console.log();
  console.log(kleur.blue("💡 Pro tip: ") + `The Agent.md file contains AI-generated guidelines specific to your project`);
  console.log(kleur.gray("   Edit it anytime to refine how the AI assistant works with your codebase"));
  console.log(kleur.gray("\n🔒 Keep .metis/secrets.json out of git!"));
}

