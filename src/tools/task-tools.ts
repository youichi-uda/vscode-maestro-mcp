import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';
import { z } from 'zod';

export function registerTaskTools(server: McpServer): void {
  server.tool(
    'list_tasks',
    'List all available VS Code tasks (from tasks.json, extensions, and auto-detected).',
    {
      filter: z.string().optional().describe('Filter tasks by name substring'),
    },
    async ({ filter }) => {
      const tasks = await vscode.tasks.fetchTasks();
      const filtered = filter
        ? tasks.filter(t => t.name.toLowerCase().includes(filter.toLowerCase()))
        : tasks;

      const result = filtered.map(t => ({
        name: t.name,
        source: t.source,
        group: t.group?.id,
        detail: t.detail,
        definition: t.definition,
      }));

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'run_task',
    'Run a VS Code task by name.',
    {
      name: z.string().describe('Task name to run'),
      source: z.string().optional().describe('Task source to disambiguate (e.g. "Workspace", "npm")'),
    },
    async ({ name, source }) => {
      const tasks = await vscode.tasks.fetchTasks();
      const task = tasks.find(t => {
        const nameMatch = t.name === name || t.name.toLowerCase().includes(name.toLowerCase());
        const sourceMatch = !source || t.source === source;
        return nameMatch && sourceMatch;
      });

      if (!task) {
        const available = tasks.map(t => `${t.name} (${t.source})`);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: `Task "${name}" not found.`,
            available,
          }, null, 2) }],
          isError: true,
        };
      }

      const execution = await vscode.tasks.executeTask(task);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          started: task.name,
          source: task.source,
        }) }],
      };
    },
  );
}
