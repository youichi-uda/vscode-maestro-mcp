import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';
import { z } from 'zod';

export function registerTerminalTools(server: McpServer): void {
  server.tool(
    'execute_shell_command',
    'Execute a shell command in the VS Code integrated terminal. Returns when the command has been sent (does not wait for completion).',
    {
      command: z.string().describe('Shell command to execute'),
      cwd: z.string().optional().describe('Working directory (relative to workspace or absolute)'),
      terminalName: z.string().default('MCP').describe('Terminal name to use or create'),
    },
    async ({ command, cwd, terminalName }) => {
      let terminal = vscode.window.terminals.find(t => t.name === terminalName);

      const options: vscode.TerminalOptions = { name: terminalName };
      if (cwd) {
        const folders = vscode.workspace.workspaceFolders;
        if (folders && folders.length > 0 && !cwd.match(/^[a-zA-Z]:[\\/]/) && !cwd.startsWith('/')) {
          options.cwd = vscode.Uri.joinPath(folders[0].uri, cwd);
        } else {
          options.cwd = cwd;
        }
      }

      if (!terminal) {
        terminal = vscode.window.createTerminal(options);
      }

      terminal.show(true);
      terminal.sendText(command);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          sent: command,
          terminal: terminal.name,
        }) }],
      };
    },
  );

  server.tool(
    'get_terminal_output',
    'Get recent output from a VS Code terminal by selecting its text content.',
    {
      terminalName: z.string().default('MCP').describe('Name of the terminal'),
      lines: z.number().default(50).describe('Number of recent lines to retrieve'),
    },
    async ({ terminalName, lines }) => {
      const terminal = vscode.window.terminals.find(t => t.name === terminalName);
      if (!terminal) {
        const available = vscode.window.terminals.map(t => t.name);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: `Terminal "${terminalName}" not found.`,
            availableTerminals: available,
          }) }],
          isError: true,
        };
      }

      // Use the shell integration API if available (VS Code 1.93+)
      // @ts-ignore - shellIntegration may not be in type defs yet
      if (terminal.shellIntegration) {
        // @ts-ignore
        const execution = terminal.shellIntegration.executions;
        // Fall through to selection-based approach if not available
      }

      // Selection-based approach: select all text in the terminal
      terminal.show(false);
      await vscode.commands.executeCommand('workbench.action.terminal.selectAll');
      await vscode.commands.executeCommand('workbench.action.terminal.copySelection');
      await vscode.commands.executeCommand('workbench.action.terminal.clearSelection');

      const clipboard = await vscode.env.clipboard.readText();
      const allLines = clipboard.split('\n');
      const recentLines = allLines.slice(-lines).join('\n');

      return {
        content: [{ type: 'text' as const, text: recentLines }],
      };
    },
  );

  server.tool(
    'list_terminals',
    'List all active VS Code terminals.',
    {},
    async () => {
      const terminals = vscode.window.terminals.map(t => ({
        name: t.name,
        processId: t.processId ? 'running' : 'unknown',
      }));

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(terminals, null, 2) }],
      };
    },
  );
}
