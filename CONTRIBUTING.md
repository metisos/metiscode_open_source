# Contributing to Metis Code

Thank you for your interest in contributing to Metis Code! This document provides guidelines for contributing to the project.

## Getting Started

1. **Fork the repository**
2. **Clone your fork:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/metis-code.git
   cd metis-code
   ```
3. **Install dependencies:**
   ```bash
   npm install
   ```
4. **Build the project:**
   ```bash
   npm run build
   ```

## Development Workflow

### Running Locally

```bash
# Build the project
npm run build

# Run in interactive mode
node dist/cli/index.js

# Run in headless mode
METIS_HEADLESS=true node dist/cli/index.js run "your task here"
```

### Testing

```bash
# Run tests
npm test

# Run specific test file
npm test -- path/to/test.ts
```

### Code Style

- Use TypeScript for all new code
- Follow existing code formatting
- Add JSDoc comments for public APIs
- Keep functions focused and single-purpose

## Submitting Changes

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes:**
   - Write clean, documented code
   - Add tests for new features
   - Update documentation as needed

3. **Test your changes:**
   ```bash
   npm run build
   npm test
   ```

4. **Commit your changes:**
   ```bash
   git add .
   git commit -m "feat: description of your changes"
   ```

5. **Push to your fork:**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request:**
   - Go to the original repository
   - Click "New Pull Request"
   - Select your branch
   - Describe your changes

## Commit Message Guidelines

We follow conventional commits:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `test:` Adding or updating tests
- `refactor:` Code refactoring
- `chore:` Maintenance tasks

Example:
```
feat: add support for TypeScript config files
```

## Areas for Contribution

### High Priority

- Additional provider integrations
- Performance optimizations
- Tool implementations
- Documentation improvements
- Test coverage expansion

### Features We'd Love

- Glob tool implementation
- Additional MCP server integrations
- Enhanced error handling
- UI/UX improvements
- Performance benchmarks

## Code Review Process

1. All submissions require review
2. Maintainers will review within 1 week
3. Address feedback in your PR
4. Once approved, maintainers will merge

## Questions?

- Open an issue for bugs
- Start a discussion for feature requests
- Check existing issues before creating new ones

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (see LICENSE file).

## Thank You!

Your contributions make Metis Code better for everyone. We appreciate your time and effort!
