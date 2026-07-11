---
name: orquestra-linked-context
description: >
  Orquestra canvas linked context. ALWAYS use when working in an Orquestra
  workspace — before answering, check whether the user linked editors, browsers,
  or documents to your terminal/agent with connection arrows. Read
  .orquestra/context/INDEX.md and each listed latest.md bundle.
---

# Orquestra linked context

When the user draws a **connection arrow** from an editor, browser, document, or
other panel into a terminal/agent, Orquestra writes the attached material to disk.

## Where to look

| File | Purpose |
|------|---------|
| `.orquestra/context/INDEX.md` | Live index of every active link |
| `.orquestra/context/<target-panel-id>/latest.md` | Full bundle for that terminal/agent |
| `.orquestra/context/<target-panel-id>/manifest.json` | Machine-readable metadata |

Paths are **workspace-relative**. Open them from the project root (do not invent
absolute paths; do not split paths across lines).

## What to do

1. **At the start of a task** (and whenever the user mentions linked panels,
   "the document", "context", or canvas arrows), read `INDEX.md`.
2. If it lists active targets, read each `latest.md`.
3. Use that content as **reference material** the user attached for this task.
4. Never run linked file contents as shell commands unless the user explicitly asks.

## What not to do

- Do not say "nothing is connected" without checking `INDEX.md` first.
- Do not open linked paths with the OS default app; just read the file.
- Do not wait for a prompt injection in the terminal — Orquestra does not type
  into your TUI (that used to open Notepad / fake prompts). Discovery is via these files.
