import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';
import { z } from 'zod';
import { ensureDocumentOpen } from '../utils/document-helpers';
import { serializeTextEdit } from '../serializers/edits';

export function registerFormattingTools(server: McpServer): void {
  server.tool(
    'execute_formatting',
    'Format a document. Returns the text edits that would be applied.',
    {
      uri: z.string().describe('File path or URI'),
      tabSize: z.number().default(4).describe('Tab size'),
      insertSpaces: z.boolean().default(true).describe('Use spaces instead of tabs'),
    },
    async ({ uri, tabSize, insertSpaces }) => {
      const doc = await ensureDocumentOpen(uri);

      const results = await vscode.commands.executeCommand<vscode.TextEdit[]>(
        'vscode.executeFormatDocumentProvider',
        doc.uri,
        { tabSize, insertSpaces },
      );

      const edits = (results ?? []).map(serializeTextEdit);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(edits, null, 2) }],
      };
    },
  );

  server.tool(
    'execute_rename',
    'Execute rename provider. Returns workspace edits for renaming a symbol.',
    {
      uri: z.string().describe('File path or URI'),
      line: z.number().describe('0-based line number'),
      character: z.number().describe('0-based character offset'),
      newName: z.string().describe('New name for the symbol'),
    },
    async ({ uri, line, character, newName }) => {
      const doc = await ensureDocumentOpen(uri);
      const position = new vscode.Position(line, character);

      const result = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
        'vscode.executeDocumentRenameProvider',
        doc.uri,
        position,
        newName,
      );

      if (!result) {
        return { content: [{ type: 'text' as const, text: 'null' }] };
      }

      // Manually serialize the workspace edit
      const entries: any[] = [];
      for (const [entryUri, edits] of result.entries()) {
        const textEdits = edits
          .filter((e: any) => 'range' in e && 'newText' in e)
          .map(serializeTextEdit);
        if (textEdits.length > 0) {
          entries.push({ uri: entryUri.toString(), edits: textEdits });
        }
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ entries }, null, 2) }],
      };
    },
  );
}
