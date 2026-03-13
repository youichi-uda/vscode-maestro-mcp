import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';
import { z } from 'zod';
import { ensureDocumentOpen } from '../utils/document-helpers';
import { uriToDisplayPath } from '../utils/uri-helpers';

export function registerEditTools(server: McpServer): void {
  server.tool(
    'replace_lines',
    'Replace a range of lines in a file. Lines are 0-based. The file is saved after editing.',
    {
      uri: z.string().describe('File path or URI'),
      startLine: z.number().describe('Start line (0-based, inclusive)'),
      endLine: z.number().describe('End line (0-based, inclusive)'),
      content: z.string().describe('Replacement text'),
      originalCode: z.string().optional().describe('Expected original code for validation. If provided and does not match, the edit is rejected.'),
    },
    async ({ uri, startLine, endLine, content: newContent, originalCode }) => {
      const doc = await ensureDocumentOpen(uri);

      if (startLine < 0 || endLine >= doc.lineCount || startLine > endLine) {
        return {
          content: [{ type: 'text' as const, text: `Invalid line range: ${startLine}-${endLine} (file has ${doc.lineCount} lines, 0-indexed)` }],
          isError: true,
        };
      }

      const startPos = new vscode.Position(startLine, 0);
      const endPos = doc.lineAt(endLine).range.end;
      const range = new vscode.Range(startPos, endPos);

      if (originalCode !== undefined) {
        const actual = doc.getText(range);
        if (actual !== originalCode) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              error: 'Original code mismatch — file may have changed.',
              expected: originalCode,
              actual,
            }, null, 2) }],
            isError: true,
          };
        }
      }

      const edit = new vscode.WorkspaceEdit();
      edit.replace(doc.uri, range, newContent);
      const success = await vscode.workspace.applyEdit(edit);

      if (!success) {
        return {
          content: [{ type: 'text' as const, text: 'Failed to apply edit.' }],
          isError: true,
        };
      }

      const updatedDoc = await ensureDocumentOpen(uri);
      await updatedDoc.save();

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          file: uriToDisplayPath(doc.uri),
          replacedLines: `${startLine}-${endLine}`,
          newLineCount: updatedDoc.lineCount,
        }) }],
      };
    },
  );

  server.tool(
    'insert_text',
    'Insert text at a specific line in a file. The text is inserted before the specified line.',
    {
      uri: z.string().describe('File path or URI'),
      line: z.number().describe('Line number to insert before (0-based). Use lineCount to append at end.'),
      content: z.string().describe('Text to insert'),
    },
    async ({ uri, line, content: newContent }) => {
      const doc = await ensureDocumentOpen(uri);

      if (line < 0 || line > doc.lineCount) {
        return {
          content: [{ type: 'text' as const, text: `Invalid line: ${line} (file has ${doc.lineCount} lines, 0-indexed)` }],
          isError: true,
        };
      }

      const edit = new vscode.WorkspaceEdit();
      if (line >= doc.lineCount) {
        // Append at end
        const lastLine = doc.lineAt(doc.lineCount - 1);
        edit.insert(doc.uri, lastLine.range.end, '\n' + newContent);
      } else {
        const pos = new vscode.Position(line, 0);
        edit.insert(doc.uri, pos, newContent + '\n');
      }

      const success = await vscode.workspace.applyEdit(edit);
      if (!success) {
        return {
          content: [{ type: 'text' as const, text: 'Failed to insert text.' }],
          isError: true,
        };
      }

      const updatedDoc = await ensureDocumentOpen(uri);
      await updatedDoc.save();

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          file: uriToDisplayPath(doc.uri),
          insertedAt: line,
          newLineCount: updatedDoc.lineCount,
        }) }],
      };
    },
  );

  server.tool(
    'undo_edit',
    'Undo the last edit in a file.',
    {
      uri: z.string().describe('File path or URI'),
      count: z.number().default(1).describe('Number of undo steps'),
    },
    async ({ uri, count }) => {
      const doc = await ensureDocumentOpen(uri);
      await vscode.window.showTextDocument(doc);

      for (let i = 0; i < count; i++) {
        await vscode.commands.executeCommand('undo');
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          file: uriToDisplayPath(doc.uri),
          undoSteps: count,
        }) }],
      };
    },
  );
}
