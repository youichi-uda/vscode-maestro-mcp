# Changelog

## 0.2.0 (2026-03-14)

### Added
- 100+ tools across 25 categories
- Dynamic tool loading with `manage_tool_categories`
- Premium license gating via Gumroad for LSP provider tools
- Streamable HTTP MCP transport (session-based)
- Free tier: files, editing, terminal, editor, diagnostics, debug, git, and more
- Premium tier: completion, hover, signature, code actions, navigation, symbols, formatting, semantic tokens, document features

### Fixed
- Language providers (hover, definition, etc.) now correctly return results by showing documents in the editor
- Document links use correct VSCode command (`vscode.executeLinkProvider`)

## 0.1.0 (2026-03-13)

- Initial development release
