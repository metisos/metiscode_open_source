import fs from "fs";
import path from "path";
import { RegisteredTool, ToolHandler, ExecutionContext, ToolResult } from "../registry";
import { withinCwdSafe } from "../files";

// Multi-Edit Tool - like Claude Code's MultiEdit
interface EditOperation {
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

const multiEditHandler: ToolHandler = {
  async execute(
    params: {
      file_path: string;
      edits: EditOperation[];
    },
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { file_path, edits } = params;

    if (!withinCwdSafe(file_path, context.workingDirectory)) {
      return {
        success: false,
        error: `Path outside workspace: ${file_path}`
      };
    }

    const fullPath = path.resolve(context.workingDirectory, file_path);

    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        error: `File not found: ${file_path}`
      };
    }

    try {
      let content = fs.readFileSync(fullPath, 'utf8');
      let totalChanges = 0;
      const appliedEdits: string[] = [];

      // Apply edits sequentially
      for (let i = 0; i < edits.length; i++) {
        const edit = edits[i];
        const { old_string, new_string, replace_all = false } = edit;

        if (old_string === new_string) {
          return {
            success: false,
            error: `Edit ${i + 1}: old_string and new_string cannot be the same`
          };
        }

        const beforeContent = content;

        if (replace_all) {
          // Replace all occurrences
          const regex = new RegExp(old_string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          content = content.replace(regex, new_string);
          const matches = beforeContent.match(regex);
          const changes = matches ? matches.length : 0;
          totalChanges += changes;

          if (changes > 0) {
            appliedEdits.push(`Edit ${i + 1}: Replaced ${changes} occurrence(s)`);
          }
        } else {
          // Replace first occurrence only
          if (content.includes(old_string)) {
            content = content.replace(old_string, new_string);
            totalChanges++;
            appliedEdits.push(`Edit ${i + 1}: Applied successfully`);
          } else {
            return {
              success: false,
              error: `Edit ${i + 1}: old_string not found in file: "${old_string.substring(0, 100)}${old_string.length > 100 ? '...' : ''}"`
            };
          }
        }
      }

      // Only write if changes were made
      if (totalChanges > 0) {
        fs.writeFileSync(fullPath, content, 'utf8');
      }

      return {
        success: true,
        content: `Applied ${totalChanges} changes across ${edits.length} edit operations`,
        metadata: {
          path: file_path,
          editsApplied: edits.length,
          totalChanges,
          appliedEdits
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Multi-edit failed: ${error.message}`
      };
    }
  }
};

export const multiEditTool: RegisteredTool = {
  name: "multi_edit",
  description: "Apply multiple edits to a single file in one operation",
  schema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "Path to the file to edit"
      },
      edits: {
        type: "array",
        description: "Array of edit operations to apply sequentially",
        items: {
          type: "object",
          properties: {
            old_string: {
              type: "string",
              description: "Text to find and replace"
            },
            new_string: {
              type: "string",
              description: "Replacement text"
            },
            replace_all: {
              type: "boolean",
              description: "Replace all occurrences (default: false)",
              default: false
            }
          },
          required: ["old_string", "new_string"]
        },
        minItems: 1
      }
    },
    required: ["file_path", "edits"]
  },
  safety: {
    require_approval: true,
    path_restrictions: ["!node_modules", "!.git", "!dist"],
    network_access: false,
    max_execution_time: 10000,
    allowed_in_ci: false
  },
  handler: multiEditHandler,
  metadata: {
    category: "file_operations",
    version: "1.0",
    author: "metis-team"
  }
};