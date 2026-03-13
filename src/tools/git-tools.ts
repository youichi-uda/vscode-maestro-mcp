import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';
import { z } from 'zod';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

function getWorkspaceCwd(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function git(args: string[], cwd?: string): Promise<string> {
  const workDir = cwd ?? getWorkspaceCwd();
  if (!workDir) throw new Error('No workspace folder open.');
  const { stdout } = await execFileAsync('git', args, { cwd: workDir, maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

export function registerGitTools(server: McpServer): void {
  server.tool(
    'git_status',
    'Get git status of the workspace. Returns staged, unstaged, and untracked files.',
    {
      short: z.boolean().default(false).describe('Use short format'),
    },
    async ({ short }) => {
      const args = ['status'];
      if (short) args.push('--short');
      const result = await git(args);
      return { content: [{ type: 'text' as const, text: result }] };
    },
  );

  server.tool(
    'git_diff',
    'Show git diff. Can compare staged, unstaged, or between commits/branches.',
    {
      staged: z.boolean().default(false).describe('Show staged changes (--cached)'),
      ref: z.string().optional().describe('Commit, branch, or range (e.g. "HEAD~3", "main..feature")'),
      path: z.string().optional().describe('Limit diff to specific file or directory'),
      stat: z.boolean().default(false).describe('Show diffstat summary only'),
      contextLines: z.number().optional().describe('Number of context lines (default 3)'),
    },
    async ({ staged, ref, path, stat, contextLines }) => {
      const args = ['diff'];
      if (staged) args.push('--cached');
      if (stat) args.push('--stat');
      if (contextLines !== undefined) args.push(`-U${contextLines}`);
      if (ref) args.push(ref);
      if (path) { args.push('--'); args.push(path); }
      const result = await git(args);
      return { content: [{ type: 'text' as const, text: result || '(no diff)' }] };
    },
  );

  server.tool(
    'git_log',
    'Show git commit log.',
    {
      maxCount: z.number().default(20).describe('Maximum number of commits'),
      oneline: z.boolean().default(false).describe('One line per commit'),
      path: z.string().optional().describe('Limit to specific file'),
      author: z.string().optional().describe('Filter by author'),
      since: z.string().optional().describe('Show commits after date (e.g. "2024-01-01", "1 week ago")'),
      format: z.string().optional().describe('Custom format string (e.g. "%h %s %an %ar")'),
      ref: z.string().optional().describe('Branch or ref to show log for'),
    },
    async ({ maxCount, oneline, path, author, since, format, ref }) => {
      const args = ['log', `--max-count=${maxCount}`];
      if (oneline && !format) args.push('--oneline');
      if (format) args.push(`--format=${format}`);
      if (author) args.push(`--author=${author}`);
      if (since) args.push(`--since=${since}`);
      if (ref) args.push(ref);
      if (path) { args.push('--'); args.push(path); }
      const result = await git(args);
      return { content: [{ type: 'text' as const, text: result || '(no commits)' }] };
    },
  );

  server.tool(
    'git_show',
    'Show details of a specific commit.',
    {
      ref: z.string().default('HEAD').describe('Commit hash, tag, or ref'),
      stat: z.boolean().default(false).describe('Show diffstat only'),
      format: z.string().optional().describe('Custom format string'),
    },
    async ({ ref, stat, format }) => {
      const args = ['show', ref];
      if (stat) args.push('--stat');
      if (format) args.push(`--format=${format}`);
      const result = await git(args);
      return { content: [{ type: 'text' as const, text: result }] };
    },
  );

  server.tool(
    'git_blame',
    'Show git blame for a file.',
    {
      path: z.string().describe('File path (relative to workspace)'),
      startLine: z.number().optional().describe('Start line (1-based)'),
      endLine: z.number().optional().describe('End line (1-based)'),
    },
    async ({ path, startLine, endLine }) => {
      const args = ['blame', path];
      if (startLine !== undefined && endLine !== undefined) {
        args.push(`-L${startLine},${endLine}`);
      }
      const result = await git(args);
      return { content: [{ type: 'text' as const, text: result }] };
    },
  );

  server.tool(
    'git_commit',
    'Stage files and create a git commit.',
    {
      message: z.string().describe('Commit message'),
      files: z.array(z.string()).default([]).describe('Files to stage. Empty array = commit currently staged files. Use ["."] to stage all.'),
      amend: z.boolean().default(false).describe('Amend previous commit'),
    },
    async ({ message, files, amend }) => {
      if (files.length > 0) {
        await git(['add', ...files]);
      }
      const args = ['commit', '-m', message];
      if (amend) args.push('--amend');
      const result = await git(args);
      return { content: [{ type: 'text' as const, text: result }] };
    },
  );

  server.tool(
    'git_branch',
    'List, create, or delete branches.',
    {
      action: z.enum(['list', 'create', 'delete', 'current']).default('list').describe('Branch action'),
      name: z.string().optional().describe('Branch name (for create/delete)'),
      all: z.boolean().default(false).describe('List remote branches too'),
      force: z.boolean().default(false).describe('Force delete'),
    },
    async ({ action, name, all, force }) => {
      switch (action) {
        case 'list': {
          const args = ['branch'];
          if (all) args.push('-a');
          args.push('-v');
          const result = await git(args);
          return { content: [{ type: 'text' as const, text: result }] };
        }
        case 'current': {
          const result = await git(['branch', '--show-current']);
          return { content: [{ type: 'text' as const, text: result.trim() }] };
        }
        case 'create': {
          if (!name) return { content: [{ type: 'text' as const, text: 'Branch name required.' }], isError: true };
          const result = await git(['branch', name]);
          return { content: [{ type: 'text' as const, text: result || `Branch "${name}" created.` }] };
        }
        case 'delete': {
          if (!name) return { content: [{ type: 'text' as const, text: 'Branch name required.' }], isError: true };
          const result = await git(['branch', force ? '-D' : '-d', name]);
          return { content: [{ type: 'text' as const, text: result || `Branch "${name}" deleted.` }] };
        }
      }
    },
  );

  server.tool(
    'git_checkout',
    'Switch branches or restore files.',
    {
      target: z.string().describe('Branch name, commit hash, or file path'),
      createBranch: z.boolean().default(false).describe('Create new branch and switch (-b)'),
    },
    async ({ target, createBranch }) => {
      const args = ['checkout'];
      if (createBranch) args.push('-b');
      args.push(target);
      const result = await git(args);
      return { content: [{ type: 'text' as const, text: result || `Switched to ${target}` }] };
    },
  );

  server.tool(
    'git_stash',
    'Stash or restore uncommitted changes.',
    {
      action: z.enum(['push', 'pop', 'list', 'apply', 'drop']).default('list').describe('Stash action'),
      message: z.string().optional().describe('Stash message (for push)'),
      index: z.number().optional().describe('Stash index (for apply/drop)'),
    },
    async ({ action, message, index }) => {
      const args = ['stash'];
      switch (action) {
        case 'push':
          args.push('push');
          if (message) { args.push('-m'); args.push(message); }
          break;
        case 'pop':
          args.push('pop');
          break;
        case 'list':
          args.push('list');
          break;
        case 'apply':
          args.push('apply');
          if (index !== undefined) args.push(`stash@{${index}}`);
          break;
        case 'drop':
          args.push('drop');
          if (index !== undefined) args.push(`stash@{${index}}`);
          break;
      }
      const result = await git(args);
      return { content: [{ type: 'text' as const, text: result || `(stash ${action} done)` }] };
    },
  );
}
