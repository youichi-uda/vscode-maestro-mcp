import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';
import { z } from 'zod';

export function registerNotificationTools(server: McpServer): void {
  server.tool(
    'show_message',
    'Show a notification message to the user with optional action buttons.',
    {
      message: z.string().describe('Message text'),
      level: z.enum(['info', 'warning', 'error']).default('info').describe('Message severity'),
      actions: z.array(z.string()).default([]).describe('Button labels. Returns which button was clicked.'),
    },
    async ({ message, level, actions }) => {
      let result: string | undefined;
      switch (level) {
        case 'info':
          result = await vscode.window.showInformationMessage(message, ...actions);
          break;
        case 'warning':
          result = await vscode.window.showWarningMessage(message, ...actions);
          break;
        case 'error':
          result = await vscode.window.showErrorMessage(message, ...actions);
          break;
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          clicked: result ?? null,
        }) }],
      };
    },
  );

  server.tool(
    'show_input_box',
    'Show an input box to prompt the user for text input.',
    {
      prompt: z.string().describe('Prompt text'),
      placeholder: z.string().optional().describe('Placeholder text'),
      value: z.string().optional().describe('Default value'),
      password: z.boolean().default(false).describe('Mask input as password'),
    },
    async ({ prompt, placeholder, value, password }) => {
      const result = await vscode.window.showInputBox({
        prompt,
        placeHolder: placeholder,
        value,
        password,
      });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          value: result ?? null,
          cancelled: result === undefined,
        }) }],
      };
    },
  );

  server.tool(
    'show_quick_pick',
    'Show a selection list to the user.',
    {
      items: z.array(z.union([
        z.string(),
        z.object({
          label: z.string(),
          description: z.string().optional(),
          detail: z.string().optional(),
        }),
      ])).describe('Items to pick from'),
      title: z.string().optional().describe('Title for the picker'),
      placeholder: z.string().optional().describe('Placeholder text'),
      canPickMany: z.boolean().default(false).describe('Allow multiple selections'),
    },
    async ({ items, title, placeholder, canPickMany }) => {
      const quickPickItems: vscode.QuickPickItem[] = items.map(item =>
        typeof item === 'string' ? { label: item } : item,
      );

      const result = canPickMany
        ? await vscode.window.showQuickPick(quickPickItems, { title, placeHolder: placeholder, canPickMany: true })
        : await vscode.window.showQuickPick(quickPickItems, { title, placeHolder: placeholder });

      if (result === undefined) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ selected: null, cancelled: true }) }],
        };
      }

      const selected = Array.isArray(result)
        ? result.map(r => r.label)
        : (result as vscode.QuickPickItem).label;

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ selected }) }],
      };
    },
  );

  server.tool(
    'show_progress',
    'Show a progress notification while performing a task. Useful for long-running operations.',
    {
      title: z.string().describe('Progress title'),
      durationMs: z.number().default(3000).describe('How long to show the progress (milliseconds)'),
      message: z.string().optional().describe('Progress detail message'),
    },
    async ({ title, durationMs, message }) => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title,
          cancellable: false,
        },
        async (progress) => {
          if (message) {
            progress.report({ message });
          }
          await new Promise(resolve => setTimeout(resolve, durationMs));
        },
      );

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ shown: title, durationMs }) }],
      };
    },
  );
}
