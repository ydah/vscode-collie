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

## Getting Started

Collie includes a VS Code Getting Started walkthrough with setup, configuration, and task integration steps. Open it from **Help: Get Started** after installing the extension.

## Problem Matchers

Collie contributes task problem matchers for batch lint output:

- `$collie` for `path/to/file.y:12:8: error: message`
- `$collie-line` for `path/to/file.y:12: warning: message`

Use them from `.vscode/tasks.json` with your project lint command.

## Release

Releases are published from the GitHub Actions **Release** workflow on `main`.

Required repository secrets:

- `VSCE_PAT` - Visual Studio Marketplace publishing token for the `ydah` publisher.
- `RELEASE_PAT` - Optional GitHub token used when branch protection blocks `GITHUB_TOKEN` from pushing the release commit and tag.

Run the workflow manually with `version` set to `patch`, `minor`, `major`, or an exact version such as `0.1.1`. The workflow bumps `package.json` and `package-lock.json`, creates `v<version>`, runs checks, packages the VSIX, publishes that VSIX to the Marketplace, and uploads it to the GitHub Release.

## Keybindings

- `Shift+Alt+F` - Format document
- `Ctrl+Shift+Alt+F` (Mac: `Cmd+Shift+Alt+F`) - Fix all offenses

## License

MIT
