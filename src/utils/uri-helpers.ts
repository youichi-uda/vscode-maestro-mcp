import * as vscode from 'vscode';

export function resolveFileUri(pathOrUri: string): vscode.Uri {
  if (pathOrUri.startsWith('file://') || pathOrUri.startsWith('untitled:')) {
    return vscode.Uri.parse(pathOrUri);
  }
  // Try as absolute path first
  if (/^[a-zA-Z]:[\\/]/.test(pathOrUri) || pathOrUri.startsWith('/')) {
    return vscode.Uri.file(pathOrUri);
  }
  // Resolve relative to workspace
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return vscode.Uri.joinPath(folders[0].uri, pathOrUri);
  }
  return vscode.Uri.file(pathOrUri);
}

export function uriToDisplayPath(uri: vscode.Uri): string {
  return vscode.workspace.asRelativePath(uri, false);
}
