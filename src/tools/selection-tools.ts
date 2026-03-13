import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';
import { z } from 'zod';
import { ensureDocumentOpen } from '../utils/document-helpers';
import { uriToDisplayPath } from '../utils/uri-helpers';

export function registerSelectionTools(server: McpServer): void {
  server.tool(
    'get_selection',
    'Get the currently selected text in the active editor. Returns selection ranges and text content.',
    {},
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return { content: [{ type: 'text' as const, text: 'No active editor.' }], isError: true };
      }

      const selections = editor.selections.map(sel => ({
        start: { line: sel.start.line, character: sel.start.character },
        end: { line: sel.end.line, character: sel.end.character },
        text: editor.document.getText(sel),
        isEmpty: sel.isEmpty,
      }));

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          file: uriToDisplayPath(editor.document.uri),
          selections,
        }, null, 2) }],
      };
    },
  );

  server.tool(
    'replace_selection',
    'Replace the current selection(s) with new text. If no selection, inserts at cursor.',
    {
      text: z.string().describe('Replacement text'),
      selectionIndex: z.number().default(0).describe('Which selection to replace (0-based). Use -1 for all selections.'),
    },
    async ({ text, selectionIndex }) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return { content: [{ type: 'text' as const, text: 'No active editor.' }], isError: true };
      }

      await editor.edit(editBuilder => {
        if (selectionIndex === -1) {
          for (const sel of editor.selections) {
            editBuilder.replace(sel, text);
          }
        } else {
          const sel = editor.selections[selectionIndex];
          if (sel) editBuilder.replace(sel, text);
        }
      });

      await editor.document.save();

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          file: uriToDisplayPath(editor.document.uri),
          replaced: selectionIndex === -1 ? editor.selections.length : 1,
        }) }],
      };
    },
  );

  server.tool(
    'set_cursor',
    'Move the cursor to a specific position in a file.',
    {
      uri: z.string().optional().describe('File path or URI. If omitted, uses active editor.'),
      line: z.number().describe('Line number (0-based)'),
      character: z.number().default(0).describe('Column (0-based)'),
    },
    async ({ uri, line, character }) => {
      let editor = vscode.window.activeTextEditor;
      if (uri) {
        const doc = await ensureDocumentOpen(uri);
        editor = await vscode.window.showTextDocument(doc);
      }
      if (!editor) {
        return { content: [{ type: 'text' as const, text: 'No active editor.' }], isError: true };
      }

      const pos = new vscode.Position(line, character);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          file: uriToDisplayPath(editor.document.uri),
          cursor: { line, character },
        }) }],
      };
    },
  );

  server.tool(
    'select_range',
    'Select a range of text in a file.',
    {
      uri: z.string().optional().describe('File path or URI. If omitted, uses active editor.'),
      startLine: z.number().describe('Start line (0-based)'),
      startCharacter: z.number().default(0).describe('Start column (0-based)'),
      endLine: z.number().describe('End line (0-based)'),
      endCharacter: z.number().describe('End column (0-based)'),
    },
    async ({ uri, startLine, startCharacter, endLine, endCharacter }) => {
      let editor = vscode.window.activeTextEditor;
      if (uri) {
        const doc = await ensureDocumentOpen(uri);
        editor = await vscode.window.showTextDocument(doc);
      }
      if (!editor) {
        return { content: [{ type: 'text' as const, text: 'No active editor.' }], isError: true };
      }

      const start = new vscode.Position(startLine, startCharacter);
      const end = new vscode.Position(endLine, endCharacter);
      editor.selection = new vscode.Selection(start, end);
      editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenter);

      const selectedText = editor.document.getText(new vscode.Range(start, end));

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          file: uriToDisplayPath(editor.document.uri),
          selectedText,
        }, null, 2) }],
      };
    },
  );

  server.tool(
    'get_clipboard',
    'Read the current clipboard text content.',
    {},
    async () => {
      const text = await vscode.env.clipboard.readText();
      return { content: [{ type: 'text' as const, text }] };
    },
  );

  server.tool(
    'set_clipboard',
    'Write text to the clipboard.',
    {
      text: z.string().describe('Text to copy to clipboard'),
    },
    async ({ text }) => {
      await vscode.env.clipboard.writeText(text);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ copied: text.length + ' characters' }) }],
      };
    },
  );
}
