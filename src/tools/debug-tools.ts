import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';
import { z } from 'zod';
import { resolveFileUri, uriToDisplayPath } from '../utils/uri-helpers';

// Helper: get active debug session or return error
function requireSession(): { session: vscode.DebugSession } | { error: string } {
  const session = vscode.debug.activeDebugSession;
  if (!session) return { error: 'No active debug session.' };
  return { session };
}

// Helper: send DAP request to active session
async function dapRequest(command: string, args?: any): Promise<any> {
  const result = requireSession();
  if ('error' in result) throw new Error(result.error);
  return result.session.customRequest(command, args);
}

export function registerDebugTools(server: McpServer): void {

  // ── Session management ──

  server.tool(
    'list_debug_sessions',
    'List all active debug sessions.',
    {},
    async () => {
      const active = vscode.debug.activeDebugSession;
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          activeSession: active ? {
            id: active.id,
            name: active.name,
            type: active.type,
          } : null,
          breakpointCount: vscode.debug.breakpoints.length,
        }, null, 2) }],
      };
    },
  );

  server.tool(
    'start_debug_session',
    'Start a debug session using a launch configuration name or inline config.',
    {
      name: z.string().optional().describe('Name of launch configuration from launch.json'),
      type: z.string().optional().describe('Debug type (e.g. "node", "python", "extensionHost")'),
      request: z.enum(['launch', 'attach']).default('launch').describe('Request type'),
      program: z.string().optional().describe('Program to debug (path to file)'),
      args: z.array(z.string()).optional().describe('Program arguments'),
      cwd: z.string().optional().describe('Working directory'),
      env: z.record(z.string()).optional().describe('Environment variables'),
      noDebug: z.boolean().default(false).describe('Run without debugging'),
    },
    async ({ name, type, request, program, args, cwd, env, noDebug }) => {
      let config: vscode.DebugConfiguration | string;

      if (name && !type) {
        config = name;
      } else {
        config = {
          name: name ?? 'MCP Debug',
          type: type ?? 'node',
          request,
          ...(program ? { program } : {}),
          ...(args ? { args } : {}),
          ...(cwd ? { cwd } : {}),
          ...(env ? { env } : {}),
        };
      }

      const folder = vscode.workspace.workspaceFolders?.[0];
      const started = await vscode.debug.startDebugging(folder, config, { noDebug });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          started,
          session: vscode.debug.activeDebugSession ? {
            id: vscode.debug.activeDebugSession.id,
            name: vscode.debug.activeDebugSession.name,
            type: vscode.debug.activeDebugSession.type,
          } : null,
        }, null, 2) }],
      };
    },
  );

  server.tool(
    'stop_debug_session',
    'Stop a debug session. Stops the active session if no name is specified.',
    {
      name: z.string().optional().describe('Name of the debug session to stop'),
    },
    async ({ name }) => {
      const session = name
        ? (vscode.debug.activeDebugSession?.name === name ? vscode.debug.activeDebugSession : undefined)
        : vscode.debug.activeDebugSession;

      if (!session) {
        return {
          content: [{ type: 'text' as const, text: name ? `No debug session found with name "${name}".` : 'No active debug session.' }],
          isError: true,
        };
      }

      await vscode.debug.stopDebugging(session);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ stopped: session.name }) }] };
    },
  );

  server.tool(
    'restart_debug_session',
    'Restart the active debug session.',
    {},
    async () => {
      const session = vscode.debug.activeDebugSession;
      if (!session) {
        return { content: [{ type: 'text' as const, text: 'No active debug session to restart.' }], isError: true };
      }
      await vscode.commands.executeCommand('workbench.action.debug.restart');
      return { content: [{ type: 'text' as const, text: JSON.stringify({ restarted: session.name }) }] };
    },
  );

  // ── Execution control ──

  server.tool(
    'debug_step',
    'Control debug execution: continue, pause, step over, step into, step out.',
    {
      action: z.enum(['continue', 'pause', 'next', 'stepIn', 'stepOut']).describe('Step action'),
      threadId: z.number().optional().describe('Thread ID (uses first thread if omitted)'),
    },
    async ({ action, threadId }) => {
      const tid = threadId ?? await getFirstThreadId();
      if (tid === undefined) {
        return { content: [{ type: 'text' as const, text: 'No threads available.' }], isError: true };
      }

      await dapRequest(action, { threadId: tid });
      return { content: [{ type: 'text' as const, text: JSON.stringify({ action, threadId: tid }) }] };
    },
  );

  // ── Threads ──

  server.tool(
    'get_threads',
    'Get all threads in the current debug session.',
    {},
    async () => {
      const response = await dapRequest('threads');
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(response.threads, null, 2) }],
      };
    },
  );

  // ── Call stack ──

  server.tool(
    'get_call_stack',
    'Get the call stack (stack frames) for a thread.',
    {
      threadId: z.number().optional().describe('Thread ID (uses first thread if omitted)'),
      startFrame: z.number().default(0).describe('Start frame index'),
      levels: z.number().default(20).describe('Number of frames to retrieve'),
    },
    async ({ threadId, startFrame, levels }) => {
      const tid = threadId ?? await getFirstThreadId();
      if (tid === undefined) {
        return { content: [{ type: 'text' as const, text: 'No threads available.' }], isError: true };
      }

      const response = await dapRequest('stackTrace', {
        threadId: tid,
        startFrame,
        levels,
      });

      const frames = (response.stackFrames ?? []).map((f: any) => ({
        id: f.id,
        name: f.name,
        source: f.source?.path ?? f.source?.name ?? '(unknown)',
        line: f.line,
        column: f.column,
        endLine: f.endLine,
        endColumn: f.endColumn,
      }));

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          threadId: tid,
          totalFrames: response.totalFrames,
          frames,
        }, null, 2) }],
      };
    },
  );

  // ── Variables ──

  server.tool(
    'get_variables',
    'Get variables for a scope in a stack frame. First call get_call_stack to get frame IDs.',
    {
      frameId: z.number().optional().describe('Stack frame ID. If omitted, uses topmost frame of first thread.'),
      scope: z.enum(['locals', 'globals', 'closure', 'all']).default('locals').describe('Which scope to retrieve'),
      variablesReference: z.number().optional().describe('Expand a specific variable by its variablesReference (for nested objects/arrays)'),
      maxDepth: z.number().default(1).describe('How many levels deep to expand objects (1 = top-level only)'),
    },
    async ({ frameId, scope, variablesReference, maxDepth }) => {
      // If expanding a specific variable
      if (variablesReference !== undefined) {
        const vars = await expandVariables(variablesReference, maxDepth);
        return { content: [{ type: 'text' as const, text: JSON.stringify(vars, null, 2) }] };
      }

      // Get scopes for the frame
      const fid = frameId ?? await getTopmostFrameId();
      if (fid === undefined) {
        return { content: [{ type: 'text' as const, text: 'No stack frames available.' }], isError: true };
      }

      const scopeResponse = await dapRequest('scopes', { frameId: fid });
      const scopes = scopeResponse.scopes as Array<{ name: string; variablesReference: number; expensive: boolean }>;

      const targetScopes = scope === 'all'
        ? scopes
        : scopes.filter(s => {
          const name = s.name.toLowerCase();
          if (scope === 'locals') return name.includes('local');
          if (scope === 'globals') return name.includes('global');
          if (scope === 'closure') return name.includes('closure');
          return true;
        });

      const result: any[] = [];
      for (const s of targetScopes) {
        const vars = await expandVariables(s.variablesReference, maxDepth);
        result.push({ scope: s.name, variables: vars });
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // ── Evaluate ──

  server.tool(
    'evaluate_expression',
    'Evaluate an expression in the debug console.',
    {
      expression: z.string().describe('Expression to evaluate'),
      frameId: z.number().optional().describe('Stack frame context for evaluation'),
      context: z.enum(['watch', 'repl', 'hover', 'clipboard']).default('repl').describe('Evaluation context'),
    },
    async ({ expression, frameId, context }) => {
      const fid = frameId ?? await getTopmostFrameId();
      const args: any = { expression, context };
      if (fid !== undefined) args.frameId = fid;

      const response = await dapRequest('evaluate', args);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          result: response.result,
          type: response.type,
          variablesReference: response.variablesReference > 0 ? response.variablesReference : undefined,
        }, null, 2) }],
      };
    },
  );

  // ── Breakpoints ──

  server.tool(
    'manage_breakpoints',
    'List, add, or remove breakpoints.',
    {
      action: z.enum(['list', 'add', 'remove', 'removeAll', 'toggle']).default('list').describe('Breakpoint action'),
      uri: z.string().optional().describe('File path (for add/remove)'),
      line: z.number().optional().describe('Line number, 1-based (for add/remove)'),
      condition: z.string().optional().describe('Breakpoint condition expression (for add)'),
      hitCondition: z.string().optional().describe('Hit count condition (for add)'),
      logMessage: z.string().optional().describe('Log message instead of breaking (logpoint, for add)'),
    },
    async ({ action, uri, line, condition, hitCondition, logMessage }) => {
      switch (action) {
        case 'list': {
          const bps = vscode.debug.breakpoints.map(bp => {
            if (bp instanceof vscode.SourceBreakpoint) {
              return {
                type: 'source',
                file: uriToDisplayPath(bp.location.uri),
                line: bp.location.range.start.line + 1,
                enabled: bp.enabled,
                condition: bp.condition,
                hitCondition: bp.hitCondition,
                logMessage: bp.logMessage,
              };
            } else if (bp instanceof vscode.FunctionBreakpoint) {
              return {
                type: 'function',
                functionName: bp.functionName,
                enabled: bp.enabled,
                condition: bp.condition,
              };
            }
            return { type: 'unknown', enabled: bp.enabled };
          });

          return { content: [{ type: 'text' as const, text: JSON.stringify(bps, null, 2) }] };
        }

        case 'add': {
          if (!uri || line === undefined) {
            return { content: [{ type: 'text' as const, text: 'uri and line required for add.' }], isError: true };
          }
          const fileUri = resolveFileUri(uri);
          const location = new vscode.Location(fileUri, new vscode.Position(line - 1, 0));
          const bp = new vscode.SourceBreakpoint(location, true, condition, hitCondition, logMessage);
          vscode.debug.addBreakpoints([bp]);
          return { content: [{ type: 'text' as const, text: JSON.stringify({
            added: { file: uriToDisplayPath(fileUri), line },
          }) }] };
        }

        case 'remove': {
          if (!uri || line === undefined) {
            return { content: [{ type: 'text' as const, text: 'uri and line required for remove.' }], isError: true };
          }
          const fileUri = resolveFileUri(uri);
          const toRemove = vscode.debug.breakpoints.filter(bp => {
            if (bp instanceof vscode.SourceBreakpoint) {
              return bp.location.uri.toString() === fileUri.toString() &&
                     bp.location.range.start.line === line - 1;
            }
            return false;
          });
          if (toRemove.length > 0) {
            vscode.debug.removeBreakpoints(toRemove);
          }
          return { content: [{ type: 'text' as const, text: JSON.stringify({ removed: toRemove.length }) }] };
        }

        case 'removeAll': {
          const all = [...vscode.debug.breakpoints];
          vscode.debug.removeBreakpoints(all);
          return { content: [{ type: 'text' as const, text: JSON.stringify({ removed: all.length }) }] };
        }

        case 'toggle': {
          if (!uri || line === undefined) {
            return { content: [{ type: 'text' as const, text: 'uri and line required for toggle.' }], isError: true };
          }
          const fileUri = resolveFileUri(uri);
          const existing = vscode.debug.breakpoints.find(bp =>
            bp instanceof vscode.SourceBreakpoint &&
            bp.location.uri.toString() === fileUri.toString() &&
            bp.location.range.start.line === line - 1,
          );
          if (existing) {
            vscode.debug.removeBreakpoints([existing]);
            return { content: [{ type: 'text' as const, text: JSON.stringify({ toggled: 'removed' }) }] };
          } else {
            const location = new vscode.Location(fileUri, new vscode.Position(line - 1, 0));
            vscode.debug.addBreakpoints([new vscode.SourceBreakpoint(location)]);
            return { content: [{ type: 'text' as const, text: JSON.stringify({ toggled: 'added' }) }] };
          }
        }
      }
    },
  );

  // ── Watch expressions ──

  server.tool(
    'debug_watch',
    'Evaluate multiple watch expressions at once in the current debug context.',
    {
      expressions: z.array(z.string()).describe('List of expressions to evaluate'),
      frameId: z.number().optional().describe('Stack frame context'),
    },
    async ({ expressions, frameId }) => {
      const fid = frameId ?? await getTopmostFrameId();
      const results: Array<{ expression: string; value: string; type?: string }> = [];

      for (const expr of expressions) {
        try {
          const args: any = { expression: expr, context: 'watch' };
          if (fid !== undefined) args.frameId = fid;
          const response = await dapRequest('evaluate', args);
          results.push({
            expression: expr,
            value: response.result,
            type: response.type,
          });
        } catch (err: any) {
          results.push({
            expression: expr,
            value: `<error: ${err.message ?? err}>`,
          });
        }
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
      };
    },
  );

  // ── Set variable ──

  server.tool(
    'set_variable',
    'Set a variable value during debugging.',
    {
      variablesReference: z.number().describe('The variablesReference of the container (scope or object)'),
      name: z.string().describe('Variable name'),
      value: z.string().describe('New value as string'),
    },
    async ({ variablesReference, name, value }) => {
      const response = await dapRequest('setVariable', { variablesReference, name, value });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          name,
          newValue: response.value,
          type: response.type,
        }, null, 2) }],
      };
    },
  );

  // ── Exception breakpoints ──

  server.tool(
    'set_exception_breakpoints',
    'Configure exception breakpoint behavior.',
    {
      filters: z.array(z.string()).describe('Exception filter IDs (e.g. ["uncaught", "caught"] for Node.js)'),
    },
    async ({ filters }) => {
      await dapRequest('setExceptionBreakpoints', { filters });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ filters }) }],
      };
    },
  );
}

// ── DAP helpers ──

async function getFirstThreadId(): Promise<number | undefined> {
  try {
    const response = await dapRequest('threads');
    return response.threads?.[0]?.id;
  } catch {
    return undefined;
  }
}

async function getTopmostFrameId(): Promise<number | undefined> {
  const tid = await getFirstThreadId();
  if (tid === undefined) return undefined;
  try {
    const response = await dapRequest('stackTrace', { threadId: tid, startFrame: 0, levels: 1 });
    return response.stackFrames?.[0]?.id;
  } catch {
    return undefined;
  }
}

async function expandVariables(variablesReference: number, depth: number): Promise<any[]> {
  const response = await dapRequest('variables', { variablesReference });
  const vars = (response.variables ?? []).map((v: any) => {
    const entry: any = {
      name: v.name,
      value: v.value,
      type: v.type,
    };
    if (v.variablesReference > 0) {
      entry.variablesReference = v.variablesReference;
      entry.hasChildren = true;
    }
    return entry;
  });

  // Recursively expand if depth > 1
  if (depth > 1) {
    for (const v of vars) {
      if (v.hasChildren && v.variablesReference) {
        v.children = await expandVariables(v.variablesReference, depth - 1);
      }
    }
  }

  return vars;
}
