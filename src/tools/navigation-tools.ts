import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';
import { z } from 'zod';
import { ensureDocumentOpen } from '../utils/document-helpers';
import { serializeLocation, serializeLocationLink } from '../serializers/position';
import { serializeCallHierarchyItem } from '../serializers/symbols';

export function registerNavigationTools(server: McpServer): void {
  server.tool(
    'execute_definition',
    'Go to definition at a position. Returns definition locations.',
    {
      uri: z.string().describe('File path or URI'),
      line: z.number().describe('0-based line number'),
      character: z.number().describe('0-based character offset'),
    },
    async ({ uri, line, character }) => {
      const doc = await ensureDocumentOpen(uri);
      const position = new vscode.Position(line, character);

      const results = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        'vscode.executeDefinitionProvider',
        doc.uri,
        position,
      );

      const locations = (results ?? []).map(r => {
        if ('targetUri' in r) return serializeLocationLink(r);
        return serializeLocation(r);
      });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(locations, null, 2) }],
      };
    },
  );

  server.tool(
    'execute_references',
    'Find all references at a position. Returns reference locations.',
    {
      uri: z.string().describe('File path or URI'),
      line: z.number().describe('0-based line number'),
      character: z.number().describe('0-based character offset'),
    },
    async ({ uri, line, character }) => {
      const doc = await ensureDocumentOpen(uri);
      const position = new vscode.Position(line, character);

      const results = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        doc.uri,
        position,
      );

      const locations = (results ?? []).map(serializeLocation);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(locations, null, 2) }],
      };
    },
  );

  server.tool(
    'execute_call_hierarchy',
    'Prepare call hierarchy at a position. Returns call hierarchy items with optional incoming/outgoing calls.',
    {
      uri: z.string().describe('File path or URI'),
      line: z.number().describe('0-based line number'),
      character: z.number().describe('0-based character offset'),
      direction: z.enum(['incoming', 'outgoing', 'both', 'none']).default('none').describe('Whether to also fetch incoming/outgoing calls'),
    },
    async ({ uri, line, character, direction }) => {
      const doc = await ensureDocumentOpen(uri);
      const position = new vscode.Position(line, character);

      const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
        'vscode.prepareCallHierarchy',
        doc.uri,
        position,
      );

      if (!items || items.length === 0) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ items: [] }) }] };
      }

      const result: any = { items: items.map(serializeCallHierarchyItem) };

      if (direction === 'incoming' || direction === 'both') {
        const incoming = await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>(
          'vscode.provideIncomingCalls',
          items[0],
        );
        result.incomingCalls = (incoming ?? []).map(c => ({
          from: serializeCallHierarchyItem(c.from),
          fromRanges: c.fromRanges.map(r => ({ start: { line: r.start.line, character: r.start.character }, end: { line: r.end.line, character: r.end.character } })),
        }));
      }

      if (direction === 'outgoing' || direction === 'both') {
        const outgoing = await vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>(
          'vscode.provideOutgoingCalls',
          items[0],
        );
        result.outgoingCalls = (outgoing ?? []).map(c => ({
          to: serializeCallHierarchyItem(c.to),
          fromRanges: c.fromRanges.map(r => ({ start: { line: r.start.line, character: r.start.character }, end: { line: r.end.line, character: r.end.character } })),
        }));
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
