import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';
import { z } from 'zod';
import { ensureDocumentOpen } from '../utils/document-helpers';
import { uriToDisplayPath } from '../utils/uri-helpers';

export function registerEditorTools(server: McpServer): void {
  server.tool(
    'focus_editor',
    'Open a file in the editor and optionally navigate to a specific line and column.',
    {
      uri: z.string().describe('File path or URI'),
      line: z.number().optional().describe('Line to navigate to (0-based)'),
      character: z.number().optional().describe('Column to navigate to (0-based)'),
      preview: z.boolean().default(false).describe('Open in preview mode (will be replaced by next preview)'),
    },
    async ({ uri, line, character, preview }) => {
      const doc = await ensureDocumentOpen(uri);
      const options: vscode.TextDocumentShowOptions = {
        preview,
        preserveFocus: false,
      };

      if (line !== undefined) {
        const pos = new vscode.Position(line, character ?? 0);
        options.selection = new vscode.Range(pos, pos);
      }

      await vscode.window.showTextDocument(doc, options);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          opened: uriToDisplayPath(doc.uri),
          languageId: doc.languageId,
          lineCount: doc.lineCount,
        }) }],
      };
    },
  );

  server.tool(
    'get_workspace_info',
    'Get information about the current workspace: folders, open files, and active editor.',
    {},
    async () => {
      const folders = (vscode.workspace.workspaceFolders ?? []).map(f => ({
        name: f.name,
        uri: f.uri.fsPath,
      }));

      const openDocuments = vscode.workspace.textDocuments
        .filter(d => d.uri.scheme === 'file')
        .map(d => ({
          path: uriToDisplayPath(d.uri),
          languageId: d.languageId,
          isDirty: d.isDirty,
          lineCount: d.lineCount,
        }));

      const activeEditor = vscode.window.activeTextEditor;
      const activeFile = activeEditor ? {
        path: uriToDisplayPath(activeEditor.document.uri),
        languageId: activeEditor.document.languageId,
        cursorLine: activeEditor.selection.active.line,
        cursorCharacter: activeEditor.selection.active.character,
      } : null;

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          workspaceFolders: folders,
          openFiles: openDocuments,
          activeFile,
          terminalCount: vscode.window.terminals.length,
        }, null, 2) }],
      };
    },
  );

  server.tool(
    'get_output_channels',
    'List output channels currently open in VS Code, and optionally read their content.',
    {
      name: z.string().optional().describe('Name of a specific output channel to read. If omitted, lists all available channels.'),
      tail: z.number().default(100).describe('Number of lines from the end to return when reading a channel'),
    },
    async ({ name, tail }) => {
      // Output channels appear as documents with 'output' scheme
      const outputDocs = vscode.workspace.textDocuments.filter(
        d => d.uri.scheme === 'output',
      );

      if (!name) {
        // List available output channels
        const channels = outputDocs.map(d => {
          // The URI fragment or path usually contains the channel name
          const channelName = decodeOutputChannelName(d.uri);
          return {
            name: channelName,
            lineCount: d.lineCount,
          };
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(channels, null, 2) }],
        };
      }

      // Find the specific channel
      const doc = outputDocs.find(d => {
        const channelName = decodeOutputChannelName(d.uri);
        return channelName.toLowerCase().includes(name.toLowerCase());
      });

      if (!doc) {
        const available = outputDocs.map(d => decodeOutputChannelName(d.uri));
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: `Output channel "${name}" not found.`,
            availableChannels: available,
          }) }],
          isError: true,
        };
      }

      const startLine = Math.max(0, doc.lineCount - tail);
      const lines: string[] = [];
      for (let i = startLine; i < doc.lineCount; i++) {
        lines.push(doc.lineAt(i).text);
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    },
  );

  server.tool(
    'list_vscode_commands',
    'List available VS Code commands, optionally filtered by prefix.',
    {
      filter: z.string().default('').describe('Filter commands by prefix or substring'),
    },
    async ({ filter }) => {
      const commands = await vscode.commands.getCommands(true);
      const filtered = filter
        ? commands.filter(c => c.toLowerCase().includes(filter.toLowerCase()))
        : commands;

      // Limit to avoid overwhelming output
      const limited = filtered.slice(0, 200);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          commands: limited,
          total: filtered.length,
          showing: limited.length,
        }, null, 2) }],
      };
    },
  );

  server.tool(
    'execute_vscode_command',
    'Execute any VS Code command by ID. Use list_vscode_commands to discover available commands.',
    {
      command: z.string().describe('Command ID (e.g. "editor.action.formatDocument")'),
      args: z.array(z.any()).default([]).describe('Arguments to pass to the command'),
    },
    async ({ command, args }) => {
      const result = await vscode.commands.executeCommand(command, ...args);

      let serialized: string;
      try {
        serialized = JSON.stringify(result, null, 2) ?? 'undefined';
      } catch {
        serialized = String(result);
      }

      return {
        content: [{ type: 'text' as const, text: serialized }],
      };
    },
  );
}

function decodeOutputChannelName(uri: vscode.Uri): string {
  // Output channel URIs encode the name in the path or fragment
  // Format varies: output:channelName or output:#channelId/channelName
  try {
    const fragment = uri.fragment;
    if (fragment) {
      // Try to parse JSON fragment (newer VS Code)
      try {
        const parsed = JSON.parse(fragment);
        return parsed.name ?? parsed.label ?? fragment;
      } catch {
        return fragment;
      }
    }
    return uri.path || uri.toString();
  } catch {
    return uri.toString();
  }
}
