import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';
import { z } from 'zod';
import { ensureDocumentOpen } from '../utils/document-helpers';
import { serializeDocumentSymbol, serializeSymbolInformation } from '../serializers/symbols';

export function registerSymbolTools(server: McpServer): void {
  server.tool(
    'execute_document_symbols',
    'Get document symbols (outline). Returns hierarchical symbol tree.',
    {
      uri: z.string().describe('File path or URI'),
    },
    async ({ uri }) => {
      const doc = await ensureDocumentOpen(uri);

      const results = await vscode.commands.executeCommand<(vscode.DocumentSymbol | vscode.SymbolInformation)[]>(
        'vscode.executeDocumentSymbolProvider',
        doc.uri,
      );

      if (!results || results.length === 0) {
        return { content: [{ type: 'text' as const, text: JSON.stringify([]) }] };
      }

      // Check if results are DocumentSymbol or SymbolInformation
      const first = results[0];
      if ('children' in first) {
        const symbols = (results as vscode.DocumentSymbol[]).map(serializeDocumentSymbol);
        return { content: [{ type: 'text' as const, text: JSON.stringify(symbols, null, 2) }] };
      } else {
        const symbols = (results as vscode.SymbolInformation[]).map(serializeSymbolInformation);
        return { content: [{ type: 'text' as const, text: JSON.stringify(symbols, null, 2) }] };
      }
    },
  );

  server.tool(
    'execute_workspace_symbols',
    'Search workspace symbols by query string.',
    {
      query: z.string().describe('Search query'),
    },
    async ({ query }) => {
      const results = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        'vscode.executeWorkspaceSymbolProvider',
        query,
      );

      const symbols = (results ?? []).map(serializeSymbolInformation);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(symbols, null, 2) }],
      };
    },
  );
}
