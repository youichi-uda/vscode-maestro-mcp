import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';
import { z } from 'zod';
import { ensureDocumentOpen } from '../utils/document-helpers';
import { serializeSignatureHelp } from '../serializers/misc';

export function registerSignatureTools(server: McpServer): void {
  server.tool(
    'execute_signature_help',
    'Execute signature help provider at a position. Returns function/method signatures with parameter info.',
    {
      uri: z.string().describe('File path or URI'),
      line: z.number().describe('0-based line number'),
      character: z.number().describe('0-based character offset'),
      triggerCharacter: z.string().optional().describe('Trigger character (e.g., "(", ",")'),
    },
    async ({ uri, line, character, triggerCharacter }) => {
      const doc = await ensureDocumentOpen(uri);
      const position = new vscode.Position(line, character);

      const result = await vscode.commands.executeCommand<vscode.SignatureHelp>(
        'vscode.executeSignatureHelpProvider',
        doc.uri,
        position,
        triggerCharacter,
      );

      if (!result) {
        return { content: [{ type: 'text' as const, text: 'null' }] };
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(serializeSignatureHelp(result), null, 2) }],
      };
    },
  );
}
