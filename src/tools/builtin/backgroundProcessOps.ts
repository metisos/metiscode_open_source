import { RegisteredTool, ToolHandler, ExecutionContext, ToolResult } from "../registry";
import { getProcessManager } from "../../runtime/processManager";

const bashOutputHandler: ToolHandler = {
  async execute(
    params: {
      bash_id: string;
      filter?: string;
    },
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { bash_id, filter } = params;
    const processManager = getProcessManager();

    const process = processManager.getProcess(bash_id);

    if (!process) {
      return {
        success: false,
        error: `Process not found: ${bash_id}`
      };
    }

    const outputData = processManager.getOutput(bash_id, {
      filter,
      sinceLastCheck: true
    });

    if (!outputData) {
      return {
        success: false,
        error: `Failed to get output for process: ${bash_id}`
      };
    }

    const combinedOutput = [
      ...outputData.output,
      ...outputData.errorOutput
    ].join('\n');

    return {
      success: true,
      content: combinedOutput || 'No new output',
      metadata: {
        bash_id,
        status: process.status,
        pid: process.pid,
        exit_code: process.exitCode,
        output_lines: outputData.output.length,
        error_lines: outputData.errorOutput.length,
        new_output_only: outputData.newOutputOnly
      }
    };
  }
};

export const bashOutputTool: RegisteredTool = {
  name: "bash_output",
  description: "Retrieve output from a running or completed background bash process",
  schema: {
    type: "object",
    properties: {
      bash_id: {
        type: "string",
        description: "The ID of the background process"
      },
      filter: {
        type: "string",
        description: "Optional regex to filter output lines"
      }
    },
    required: ["bash_id"]
  },
  safety: {
    require_approval: false,
    network_access: false,
    max_execution_time: 5000,
    allowed_in_ci: true
  },
  handler: bashOutputHandler,
  metadata: {
    category: "system_operations",
    version: "1.0",
    author: "metis-team"
  }
};

const killShellHandler: ToolHandler = {
  async execute(
    params: {
      shell_id: string;
    },
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { shell_id } = params;
    const processManager = getProcessManager();

    const process = processManager.getProcess(shell_id);

    if (!process) {
      return {
        success: false,
        error: `Process not found: ${shell_id}`
      };
    }

    if (process.status !== 'running') {
      return {
        success: false,
        error: `Process is not running. Current status: ${process.status}`
      };
    }

    const killed = processManager.killProcess(shell_id);

    if (killed) {
      return {
        success: true,
        content: `Process ${shell_id} terminated`,
        metadata: {
          shell_id,
          previous_status: 'running',
          current_status: 'killed'
        }
      };
    }

    return {
      success: false,
      error: `Failed to kill process ${shell_id}`
    };
  }
};

export const killShellTool: RegisteredTool = {
  name: "kill_shell",
  description: "Kill a running background bash process",
  schema: {
    type: "object",
    properties: {
      shell_id: {
        type: "string",
        description: "The ID of the process to kill"
      }
    },
    required: ["shell_id"]
  },
  safety: {
    require_approval: false,
    network_access: false,
    max_execution_time: 5000,
    allowed_in_ci: true
  },
  handler: killShellHandler,
  metadata: {
    category: "system_operations",
    version: "1.0",
    author: "metis-team"
  }
};
