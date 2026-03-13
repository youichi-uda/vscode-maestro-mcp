import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';
import { z } from 'zod';
import { ensureDocumentOpen } from '../utils/document-helpers';
import { decodeSemanticTokens } from '../serializers/semantic-tokens';
import { serializeInlayHint } from '../serializers/misc';

export function registerSemanticTools(server: McpServer): void {
  server.tool(
    'execute_semantic_tokens',
    'Get semantic tokens for a document. Returns token types and modifiers for syntax analysis.',
    {
      uri: z.string().describe('File path or URI'),
      range: z.object({
        startLine: z.number(),
        startCharacter: z.number(),
        endLine: z.number(),
        endCharacter: z.number(),
      }).optional().describe('Optional range to limit tokens'),
    },
    async ({ uri, range }) => {
      const doc = await ensureDocumentOpen(uri);

      // Try to get the semantic tokens legend
      const legend = await vscode.commands.executeCommand<vscode.SemanticTokensLegend>(
        'vscode.provideDocumentSemanticTokensLegend',
        doc.uri,
      );

      let tokens: vscode.SemanticTokens | undefined;

      if (range) {
        const vscRange = new vscode.Range(range.startLine, range.startCharacter, range.endLine, range.endCharacter);
        tokens = await vscode.commands.executeCommand<vscode.SemanticTokens>(
          'vscode.provideDocumentRangeSemanticTokens',
          doc.uri,
          vscRange,
        );
      } else {
        tokens = await vscode.commands.executeCommand<vscode.SemanticTokens>(
          'vscode.provideDocumentSemanticTokens',
          doc.uri,
        );
      }

      if (!tokens || !legend) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ tokens: [], legend: null }) }] };
      }

      const decoded = decodeSemanticTokens(tokens, legend);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ tokens: decoded, legend: { tokenTypes: legend.tokenTypes, tokenModifiers: legend.tokenModifiers } }, null, 2) }],
      };
    },
  );

  server.tool(
    'execute_inlay_hints',
    'Get inlay hints for a range in a document. Returns inline annotations like type hints and parameter names.',
    {
      uri: z.string().describe('File path or URI'),
      startLine: z.number().describe('0-based start line'),
      startCharacter: z.number().default(0).describe('0-based start character'),
      endLine: z.number().describe('0-based end line'),
      endCharacter: z.number().default(0).describe('0-based end character'),
    },
    async ({ uri, startLine, startCharacter, endLine, endCharacter }) => {
      const doc = await ensureDocumentOpen(uri);
      const range = new vscode.Range(startLine, startCharacter, endLine, endCharacter);

      const results = await vscode.commands.executeCommand<vscode.InlayHint[]>(
        'vscode.executeInlayHintProvider',
        doc.uri,
        range,
      );

      const hints = (results ?? []).map(serializeInlayHint);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(hints, null, 2) }],
      };
    },
  );
}
