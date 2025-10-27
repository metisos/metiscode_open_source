import { RegisteredTool, ToolHandler, ExecutionContext, ToolResult } from "../registry";

// Todo item interface
interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm: string;
  created: string;
  updated?: string;
  category?: string;
  priority?: "low" | "medium" | "high";
}

// In-memory session-based todos storage
const sessionTodos: Map<string, TodoItem[]> = new Map();

// Get todos for current session
function getSessionTodos(sessionId: string): TodoItem[] {
  if (!sessionTodos.has(sessionId)) {
    sessionTodos.set(sessionId, []);
  }
  return sessionTodos.get(sessionId)!;
}

// Save todos for current session
function setSessionTodos(sessionId: string, todos: TodoItem[]): void {
  sessionTodos.set(sessionId, todos);
}

// Generate unique ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Create Todo Tool
const createTodoHandler: ToolHandler = {
  async execute(
    params: {
      content: string;
      activeForm: string;
      category?: string;
      priority?: "low" | "medium" | "high";
    },
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { content, activeForm, category, priority = "medium" } = params;
    
    if (!content || content.trim().length === 0) {
      return {
        success: false,
        error: "Todo content cannot be empty"
      };
    }

    if (!activeForm || activeForm.trim().length === 0) {
      return {
        success: false,
        error: "Todo activeForm cannot be empty"
      };
    }

    try {
      const todos = getSessionTodos(context.sessionId);
      
      const newTodo: TodoItem = {
        id: generateId(),
        content: content.trim(),
        activeForm: activeForm.trim(),
        status: "pending",
        created: new Date().toISOString(),
        category,
        priority
      };

      todos.push(newTodo);
      setSessionTodos(context.sessionId, todos);

      return {
        success: true,
        content: `📋 Added to todo list: "${content}"`,
        metadata: {
          todo_id: newTodo.id,
          total_todos: todos.length
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to create todo: ${error.message}`
      };
    }
  }
};

// Update Todo Status Tool
const updateTodoHandler: ToolHandler = {
  async execute(
    params: {
      id?: string;
      content?: string;
      status?: "pending" | "in_progress" | "completed";
      category?: string;
      priority?: "low" | "medium" | "high";
    },
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { id, content, status, category, priority } = params;
    
    if (!id && !content) {
      return {
        success: false,
        error: "Must provide either todo ID or content to match"
      };
    }

    try {
      const todos = getSessionTodos(context.sessionId);
      
      // Find todo by ID or content
      let todoIndex = -1;
      if (id) {
        todoIndex = todos.findIndex(todo => todo.id === id);
      } else if (content) {
        todoIndex = todos.findIndex(todo => 
          todo.content.toLowerCase().includes(content.toLowerCase())
        );
      }

      if (todoIndex === -1) {
        return {
          success: false,
          error: id ? `Todo with ID "${id}" not found` : `Todo containing "${content}" not found`
        };
      }

      const todo = todos[todoIndex];
      const originalStatus = todo.status;
      
      // Update todo properties
      if (status) todo.status = status;
      if (category !== undefined) todo.category = category;
      if (priority) todo.priority = priority;
      todo.updated = new Date().toISOString();

      setSessionTodos(context.sessionId, todos);

      const statusEmoji = status === "completed" ? "✅" : status === "in_progress" ? "🔄" : "📋";
      const statusChange = status && status !== originalStatus ? ` (${originalStatus} → ${status})` : "";
      
      return {
        success: true,
        content: `${statusEmoji} Updated todo: "${todo.content}"${statusChange}`,
        metadata: {
          todo_id: todo.id,
          old_status: originalStatus,
          new_status: todo.status
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to update todo: ${error.message}`
      };
    }
  }
};

// List Todos Tool
const listTodosHandler: ToolHandler = {
  async execute(
    params: {
      status?: "pending" | "in_progress" | "completed" | "all";
      category?: string;
      limit?: number;
    },
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { status = "all", category, limit } = params;

    try {
      const todos = getSessionTodos(context.sessionId);
      
      let filteredTodos = todos;
      
      // Filter by status
      if (status !== "all") {
        filteredTodos = filteredTodos.filter(todo => todo.status === status);
      }
      
      // Filter by category
      if (category) {
        filteredTodos = filteredTodos.filter(todo => 
          todo.category?.toLowerCase().includes(category.toLowerCase())
        );
      }
      
      // Apply limit
      if (limit && limit > 0) {
        filteredTodos = filteredTodos.slice(0, limit);
      }

      if (filteredTodos.length === 0) {
        const filterDesc = status !== "all" ? ` with status "${status}"` : "";
        const categoryDesc = category ? ` in category "${category}"` : "";
        return {
          success: true,
          content: `No todos found${filterDesc}${categoryDesc}`,
          metadata: {
            total_todos: todos.length,
            filtered_count: 0
          }
        };
      }

      // Format todo list in Claude Code style
      const todoLines = filteredTodos.map((todo, index) => {
        const statusIcon = todo.status === "completed" ? "[completed]" : 
                          todo.status === "in_progress" ? "[in_progress]" : 
                          "[pending]";
        const activeText = todo.status === "in_progress" ? todo.activeForm : todo.content;
        
        return `${index + 1}. ${statusIcon} ${activeText}`;
      });

      const summary = todoLines.join('\n');
      
      // Add summary stats
      const stats = {
        pending: todos.filter(t => t.status === "pending").length,
        in_progress: todos.filter(t => t.status === "in_progress").length,
        completed: todos.filter(t => t.status === "completed").length
      };
      
      return {
        success: true,
        content: summary,
        metadata: {
          total_todos: todos.length,
          filtered_count: filteredTodos.length,
          stats
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to list todos: ${error.message}`
      };
    }
  }
};

// Delete Todo Tool
const deleteTodoHandler: ToolHandler = {
  async execute(
    params: {
      id?: string;
      content?: string;
    },
    context: ExecutionContext
  ): Promise<ToolResult> {
    const { id, content } = params;
    
    if (!id && !content) {
      return {
        success: false,
        error: "Must provide either todo ID or content to match"
      };
    }

    try {
      const todos = getSessionTodos(context.sessionId);
      
      // Find todo by ID or content
      let todoIndex = -1;
      if (id) {
        todoIndex = todos.findIndex(todo => todo.id === id);
      } else if (content) {
        todoIndex = todos.findIndex(todo => 
          todo.content.toLowerCase().includes(content.toLowerCase())
        );
      }

      if (todoIndex === -1) {
        return {
          success: false,
          error: id ? `Todo with ID "${id}" not found` : `Todo containing "${content}" not found`
        };
      }

      const deletedTodo = todos.splice(todoIndex, 1)[0];
      setSessionTodos(context.sessionId, todos);

      return {
        success: true,
        content: `🗑️ Deleted todo: "${deletedTodo.content}"`,
        metadata: {
          deleted_todo_id: deletedTodo.id,
          remaining_todos: todos.length
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to delete todo: ${error.message}`
      };
    }
  }
};

// Clear Completed Todos Tool
const clearCompletedHandler: ToolHandler = {
  async execute(
    params: {},
    context: ExecutionContext
  ): Promise<ToolResult> {
    try {
      const todos = getSessionTodos(context.sessionId);
      
      const completedTodos = todos.filter(todo => todo.status === "completed");
      const remainingTodos = todos.filter(todo => todo.status !== "completed");
      
      setSessionTodos(context.sessionId, remainingTodos);

      return {
        success: true,
        content: `🧹 Cleared ${completedTodos.length} completed todos`,
        metadata: {
          cleared_count: completedTodos.length,
          remaining_todos: remainingTodos.length
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to clear completed todos: ${error.message}`
      };
    }
  }
};

export const createTodoTool: RegisteredTool = {
  name: "create_todo",
  description: "Create a new todo item to track tasks and progress during the session",
  schema: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "The todo item content/description (imperative form, e.g. 'Implement user login')"
      },
      activeForm: {
        type: "string", 
        description: "The present continuous form shown during execution (e.g. 'Implementing user login')"
      },
      category: {
        type: "string",
        description: "Optional category to organize the todo"
      },
      priority: {
        type: "string",
        enum: ["low", "medium", "high"],
        description: "Priority level of the todo item",
        default: "medium"
      }
    },
    required: ["content", "activeForm"]
  },
  safety: {
    require_approval: false,
    path_restrictions: [],
    network_access: false,
    max_execution_time: 5000,
    allowed_in_ci: true
  },
  handler: createTodoHandler,
  metadata: {
    category: "productivity",
    version: "1.0",
    author: "metis-team"
  }
};

export const updateTodoTool: RegisteredTool = {
  name: "update_todo",
  description: "Update a todo item's status, priority, or other properties",
  schema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "Todo ID to update"
      },
      content: {
        type: "string",
        description: "Search for todo by content (alternative to ID)"
      },
      status: {
        type: "string",
        enum: ["pending", "in_progress", "completed"],
        description: "Update the todo status"
      },
      category: {
        type: "string",
        description: "Update the todo category"
      },
      priority: {
        type: "string",
        enum: ["low", "medium", "high"],
        description: "Update the todo priority"
      }
    }
  },
  safety: {
    require_approval: false,
    path_restrictions: [],
    network_access: false,
    max_execution_time: 5000,
    allowed_in_ci: true
  },
  handler: updateTodoHandler,
  metadata: {
    category: "productivity",
    version: "1.0",
    author: "metis-team"
  }
};

export const listTodosTool: RegisteredTool = {
  name: "list_todos",
  description: "List and display current todo items with filtering options",
  schema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["pending", "in_progress", "completed", "all"],
        description: "Filter todos by status",
        default: "all"
      },
      category: {
        type: "string",
        description: "Filter todos by category"
      },
      limit: {
        type: "number",
        description: "Limit number of todos to display"
      }
    }
  },
  safety: {
    require_approval: false,
    path_restrictions: [],
    network_access: false,
    max_execution_time: 5000,
    allowed_in_ci: true
  },
  handler: listTodosHandler,
  metadata: {
    category: "productivity",
    version: "1.0",
    author: "metis-team"
  }
};

export const deleteTodoTool: RegisteredTool = {
  name: "delete_todo",
  description: "Delete a specific todo item",
  schema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "Todo ID to delete"
      },
      content: {
        type: "string",
        description: "Search for todo by content (alternative to ID)"
      }
    }
  },
  safety: {
    require_approval: false,
    path_restrictions: [],
    network_access: false,
    max_execution_time: 5000,
    allowed_in_ci: true
  },
  handler: deleteTodoHandler,
  metadata: {
    category: "productivity",
    version: "1.0",
    author: "metis-team"
  }
};

export const clearCompletedTool: RegisteredTool = {
  name: "clear_completed_todos",
  description: "Remove all completed todo items from the list",
  schema: {
    type: "object",
    properties: {}
  },
  safety: {
    require_approval: false,
    path_restrictions: [],
    network_access: false,
    max_execution_time: 5000,
    allowed_in_ci: true
  },
  handler: clearCompletedHandler,
  metadata: {
    category: "productivity",
    version: "1.0",
    author: "metis-team"
  }
};