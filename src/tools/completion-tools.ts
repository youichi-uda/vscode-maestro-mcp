import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';
import { z } from 'zod';
import { ensureDocumentOpen } from '../utils/document-helpers';
import { serializeCompletionItem } from '../serializers/completion';

export function registerCompletionTools(server: McpServer): void {
  server.tool(
    'execute_completion',
    'Execute completion provider at a position in a document. Returns completion items with labels, kinds, and details.',
    {
      uri: z.string().describe('File path or URI'),
      line: z.number().describe('0-based line number'),
      character: z.number().describe('0-based character offset'),
      triggerCharacter: z.string().optional().describe('Trigger character (e.g., ".", " ")'),
    },
    async ({ uri, line, character, triggerCharacter }) => {
      const doc = await ensureDocumentOpen(uri);
      const position = new vscode.Position(line, character);

      const result = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        doc.uri,
        position,
        triggerCharacter,
      );

      if (!result || result.items.length === 0) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ items: [], isIncomplete: false }) }] };
      }

      const items = result.items.map(serializeCompletionItem);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ items, isIncomplete: result.isIncomplete }, null, 2) }],
      };
    },
  );
}
