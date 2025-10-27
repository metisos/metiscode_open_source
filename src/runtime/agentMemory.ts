import fs from "fs";
import path from "path";

export interface AgentMdContent {
  filePath: string;
  content: string;
  lastModified: Date;
  level: 'project' | 'directory' | 'subdirectory';
}

export interface MemoryHierarchy {
  projectInstructions: string;
  agentMdFiles: AgentMdContent[];
  sessionContext: string;
  workingDirectory: string;
}

export class AgentMemoryManager {
  private workingDirectory: string;
  private agentMdCache: Map<string, AgentMdContent> = new Map();
  private lastScanTime: number = 0;
  private scanInterval: number = 30000; // 30 seconds

  constructor(workingDirectory: string) {
    this.workingDirectory = workingDirectory;
  }

  // Load hierarchical Agent.md files (project root -> subdirectories)
  loadHierarchicalAgentMd(currentPath?: string): MemoryHierarchy {
    const targetPath = currentPath || this.workingDirectory;
    const agentMdFiles: AgentMdContent[] = [];
    
    // Start from current directory and work up to project root
    const pathsToCheck = this.getHierarchicalPaths(targetPath);
    
    for (const dirPath of pathsToCheck) {
      const agentMdPath = path.join(dirPath, 'Agent.md');
      
      // Only check for Agent.md files
      let contentPath = null;
      if (fs.existsSync(agentMdPath)) {
        contentPath = agentMdPath;
      }
      
      if (contentPath) {
        try {
          const stats = fs.statSync(contentPath);
          const content = fs.readFileSync(contentPath, 'utf8');
          const relativePath = path.relative(this.workingDirectory, dirPath);
          
          const level = this.determineLevel(relativePath);
          
          const agentMdContent: AgentMdContent = {
            filePath: contentPath,
            content: content.trim(),
            lastModified: stats.mtime,
            level
          };
          
          agentMdFiles.push(agentMdContent);
          this.agentMdCache.set(contentPath, agentMdContent);
        } catch (error) {
          // Silently continue if file can't be read
          console.warn(`Could not read ${contentPath}:`, error.message);
        }
      }
    }
    
    // Build combined project instructions
    const projectInstructions = this.buildProjectInstructions(agentMdFiles);
    
    return {
      projectInstructions,
      agentMdFiles,
      sessionContext: '',
      workingDirectory: this.workingDirectory
    };
  }

  // Get hierarchical paths from current directory up to project root
  private getHierarchicalPaths(startPath: string): string[] {
    const paths: string[] = [];
    let currentPath = path.resolve(startPath);
    const rootPath = path.parse(currentPath).root;
    
    // Add current directory
    paths.push(currentPath);
    
    // Walk up the directory tree
    while (currentPath !== rootPath && currentPath !== path.dirname(currentPath)) {
      currentPath = path.dirname(currentPath);
      paths.push(currentPath);
      
      // Stop at common project indicators
      if (this.isProjectRoot(currentPath)) {
        break;
      }
      
      // Safety: don't go more than 10 levels up
      if (paths.length > 10) break;
    }
    
    // Return in reverse order (project root first, then down to current)
    return paths.reverse();
  }

  // Check if a directory is likely a project root
  private isProjectRoot(dirPath: string): boolean {
    const projectIndicators = [
      'package.json',
      '.git',
      'metis.config.json',
      'pyproject.toml',
      'Cargo.toml',
      '.project',
      'pom.xml',
      'go.mod'
    ];
    
    return projectIndicators.some(indicator => 
      fs.existsSync(path.join(dirPath, indicator))
    );
  }

  // Determine the level of an Agent.md file
  private determineLevel(relativePath: string): 'project' | 'directory' | 'subdirectory' {
    if (!relativePath || relativePath === '.') {
      return 'project';
    }
    
    const depth = relativePath.split(path.sep).length;
    return depth === 1 ? 'directory' : 'subdirectory';
  }

  // Build combined project instructions from multiple Agent.md files
  private buildProjectInstructions(agentMdFiles: AgentMdContent[]): string {
    if (agentMdFiles.length === 0) {
      return '';
    }
    
    const sections: string[] = [];
    
    // Sort by hierarchy level (project first, then by file path)
    const sortedFiles = agentMdFiles.sort((a, b) => {
      const levelPriority = { 'project': 0, 'directory': 1, 'subdirectory': 2 };
      const aPriority = levelPriority[a.level];
      const bPriority = levelPriority[b.level];
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      return a.filePath.localeCompare(b.filePath);
    });
    
    for (const agentMd of sortedFiles) {
      const relativePath = path.relative(this.workingDirectory, path.dirname(agentMd.filePath));
      const sectionTitle = relativePath || 'Project Root';
      
      sections.push(`# ${sectionTitle} Instructions\n${agentMd.content}`);
    }
    
    return sections.join('\n\n---\n\n');
  }

  // Check if Agent.md files have been modified and reload if necessary
  refreshIfNeeded(): boolean {
    const now = Date.now();
    if (now - this.lastScanTime < this.scanInterval) {
      return false; // Too soon to rescan
    }
    
    this.lastScanTime = now;
    let hasChanges = false;
    
    // Check cached files for modifications
    for (const [filePath, cachedContent] of this.agentMdCache.entries()) {
      try {
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          if (stats.mtime > cachedContent.lastModified) {
            hasChanges = true;
            break;
          }
        } else {
          // File was deleted
          hasChanges = true;
          break;
        }
      } catch (error) {
        // Error accessing file
        hasChanges = true;
        break;
      }
    }
    
    if (hasChanges) {
      // Clear cache to force reload
      this.agentMdCache.clear();
      return true;
    }
    
    return false;
  }

  // Get current project instructions (cached)
  getCurrentProjectInstructions(): string {
    const hierarchy = this.loadHierarchicalAgentMd();
    return hierarchy.projectInstructions;
  }

  // Get working directory relative path for context
  getRelativeWorkingPath(filePath?: string): string {
    const targetPath = filePath || process.cwd();
    return path.relative(this.workingDirectory, targetPath);
  }

  // Generate a project context summary 
  generateProjectContext(includeFileStructure: boolean = false): string {
    const hierarchy = this.loadHierarchicalAgentMd();
    const parts: string[] = [];
    
    if (hierarchy.agentMdFiles.length > 0) {
      parts.push(`**Project Configuration Found**: ${hierarchy.agentMdFiles.length} Agent.md file(s)`);
      
      hierarchy.agentMdFiles.forEach(agentMd => {
        const relativePath = path.relative(this.workingDirectory, path.dirname(agentMd.filePath));
        const location = relativePath || 'project root';
        parts.push(`- ${location} (${agentMd.level})`);
      });
    }
    
    if (includeFileStructure) {
      parts.push('**Working Directory**: ' + this.workingDirectory);
    }
    
    return parts.length > 0 ? parts.join('\n') : 'No Agent.md files found in project hierarchy';
  }

  // Clear the cache (useful for testing or forced refresh)
  clearCache(): void {
    this.agentMdCache.clear();
    this.lastScanTime = 0;
  }
}

// Global agent memory manager
let globalAgentMemory: AgentMemoryManager | null = null;

export function getAgentMemory(workingDirectory?: string): AgentMemoryManager {
  const targetDir = workingDirectory || process.cwd();
  
  if (!globalAgentMemory || globalAgentMemory['workingDirectory'] !== targetDir) {
    globalAgentMemory = new AgentMemoryManager(targetDir);
  }
  
  return globalAgentMemory;
}