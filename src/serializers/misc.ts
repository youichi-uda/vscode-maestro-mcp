import * as vscode from 'vscode';
import { serializePosition, serializeRange, type SerializedPosition, type SerializedRange } from './position';

export interface SerializedSignatureHelp {
  signatures: Array<{
    label: string;
    documentation?: string;
    parameters: Array<{ label: string | [number, number]; documentation?: string }>;
  }>;
  activeSignature: number;
  activeParameter: number;
}

export interface SerializedCodeLens {
  range: SerializedRange;
  command?: { title: string; command: string };
}

export interface SerializedInlayHint {
  position: SerializedPosition;
  label: string;
  kind?: string;
  paddingLeft?: boolean;
  paddingRight?: boolean;
}

export interface SerializedDocumentLink {
  range: SerializedRange;
  target?: string;
  tooltip?: string;
}

export interface SerializedColorInfo {
  range: SerializedRange;
  color: { red: number; green: number; blue: number; alpha: number };
}

export interface SerializedFoldingRange {
  start: number;
  end: number;
  kind?: string;
}

export function serializeSignatureHelp(help: vscode.SignatureHelp): SerializedSignatureHelp {
  return {
    signatures: help.signatures.map(sig => ({
      label: sig.label,
      documentation: sig.documentation
        ? (typeof sig.documentation === 'string' ? sig.documentation : sig.documentation.value)
        : undefined,
      parameters: (sig.parameters ?? []).map(p => ({
        label: p.label,
        documentation: p.documentation
          ? (typeof p.documentation === 'string' ? p.documentation : p.documentation.value)
          : undefined,
      })),
    })),
    activeSignature: help.activeSignature,
    activeParameter: help.activeParameter,
  };
}

export function serializeCodeLens(lens: vscode.CodeLens): SerializedCodeLens {
  return {
    range: serializeRange(lens.range),
    command: lens.command ? { title: lens.command.title, command: lens.command.command } : undefined,
  };
}

export function serializeInlayHint(hint: vscode.InlayHint): SerializedInlayHint {
  const label = typeof hint.label === 'string'
    ? hint.label
    : hint.label.map(p => p.value).join('');

  const INLAY_KINDS: Record<number, string> = {
    [vscode.InlayHintKind.Type]: 'Type',
    [vscode.InlayHintKind.Parameter]: 'Parameter',
  };

  return {
    position: serializePosition(hint.position),
    label,
    kind: hint.kind !== undefined ? (INLAY_KINDS[hint.kind] ?? `Unknown(${hint.kind})`) : undefined,
    paddingLeft: hint.paddingLeft,
    paddingRight: hint.paddingRight,
  };
}

export function serializeDocumentLink(link: vscode.DocumentLink): SerializedDocumentLink {
  return {
    range: serializeRange(link.range),
    target: link.target?.toString(),
    tooltip: link.tooltip,
  };
}

export function serializeColorInfo(color: vscode.ColorInformation): SerializedColorInfo {
  return {
    range: serializeRange(color.range),
    color: {
      red: color.color.red,
      green: color.color.green,
      blue: color.color.blue,
      alpha: color.color.alpha,
    },
  };
}

export function serializeFoldingRange(range: vscode.FoldingRange): SerializedFoldingRange {
  const KINDS: Record<number, string> = {
    [vscode.FoldingRangeKind.Comment]: 'Comment',
    [vscode.FoldingRangeKind.Imports]: 'Imports',
    [vscode.FoldingRangeKind.Region]: 'Region',
  };
  return {
    start: range.start,
    end: range.end,
    kind: range.kind !== undefined ? KINDS[range.kind] : undefined,
  };
}
