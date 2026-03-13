import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { log } from './utils/logger';
import { isLicenseValid } from './license';

interface RegisteredTool {
  enabled: boolean;
  enable(): void;
  disable(): void;
}

interface CategoryEntry {
  description: string;
  toolNames: string[];
  enabled: boolean;
  premium: boolean;
}

/**
 * Manages MCP tools organized by category with enable/disable support.
 * Uses the SDK's built-in tool.enabled filtering in tools/list.
 */
export class ToolRegistry {
  private categories = new Map<string, CategoryEntry>();
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private mcpServer: McpServer) {}

  /**
   * Register a category of tools. The registerFn calls server.tool() as usual.
   * Tools added by registerFn are detected and grouped under this category.
   */
  registerCategory(
    name: string,
    description: string,
    defaultEnabled: boolean,
    registerFn: (server: McpServer) => void,
    premium = false,
  ): void {
    const toolsBefore = new Set(this.getToolNames());
    registerFn(this.mcpServer);
    const toolsAfter = this.getToolNames();

    const newTools = toolsAfter.filter(t => !toolsBefore.has(t));

    this.categories.set(name, {
      description,
      toolNames: newTools,
      enabled: defaultEnabled,
      premium,
    });

    if (!defaultEnabled) {
      for (const toolName of newTools) {
        this.getRegisteredTool(toolName)?.disable();
      }
    }

    log(`[ToolRegistry] Category "${name}": ${newTools.length} tools (${defaultEnabled ? 'enabled' : 'disabled'}${premium ? ', premium' : ''})`);
  }

  /**
   * Register the meta-tool for managing categories.
   * This tool is always available.
   */
  registerMetaTool(): void {
    const self = this;

    this.mcpServer.tool(
      'manage_tool_categories',
      'List, enable, or disable tool categories. Call with no action to see available categories and their status.',
      {
        action: z.enum(['list', 'enable', 'disable']).default('list').describe('Action to perform'),
        category: z.string().optional().describe('Category name (required for enable/disable)'),
      },
      async ({ action, category }) => {
        if (action === 'list') {
          const cats = Array.from(self.categories.entries()).map(([name, entry]) => ({
            name,
            description: entry.description,
            enabled: entry.enabled,
            premium: entry.premium,
            toolCount: entry.toolNames.length,
            tools: entry.toolNames,
          }));

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(cats, null, 2) }],
          };
        }

        if (!category) {
          return {
            content: [{ type: 'text' as const, text: 'Category name is required for enable/disable.' }],
            isError: true,
          };
        }

        const entry = self.categories.get(category);
        if (!entry) {
          const available = Array.from(self.categories.keys());
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              error: `Category "${category}" not found.`,
              available,
            }) }],
            isError: true,
          };
        }

        // Premium gate
        if (action === 'enable' && entry.premium) {
          const licensed = await isLicenseValid();
          if (!licensed) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                error: `Category "${category}" requires a premium license.`,
                hint: 'Run "Maestro MCP: Enter License Key" command in VS Code, or purchase at https://abyo-software.gumroad.com/l/maestro-mcp',
              }, null, 2) }],
              isError: true,
            };
          }
        }

        const enabling = action === 'enable';
        entry.enabled = enabling;

        for (const toolName of entry.toolNames) {
          const tool = self.getRegisteredTool(toolName);
          if (tool) {
            enabling ? tool.enable() : tool.disable();
          }
        }

        self.notifyToolListChanged();

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            category,
            enabled: enabling,
            tools: entry.toolNames,
          }, null, 2) }],
        };
      },
    );
  }

  private getToolNames(): string[] {
    const tools = (this.mcpServer as any)._registeredTools;
    return Object.keys(tools ?? {});
  }

  private getRegisteredTool(name: string): RegisteredTool | undefined {
    const tools = (this.mcpServer as any)._registeredTools;
    return tools?.[name];
  }

  private notifyToolListChanged(): void {
    // Debounce: batch rapid enable/disable calls into a single notification
    if (this.notifyTimer) {
      clearTimeout(this.notifyTimer);
    }
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      try {
        const mcpAny = this.mcpServer as any;
        if (typeof mcpAny.sendToolListChanged === 'function') {
          log('[ToolRegistry] Sending debounced sendToolListChanged()');
          mcpAny.sendToolListChanged();
        } else if (mcpAny.server && typeof mcpAny.server.sendToolListChanged === 'function') {
          log('[ToolRegistry] Sending debounced server.sendToolListChanged()');
          mcpAny.server.sendToolListChanged();
        } else {
          log('[ToolRegistry] WARNING: No sendToolListChanged method found');
        }
      } catch (err) {
        log(`[ToolRegistry] sendToolListChanged error: ${err}`);
      }
    }, 500);
  }
}
