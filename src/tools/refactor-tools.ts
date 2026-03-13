import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';
import { z } from 'zod';
import { resolveFileUri, uriToDisplayPath } from '../utils/uri-helpers';

export function registerRefactorTools(server: McpServer): void {
  server.tool(
    'apply_workspace_edit',
    'Apply text edits across multiple files at once. Each entry specifies a file and a list of edits (range + newText).',
    {
      edits: z.array(z.object({
        uri: z.string().describe('File path or URI'),
        changes: z.array(z.object({
          startLine: z.number().describe('Start line (0-based)'),
          startCharacter: z.number().default(0).describe('Start column'),
          endLine: z.number().describe('End line (0-based)'),
          endCharacter: z.number().describe('End column'),
          newText: z.string().describe('Replacement text'),
        })),
      })).describe('Array of file edits'),
    },
    async ({ edits }) => {
      const wsEdit = new vscode.WorkspaceEdit();
      const filesSummary: string[] = [];

      for (const fileEdit of edits) {
        const fileUri = resolveFileUri(fileEdit.uri);
        for (const change of fileEdit.changes) {
          const range = new vscode.Range(
            change.startLine, change.startCharacter,
            change.endLine, change.endCharacter,
          );
          wsEdit.replace(fileUri, range, change.newText);
        }
        filesSummary.push(`${uriToDisplayPath(fileUri)}: ${fileEdit.changes.length} edits`);
      }

      const success = await vscode.workspace.applyEdit(wsEdit);

      if (!success) {
        return {
          content: [{ type: 'text' as const, text: 'Failed to apply workspace edit.' }],
          isError: true,
        };
      }

      // Save all modified files
      await vscode.workspace.saveAll(false);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          applied: true,
          files: filesSummary,
        }, null, 2) }],
      };
    },
  );

  server.tool(
    'find_and_replace',
    'Find and replace text across files in the workspace.',
    {
      search: z.string().describe('Text to search for'),
      replace: z.string().describe('Replacement text'),
      isRegex: z.boolean().default(false).describe('Treat search as regex'),
      caseSensitive: z.boolean().default(false).describe('Case-sensitive matching'),
      include: z.string().optional().describe('Glob pattern for files to include'),
      exclude: z.string().optional().describe('Glob pattern for files to exclude'),
      maxFiles: z.number().default(50).describe('Maximum number of files to modify'),
      dryRun: z.boolean().default(true).describe('Preview changes without applying. Set false to apply.'),
    },
    async ({ search, replace, isRegex, caseSensitive, include, exclude, maxFiles, dryRun }) => {
      const pattern = include ?? '**/*';
      const excludePattern = exclude ?? '**/node_modules/**';
      const files = await vscode.workspace.findFiles(pattern, excludePattern, maxFiles * 2);

      const regex = isRegex
        ? new RegExp(search, caseSensitive ? 'g' : 'gi')
        : new RegExp(escapeRegex(search), caseSensitive ? 'g' : 'gi');

      const results: Array<{ file: string; matches: number; replacements: Array<{ line: number; before: string; after: string }> }> = [];
      const wsEdit = new vscode.WorkspaceEdit();
      let totalMatches = 0;
      let fileCount = 0;

      for (const fileUri of files) {
        if (fileCount >= maxFiles) break;
        try {
          const doc = await vscode.workspace.openTextDocument(fileUri);
          const fileReplacements: Array<{ line: number; before: string; after: string }> = [];

          for (let i = 0; i < doc.lineCount; i++) {
            const line = doc.lineAt(i);
            const lineText = line.text;
            regex.lastIndex = 0;

            if (regex.test(lineText)) {
              regex.lastIndex = 0;
              const newText = lineText.replace(regex, replace);
              fileReplacements.push({
                line: i,
                before: lineText.trim(),
                after: newText.trim(),
              });

              if (!dryRun) {
                wsEdit.replace(doc.uri, line.range, newText);
              }
            }
          }

          if (fileReplacements.length > 0) {
            results.push({
              file: uriToDisplayPath(fileUri),
              matches: fileReplacements.length,
              replacements: fileReplacements.slice(0, 20), // Limit per file
            });
            totalMatches += fileReplacements.length;
            fileCount++;
          }
        } catch {
          // Skip binary or unreadable files
        }
      }

      if (!dryRun && totalMatches > 0) {
        const success = await vscode.workspace.applyEdit(wsEdit);
        if (success) {
          await vscode.workspace.saveAll(false);
        }
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          dryRun,
          totalMatches,
          filesAffected: results.length,
          results,
        }, null, 2) }],
      };
    },
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
