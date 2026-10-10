---
name: help
description: Explain Ralph Loop plugin and available commands
---

# Ralph Loop Help

The Ralph Loop plugin provides auto-continuation for complex tasks in opencode.

## Available Commands

### Automatic build-session loop
OpenCode `build` sessions arm Ralph automatically on ordinary user messages. No Ralph-specific task prompt is required.

### `/ralph-loop <task>`
Explicitly replace the tracked task or iteration loop when manual control is useful.

Example:
```
/ralph-loop Build a REST API with authentication
```

The AI will work on your task and automatically continue until completion.

### `/cancel-ralph`
Cancel an active Ralph Loop before it completes.

Example:
```
/cancel-ralph
```

## How It Works

1. **Start**: Ordinary `build` user messages create state at `.opencode/ralph-loop.local.md`
2. **Protocol**: The plugin adds terminal instructions through OpenCode's system hook
3. **Loop**: Before an assistant response can become idle, the plugin checks for `👌` or `<<<CODING_FEEDBACK>>>`
4. **Continue**: If neither is found, it injects a synthetic work-first continuation
5. **Cleanup**: State is deleted when a terminal signal is reached or the loop ends

## Terminal Signals

When there is no important coding feedback:

```
👌
```

When important coding feedback exists:

```
<<<CODING_FEEDBACK>>>
<necessary feedback>
```

Both are terminal for the loop. Ordinary unmarked prose is not.

## State File

Located at `.opencode/ralph-loop.local.md` (add to `.gitignore`):

```markdown
---
active: true
iteration: 3
maxIterations: 100
sessionId: ses_abc123
---

Your original task prompt
```

## Credits

- Inspired by [Anthropic's Ralph Wiggum](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum) plugin for Claude Code
- Standalone extraction from [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode)
