import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';
import { z } from 'zod';
import { ensureDocumentOpen } from '../utils/document-helpers';
import { serializeHover } from '../serializers/hover';

export function registerHoverTools(server: McpServer): void {
  server.tool(
    'execute_hover',
    'Execute hover provider at a position. Returns hover content (markdown documentation).',
    {
      uri: z.string().describe('File path or URI'),
      line: z.number().describe('0-based line number'),
      character: z.number().describe('0-based character offset'),
    },
    async ({ uri, line, character }) => {
      const doc = await ensureDocumentOpen(uri);
      const position = new vscode.Position(line, character);

      // Debug: log the URI and line content
      const lineText = doc.lineAt(line).text;
      const log = (await import('../utils/logger')).log;
      log(`[hover] uri=${doc.uri.toString()}, line=${line}, char=${character}, text="${lineText}"`);

      const results = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        doc.uri,
        position,
      );

      log(`[hover] results=${results?.length ?? 'null'}`);

      const hovers = (results ?? []).map(serializeHover);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(hovers, null, 2) }],
      };
    },
  );
}
