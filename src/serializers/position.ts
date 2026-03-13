import * as vscode from 'vscode';

export interface SerializedPosition {
  line: number;
  character: number;
}

export interface SerializedRange {
  start: SerializedPosition;
  end: SerializedPosition;
}

export interface SerializedLocation {
  uri: string;
  range: SerializedRange;
}

export interface SerializedLocationLink {
  originSelectionRange?: SerializedRange;
  targetUri: string;
  targetRange: SerializedRange;
  targetSelectionRange: SerializedRange;
}

export function serializePosition(pos: vscode.Position): SerializedPosition {
  return { line: pos.line, character: pos.character };
}

export function serializeRange(range: vscode.Range): SerializedRange {
  return {
    start: serializePosition(range.start),
    end: serializePosition(range.end),
  };
}

export function serializeLocation(loc: vscode.Location): SerializedLocation {
  return {
    uri: loc.uri.toString(),
    range: serializeRange(loc.range),
  };
}

export function serializeLocationLink(link: vscode.LocationLink): SerializedLocationLink {
  return {
    originSelectionRange: link.originSelectionRange ? serializeRange(link.originSelectionRange) : undefined,
    targetUri: link.targetUri.toString(),
    targetRange: serializeRange(link.targetRange),
    targetSelectionRange: serializeRange(link.targetSelectionRange),
  };
}
