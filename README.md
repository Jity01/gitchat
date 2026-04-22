# gitchat

> stop losing context between ai chats

A desktop canvas where every chat is a node, and you draw edges to carry context forward — with explicit control over how much transfers. Built on Tauri + React + TypeScript, with a Rust backend for filesystem + PTY + LLM calls.

See [`SPEC.md`](./SPEC.md) for the product spec and design rationale.

## What's in the app

- **Canvas** — click to create chats, drag to connect them, pan, annotate with freehand ink + text boxes
- **Four transfer modes** on every edge — summary · detailed · cherry-pick · full inherit — each snapshotted at edge creation
- **Three models** — Claude Sonnet 4.6, Claude Opus 4.7, Claude Code (the last drives an agentic session with a live PTY and a file tree in the chat view)
- **File editing** inside Claude Code chats — click a file, edit it with syntax-highlighted autosave, toggle code ↔ pseudocode (generated via Sonnet), preview `.md` files
- **Import a chat** — paste a conversation from Claude or ChatGPT and we extract the messages into a new node
- **Context ring** on every chat — shows how much of the model's context window is filled

## Running locally

Requires: Node 20+, Rust 1.75+, an Anthropic API key.

```bash
# 1. clone + install
git clone https://github.com/Jity01/gitchat.git
cd gitchat
npm install

# 2. add your key
cp .env.example .env
# edit .env and paste in ANTHROPIC_API_KEY=sk-ant-...

# 3. run
npm run tauri dev
```

First boot takes a minute or two while Rust compiles. After that, file changes in `src/` hot-reload.

## Tech

- **Shell**: Tauri 2 (macOS-first; Linux + Windows compile but aren't actively tested)
- **UI**: React 18 + Vite + TypeScript
- **Code editing**: highlight.js for syntax
- **Terminal**: xterm.js bound to a real PTY via `portable-pty` in Rust
- **LLM**: Anthropic Messages API directly from the Rust side
- **Markdown**: marked

## Layout

```
src/                  React UI
  components/         canvas, chat view, file tree, terminal, etc.
  lib/                helpers (token estimate, context assembly, hljs setup, md)
  theme.ts            design tokens (deep cream / brown palette)

src-tauri/src/
  lib.rs              entry — registers Tauri commands
  llm.rs              chat_send, pseudocode, import_pasted_chat
  fs.rs               fs_list / fs_read / fs_write / fs_create_file
  pty.rs              pty_open / pty_write / pty_resize / pty_close
  env.rs              .env loader
```

## Status

Early. Works for single-player local use. No persistence across app restarts yet — chats live in React state and reset on relaunch.
