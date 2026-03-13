import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';
import { z } from 'zod';
import { resolveFileUri, uriToDisplayPath } from '../utils/uri-helpers';

export function registerFileTools(server: McpServer): void {
  server.tool(
    'list_files',
    'List files and directories in the workspace. Returns names and types.',
    {
      path: z.string().default('').describe('Relative path within workspace. Empty string for workspace root.'),
      recursive: z.boolean().default(false).describe('List files recursively'),
      maxResults: z.number().default(500).describe('Maximum number of results'),
    },
    async ({ path, recursive, maxResults }) => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No workspace folder open.' }], isError: true };
      }

      const baseUri = path
        ? vscode.Uri.joinPath(folders[0].uri, path)
        : folders[0].uri;

      if (recursive) {
        const pattern = path ? new vscode.RelativePattern(baseUri, '**/*') : new vscode.RelativePattern(folders[0], '**/*');
        const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', maxResults);
        const entries = files.map(f => uriToDisplayPath(f)).sort();
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(entries, null, 2) }],
        };
      }

      const entries = await vscode.workspace.fs.readDirectory(baseUri);
      const result = entries
        .slice(0, maxResults)
        .map(([name, type]) => ({
          name,
          type: type === vscode.FileType.Directory ? 'directory'
            : type === vscode.FileType.File ? 'file'
            : type === vscode.FileType.SymbolicLink ? 'symlink'
            : 'unknown',
        }))
        .sort((a, b) => {
          if (a.type === 'directory' && b.type !== 'directory') return -1;
          if (a.type !== 'directory' && b.type === 'directory') return 1;
          return a.name.localeCompare(b.name);
        });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    'find_files',
    'Find files matching a glob pattern in the workspace.',
    {
      pattern: z.string().describe('Glob pattern (e.g. "**/*.ts", "src/**/*.json")'),
      exclude: z.string().default('**/node_modules/**').describe('Glob pattern to exclude'),
      maxResults: z.number().default(200).describe('Maximum number of results'),
    },
    async ({ pattern, exclude, maxResults }) => {
      const files = await vscode.workspace.findFiles(pattern, exclude, maxResults);
      const paths = files.map(f => uriToDisplayPath(f)).sort();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(paths, null, 2) }],
      };
    },
  );

  server.tool(
    'search_text',
    'Search for text or regex pattern across workspace files. Returns matching lines with context.',
    {
      query: z.string().describe('Search text or regex pattern'),
      isRegex: z.boolean().default(false).describe('Treat query as regex'),
      caseSensitive: z.boolean().default(false).describe('Case-sensitive search'),
      include: z.string().optional().describe('Glob pattern for files to include (e.g. "**/*.ts")'),
      exclude: z.string().optional().describe('Glob pattern for files to exclude'),
      maxResults: z.number().default(100).describe('Maximum number of results'),
      contextLines: z.number().default(0).describe('Number of context lines before and after each match'),
    },
    async ({ query, isRegex, caseSensitive, include, exclude, maxResults, contextLines }) => {
      const results: Array<{ file: string; line: number; text: string; context?: string[] }> = [];
      let count = 0;

      // Use workspace.findFiles + read to search
      const pattern = include ?? '**/*';
      const excludePattern = exclude ?? '**/node_modules/**';
      const files = await vscode.workspace.findFiles(pattern, excludePattern, 500);

      const regex = isRegex
        ? new RegExp(query, caseSensitive ? 'g' : 'gi')
        : new RegExp(escapeRegex(query), caseSensitive ? 'g' : 'gi');

      for (const fileUri of files) {
        if (count >= maxResults) break;
        try {
          const doc = await vscode.workspace.openTextDocument(fileUri);
          for (let i = 0; i < doc.lineCount && count < maxResults; i++) {
            const lineText = doc.lineAt(i).text;
            if (regex.test(lineText)) {
              regex.lastIndex = 0; // Reset regex state
              const entry: any = {
                file: uriToDisplayPath(fileUri),
                line: i,
                text: lineText.trim(),
              };
              if (contextLines > 0) {
                const ctxLines: string[] = [];
                for (let c = Math.max(0, i - contextLines); c <= Math.min(doc.lineCount - 1, i + contextLines); c++) {
                  if (c !== i) ctxLines.push(`${c}\t${doc.lineAt(c).text}`);
                }
                entry.context = ctxLines;
              }
              results.push(entry);
              count++;
            }
          }
        } catch {
          // Skip binary or unreadable files
        }
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
      };
    },
  );

  server.tool(
    'read_file',
    'Read the contents of a file. Returns text content with line numbers.',
    {
      uri: z.string().describe('File path or URI'),
      startLine: z.number().optional().describe('Start line (0-based, inclusive)'),
      endLine: z.number().optional().describe('End line (0-based, inclusive)'),
      maxCharacters: z.number().default(100000).describe('Maximum characters to return'),
    },
    async ({ uri, startLine, endLine, maxCharacters }) => {
      const fileUri = resolveFileUri(uri);
      const doc = await vscode.workspace.openTextDocument(fileUri);

      const start = startLine ?? 0;
      const end = Math.min(endLine ?? doc.lineCount - 1, doc.lineCount - 1);

      const lines: string[] = [];
      let charCount = 0;
      let truncated = false;

      for (let i = start; i <= end; i++) {
        const lineText = doc.lineAt(i).text;
        if (charCount + lineText.length > maxCharacters) {
          truncated = true;
          break;
        }
        lines.push(`${i}\t${lineText}`);
        charCount += lineText.length + 1;
      }

      let result = lines.join('\n');
      if (truncated) {
        result += `\n... (truncated at ${maxCharacters} characters)`;
      }

      return {
        content: [{ type: 'text' as const, text: result }],
      };
    },
  );

  server.tool(
    'create_file',
    'Create a new file with the given content. Fails if the file already exists unless overwrite is true.',
    {
      uri: z.string().describe('File path or URI'),
      content: z.string().describe('File content'),
      overwrite: z.boolean().default(false).describe('Overwrite existing file'),
    },
    async ({ uri, content: fileContent, overwrite }) => {
      const fileUri = resolveFileUri(uri);

      if (!overwrite) {
        try {
          await vscode.workspace.fs.stat(fileUri);
          return {
            content: [{ type: 'text' as const, text: `File already exists: ${uriToDisplayPath(fileUri)}. Set overwrite=true to replace.` }],
            isError: true,
          };
        } catch {
          // File doesn't exist, proceed
        }
      }

      const encoded = Buffer.from(fileContent, 'utf-8');
      await vscode.workspace.fs.writeFile(fileUri, encoded);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          created: uriToDisplayPath(fileUri),
          size: encoded.length,
        }) }],
      };
    },
  );

  server.tool(
    'copy_file',
    'Copy a file or directory to a new location.',
    {
      source: z.string().describe('Source file path or URI'),
      target: z.string().describe('Target file path or URI'),
      overwrite: z.boolean().default(false).describe('Overwrite if target exists'),
    },
    async ({ source, target, overwrite }) => {
      const sourceUri = resolveFileUri(source);
      const targetUri = resolveFileUri(target);

      await vscode.workspace.fs.copy(sourceUri, targetUri, { overwrite });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          copied: uriToDisplayPath(sourceUri),
          to: uriToDisplayPath(targetUri),
        }) }],
      };
    },
  );

  server.tool(
    'move_file',
    'Move or rename a file or directory. Updates imports if the language server supports it.',
    {
      source: z.string().describe('Source file path or URI'),
      target: z.string().describe('Target file path or URI'),
      overwrite: z.boolean().default(false).describe('Overwrite if target exists'),
    },
    async ({ source, target, overwrite }) => {
      const sourceUri = resolveFileUri(source);
      const targetUri = resolveFileUri(target);

      // Use WorkspaceEdit for move to trigger language server refactoring
      const edit = new vscode.WorkspaceEdit();
      edit.renameFile(sourceUri, targetUri, { overwrite });
      const success = await vscode.workspace.applyEdit(edit);

      if (!success) {
        return {
          content: [{ type: 'text' as const, text: `Failed to move ${uriToDisplayPath(sourceUri)}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          moved: uriToDisplayPath(sourceUri),
          to: uriToDisplayPath(targetUri),
        }) }],
      };
    },
  );

  server.tool(
    'delete_file',
    'Delete a file or directory.',
    {
      uri: z.string().describe('File path or URI to delete'),
      recursive: z.boolean().default(false).describe('Delete directory contents recursively'),
    },
    async ({ uri, recursive }) => {
      const fileUri = resolveFileUri(uri);
      await vscode.workspace.fs.delete(fileUri, { recursive });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          deleted: uriToDisplayPath(fileUri),
        }) }],
      };
    },
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
