# Extensions

Extensions package custom commands, MCP servers, prompts, hooks, and skills into
a shareable format.

## Directory Structure

```
my-extension/
├── gemini-extension.json
├── GEMINI.md (optional, extension-specific context)
├── commands/ (TOML commands)
├── hooks/
│   └── hooks.json
├── skills/ (Agent Skills)
└── mcp-servers/ (if any)
```

## `gemini-extension.json`

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "mcpServers": {
    "server1": { "command": "node ${extensionPath}/server.js" }
  },
  "contextFileName": "GEMINI.md",
  "excludeTools": ["run_shell_command(rm -rf)"],
  "settings": [
    {
      "name": "API Key",
      "envVar": "MY_API_KEY",
      "sensitive": true
    }
  ]
}
```

## Management Commands

- `gemini extensions new <path> [template]`: Create a boilerplate extension.
  **Prefer creating new extensions within your project directory for initial
  development.**
- `gemini extensions link <path>`: Symlink a local extension for development.
- `gemini extensions install <source>`: Install from GitHub URL or local path.
- `gemini extensions update <name>`: Update an installed extension.
- `gemini extensions list`: Show all installed extensions.

## Activation

- **Local Development**: Use `gemini extensions link <path>` to symlink your
  local extension. Changes to files within the linked directory are typically
  picked up automatically or on the next session.
- **Installation**: Use `gemini extensions install <path>` for a permanent local
  install or `gemini extensions install <url>` for remote.

## Variables

- `${extensionPath}`: Path to the extension folder.
- `${workspacePath}`: Path to the current workspace.
- `${/}` or `${pathSeparator}`: OS-specific path separator.

## Verification

To validate that your extension is correctly installed or linked:

1.  **List Extensions**: Run `gemini extensions list`.
2.  **Troubleshooting**: Run `gemini extensions list --debug` to see detailed
    logs about which extension components (commands, hooks, skills) are being
    loaded.

## Documentation

For more information, visit the
[official extensions documentation](https://geminicli.com/docs/extensions).
