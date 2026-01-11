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

- **Targeted Command**:
  `gemini --debug --allowed-tools <minimal_tools> "/<command_name> <args>"`
- **Verification Choice**: **Ask the user first** if they want to verify
  **manually** (interactive session) or have **you** (the agent) verify it on
  their behalf. Mention that agent-led verification involves the agent invoking
  itself headlessly and will require extra confirmations.
- **Security WARNING & Invocation**: If the user chooses agent-led verification,
  provide a **WARNING** that you will be invoking Gemini CLI on their behalf and
  will need to allow-list the tools required for verification (meaning those
  tools will run without further confirmation _within that headless process_).
  Immediately follow this warning with the tool call to execute the targeted
  headless command.
- **Troubleshooting**: Use the `--debug` flag to inspect discovery and execution
  logs.

**Note**:

- If your command uses shell injections (`!{...}`), you must include
  `run_shell_command` in the `--allowed-tools` list. To reduce the blast radius,
  you **MUST** scope it down using prefix matching, e.g.,
  `run_shell_command(git diff)`.
- `read_file` is allowed by default for read-only headless operations (e.g.,
  when using `@{...}`).
- Headless execution (using a string prompt) is read-only by default.

## Documentation

For more information, visit the
[official commands documentation](https://geminicli.com/docs/cli/commands).
