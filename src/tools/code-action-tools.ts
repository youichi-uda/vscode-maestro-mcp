import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';
import { z } from 'zod';
import { ensureDocumentOpen } from '../utils/document-helpers';
import { serializeCodeAction } from '../serializers/diagnostics';
import { serializeCodeLens } from '../serializers/misc';

export function registerCodeActionTools(server: McpServer): void {
  server.tool(
    'execute_code_actions',
    'Execute code action provider for a range. Returns available quick fixes, refactorings, etc.',
    {
      uri: z.string().describe('File path or URI'),
      startLine: z.number().describe('0-based start line'),
      startCharacter: z.number().describe('0-based start character'),
      endLine: z.number().describe('0-based end line'),
      endCharacter: z.number().describe('0-based end character'),
      kind: z.string().optional().describe('Code action kind filter (e.g., "quickfix", "refactor")'),
    },
    async ({ uri, startLine, startCharacter, endLine, endCharacter, kind }) => {
      const doc = await ensureDocumentOpen(uri);
      const range = new vscode.Range(startLine, startCharacter, endLine, endCharacter);

      const results = await vscode.commands.executeCommand<vscode.CodeAction[]>(
        'vscode.executeCodeActionProvider',
        doc.uri,
        range,
        kind,
      );

      const actions = (results ?? []).map(serializeCodeAction);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(actions, null, 2) }],
      };
    },
  );

  server.tool(
    'execute_code_lens',
    'Execute CodeLens provider for a document. Returns CodeLens items with ranges and commands.',
    {
      uri: z.string().describe('File path or URI'),
    },
    async ({ uri }) => {
      const doc = await ensureDocumentOpen(uri);

      const results = await vscode.commands.executeCommand<vscode.CodeLens[]>(
        'vscode.executeCodeLensProvider',
        doc.uri,
      );

      const lenses = (results ?? []).map(serializeCodeLens);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(lenses, null, 2) }],
      };
    },
  );
}
