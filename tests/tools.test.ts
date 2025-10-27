import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ToolRegistry, ExecutionContext } from "../src/tools/registry";
import { readFileTool, writeFileTool, listFilesTool } from "../src/tools/builtin/fileOps";
import { gitStatusTool } from "../src/tools/builtin/gitOps";
import fs from "fs";
import path from "path";

describe("ToolRegistry", () => {
  let registry: ToolRegistry;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    registry = new ToolRegistry();
    mockContext = {
      sessionId: "test-session",
      workingDirectory: process.cwd(),
      config: { autoApprove: true },
      traceEnabled: false,
      verboseEnabled: false
    };
  });

  it("should register and list tools", () => {
    registry.register(readFileTool);
    registry.register(writeFileTool);
    
    const tools = registry.list();
    expect(tools).toContain("read_file");
    expect(tools).toContain("write_file");
    expect(tools).toHaveLength(2);
  });

  it("should execute read_file tool successfully", async () => {
    registry.register(readFileTool);
    
    // Create a test file
    const testFile = path.join(process.cwd(), "test-file.txt");
    fs.writeFileSync(testFile, "Hello, World!");
    
    try {
      const result = await registry.execute("read_file", { path: "test-file.txt" }, mockContext);
      
      expect(result.success).toBe(true);
      expect(result.content).toBe("Hello, World!");
      expect(result.metadata?.path).toBe("test-file.txt");
    } finally {
      // Clean up
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    }
  });

  it("should handle file not found errors gracefully", async () => {
    registry.register(readFileTool);
    
    const result = await registry.execute("read_file", { path: "nonexistent.txt" }, mockContext);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain("File not found");
  });

  it("should enforce safety restrictions", async () => {
    registry.register(readFileTool);
    
    const result = await registry.execute("read_file", { path: "../../etc/passwd" }, mockContext);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain("Path outside workspace");
  });

  it("should validate tool parameters", async () => {
    registry.register(readFileTool);
    
    const result = await registry.execute("read_file", {}, mockContext);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain("Missing required parameter: path");
  });
});

describe("File Operations Tools", () => {
  let mockContext: ExecutionContext;
  const testDir = path.join(process.cwd(), "test-tools");

  beforeEach(() => {
    mockContext = {
      sessionId: "test-session",
      workingDirectory: process.cwd(),
      config: { autoApprove: true },
      traceEnabled: false,
      verboseEnabled: false
    };

    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir);
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should create files with write_file tool", async () => {
    const filePath = path.join("test-tools", "new-file.ts");
    const content = "export const hello = 'world';";
    
    const result = await writeFileTool.handler.execute(
      { path: filePath, content },
      mockContext
    );
    
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), filePath))).toBe(true);
    expect(fs.readFileSync(path.join(process.cwd(), filePath), "utf8")).toBe(content);
  });

  it("should list files in directory", async () => {
    // Create test files
    fs.writeFileSync(path.join(testDir, "file1.ts"), "content1");
    fs.writeFileSync(path.join(testDir, "file2.js"), "content2");
    fs.writeFileSync(path.join(testDir, "file3.md"), "content3");
    
    const result = await listFilesTool.handler.execute(
      { path: "test-tools" },
      mockContext
    );
    
    expect(result.success).toBe(true);
    expect(result.content).toContain("file1.ts");
    expect(result.content).toContain("file2.js");
    expect(result.content).toContain("file3.md");
  });

  it("should filter files by pattern", async () => {
    // Create test files
    fs.writeFileSync(path.join(testDir, "component.tsx"), "react");
    fs.writeFileSync(path.join(testDir, "utils.ts"), "typescript");
    fs.writeFileSync(path.join(testDir, "readme.md"), "docs");
    
    const result = await listFilesTool.handler.execute(
      { path: "test-tools", pattern: ".ts" },
      mockContext
    );
    
    expect(result.success).toBe(true);
    const files = result.content as string[];
    expect(files.some(f => f.includes("component.tsx"))).toBe(true);
    expect(files.some(f => f.includes("utils.ts"))).toBe(true);
    expect(files.some(f => f.includes("readme.md"))).toBe(false);
  });
});