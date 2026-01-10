# Agent Skills

Agent Skills are modular packages that provide specialized knowledge, workflows,
and tools to the agent.

## Structure

A skill is a directory containing a `SKILL.md` file and optional resource
directories.

```
my-skill/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description)
│   └── Markdown instructions
├── scripts/    - Executable code
├── references/ - Documentation to be loaded as needed
└── assets/     - Templates, boilerplate, etc.
```

## SKILL.md

### Frontmatter

```yaml
---
name: my-skill
description:
  'Briefly explain WHAT the skill does and WHEN to use it. This is the primary
  triggering mechanism.'
---
```

### Body

Contains detailed instructions for the agent on how to use the skill and its
resources.

## Locations

- **Project Skills**: `.gemini/skills/` (**Preferred for development and
  iteration**).
- **User Skills**: `~/.gemini/skills/` (manually added for global use).
- **Built-in Skills**: `packages/core/src/skills/builtin/` (pre-installed).
- **Extension Skills**: `skills/` directory within an extension folder.

## Activation

After creating or modifying a skill, you must tell Gemini CLI to rediscover it:

- **Command**: `/skills reload`

This refreshes the list of available skills across all locations (Project, User,
and Extensions) without needing to restart the CLI.

## Best Practices

- **Concise**: Only include context the agent doesn't already have.
- **Progressive Disclosure**: Use the `references/` directory for detailed
  documentation and link to it from `SKILL.md`.
- **Scripts**: Use scripts for deterministic tasks or to avoid repetitive code
  generation.
- **Imperative Tone**: Use commands (e.g., "Analyze the logs", "Generate a
  test").

## Verification

To validate that a skill is correctly discovered and can be activated:

1.  **Activation**: Headlessly trigger the skill using:
    `gemini --allowed-tools activate_skill,<additional_tools> "your prompt to trigger the skill"`
2.  **Troubleshooting**: Add the `--debug` flag to the command above to verify
    skill discovery and activation logs if the skill fails to trigger.
3.  **UI List**: **The user** can use `/skills list` in an interactive session
    to see all available skills and their enabled status.

**Note**: When verifying headlessly, you must include any tools the skill
intends to use in the `--allowed-tools` list (comma-separated).

## Documentation

For more information, visit the
[official skills documentation](https://geminicli.com/docs/cli/skills).
