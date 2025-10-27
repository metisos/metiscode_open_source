import fs from "fs";
import path from "path";
import { RegisteredTool, ToolHandler, ExecutionContext, ToolResult } from "../registry";
import { withinCwdSafe } from "../files";

// Notebook Edit Tool - like Claude Code's NotebookEdit
interface NotebookCell {
  cell_type: 'code' | 'markdown';
  source: string[];
  metadata?: any;
  outputs?: any[];
  execution_count?: number | null;
}

interface NotebookData {
  cells: NotebookCell[];
  metadata: any;
  nbformat: number;
  nbformat_minor: number;
}

const notebookEditHandler: ToolHandler = {
  async execute(
    params: {
      notebook_path: string;
      new_source: string;
      cell_id?: string;
      cell_type?: 'code' | 'markdown';
      edit_mode?: 'replace' | 'insert' | 'delete';
    },
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { notebook_path, new_source, cell_id, cell_type = 'code', edit_mode = 'replace' } = params;

    if (!withinCwdSafe(notebook_path, context.workingDirectory)) {
      return {
        success: false,
        error: `Path outside workspace: ${notebook_path}`
      };
    }

    const fullPath = path.resolve(context.workingDirectory, notebook_path);

    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        error: `Notebook not found: ${notebook_path}`
      };
    }

    if (!notebook_path.endsWith('.ipynb')) {
      return {
        success: false,
        error: `File must be a Jupyter notebook (.ipynb): ${notebook_path}`
      };
    }

    try {
      const notebookContent = fs.readFileSync(fullPath, 'utf8');
      const notebook: NotebookData = JSON.parse(notebookContent);

      if (!notebook.cells || !Array.isArray(notebook.cells)) {
        return {
          success: false,
          error: `Invalid notebook format: ${notebook_path}`
        };
      }

      let targetCellIndex = -1;
      let operation = '';

      // Find target cell by ID or use last cell
      if (cell_id) {
        targetCellIndex = notebook.cells.findIndex((cell: any) =>
          cell.id === cell_id || cell.metadata?.id === cell_id
        );
        if (targetCellIndex === -1) {
          return {
            success: false,
            error: `Cell with ID ${cell_id} not found`
          };
        }
      }

      switch (edit_mode) {
        case 'insert':
          // Insert new cell
          const newCell: NotebookCell = {
            cell_type,
            source: new_source.split('\n'),
            metadata: { id: `cell-${Date.now()}` }
          };

          if (cell_type === 'code') {
            newCell.execution_count = null;
            newCell.outputs = [];
          }

          if (cell_id && targetCellIndex >= 0) {
            notebook.cells.splice(targetCellIndex + 1, 0, newCell);
            operation = `Inserted new ${cell_type} cell after cell ${targetCellIndex + 1}`;
          } else {
            notebook.cells.push(newCell);
            operation = `Inserted new ${cell_type} cell at end`;
          }
          break;

        case 'delete':
          if (targetCellIndex >= 0) {
            const deletedCell = notebook.cells.splice(targetCellIndex, 1)[0];
            operation = `Deleted ${deletedCell.cell_type} cell at index ${targetCellIndex}`;
          } else {
            return {
              success: false,
              error: `Cannot delete: cell not found`
            };
          }
          break;

        case 'replace':
        default:
          if (targetCellIndex >= 0) {
            // Replace existing cell
            notebook.cells[targetCellIndex].source = new_source.split('\n');
            notebook.cells[targetCellIndex].cell_type = cell_type;

            // Clear outputs for code cells when editing
            if (cell_type === 'code') {
              notebook.cells[targetCellIndex].outputs = [];
              notebook.cells[targetCellIndex].execution_count = null;
            }

            operation = `Updated ${cell_type} cell at index ${targetCellIndex}`;
          } else {
            // Create new cell if none specified
            const newCell: NotebookCell = {
              cell_type,
              source: new_source.split('\n'),
              metadata: { id: `cell-${Date.now()}` }
            };

            if (cell_type === 'code') {
              newCell.execution_count = null;
              newCell.outputs = [];
            }

            notebook.cells.push(newCell);
            operation = `Added new ${cell_type} cell`;
          }
          break;
      }

      // Write updated notebook
      const updatedContent = JSON.stringify(notebook, null, 2);
      fs.writeFileSync(fullPath, updatedContent, 'utf8');

      return {
        success: true,
        content: operation,
        metadata: {
          notebook_path,
          operation: edit_mode,
          cell_type,
          cell_count: notebook.cells.length,
          target_cell: targetCellIndex >= 0 ? targetCellIndex : notebook.cells.length - 1
        }
      };

    } catch (error: any) {
      return {
        success: false,
        error: `Failed to edit notebook: ${error.message}`
      };
    }
  }
};

export const notebookEditTool: RegisteredTool = {
  name: "notebook_edit",
  description: "Edit Jupyter notebook cells with support for code and markdown",
  schema: {
    type: "object",
    properties: {
      notebook_path: {
        type: "string",
        description: "Path to the Jupyter notebook (.ipynb file)"
      },
      new_source: {
        type: "string",
        description: "New source code or markdown content for the cell"
      },
      cell_id: {
        type: "string",
        description: "ID of the cell to edit (optional, creates new cell if not specified)"
      },
      cell_type: {
        type: "string",
        enum: ["code", "markdown"],
        description: "Type of cell (code or markdown)",
        default: "code"
      },
      edit_mode: {
        type: "string",
        enum: ["replace", "insert", "delete"],
        description: "Edit operation type",
        default: "replace"
      }
    },
    required: ["notebook_path", "new_source"]
  },
  safety: {
    require_approval: true,
    path_restrictions: ["!node_modules", "!.git", "!dist"],
    network_access: false,
    max_execution_time: 10000,
    allowed_in_ci: false
  },
  handler: notebookEditHandler,
  metadata: {
    category: "file_operations",
    version: "1.0",
    author: "metis-team"
  }
};