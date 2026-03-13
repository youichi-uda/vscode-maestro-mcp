import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';
import { z } from 'zod';
import { ensureDocumentOpen } from '../utils/document-helpers';
import { serializeDocumentLink, serializeColorInfo, serializeFoldingRange } from '../serializers/misc';

export function registerDocumentTools(server: McpServer): void {
  server.tool(
    'execute_document_links',
    'Get document links (clickable URLs/paths in code). Returns link ranges and targets.',
    {
      uri: z.string().describe('File path or URI'),
    },
    async ({ uri }) => {
      const doc = await ensureDocumentOpen(uri);

      const results = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
        'vscode.executeLinkProvider',
        doc.uri,
      );

      const links = (results ?? []).map(serializeDocumentLink);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(links, null, 2) }],
      };
    },
  );

  server.tool(
    'execute_color_provider',
    'Get color information from a document. Returns color values and their positions.',
    {
      uri: z.string().describe('File path or URI'),
    },
    async ({ uri }) => {
      const doc = await ensureDocumentOpen(uri);

      const results = await vscode.commands.executeCommand<vscode.ColorInformation[]>(
        'vscode.executeDocumentColorProvider',
        doc.uri,
      );

      const colors = (results ?? []).map(serializeColorInfo);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(colors, null, 2) }],
      };
    },
  );

  server.tool(
    'execute_folding_ranges',
    'Get folding ranges for a document. Returns foldable regions.',
    {
      uri: z.string().describe('File path or URI'),
    },
    async ({ uri }) => {
      const doc = await ensureDocumentOpen(uri);

      const results = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
        'vscode.executeFoldingRangeProvider',
        doc.uri,
      );

      const ranges = (results ?? []).map(serializeFoldingRange);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(ranges, null, 2) }],
      };
    },
  );
}
