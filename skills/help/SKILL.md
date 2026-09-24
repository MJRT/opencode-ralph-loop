---
name: help
description: Explain Ralph Loop plugin and available commands
---

# Ralph Loop Help

The Ralph Loop plugin provides auto-continuation for complex tasks in opencode.

## Available Commands

### `/ralph-loop <task>`
Start an iterative development loop that prevents premature idle during a coding turn.

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

1. **Start**: `/ralph-loop` creates a state file at `.opencode/ralph-loop.local.md`
2. **Loop**: When the AI goes idle, the plugin checks for `👌` or `<<<CODING_FEEDBACK>>>`
3. **Continue**: If neither is found, it injects a work-first continuation prompt
4. **Stop**: Loop continues until a terminal signal is found or max iterations (100) is reached
5. **Cleanup**: State file is deleted when complete

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
