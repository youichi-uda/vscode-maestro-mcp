import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';
import { z } from 'zod';

export function registerWebviewTools(server: McpServer): void {
  server.tool(
    'list_tabs',
    'List all open editor tabs and tab groups.',
    {},
    async () => {
      const tabGroups = vscode.window.tabGroups.all.map(group => ({
        groupIndex: group.viewColumn,
        isActive: group.isActive,
        tabs: group.tabs.map(tab => ({
          label: tab.label,
          isActive: tab.isActive,
          isDirty: tab.isDirty,
          isPinned: tab.isPinned,
          isPreview: tab.isPreview,
          kind: getTabKind(tab),
        })),
      }));

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(tabGroups, null, 2) }],
      };
    },
  );

  server.tool(
    'close_tab',
    'Close editor tabs by label or close all in a group.',
    {
      label: z.string().optional().describe('Tab label to close (partial match)'),
      closeAll: z.boolean().default(false).describe('Close all tabs'),
      closeSaved: z.boolean().default(false).describe('Close only saved (non-dirty) tabs'),
    },
    async ({ label, closeAll, closeSaved }) => {
      if (closeAll) {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        return { content: [{ type: 'text' as const, text: 'All tabs closed.' }] };
      }

      if (closeSaved) {
        await vscode.commands.executeCommand('workbench.action.closeUnmodifiedEditors');
        return { content: [{ type: 'text' as const, text: 'Saved tabs closed.' }] };
      }

      if (label) {
        let closed = 0;
        for (const group of vscode.window.tabGroups.all) {
          for (const tab of group.tabs) {
            if (tab.label.toLowerCase().includes(label.toLowerCase())) {
              await vscode.window.tabGroups.close(tab);
              closed++;
            }
          }
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ closed }) }] };
      }

      return { content: [{ type: 'text' as const, text: 'Specify label, closeAll, or closeSaved.' }], isError: true };
    },
  );

  server.tool(
    'manage_editor_layout',
    'Split editor or change layout.',
    {
      action: z.enum([
        'splitRight', 'splitDown', 'splitLeft', 'splitUp',
        'singleColumn', 'twoColumns', 'threeColumns',
        'twoRows', 'grid',
        'focusFirst', 'focusSecond', 'focusThird',
        'closeGroup',
      ]).describe('Layout action'),
    },
    async ({ action }) => {
      const commands: Record<string, string> = {
        splitRight: 'workbench.action.splitEditorRight',
        splitDown: 'workbench.action.splitEditorDown',
        splitLeft: 'workbench.action.splitEditorLeft',
        splitUp: 'workbench.action.splitEditorUp',
        singleColumn: 'workbench.action.editorLayoutSingle',
        twoColumns: 'workbench.action.editorLayoutTwoColumns',
        threeColumns: 'workbench.action.editorLayoutThreeColumns',
        twoRows: 'workbench.action.editorLayoutTwoRows',
        grid: 'workbench.action.editorLayoutTwoByTwoGrid',
        focusFirst: 'workbench.action.focusFirstEditorGroup',
        focusSecond: 'workbench.action.focusSecondEditorGroup',
        focusThird: 'workbench.action.focusThirdEditorGroup',
        closeGroup: 'workbench.action.closeEditorsInGroup',
      };

      await vscode.commands.executeCommand(commands[action]);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ action, done: true }) }] };
    },
  );

  server.tool(
    'preview_markdown',
    'Open a markdown file in the VS Code preview pane.',
    {
      uri: z.string().describe('Markdown file path or URI'),
      side: z.boolean().default(true).describe('Open preview to the side'),
    },
    async ({ uri, side }) => {
      const fileUri = vscode.Uri.file(uri);
      const command = side
        ? 'markdown.showPreviewToSide'
        : 'markdown.showPreview';
      await vscode.commands.executeCommand(command, fileUri);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ previewing: uri }) }] };
    },
  );

  server.tool(
    'open_url',
    'Open a URL in the VS Code Simple Browser or external browser.',
    {
      url: z.string().describe('URL to open'),
      external: z.boolean().default(false).describe('Open in external browser instead of VS Code'),
    },
    async ({ url, external }) => {
      const uri = vscode.Uri.parse(url);
      if (external) {
        await vscode.env.openExternal(uri);
      } else {
        await vscode.commands.executeCommand('simpleBrowser.show', url);
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ opened: url, external }) }] };
    },
  );

  server.tool(
    'manage_panels',
    'Show or hide VS Code panels and views.',
    {
      panel: z.enum([
        'terminal', 'output', 'problems', 'debugConsole',
        'explorer', 'search', 'scm', 'extensions', 'testing',
      ]).describe('Panel to show'),
    },
    async ({ panel }) => {
      const commands: Record<string, string> = {
        terminal: 'workbench.action.terminal.toggleTerminal',
        output: 'workbench.action.output.toggleOutput',
        problems: 'workbench.actions.view.problems',
        debugConsole: 'workbench.debug.action.toggleRepl',
        explorer: 'workbench.view.explorer',
        search: 'workbench.view.search',
        scm: 'workbench.view.scm',
        extensions: 'workbench.view.extensions',
        testing: 'workbench.view.testing',
      };

      await vscode.commands.executeCommand(commands[panel]);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ shown: panel }) }] };
    },
  );
}

function getTabKind(tab: vscode.Tab): string {
  const input = tab.input;
  if (input instanceof vscode.TabInputText) return 'text';
  if (input instanceof vscode.TabInputTextDiff) return 'diff';
  if (input instanceof vscode.TabInputNotebook) return 'notebook';
  if (input instanceof vscode.TabInputNotebookDiff) return 'notebookDiff';
  if (input instanceof vscode.TabInputWebview) return 'webview';
  if (input instanceof vscode.TabInputTerminal) return 'terminal';
  if (input instanceof vscode.TabInputCustom) return 'custom';
  return 'unknown';
}
