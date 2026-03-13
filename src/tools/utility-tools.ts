import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';
import { z } from 'zod';
import { ensureDocumentOpen, getActiveEditorState } from '../utils/document-helpers';
import { resolveFileUri, uriToDisplayPath } from '../utils/uri-helpers';
import { serializeDiagnostic } from '../serializers/diagnostics';

export function registerUtilityTools(server: McpServer): void {
  server.tool(
    'open_document',
    'Open a file in the editor. Many providers require the document to be open. Returns document metadata.',
    {
      uri: z.string().describe('File path or URI'),
      show: z.boolean().default(false).describe('Also show the document in the editor'),
    },
    async ({ uri, show }) => {
      const doc = await ensureDocumentOpen(uri);

      if (show) {
        await vscode.window.showTextDocument(doc);
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          uri: doc.uri.toString(),
          fileName: uriToDisplayPath(doc.uri),
          languageId: doc.languageId,
          lineCount: doc.lineCount,
          version: doc.version,
          isDirty: doc.isDirty,
        }, null, 2) }],
      };
    },
  );

  server.tool(
    'get_diagnostics',
    'Get current diagnostics (errors, warnings) for a file or the entire workspace.',
    {
      uri: z.string().optional().describe('File path or URI. If omitted, returns all workspace diagnostics.'),
      severities: z.array(z.number()).default([0, 1]).describe('Severity filter: 0=Error, 1=Warning, 2=Information, 3=Hint'),
    },
    async ({ uri, severities }) => {
      const severitySet = new Set(severities);
      let diagnostics: Array<{ uri: string; diagnostics: any[] }>;

      if (uri) {
        const fileUri = resolveFileUri(uri);
        const fileDiags = vscode.languages.getDiagnostics(fileUri);
        const filtered = fileDiags
          .filter(d => severitySet.has(d.severity))
          .map(serializeDiagnostic);
        diagnostics = [{ uri: uriToDisplayPath(fileUri), diagnostics: filtered }];
      } else {
        const allDiags = vscode.languages.getDiagnostics();
        diagnostics = allDiags
          .map(([fileUri, diags]) => ({
            uri: uriToDisplayPath(fileUri),
            diagnostics: diags.filter(d => severitySet.has(d.severity)).map(serializeDiagnostic),
          }))
          .filter(entry => entry.diagnostics.length > 0);
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(diagnostics, null, 2) }],
      };
    },
  );

  server.tool(
    'get_editor_state',
    'Get the active editor state including cursor position, selections, and document info.',
    {},
    async () => {
      const state = getActiveEditorState();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(state, null, 2) }],
      };
    },
  );
}
