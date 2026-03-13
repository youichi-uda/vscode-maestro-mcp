import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { log, logError } from './utils/logger';
import { ToolRegistry } from './tool-registry';

// Free-tier tool modules
import { registerFileTools } from './tools/file-tools';
import { registerEditTools } from './tools/edit-tools';
import { registerTerminalTools } from './tools/terminal-tools';
import { registerEditorTools } from './tools/editor-tools';
import { registerDebugTools } from './tools/debug-tools';
import { registerUtilityTools } from './tools/utility-tools';
import { registerGitTools } from './tools/git-tools';
import { registerSelectionTools } from './tools/selection-tools';
import { registerDiffTools } from './tools/diff-tools';
import { registerTaskTools } from './tools/task-tools';
import { registerNotificationTools } from './tools/notification-tools';
import { registerSettingsTools } from './tools/settings-tools';
import { registerRefactorTools } from './tools/refactor-tools';
import { registerSnippetTools } from './tools/snippet-tools';
import { registerTestTools } from './tools/test-tools';
import { registerWebviewTools } from './tools/webview-tools';

// Premium tool modules
import { registerCompletionTools } from './tools/completion-tools';
import { registerHoverTools } from './tools/hover-tools';
import { registerSignatureTools } from './tools/signature-tools';
import { registerCodeActionTools } from './tools/code-action-tools';
import { registerNavigationTools } from './tools/navigation-tools';
import { registerSymbolTools } from './tools/symbol-tools';
import { registerFormattingTools } from './tools/formatting-tools';
import { registerSemanticTools } from './tools/semantic-tools';
import { registerDocumentTools } from './tools/document-tools';

import type http from 'http';

export class MCPServer {
  private app: express.Application;
  private httpServer: http.Server | null = null;
  private mcpServer: McpServer;
  private transports = new Map<string, StreamableHTTPServerTransport>();

  constructor(
    private port: number,
    private host: string,
  ) {
    this.app = express();
    this.app.use(express.json());

    this.mcpServer = new McpServer(
      { name: 'vscode-maestro-mcp', version: '0.2.0' },
      { capabilities: { logging: {}, tools: { listChanged: true } } },
    );

    this.setupTools();
    this.setupRoutes();
  }

  private setupTools(): void {
    const registry = new ToolRegistry(this.mcpServer);

    // ── Always-on: category management ──
    registry.registerMetaTool();

    // ── Free-tier categories (enabled by default) ──

    registry.registerCategory(
      'files',
      'File operations: list, find, search, read, create, copy, move, delete',
      true,
      registerFileTools,
    );

    registry.registerCategory(
      'editing',
      'Text editing: replace lines, insert text, undo',
      true,
      registerEditTools,
    );

    registry.registerCategory(
      'terminal',
      'Terminal: execute commands, read output, list terminals',
      true,
      registerTerminalTools,
    );

    registry.registerCategory(
      'editor',
      'Editor & workspace: focus, workspace info, output channels, VS Code commands',
      true,
      registerEditorTools,
    );

    registry.registerCategory(
      'diagnostics',
      'Diagnostics, document open, and editor state',
      true,
      registerUtilityTools,
    );

    registry.registerCategory(
      'debug',
      'Debug sessions: list, start, stop, restart',
      false,
      registerDebugTools,
    );

    registry.registerCategory(
      'git',
      'Git: status, diff, log, show, blame, commit, branch, checkout, stash',
      false,
      registerGitTools,
    );

    registry.registerCategory(
      'selection',
      'Selection & cursor: get/replace selection, set cursor, select range, clipboard',
      false,
      registerSelectionTools,
    );

    registry.registerCategory(
      'diff',
      'Diff: compare files side by side, get unsaved changes',
      false,
      registerDiffTools,
    );

    registry.registerCategory(
      'tasks',
      'VS Code tasks: list and run configured tasks',
      false,
      registerTaskTools,
    );

    registry.registerCategory(
      'notifications',
      'User interaction: messages, input boxes, quick picks, progress',
      false,
      registerNotificationTools,
    );

    registry.registerCategory(
      'settings',
      'VS Code settings, extensions, and keybindings',
      false,
      registerSettingsTools,
    );

    registry.registerCategory(
      'refactor',
      'Multi-file edits and find & replace across workspace',
      false,
      registerRefactorTools,
    );

    registry.registerCategory(
      'snippets',
      'Snippet insertion and surround-with-snippet',
      false,
      registerSnippetTools,
    );

    registry.registerCategory(
      'testing',
      'Test Explorer: list tests, run/debug tests, coverage, view results',
      false,
      registerTestTools,
    );

    registry.registerCategory(
      'tabs-layout',
      'Tabs, editor layout, panels, markdown preview, URL browser',
      false,
      registerWebviewTools,
    );

    // ── Premium categories (disabled by default, require license) ──

    registry.registerCategory(
      'completion',
      'Code completion provider [Premium]',
      false,
      registerCompletionTools,
      true,
    );

    registry.registerCategory(
      'hover',
      'Hover information provider [Premium]',
      false,
      registerHoverTools,
      true,
    );

    registry.registerCategory(
      'signature',
      'Signature help provider [Premium]',
      false,
      registerSignatureTools,
      true,
    );

    registry.registerCategory(
      'code-actions',
      'Code actions and CodeLens providers [Premium]',
      false,
      registerCodeActionTools,
      true,
    );

    registry.registerCategory(
      'navigation',
      'Go to definition, find references, call hierarchy [Premium]',
      false,
      registerNavigationTools,
      true,
    );

    registry.registerCategory(
      'symbols',
      'Document symbols and workspace symbol search [Premium]',
      false,
      registerSymbolTools,
      true,
    );

    registry.registerCategory(
      'formatting',
      'Document formatting and rename [Premium]',
      false,
      registerFormattingTools,
      true,
    );

    registry.registerCategory(
      'semantic',
      'Semantic tokens and inlay hints [Premium]',
      false,
      registerSemanticTools,
      true,
    );

    registry.registerCategory(
      'document-features',
      'Document links, colors, and folding ranges [Premium]',
      false,
      registerDocumentTools,
      true,
    );
  }

