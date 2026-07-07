Collie bundles problem matchers for task output:

- `$collie` matches `path/to/file.y:12:8: error: message`.
- `$collie-line` matches `path/to/file.y:12: warning: message`.

Attach the matcher to the command your project uses for batch linting. Example `tasks.json` entry:

```json
{
  "label": "collie lint",
  "type": "shell",
  "command": "bundle exec collie lint grammar.y",
  "problemMatcher": "$collie"
}
```

Use both matchers when your task can emit line-only and line-column diagnostics.
