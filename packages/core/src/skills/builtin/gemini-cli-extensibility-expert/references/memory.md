# Context Files (GEMINI.md)

Context files allow you to provide persistent instructional context, coding
styles, and project-specific rules to the Gemini model.

## Creating a Context File

The easiest way to get started with a project-specific context file is to use
the built-in initialization command:

- **Command**: `/init`

This command analyzes your project structure and creates a tailored `GEMINI.md`
file with relevant instructions and style guides.

## File Locations

Gemini CLI uses a hierarchical system to source context:

- **Global Context**: `~/.gemini/GEMINI.md` (available in all projects).
- **Project Context**: `GEMINI.md` in the project root or parent directories.
- **Sub-directory Context**: `GEMINI.md` files in specific sub-directories for
  localized instructions.

## Activation

The CLI automatically detects and loads `GEMINI.md` files. If you add or modify
a file and want the changes to take effect immediately:

- **Command**: `/memory refresh`

To inspect what context is currently being sent to the model:

- **Command**: `/memory show`

## Imports

You can modularize your context by importing other files using the `@` symbol:

```markdown
# Main Context

@./style-guide.md @./persona.md
```

## Verification

To verify that your `GEMINI.md` files are being loaded:

1.  **Manual Check**: **The user** can use the interactive `/memory show`
    command to see the full concatenated context being sent to the model.
2.  **Manual Refresh**: **The user** can also use `/memory refresh` to manually
    trigger a reload of all context files.
3.  **Troubleshooting**: Run `gemini --debug "any prompt"` to see discovery logs
    for context files across the directory hierarchy.

## Documentation

For more information, visit the
[official GEMINI.md documentation](https://geminicli.com/docs/cli/gemini-md).
