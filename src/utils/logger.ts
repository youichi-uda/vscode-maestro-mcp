import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function getLogger(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('Maestro MCP');
  }
  return channel;
}

export function log(message: string): void {
  getLogger().appendLine(`[${new Date().toISOString()}] ${message}`);
}

export function logError(message: string, error?: unknown): void {
  const detail = error instanceof Error ? `: ${error.message}` : '';
  getLogger().appendLine(`[${new Date().toISOString()}] ERROR: ${message}${detail}`);
}
