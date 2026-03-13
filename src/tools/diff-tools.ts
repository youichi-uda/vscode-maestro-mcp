import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';
import { z } from 'zod';
import { resolveFileUri, uriToDisplayPath } from '../utils/uri-helpers';

export function registerDiffTools(server: McpServer): void {
  server.tool(
    'diff_files',
    'Compare two files side by side in VS Code diff editor.',
    {
      left: z.string().describe('Left file path or URI'),
      right: z.string().describe('Right file path or URI'),
      title: z.string().optional().describe('Title for the diff tab'),
    },
    async ({ left, right, title }) => {
      const leftUri = resolveFileUri(left);
      const rightUri = resolveFileUri(right);
      const diffTitle = title ?? `${uriToDisplayPath(leftUri)} ↔ ${uriToDisplayPath(rightUri)}`;

      await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, diffTitle);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          opened: diffTitle,
        }) }],
      };
    },
  );

  server.tool(
    'get_unsaved_changes',
    'Get the unsaved (dirty) changes in open editors. Returns the diff between saved and current content.',
    {
      uri: z.string().optional().describe('Specific file. If omitted, returns all dirty files.'),
    },
    async ({ uri }) => {
      const dirtyDocs = uri
        ? [vscode.workspace.textDocuments.find(d => {
            const target = resolveFileUri(uri);
            return d.uri.toString() === target.toString();
          })].filter(Boolean) as vscode.TextDocument[]
        : vscode.workspace.textDocuments.filter(d => d.isDirty && d.uri.scheme === 'file');

      if (dirtyDocs.length === 0) {
        return {
          content: [{ type: 'text' as const, text: uri ? 'File has no unsaved changes.' : 'No dirty files.' }],
        };
      }

      const results = await Promise.all(dirtyDocs.map(async doc => {
        // Read saved version from disk
        let savedContent: string;
        try {
          const bytes = await vscode.workspace.fs.readFile(doc.uri);
          savedContent = Buffer.from(bytes).toString('utf-8');
        } catch {
          savedContent = '';
        }
        const currentContent = doc.getText();

        // Simple line diff
        const savedLines = savedContent.split('\n');
        const currentLines = currentContent.split('\n');
        const changes: Array<{ type: string; line: number; text: string }> = [];

        const maxLines = Math.max(savedLines.length, currentLines.length);
        for (let i = 0; i < maxLines; i++) {
          const saved = savedLines[i];
          const current = currentLines[i];
          if (saved === undefined) {
            changes.push({ type: 'added', line: i, text: current });
          } else if (current === undefined) {
            changes.push({ type: 'removed', line: i, text: saved });
          } else if (saved !== current) {
            changes.push({ type: 'modified', line: i, text: `- ${saved}\n+ ${current}` });
          }
        }

        return {
          file: uriToDisplayPath(doc.uri),
          changeCount: changes.length,
          changes: changes.slice(0, 200), // Limit output
        };
      }));

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
      };
    },
  );
}
