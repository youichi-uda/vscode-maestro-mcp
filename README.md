# VSCode Maestro MCP

The most comprehensive MCP server for VS Code — 100+ tools across 25 categories, from file ops to LSP providers.

Control every aspect of VS Code through the [Model Context Protocol](https://modelcontextprotocol.io/). Let AI agents read files, run commands, get completions, hover docs, find references, and more — all without leaving your editor.

## Quick Start

1. Install this extension from the VS Code Marketplace
2. The MCP server starts automatically on port 3002
3. Connect your MCP client:

```json
{
  "maestro-mcp": {
    "type": "http",
    "url": "http://localhost:3002/mcp"
  }
}
```

4. Start using tools — `list_files`, `read_file`, `execute_hover`, etc.

## Free Tools (no license needed)

| Category | Tools | Description |
|----------|-------|-------------|
| **Files** | 8 | List, find, search, read, create, copy, move, delete |
| **Editing** | 3 | Replace lines, insert text, undo |
| **Terminal** | 3 | Execute commands, read output, list terminals |
| **Editor** | 5 | Focus, workspace info, output channels, VS Code commands |
| **Diagnostics** | 3 | Errors, warnings, editor state |
| **Debug** | 13 | Sessions, breakpoints, stepping, variables, call stack |
| **Git** | 9 | Status, diff, log, blame, commit, branch, stash |
| **Selection** | 6 | Get/replace selection, cursor, clipboard |
| **Diff** | 2 | Compare files, unsaved changes |
| **Tasks** | 2 | List and run VS Code tasks |
| **Notifications** | 4 | Messages, input boxes, quick picks, progress |
| **Settings** | 5 | Get/set settings, extensions, keybindings |
| **Refactor** | 2 | Workspace edits, find & replace |
| **Snippets** | 2 | Insert and surround with snippets |
| **Testing** | 7 | Run tests, coverage, results |
| **Tabs/Layout** | 6 | Tabs, layout, panels, markdown preview |

## Premium Tools (license required)

Unlock VS Code's Language Server Protocol providers — the same data that powers IntelliSense, accessible to any MCP client.

| Category | Tools | Description |
|----------|-------|-------------|
| **Completion** | 1 | Code completion at any position |
| **Hover** | 1 | Hover information (docs, types) |
| **Signature** | 1 | Function signature help |
| **Code Actions** | 2 | Quick fixes, refactorings, CodeLens |
| **Navigation** | 3 | Go to definition, references, call hierarchy |
| **Symbols** | 2 | Document & workspace symbol search |
| **Formatting** | 2 | Document formatting, rename symbol |
| **Semantic** | 2 | Semantic tokens, inlay hints |
| **Document Features** | 3 | Document links, color picker, folding ranges |

[Get a license](https://abyo-software.gumroad.com/l/maestro-mcp) — one-time purchase, no subscription.

## Dynamic Tool Loading

Tools are organized into categories that can be enabled/disabled at runtime using the `manage_tool_categories` tool. Premium categories require a valid license key. When categories change, the MCP server sends `toolListChanged` notifications so clients automatically update their available tools.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `maestroMcp.port` | `3002` | MCP server port |
| `maestroMcp.host` | `127.0.0.1` | MCP server host |
| `maestroMcp.autoStart` | `true` | Start server on activation |
| `maestroMcp.licenseKey` | `""` | Premium license key |

## Commands

- **Maestro MCP: Toggle Server** — Start/stop the MCP server
- **Maestro MCP: Show Server Info** — Display server URL and status
- **Maestro MCP: Enter License Key** — Enter premium license key
- **Maestro MCP: License Status** — Check current license status

## Compatibility

Works with any MCP client that supports Streamable HTTP transport:

- [Claude Code](https://claude.ai/code) (Anthropic)
- [Claude Desktop](https://claude.ai/download)
- [Cursor](https://cursor.sh/)
- Custom MCP clients

## Requirements

- VS Code 1.85.0 or later

## License

Free core features. Premium LSP features require a [license](https://abyo-software.gumroad.com/l/maestro-mcp).

See [LICENSE.md](LICENSE.md) for details.
