# Custom Commands

Custom commands (slash commands) allow you to save and reuse prompts as
shortcuts. They can be global (user-level) or project-specific.

## File Locations

- **Project Commands**: `<project-root>/.gemini/commands/` (**Preferred for
  development and iteration**)
- **User Commands**: `~/.gemini/commands/` (available everywhere)
- **Extension Commands**: `commands/` directory within an extension folder.

## Naming and Namespacing

Command names are derived from their file paths relative to the `commands`
directory.

- `test.toml` -> `/test`
- `git/commit.toml` -> `/git:commit`

## TOML Format

Commands must be in TOML format with a `.toml` extension.

### Structure

```toml
description = "Brief description for /help"
prompt = """
Your multi-line prompt goes here.
You can use special placeholders:
- {{args}}: Injects user arguments.
- !{shell command}: Injects output of a shell command.
- @{path/to/file}: Injects content of a file or directory.
"""
```

### Placeholders

- `{{args}}`:
  - Raw injection in the prompt.
  - Shell-escaped injection inside `!{...}` blocks.
- `!{...}`: Executes a shell command. Must have balanced braces.
- `@{...}`: Injects file/directory content. Processed before `!{...}` and
  `{{args}}`.

## Default Argument Handling

If `{{args}}` is NOT in the prompt, arguments provided by the user are appended
to the end of the prompt after two newlines.

## Activation

Custom slash commands are loaded when Gemini CLI starts. To make new or modified
commands available:

- **Action**: Restart Gemini CLI.

Currently, there is no automatic watching for new files in the `commands/`
directory, so a fresh session is required to discover them.

## In Extensions

Extensions provide commands by placing TOML files in a `commands/` subdirectory.

- Commands from an extension named `my-ext` might be namespaced as
  `/my-ext:command` if there is a conflict.
- Otherwise, they use their natural name (e.g., `/deploy`).

## Verification

To validate a newly created or modified slash command headlessly:

- **Command**: `gemini --allowed-tools <tool_names> "/<command_name> <args>"`
- **Troubleshooting**: If the command is not discovered or fails to execute, add
  the `--debug` flag to the command above to see detailed logs.

**Note**:

- If your command uses shell injections (`!{...}`), you must include
  `run_shell_command` in the `--allowed-tools` list.
- Headless execution (using a string prompt) is read-only by default.

## Documentation

For more information, visit the
[official commands documentation](https://geminicli.com/docs/cli/commands).
