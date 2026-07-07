# Collie

Collie is a Visual Studio Code extension for Lrama-style BNF grammar files.
It provides syntax highlighting, snippets, diagnostics, formatting, quick fixes,
and navigation for `.y` and `.yacc` files through the `collie-lsp` language
server.

## Features

- Syntax highlighting for Yacc, Bison, and Lrama grammar files
- Real-time diagnostics from `collie-lsp`
- Document formatting and fix-all support when the server advertises the capability
- Hover, completion, go to definition, symbol search, and syntax diagram commands when supported by the server
- Getting Started walkthrough for setup, rule configuration, and task integration
- Snippets for common grammar declarations and Lrama-specific constructs such as `%rule`, parameterized rules, and named references
- Task problem matchers for Collie lint output
- Setup checks with install guidance when `collie-lsp` is missing
- Version mismatch warnings when the detected language server is older than the extension expects

## Requirements

Collie requires Ruby and the `collie-lsp` gem.

```bash
gem install collie-lsp
```

If the gem is missing, the extension shows an **Install collie-lsp** action that
opens a terminal with the install command. You can also run **Collie: Check
Setup** from the command palette to inspect Ruby, the selected language server,
and the detected server version.

Workspace binstubs are preferred when present at `bin/collie-lsp`. If your
project uses Bundler, enable `collie.useBundler` or set `collie.lspPath` to the
executable VS Code should run.

## Installation

Install Collie from the Visual Studio Marketplace:

```bash
code --install-extension ydah.collie
```

After installing, open a `.y` or `.yacc` file. The extension activates for the
`yacc` language mode and starts `collie-lsp`.

## Getting Started

Collie includes a VS Code walkthrough. Open **Help: Get Started**, then select
**Get Started with Collie**.

The walkthrough covers:

- Installing and checking `collie-lsp`
- Opening grammar files
- Creating or opening `.collie.yml`
- Using Collie problem matchers from VS Code tasks

## Commands

| Command | Description |
| --- | --- |
| `Collie: Format Document` | Format the active grammar file |
| `Collie: Lint Current File` | Run linting for the active grammar file |
| `Collie: Fix All Auto-correctable Offenses` | Apply available auto-corrections |
| `Collie: Restart Language Server` | Restart the active `collie-lsp` client |
| `Collie: Show Output Channel` | Open the Collie output channel |
| `Collie: Check Setup` | Check Ruby, server launch, and server version |
| `Collie: Copy Environment Info` | Copy extension and language server diagnostics for bug reports |
| `Collie: Create .collie.yml` | Create a project configuration file |
| `Collie: Open Collie Config` | Open the configured Collie config file |
| `Collie: Search Symbols` | Search Collie symbols when supported by the server |
| `Collie: Preview Syntax Diagram for Current Rule` | Preview a syntax diagram when supported by the server |

## Keybindings

| Keybinding | Command |
| --- | --- |
| `Shift+Alt+F` | `Collie: Format Document` |
| `Ctrl+Shift+Alt+F` | `Collie: Fix All Auto-correctable Offenses` |
| `Cmd+Shift+Alt+F` on macOS | `Collie: Fix All Auto-correctable Offenses` |

## Extension Settings

| Setting | Default | Description |
| --- | --- | --- |
| `collie.lspPath` | `null` | Path to a `collie-lsp` executable. Leave empty to use workspace binstubs, Bundler, or `PATH`. |
| `collie.useBundler` | `false` | Start the server with `bundle exec collie-lsp` when no custom path is configured. |
| `collie.minimumServerVersion` | `null` | Minimum accepted `collie-lsp` version. Empty uses the extension version. |
| `collie.enableLinting` | `true` | Enable diagnostics. |
| `collie.enableFormatting` | `true` | Enable formatting support. |
| `collie.configPath` | `null` | Path to a `.collie.yml` file. Relative paths are resolved from the workspace folder. |
| `collie.trace.server` | `off` | Trace language server communication. Use `messages` or `verbose` for debugging. |

Example:

```json
{
  "collie.useBundler": true,
  "collie.enableLinting": true,
  "collie.enableFormatting": true,
  "collie.configPath": ".collie.yml"
}
```

The deprecated `collie-lsp.serverPath` setting is still read as an alias for
`collie.lspPath`.

## Snippets

Snippets are available in the `yacc` language mode. They include declarations
such as `%token`, `%nterm`, precedence directives, grammar rules, alternatives,
Lrama `%rule` directives, parameterized rules, parameterized rule calls, named
references, parser and lexer parameters, code blocks, destructors, and printers.

## Problem Matchers

Collie contributes task problem matchers for batch lint output:

- `$collie` matches `path/to/file.y:12:8: error: message`
- `$collie-line` matches `path/to/file.y:12: warning: message`

Example `.vscode/tasks.json` entry:

```json
{
  "label": "collie lint",
  "type": "shell",
  "command": "bundle exec collie lint grammar.y",
  "problemMatcher": "$collie"
}
```

Use both matchers when your task can emit both line-column and line-only
diagnostics.

## Known Issues

- `collie-lsp` is distributed separately as a Ruby gem and must be available to VS Code.
- Formatting, fix-all, symbol search, and syntax diagram support depend on the capabilities advertised by the installed server version.

## Development

```bash
npm ci
npm run lint
npm run check-types
npm test
npm run package
npm run package:smoke
```

Useful scripts:

- `npm run compile` builds the extension into `out/extension.js`
- `npm run package` creates a `.vsix` file with `vsce package`
- `npm run package:smoke` verifies the packaged extension contents
- `npm run vsix:install-smoke` runs an install smoke test for a generated VSIX
- `npm run real-lsp:probe` probes a real `collie-lsp` installation

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).

Manual Marketplace release flow:

1. Update the version with `npm version patch`, `npm version minor`, or `npm version major`.
2. Run the development checks and package smoke test.
3. Publish the generated VSIX with `vsce publish --packagePath collie-<version>.vsix` or upload it from the Marketplace publisher page.
4. Push the release commit and tag with `git push origin main --follow-tags`.

## License

[MIT](LICENSE)
