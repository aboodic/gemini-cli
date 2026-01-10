# Model-Context Protocol (MCP) Servers

MCP servers allow you to extend Gemini CLI with custom tools. The CLI connects
to these servers to discover and execute tools.

## Configuration

MCP servers are configured in `settings.json` (user, project, or extension)
under the `mcpServers` key. **For development and rapid iteration, always start
by configuring servers in your project-level `settings.json`. This avoids
potential permission issues and keeps your development environment clean.**

### Stdio Server (Standard I/O)

Used for local servers executed as subprocesses.

```json
"mcpServers": {
  "my-server": {
    "command": "node",
    "args": ["path/to/server.js"],
    "env": { "API_KEY": "..." },
    "cwd": "path/to/working-dir"
  }
}
```

### SSE Server (Server-Sent Events)

Used for remote servers communicating over HTTP.

```json
"mcpServers": {
  "remote-server": {
    "url": "http://localhost:3001/sse",
    "headers": { "Authorization": "Bearer ..." }
  }
}
```

### HTTP Server

```json
"mcpServers": {
  "http-server": {
    "httpUrl": "http://localhost:3002/mcp"
  }
}
```

## Options

- `trust` (boolean): If `true`, bypasses tool call confirmations for this
  server.
- `includeTools` (string[]): Allowlist of tools to enable.
- `excludeTools` (string[]): Blocklist of tools to disable.
- `timeout` (number): Request timeout in milliseconds.

## In Extensions

Extensions define MCP servers in `gemini-extension.json`.

```json
{
  "name": "my-extension",
  "mcpServers": {
    "ext-server": {
      "command": "node",
      "args": ["${extensionPath}/server.js"]
    }
  }
}
```

## Activation

When you add or modify an MCP server in `settings.json`, you must restart Gemini
CLI for the changes to take effect. Upon restart, the CLI will connect to the
server and automatically register any new tools as slash commands (visible via
`/mcp`).

## Verification

To validate that your MCP server is connecting and providing tools:

1.  **List Servers**: Run `gemini mcp list` to see the connection status of all
    configured servers.
2.  **Troubleshooting**: Run `gemini mcp list --debug` to see detailed
    connection and tool-discovery logs if a server is failing to connect.
3.  **Manual Check**: **The user** can verify that the tools provided by the
    server are active by running `/mcp` in an interactive session.

## Documentation

For more information, visit the
[official MCP documentation](https://geminicli.com/docs/tools/mcp).
