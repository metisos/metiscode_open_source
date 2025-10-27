import { ToolDefinition } from "../types/persona";
import { FunctionDefinition } from "../providers/types";

export class SchemaConverter {
  /**
   * Convert our internal tool definition to OpenAI function definition
   */
  static toOpenAIFunction(tool: ToolDefinition): FunctionDefinition {
    return {
      name: tool.name,
      description: tool.description,
      parameters: this.ensureValidSchema(tool.schema)
    };
  }

  /**
   * Convert our internal tool definition to Anthropic tool definition
   */
  static toAnthropicTool(tool: ToolDefinition) {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: this.ensureValidSchema(tool.schema)
    };
  }

  /**
   * Ensure schema is valid JSON Schema
   */
  private static ensureValidSchema(schema: any): any {
    if (!schema || typeof schema !== 'object') {
      return {
        type: "object",
        properties: {},
        additionalProperties: false
      };
    }

    // Ensure we have basic JSON Schema structure
    // IMPORTANT: Set defaults AFTER spreading to prevent override
    const result = {
      ...schema,
      type: schema.type || "object", // Ensure type is always set
      properties: schema.properties || {},
      required: schema.required || []
    };

    // Only set additionalProperties if not explicitly defined
    if (result.additionalProperties === undefined) {
      result.additionalProperties = false;
    }

    // Validate and clean up properties
    if (result.properties && typeof result.properties === 'object') {
      for (const [key, prop] of Object.entries(result.properties)) {
        if (typeof prop === 'object' && prop !== null) {
          // Ensure each property has a type
          if (!(prop as any).type) {
            (result.properties as any)[key] = {
              ...prop,
              type: "string" // Default to string if no type specified
            };
          }
        }
      }
    }

    return result;
  }

  /**
   * Validate that a tool schema is compatible with function calling
   */
  static validateToolSchema(tool: ToolDefinition): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!tool.name || typeof tool.name !== 'string') {
      errors.push("Tool name is required and must be a string");
    }

    if (!tool.description || typeof tool.description !== 'string') {
      errors.push("Tool description is required and must be a string");
    }

    // Tool name should follow function naming conventions
    if (tool.name && !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(tool.name)) {
      errors.push("Tool name must start with a letter and contain only letters, numbers, and underscores");
    }

    // Validate schema if provided
    if (tool.schema) {
      try {
        const schema = this.ensureValidSchema(tool.schema);
        
        if (schema.type !== 'object') {
          errors.push("Root schema type must be 'object'");
        }

        // Check for unsupported features
        if (schema.oneOf || schema.anyOf || schema.allOf) {
          errors.push("Schema composition (oneOf, anyOf, allOf) is not supported in function calling");
        }

        // Validate property types
        if (schema.properties) {
          for (const [propName, propSchema] of Object.entries(schema.properties)) {
            const prop = propSchema as any;
            if (prop.type && !['string', 'number', 'integer', 'boolean', 'array', 'object'].includes(prop.type)) {
              errors.push(`Property '${propName}' has unsupported type: ${prop.type}`);
            }
          }
        }
      } catch (error: any) {
        errors.push(`Schema validation error: ${error.message}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Convert simple parameter definitions to JSON Schema
   */
  static parametersToSchema(params: Record<string, any>): any {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [name, def] of Object.entries(params)) {
      if (typeof def === 'string') {
        // Simple type definition
        properties[name] = { type: def };
      } else if (typeof def === 'object' && def !== null) {
        // Full property definition
        properties[name] = def;
        if (def.required === true) {
          required.push(name);
        }
      }
    }

    return {
      type: "object",
      properties,
      required,
      additionalProperties: false
    };
  }

  /**
   * Generate example parameters for a tool (useful for testing)
   */
  static generateExampleParams(tool: ToolDefinition): Record<string, any> {
    const schema = this.ensureValidSchema(tool.schema);
    const params: Record<string, any> = {};

    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const prop = propSchema as any;
        params[propName] = this.generateExampleValue(prop);
      }
    }

    return params;
  }

  private static generateExampleValue(schema: any): any {
    switch (schema.type) {
      case 'string':
        return schema.default || schema.example || "example_string";
      case 'number':
        return schema.default || schema.example || 42;
      case 'integer':
        return schema.default || schema.example || 1;
      case 'boolean':
        return schema.default !== undefined ? schema.default : true;
      case 'array':
        return schema.default || [];
      case 'object':
        return schema.default || {};
      default:
        return null;
    }
  }
}