  private setupRoutes(): void {
    // POST /mcp — client-to-server messages
    this.app.post('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && this.transports.has(sessionId)) {
        transport = this.transports.get(sessionId)!;
      } else if (!sessionId) {
        // New session — create transport with session ID generator
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => `session-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          onsessioninitialized: (id) => {
            this.transports.set(id, transport);
            log(`[MCPServer] Session created: ${id}`);
          },
        });
        transport.onclose = () => {
          const id = [...this.transports.entries()].find(([, t]) => t === transport)?.[0];
          if (id) {
            this.transports.delete(id);
            log(`[MCPServer] Session closed: ${id}`);
          }
        };
        await this.mcpServer.connect(transport);
      } else {
        res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Invalid session' }, id: null });
        return;
      }

      try {
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        logError('Error handling POST /mcp', error);
        if (!res.headersSent) {
          res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
        }
      }
    });

    // GET /mcp — SSE stream for server-to-client notifications
    this.app.get('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (sessionId && this.transports.has(sessionId)) {
        const transport = this.transports.get(sessionId)!;
        try {
          await transport.handleRequest(req, res);
        } catch (error) {
          logError('Error handling GET /mcp (SSE)', error);
          if (!res.headersSent) {
            res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
          }
        }
      } else {
        res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'No valid session' }, id: null });
      }
    });

    // DELETE /mcp — close session
    this.app.delete('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (sessionId && this.transports.has(sessionId)) {
        const transport = this.transports.get(sessionId)!;
        try {
          await transport.handleRequest(req, res);
        } catch { /* ignore */ }
        this.transports.delete(sessionId);
        log(`[MCPServer] Session deleted: ${sessionId}`);
      } else {
        res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'No valid session' }, id: null });
      }
    });

    this.app.options('/mcp', (_req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id');
      res.status(204).end();
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = this.app.listen(this.port, this.host, () => {
        log(`MCP server started on http://${this.host}:${this.port}/mcp (session mode)`);
        resolve();
      });
      this.httpServer.on('error', (err) => {
        logError('Server error', err);
        reject(err);
      });
    });
  }

  async stop(): Promise<void> {
    for (const [id, transport] of this.transports) {
      try { await transport.close(); } catch { /* ignore */ }
      this.transports.delete(id);
    }
    try { await this.mcpServer.close(); } catch { /* ignore */ }

    return new Promise((resolve) => {
      if (this.httpServer) {
        this.httpServer.close(() => {
          log('MCP server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
