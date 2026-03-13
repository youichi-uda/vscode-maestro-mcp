import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';
import { z } from 'zod';
import { ensureDocumentOpen } from '../utils/document-helpers';
import { uriToDisplayPath } from '../utils/uri-helpers';

export function registerSnippetTools(server: McpServer): void {
  server.tool(
    'insert_snippet',
    'Insert a VS Code snippet at the cursor position or a specified location. Supports snippet syntax ($1, ${2:placeholder}, etc.).',
    {
      snippet: z.string().describe('Snippet text with VS Code snippet syntax (e.g. "for (let ${1:i} = 0; $1 < ${2:length}; $1++) {\\n\\t$0\\n}")'),
      uri: z.string().optional().describe('File path or URI. If omitted, uses active editor.'),
      line: z.number().optional().describe('Insert at this line (0-based)'),
      character: z.number().optional().describe('Insert at this column (0-based)'),
    },
    async ({ snippet, uri, line, character }) => {
      let editor = vscode.window.activeTextEditor;

      if (uri) {
        const doc = await ensureDocumentOpen(uri);
        editor = await vscode.window.showTextDocument(doc);
      }

      if (!editor) {
        return { content: [{ type: 'text' as const, text: 'No active editor.' }], isError: true };
      }

      if (line !== undefined) {
        const pos = new vscode.Position(line, character ?? 0);
        editor.selection = new vscode.Selection(pos, pos);
      }

      const snippetString = new vscode.SnippetString(snippet);
      await editor.insertSnippet(snippetString);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          inserted: true,
          file: uriToDisplayPath(editor.document.uri),
        }) }],
      };
    },
  );

  server.tool(
    'surround_with_snippet',
    'Wrap the current selection with a snippet. Use $TM_SELECTED_TEXT for the selected text.',
    {
      snippet: z.string().describe('Snippet text. Use $TM_SELECTED_TEXT to include the selection (e.g. "try {\\n\\t$TM_SELECTED_TEXT\\n} catch (${1:error}) {\\n\\t$0\\n}")'),
    },
    async ({ snippet }) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return { content: [{ type: 'text' as const, text: 'No active editor.' }], isError: true };
      }

      if (editor.selection.isEmpty) {
        return { content: [{ type: 'text' as const, text: 'No text selected.' }], isError: true };
      }

      const snippetString = new vscode.SnippetString(snippet);
      await editor.insertSnippet(snippetString);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          wrapped: true,
          file: uriToDisplayPath(editor.document.uri),
        }) }],
      };
    },
  );
}
