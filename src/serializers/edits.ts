import * as vscode from 'vscode';
import { serializeRange, type SerializedRange } from './position';

export interface SerializedTextEdit {
  range: SerializedRange;
  newText: string;
}

export interface SerializedWorkspaceEdit {
  entries: Array<{
    uri: string;
    edits: SerializedTextEdit[];
  }>;
}

export function serializeTextEdit(edit: vscode.TextEdit): SerializedTextEdit {
  return {
    range: serializeRange(edit.range),
    newText: edit.newText,
  };
}

export function serializeWorkspaceEdit(edit: vscode.WorkspaceEdit): SerializedWorkspaceEdit {
  const entries: SerializedWorkspaceEdit['entries'] = [];
  for (const [uri, edits] of edit.entries()) {
    const textEdits = edits
      .filter((e): e is vscode.TextEdit => 'range' in e && 'newText' in e)
      .map(serializeTextEdit);
    if (textEdits.length > 0) {
      entries.push({ uri: uri.toString(), edits: textEdits });
    }
  }
  return { entries };
}
