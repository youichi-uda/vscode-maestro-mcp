import * as vscode from 'vscode';
import { serializeRange, serializeLocation, type SerializedRange, type SerializedLocation } from './position';

export interface SerializedDocumentSymbol {
  name: string;
  detail: string;
  kind: string;
  range: SerializedRange;
  selectionRange: SerializedRange;
  children: SerializedDocumentSymbol[];
}

export interface SerializedSymbolInformation {
  name: string;
  kind: string;
  location: SerializedLocation;
  containerName?: string;
}

export interface SerializedCallHierarchyItem {
  name: string;
  kind: string;
  detail?: string;
  uri: string;
  range: SerializedRange;
  selectionRange: SerializedRange;
}

const SYMBOL_KINDS: Record<number, string> = {
  [vscode.SymbolKind.File]: 'File',
  [vscode.SymbolKind.Module]: 'Module',
  [vscode.SymbolKind.Namespace]: 'Namespace',
  [vscode.SymbolKind.Package]: 'Package',
  [vscode.SymbolKind.Class]: 'Class',
  [vscode.SymbolKind.Method]: 'Method',
  [vscode.SymbolKind.Property]: 'Property',
  [vscode.SymbolKind.Field]: 'Field',
  [vscode.SymbolKind.Constructor]: 'Constructor',
  [vscode.SymbolKind.Enum]: 'Enum',
  [vscode.SymbolKind.Interface]: 'Interface',
  [vscode.SymbolKind.Function]: 'Function',
  [vscode.SymbolKind.Variable]: 'Variable',
  [vscode.SymbolKind.Constant]: 'Constant',
  [vscode.SymbolKind.String]: 'String',
  [vscode.SymbolKind.Number]: 'Number',
  [vscode.SymbolKind.Boolean]: 'Boolean',
  [vscode.SymbolKind.Array]: 'Array',
  [vscode.SymbolKind.Object]: 'Object',
  [vscode.SymbolKind.Key]: 'Key',
  [vscode.SymbolKind.Null]: 'Null',
  [vscode.SymbolKind.EnumMember]: 'EnumMember',
  [vscode.SymbolKind.Struct]: 'Struct',
  [vscode.SymbolKind.Event]: 'Event',
  [vscode.SymbolKind.Operator]: 'Operator',
  [vscode.SymbolKind.TypeParameter]: 'TypeParameter',
};

export function symbolKindToString(kind: vscode.SymbolKind): string {
  return SYMBOL_KINDS[kind] ?? `Unknown(${kind})`;
}

export function serializeDocumentSymbol(sym: vscode.DocumentSymbol): SerializedDocumentSymbol {
  return {
    name: sym.name,
    detail: sym.detail,
    kind: symbolKindToString(sym.kind),
    range: serializeRange(sym.range),
    selectionRange: serializeRange(sym.selectionRange),
    children: sym.children.map(serializeDocumentSymbol),
  };
}

export function serializeSymbolInformation(sym: vscode.SymbolInformation): SerializedSymbolInformation {
  return {
    name: sym.name,
    kind: symbolKindToString(sym.kind),
    location: serializeLocation(sym.location),
    containerName: sym.containerName,
  };
}

export function serializeCallHierarchyItem(item: vscode.CallHierarchyItem): SerializedCallHierarchyItem {
  return {
    name: item.name,
    kind: symbolKindToString(item.kind),
    detail: item.detail,
    uri: item.uri.toString(),
    range: serializeRange(item.range),
    selectionRange: serializeRange(item.selectionRange),
  };
}
