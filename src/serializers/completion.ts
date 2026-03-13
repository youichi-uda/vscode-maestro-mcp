import * as vscode from 'vscode';
import { serializeRange, type SerializedRange } from './position';

export interface SerializedCompletionItem {
  label: string;
  kind?: string;
  detail?: string;
  documentation?: string;
  insertText?: string;
  sortText?: string;
  filterText?: string;
  range?: SerializedRange;
  preselect?: boolean;
}

const COMPLETION_KINDS: Record<number, string> = {
  [vscode.CompletionItemKind.Text]: 'Text',
  [vscode.CompletionItemKind.Method]: 'Method',
  [vscode.CompletionItemKind.Function]: 'Function',
  [vscode.CompletionItemKind.Constructor]: 'Constructor',
  [vscode.CompletionItemKind.Field]: 'Field',
  [vscode.CompletionItemKind.Variable]: 'Variable',
  [vscode.CompletionItemKind.Class]: 'Class',
  [vscode.CompletionItemKind.Interface]: 'Interface',
  [vscode.CompletionItemKind.Module]: 'Module',
  [vscode.CompletionItemKind.Property]: 'Property',
  [vscode.CompletionItemKind.Unit]: 'Unit',
  [vscode.CompletionItemKind.Value]: 'Value',
  [vscode.CompletionItemKind.Enum]: 'Enum',
  [vscode.CompletionItemKind.Keyword]: 'Keyword',
  [vscode.CompletionItemKind.Snippet]: 'Snippet',
  [vscode.CompletionItemKind.Color]: 'Color',
  [vscode.CompletionItemKind.File]: 'File',
  [vscode.CompletionItemKind.Reference]: 'Reference',
  [vscode.CompletionItemKind.Folder]: 'Folder',
  [vscode.CompletionItemKind.EnumMember]: 'EnumMember',
  [vscode.CompletionItemKind.Constant]: 'Constant',
  [vscode.CompletionItemKind.Struct]: 'Struct',
  [vscode.CompletionItemKind.Event]: 'Event',
  [vscode.CompletionItemKind.Operator]: 'Operator',
  [vscode.CompletionItemKind.TypeParameter]: 'TypeParameter',
};

export function serializeCompletionItem(item: vscode.CompletionItem): SerializedCompletionItem {
  const label = typeof item.label === 'string' ? item.label : item.label.label;
  const doc = item.documentation;
  const documentation = doc
    ? (typeof doc === 'string' ? doc : doc.value)
    : undefined;
  const insertText = item.insertText
    ? (typeof item.insertText === 'string' ? item.insertText : item.insertText.value)
    : undefined;

  return {
    label,
    kind: item.kind !== undefined ? (COMPLETION_KINDS[item.kind] ?? `Unknown(${item.kind})`) : undefined,
    detail: item.detail,
    documentation,
    insertText,
    sortText: item.sortText,
    filterText: item.filterText,
    range: item.range && 'start' in item.range ? serializeRange(item.range as vscode.Range) : undefined,
    preselect: item.preselect,
  };
}
