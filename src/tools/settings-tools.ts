import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';
import { z } from 'zod';

export function registerSettingsTools(server: McpServer): void {
  server.tool(
    'get_setting',
    'Read a VS Code setting value.',
    {
      key: z.string().describe('Setting key (e.g. "editor.fontSize", "python.defaultInterpreterPath")'),
      scope: z.enum(['default', 'global', 'workspace', 'workspaceFolder']).default('workspace').describe('Configuration scope'),
    },
    async ({ key, scope }) => {
      // Split key into section and property
      const lastDot = key.lastIndexOf('.');
      const section = lastDot > 0 ? key.substring(0, lastDot) : key;
      const property = lastDot > 0 ? key.substring(lastDot + 1) : undefined;

      const config = vscode.workspace.getConfiguration(section);
      const value = property ? config.get(property) : config;

      const inspect = property ? config.inspect(property) : undefined;
      const scopeValue = inspect ? {
        defaultValue: inspect.defaultValue,
        globalValue: inspect.globalValue,
        workspaceValue: inspect.workspaceValue,
        workspaceFolderValue: inspect.workspaceFolderValue,
      } : undefined;

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          key,
          value,
          ...(scopeValue ? { scopes: scopeValue } : {}),
        }, null, 2) }],
      };
    },
  );

  server.tool(
    'update_setting',
    'Update a VS Code setting.',
    {
      key: z.string().describe('Setting key (e.g. "editor.fontSize")'),
      value: z.any().describe('New value'),
      scope: z.enum(['global', 'workspace', 'workspaceFolder']).default('workspace').describe('Where to save the setting'),
    },
    async ({ key, value, scope }) => {
      const lastDot = key.lastIndexOf('.');
      const section = lastDot > 0 ? key.substring(0, lastDot) : key;
      const property = lastDot > 0 ? key.substring(lastDot + 1) : undefined;

      if (!property) {
        return {
          content: [{ type: 'text' as const, text: 'Setting key must include section and property (e.g. "editor.fontSize")' }],
          isError: true,
        };
      }

      const config = vscode.workspace.getConfiguration(section);
      const target = scope === 'global'
        ? vscode.ConfigurationTarget.Global
        : scope === 'workspaceFolder'
          ? vscode.ConfigurationTarget.WorkspaceFolder
          : vscode.ConfigurationTarget.Workspace;

      await config.update(property, value, target);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          updated: key,
          value,
          scope,
        }) }],
      };
    },
  );

  server.tool(
    'list_extensions',
    'List installed VS Code extensions.',
    {
      filter: z.string().optional().describe('Filter by name or ID substring'),
      includeBuiltin: z.boolean().default(false).describe('Include built-in extensions'),
    },
    async ({ filter, includeBuiltin }) => {
      let extensions = vscode.extensions.all;

      if (!includeBuiltin) {
        extensions = extensions.filter(e => !e.id.startsWith('vscode.'));
      }

      if (filter) {
        const lowerFilter = filter.toLowerCase();
        extensions = extensions.filter(e =>
          e.id.toLowerCase().includes(lowerFilter) ||
          (e.packageJSON.displayName ?? '').toLowerCase().includes(lowerFilter),
        );
      }

      const result = extensions.map(e => ({
        id: e.id,
        name: e.packageJSON.displayName ?? e.id,
        version: e.packageJSON.version,
        isActive: e.isActive,
      })).sort((a, b) => a.name.localeCompare(b.name));

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'get_extension_info',
    'Get detailed information about a specific installed extension.',
    {
      extensionId: z.string().describe('Extension ID (e.g. "ms-python.python")'),
    },
    async ({ extensionId }) => {
      const ext = vscode.extensions.getExtension(extensionId);
      if (!ext) {
        return {
          content: [{ type: 'text' as const, text: `Extension "${extensionId}" not found.` }],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          id: ext.id,
          name: ext.packageJSON.displayName,
          version: ext.packageJSON.version,
          description: ext.packageJSON.description,
          isActive: ext.isActive,
          extensionPath: ext.extensionPath,
          contributes: ext.packageJSON.contributes ? Object.keys(ext.packageJSON.contributes) : [],
        }, null, 2) }],
      };
    },
  );

  server.tool(
    'get_keybindings',
    'Get keybinding for a specific command.',
    {
      command: z.string().describe('Command ID to look up keybinding for'),
    },
    async ({ command }) => {
      const bindings = await vscode.commands.executeCommand<Array<{
        key: string;
        command: string;
        when?: string;
      }>>('workbench.action.inspectKeyMappings');

      // Fall back to showing the keybindings UI if API not available
      if (!bindings) {
        await vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', command);
        return {
          content: [{ type: 'text' as const, text: 'Opened keybindings editor with search.' }],
        };
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(bindings, null, 2) }],
      };
    },
  );
}
