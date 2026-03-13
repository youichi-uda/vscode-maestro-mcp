import * as vscode from 'vscode';
import { MCPServer } from './server';
import { log, logError, getLogger } from './utils/logger';
import { initLicense, enterLicenseCommand, licenseStatusCommand, validateLicense, setLicenseKey, clearLicenseKey, setMemoryLicenseValid } from './license';

let server: MCPServer | null = null;
let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  log('Maestro MCP activating...');

  // Initialize license system
  initLicense(context);

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'maestroMcp.toggleServer';
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('maestroMcp.toggleServer', toggleServer),
    vscode.commands.registerCommand('maestroMcp.showInfo', showInfo),
    vscode.commands.registerCommand('maestroMcp.enterLicense', enterLicenseCommand),
    vscode.commands.registerCommand('maestroMcp.licenseStatus', licenseStatusCommand),
  );

  const config = vscode.workspace.getConfiguration('maestroMcp');
  if (config.get<boolean>('autoStart', true)) {
    await startServer();
  } else {
    updateStatusBar(false);
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async e => {
      if (e.affectsConfiguration('maestroMcp')) {
        if (server && (e.affectsConfiguration('maestroMcp.port') || e.affectsConfiguration('maestroMcp.host'))) {
          vscode.window.showInformationMessage('Maestro MCP: Restart the server to apply port/host changes.');
        }

        // License key changed via settings UI
        if (e.affectsConfiguration('maestroMcp.licenseKey')) {
          const key = vscode.workspace.getConfiguration('maestroMcp').get<string>('licenseKey');
          if (key) {
            const status = await validateLicense(key);
            if (status.valid) {
              // Move to SecretStorage and clear from settings (more secure)
              await setLicenseKey(key);
              setMemoryLicenseValid(true);
              await vscode.workspace.getConfiguration('maestroMcp').update('licenseKey', '', vscode.ConfigurationTarget.Global);
              vscode.window.showInformationMessage(`Maestro MCP: License activated! ${status.message}. Key moved to secure storage.`);
            } else {
              vscode.window.showErrorMessage(`Maestro MCP: ${status.message}`);
            }
          } else {
            await clearLicenseKey();
          }
        }
      }
    }),
  );

  log('Maestro MCP activated');
}

export async function deactivate(): Promise<void> {
  await stopServer();
}

async function startServer(): Promise<void> {
  if (server) return;

  const config = vscode.workspace.getConfiguration('maestroMcp');
  const port = config.get<number>('port', 3002);
  const host = config.get<string>('host', '127.0.0.1');

  try {
    server = new MCPServer(port, host);
    await server.start();
    updateStatusBar(true, port);
  } catch (err) {
    logError('Failed to start MCP server', err);
    server = null;
    updateStatusBar(false);
    vscode.window.showErrorMessage(`Maestro MCP: Failed to start on port ${port}`);
  }
}

async function stopServer(): Promise<void> {
  if (!server) return;
  await server.stop();
  server = null;
  updateStatusBar(false);
}

async function toggleServer(): Promise<void> {
  if (server) {
    await stopServer();
    vscode.window.showInformationMessage('Maestro MCP: Server stopped');
  } else {
    await startServer();
    if (server) {
      vscode.window.showInformationMessage('Maestro MCP: Server started');
    }
  }
}

function showInfo(): void {
  if (server) {
    const config = vscode.workspace.getConfiguration('maestroMcp');
    const port = config.get<number>('port', 3002);
    const host = config.get<string>('host', '127.0.0.1');
    vscode.window.showInformationMessage(`Maestro MCP: Running on http://${host}:${port}/mcp`);
  } else {
    vscode.window.showInformationMessage('Maestro MCP: Server is not running');
  }
  getLogger().show();
}

function updateStatusBar(running: boolean, port?: number): void {
  if (running) {
    statusBarItem.text = `$(testing-run-icon) Maestro :${port}`;
    statusBarItem.tooltip = `Maestro MCP — Running on port ${port}. Click to stop.`;
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = '$(testing-unset-icon) Maestro Off';
    statusBarItem.tooltip = 'Maestro MCP — Stopped. Click to start.';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }
  statusBarItem.show();
}
