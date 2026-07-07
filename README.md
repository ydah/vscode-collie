# Collie for VSCode

Linter and formatter for Lrama Style BNF grammar files (.y files).

## Features

- Real-time linting with 18+ built-in rules
- Auto-formatting support
- Quick fixes for common issues
- Syntax highlighting for Yacc/Bison/Lrama
- Code snippets for common patterns
- Hover information for tokens and nonterminals
- Auto-completion
- Go to definition

## Requirements

- Ruby 3.2 or higher
- `collie-lsp` gem installed:
  ```bash
  gem install collie-lsp
  ```

If `collie-lsp` is missing, Collie shows an **Install collie-lsp** action that opens a terminal with the install command. Collie also warns when the detected language server is older than the extension expects.

## Installation

1. Install from VSCode Marketplace
2. Install `collie-lsp` gem, or use the **Install collie-lsp** action when prompted
3. Open a .y file and start coding

## Configuration

Configure in VSCode settings:

```json
{
  "collie.lspPath": "/custom/path/to/collie-lsp",
  "collie.enableLinting": true,
  "collie.enableFormatting": true,
  "collie.configPath": ".collie.yml"
}
```

## Commands

- `Collie: Format Document` - Format current file
- `Collie: Fix All Auto-correctable Offenses` - Apply all fixes
- `Collie: Restart Language Server` - Restart LSP server

## Keybindings

- `Shift+Alt+F` - Format document
- `Ctrl+Shift+Alt+F` (Mac: `Cmd+Shift+Alt+F`) - Fix all offenses

## License

MIT
