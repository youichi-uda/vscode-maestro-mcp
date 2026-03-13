import * as vscode from 'vscode';
import { resolveFileUri } from './uri-helpers';

export async function ensureDocumentOpen(pathOrUri: string): Promise<vscode.TextDocument> {
  const uri = resolveFileUri(pathOrUri);

  // Check if already visible in an editor
  const visibleEditor = vscode.window.visibleTextEditors.find(
    e => e.document.uri.fsPath === uri.fsPath
  );
  if (visibleEditor) return visibleEditor.document;

  // Open and show in editor — many language servers only provide
  // hover/definition for documents visible in an editor tab
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, { preserveFocus: true, preview: true });
  return doc;
}

export function getActiveEditorState() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;

  return {
    uri: editor.document.uri.toString(),
    fileName: editor.document.fileName,
    languageId: editor.document.languageId,
    lineCount: editor.document.lineCount,
    cursorPosition: {
      line: editor.selection.active.line,
      character: editor.selection.active.character,
    },
    selections: editor.selections.map(s => ({
      start: { line: s.start.line, character: s.start.character },
      end: { line: s.end.line, character: s.end.character },
      isReversed: s.isReversed,
    })),
  };
}
