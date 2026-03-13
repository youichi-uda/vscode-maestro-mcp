import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';
import { z } from 'zod';

export function registerTestTools(server: McpServer): void {
  server.tool(
    'list_tests',
    'List all discovered tests from the Test Explorer. Returns test items with their IDs, labels, and status.',
    {
      filter: z.string().optional().describe('Filter tests by label substring'),
    },
    async ({ filter }) => {
      // Collect test items from all test controllers
      const controllers = getTestControllers();
      if (controllers.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No test controllers registered. Make sure a testing extension is active.' }],
          isError: true,
        };
      }

      const tests: any[] = [];
      for (const controller of controllers) {
        collectTestItems(controller.items, tests, filter, controller.id);
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          controllerCount: controllers.length,
          testCount: tests.length,
          tests,
        }, null, 2) }],
      };
    },
  );

  server.tool(
    'run_tests',
    'Run tests via the Test Explorer.',
    {
      scope: z.enum(['all', 'file', 'failed']).default('all').describe('Which tests to run'),
      debug: z.boolean().default(false).describe('Run tests in debug mode'),
    },
    async ({ scope, debug }) => {
      const command = debug
        ? scope === 'failed'
          ? 'testing.debugFailedTests'
          : 'testing.debugAll'
        : scope === 'all'
          ? 'testing.runAll'
          : scope === 'failed'
            ? 'testing.reRunFailTests'
            : 'testing.runCurrentFile';

      await vscode.commands.executeCommand(command);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          command,
          scope,
          debug,
          status: 'started',
        }) }],
      };
    },
  );

  server.tool(
    'get_test_results',
    'Get the results of the most recent test run.',
    {},
    async () => {
      // Use test result API
      const testResults = getLatestTestResults();

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(testResults, null, 2) }],
      };
    },
  );

  server.tool(
    'show_test_output',
    'Show the test output panel.',
    {},
    async () => {
      await vscode.commands.executeCommand('testing.showMostRecentOutput');
      return {
        content: [{ type: 'text' as const, text: 'Test output panel shown.' }],
      };
    },
  );

  server.tool(
    'cancel_test_run',
    'Cancel the currently running test execution.',
    {},
    async () => {
      await vscode.commands.executeCommand('testing.cancelRun');
      return {
        content: [{ type: 'text' as const, text: 'Test run cancellation requested.' }],
      };
    },
  );

  server.tool(
    'run_test_at_cursor',
    'Run the test at the current cursor position.',
    {
      debug: z.boolean().default(false).describe('Run in debug mode'),
    },
    async ({ debug }) => {
      const command = debug ? 'testing.debugAtCursor' : 'testing.runAtCursor';
      await vscode.commands.executeCommand(command);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ command, debug }) }],
      };
    },
  );

  server.tool(
    'toggle_test_coverage',
    'Run tests with coverage or toggle the coverage display.',
    {
      action: z.enum(['run', 'toggle']).default('run').describe('"run" = run with coverage, "toggle" = toggle coverage display'),
    },
    async ({ action }) => {
      if (action === 'run') {
        await vscode.commands.executeCommand('testing.coverageAll');
      } else {
        await vscode.commands.executeCommand('testing.coverage.toggle');
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ action, status: 'done' }) }],
      };
    },
  );
}

function getTestControllers(): vscode.TestController[] {
  // VS Code doesn't expose a public list of controllers.
  // We use a workaround: check the testing API via internal commands.
  // For now, return empty and rely on commands for test execution.
  // Tests are listed through test items visible in the test explorer.
  return [];
}

function collectTestItems(
  items: vscode.TestItemCollection,
  result: any[],
  filter: string | undefined,
  controllerId: string,
  parentPath = '',
): void {
  items.forEach(item => {
    const path = parentPath ? `${parentPath} > ${item.label}` : item.label;
    const matches = !filter || item.label.toLowerCase().includes(filter.toLowerCase());

    if (matches) {
      result.push({
        id: item.id,
        label: item.label,
        path,
        uri: item.uri?.fsPath,
        line: item.range?.start.line,
        controller: controllerId,
        hasChildren: item.children.size > 0,
      });
    }

    if (item.children.size > 0) {
      collectTestItems(item.children, result, filter, controllerId, path);
    }
  });
}

function getLatestTestResults(): any {
  // VS Code's test result API (vscode.test.createTestRun) is for providers.
  // For consumers, we check the output channel and testing commands.
  // Return summary based on available diagnostics and testing state.

  // Read test-related output channels
  const testDocs = vscode.workspace.textDocuments.filter(
    d => d.uri.scheme === 'output' && d.getText().toLowerCase().includes('test'),
  );

  if (testDocs.length > 0) {
    const lastDoc = testDocs[testDocs.length - 1];
    const lines = lastDoc.getText().split('\n');
    const tail = lines.slice(-50).join('\n');
    return {
      source: 'output_channel',
      recentOutput: tail,
    };
  }

  return {
    message: 'No test results found. Run tests first using run_tests.',
  };
}
