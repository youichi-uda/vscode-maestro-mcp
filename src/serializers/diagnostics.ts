import * as vscode from 'vscode';
import { serializeRange, type SerializedRange } from './position';

export interface SerializedDiagnostic {
  range: SerializedRange;
  message: string;
  severity: string;
  source?: string;
  code?: string | number;
}

export interface SerializedCodeAction {
  title: string;
  kind?: string;
  isPreferred?: boolean;
  diagnostics?: SerializedDiagnostic[];
}

const SEVERITY_NAMES: Record<number, string> = {
  [vscode.DiagnosticSeverity.Error]: 'Error',
  [vscode.DiagnosticSeverity.Warning]: 'Warning',
  [vscode.DiagnosticSeverity.Information]: 'Information',
  [vscode.DiagnosticSeverity.Hint]: 'Hint',
};

export function serializeDiagnostic(diag: vscode.Diagnostic): SerializedDiagnostic {
  return {
    range: serializeRange(diag.range),
    message: diag.message,
    severity: SEVERITY_NAMES[diag.severity] ?? `Unknown(${diag.severity})`,
    source: diag.source,
    code: typeof diag.code === 'object' ? diag.code.value : diag.code,
  };
}

export function serializeCodeAction(action: vscode.CodeAction): SerializedCodeAction {
  return {
    title: action.title,
    kind: action.kind?.value,
    isPreferred: action.isPreferred,
    diagnostics: action.diagnostics?.map(serializeDiagnostic),
  };
}
