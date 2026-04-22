# GitChat — Product Spec (PRD)

## 1. One-liner

**Stop losing context between AI chats.** A canvas where every chat is a node, and you draw edges to carry context forward — with explicit control over how much transfers.

## 2. Problem

LLM conversations are amnesiac islands.

- A long chat accumulates shared understanding the user doesn't want to lose — but also noise they want to drop.
- Starting a new chat means re-explaining background (slow) or pasting the whole old chat (noisy, expensive).
- There's no primitive for "fork this," "pull the decisions from over there," or "let this new chat inherit only these four exchanges."

Users end up with scattered tabs, lost threads, and re-typed context. The underlying model they want is **git for conversations**: branches, merges, cherry-picks.

## 3. Who it's for

Primary persona: the **power AI user who thinks in parallel threads.**

- Founders / builders running multiple overlapping explorations with Claude or GPT (idea → spec → landing → pitch → tech).
- Researchers juggling literature summaries, question threads, and synthesis chats.
- Engineers using chat as a design surface — architecture discussion in one thread, implementation in another, review in a third.

Anti-persona: casual single-chat users. GitChat is *graphs of conversations*; if you only ever have one chat, it's overkill.

## 4. Value proposition

1. **Never rewrite context.** Forking carries the relevant slice forward automatically.
2. **Explicit, visible context.** You can see exactly which past chats are feeding each new chat, and what got passed in.
3. **Compose threads.** Merge two parallel explorations by creating a new chat that inherits from both.
4. **Cherry-pick quality over recency.** Pull the three best exchanges from a noisy long thread, skip the rest.

## 5. Core concepts

### 5.1 Chat — a node on the canvas
A single conversation thread. Has a title (editable, handwritten style), a list of messages, a position on the grid, and a selected model. Visually: a small horizontal card with a status dot (green = has messages, gray = empty).

### 5.2 Edge — directed context transfer
An edge goes from a **source** chat to a **target** chat. It represents: *"when the target chat talks to its LLM, prepend context extracted from the source."* Edges are directional, and their context is snapshotted at creation time (see §8).

### 5.3 Transfer modes — how context flows
Four modes, chosen per edge at creation:

| Mode | Glyph | Use when… | What transfers |
|---|---|---|---|
| **Summary** | `~` | You want a quick recap. | Compressed bullet list of the assistant's key turns. |
| **Detailed** | `≡` | You want structured carry-over of bullet points and lists. | Extracted bullets/lists from both roles, preserved as structure. |
| **Cherry pick** | `✂` | Only specific messages matter. | A hand-selected subset of messages from the source. |
| **Full inherit** | `∞` | You want everything. | The entire source conversation, verbatim. |

Modes are visually color-coded (green / blue / pink / gray). The color follows through all surfaces: the edge line, the context pill in the chat view, the preview header.

### 5.4 Targeting rule
Edges can go into any existing chat — empty or ongoing. When a target already has messages, the inbound context is prepended to the system prompt for *future* turns only; prior replies are not retroactively rewritten.

Rejected:
- **Self-loops** (`A → A`).
- **Duplicate edges** (same `from → to` pair — to change the mode, delete and re-draw).

During edge-dragging, valid targets highlight green; invalid targets (self or duplicate) highlight red.

Cycles are permitted because each edge carries a frozen snapshot (§8) — there's no recursive resolution at prompt-assembly time.

## 6. Canvas UX — home screen

The canvas *is* the product. First-run users see it, not a chat.

- **Grid**: subtle 60px grid, cells snap. Empty cells show a faint `+` at cursor on hover.
- **Create**: click any empty cell → new empty chat, title auto-focused.
- **Connect**: hover a non-empty chat → a handle appears on its bottom edge; drag from handle to another node. On drop, a mode-picker modal appears near the target.
- **Open**: double-click a node → full-screen chat view.
- **Rename**: click the title inline.
- **Move**: drag anywhere on the node body.
- **Delete**: right-click → "delete chat" (cascades to attached edges).
- **Pan**: click-drag empty grid.
- **Empty state**: ghost node with "click anywhere" hint so the first action is obvious.

Design principle: **every action is a direct manipulation on the canvas itself.** No sidebar, no modal for things that can be inline, no settings to configure before the first chat.

## 7. Chat view — the conversation surface

Opens full-screen over the canvas (dark, to contrast with light canvas).

- **Back arrow** returns to canvas with position preserved.
- **Inline-editable title** (same handwritten style as the node).
- **Context bar** (only if the chat has inbound edges): row of colored pills, one per source chat, labeled `source title · mode`. Clicking a pill shows a modal previewing exactly what got injected.
- **Message list**: user messages right-aligned, assistant left-aligned. Code blocks render as syntax-styled panels. Claude Code chats additionally render tool-call blocks (bash, edits, file reads) inline with collapsible output.
- **Model picker** above the input: dropdown with Claude Sonnet 4.6, Claude Opus 4.6, Claude Code. Switchable per chat at any time.
- **Input**: auto-growing textarea. Enter sends, Shift+Enter newline.

The preview modal matters. Users need to trust that "summary mode" didn't silently drop something important. Making the injected context *inspectable* is a core trust move, not a debug feature.

### 7.1 Model mode: plain chat vs. Claude Code

GitChat exposes two kinds of chats:

- **Plain chat** (Sonnet / Opus): text-only conversation. Input → model → text reply.
- **Claude Code chat**: an agentic session with a bound **working directory** on the user's machine. The model can run bash, read/edit files, and use MCP tools. The chat view surfaces tool calls as they happen.

Switching models mid-chat is allowed *between* the plain models (Sonnet ↔ Opus) freely. Switching *to or from* Claude Code is allowed but flagged in the UI — Claude Code messages have attached tool-call history that plain chats will ignore, and plain-chat messages appear to Claude Code as ordinary prior turns.

Each Claude Code chat has:
- A **working directory** (chosen at first Claude Code message, editable in chat settings).
- A **permission mode** (plan / accept-edits / bypass) matching Claude Code's modes. Default: plan.
- A **running state** (idle / thinking / running-tool / waiting-for-approval).
- An **interactive terminal** (see §9.1) running a real shell in the same working directory, beside the chat view.

## 8. Context snapshotting — trust rules

When an edge is created, the extracted context is **frozen onto the edge**. It does not update when the source chat is later edited or extended.

Why:

- The user's mental model when drawing the edge was: *"at this moment, pass this forward."* Retroactively mutating downstream prompts violates that.
- Debuggability: "what did chat B actually receive?" has a stable answer.
- Deleting the source doesn't break the target — the edge carries its own copy.

Consequence: if a source chat gets deleted, downstream chats still work; the pill just labels the source as "(deleted)."

## 9. Platform — desktop app

GitChat ships as a **desktop application**, not a web app. This is a forcing decision driven by the Claude Code chat mode: agents need local filesystem access, shell execution, and long-running subprocesses. A browser tab is the wrong shape for that.

**Stack direction** (prototype-level, not final):

- **Shell**: Electron or Tauri. Tauri preferred for bundle size + security model; Electron acceptable if Node APIs simplify Claude Code subprocess management.
- **UI**: the existing React prototype runs unchanged inside the shell's webview.
- **Local store**: SQLite (via `better-sqlite3` on Electron, or Tauri's SQL plugin). All chats, edges, snapshots live on-disk in the user's app-data directory.
- **Model calls**:
  - Sonnet / Opus → Anthropic API, user provides their API key in settings (stored in OS keychain).
  - Claude Code → spawn the `claude` CLI as a subprocess with `--output-format stream-json`, or use the Agent SDK directly. Reuse the user's existing Claude Code auth.
- **No backend server** at launch. Fully local-first. Optional cloud sync is a post-v1 concern.

### 9.1 Claude Code integration details

- First time a user picks Claude Code as the model for a chat, prompt for a **working directory** (native folder picker).
- Persist the working directory on the chat row. All Claude Code invocations for that chat run against that directory.
- Stream the agent's turn into the UI: assistant text, tool calls, tool results all appear as they emit. Tool-call blocks are collapsible.
- Respect Claude Code's permission modes. Surface permission prompts as inline UI (approve / deny buttons on the tool call), not OS dialogs.
- **Safety**: the working directory is scoped per-chat. Users see the path prominently in the chat header. Deleting a chat does not touch the working directory's files.

#### File browser + tabs + pseudocode

Claude Code chats also get a **collapsible file tree** of the working directory on the far left. Default: collapsed. Clicking a file in the tree opens it as a **tab** next to the chat tab in the middle pane.

Each file tab has a `code ↔ pseudocode` toggle in its header:
- **code**: raw file contents, rendered with syntax highlighting via `highlight.js`.
- **pseudocode**: the file's contents run through Claude Sonnet 4.6 with a tuned prompt that emits terse, uppercase-keyword structured pseudocode preserving control flow but stripping syntactic noise. Result is cached per (path + content hash) so toggling back-and-forth is free.

Constraints:
- File viewer declines binary files and files > 1.5 MB.
- Pseudocode generation declines files > 120 KB (cost / context window).
- Pseudocode requires `ANTHROPIC_API_KEY` in the environment; no UI for key entry yet (noted under out-of-v1).

#### Interactive terminal

Claude Code chats get a **real PTY** rendered to the right of the message list, resizable via a draggable splitter. The terminal runs the user's shell (`$SHELL -l`) in the chat's working directory, so the user can run commands themselves alongside Claude's tool calls.

- Backend: `portable-pty` in Rust. One PTY per open Claude Code chat, lazily spawned on first render. A reader thread pipes bytes from the master fd to the frontend via a Tauri event (`pty://{id}/data`).
- Frontend: `@xterm/xterm` bound to that event. User keystrokes → `pty_write` command; container resize → `pty_resize`.
- Lifecycle: closing the chat view, deleting the chat, or switching away from Claude Code as the model all close the PTY (drop → SIGHUP).
- Out of v1: auto-injecting the terminal's user-driven output into Claude's context. For now, the terminal is a user convenience surface; the user can copy/paste interesting output into the chat.

### 9.2 Context transfer implications

The 4 transfer modes all still apply to Claude Code chats, with one wrinkle: tool calls are part of the conversation. Transfer rules:

- **Summary / Detailed**: extract from assistant text only. Tool calls are omitted. (A long agent session shouldn't bleed its bash output into a summary.)
- **Cherry pick**: user selects messages; tool-call blocks are pickable as individual items alongside text messages.
- **Full inherit**: includes tool calls and results verbatim.

Claude Code → plain chat edges work (tool calls serialize as text). Plain chat → Claude Code edges work (plain text enters the Claude Code session as prior conversation). The working directory is *not* inherited across an edge — each Claude Code chat sets its own.

## 10. Key UX rules (collected)

- **Any chat can receive an edge**, empty or ongoing — context applies to future turns only (§5.4). Self-loops and duplicate edges are rejected.
- **Snapshots are frozen at edge creation.** (§8)
- **Cherry-pick is disabled if source has zero messages.** (Nothing to pick.)
- **Context pills are always visible, always clickable.** Never hide what's being injected.
- **Working directory is per-Claude-Code-chat.** Not inherited via edges, not shared across chats.
- **Titles are cosmetic.** No uniqueness constraint, no slugs, no routing.

## 11. MVP scope

**In for v1:**
- Desktop app (macOS first; Windows/Linux best-effort from same codebase).
- Canvas: create, move, rename, delete, pan.
- Edges: all 4 transfer modes, with cherry-pick selection modal.
- Chat view with inbound-context pills and preview modal.
- Three models live: Claude Sonnet 4.6, Claude Opus 4.6, Claude Code — user-switchable per chat.
- Claude Code: working-directory binding, streaming tool calls, permission-mode UI.
- Local SQLite persistence, API key stored in OS keychain.

**Deliberately out of v1 (noted, not forgotten):**
- Streaming reply rendering for plain chat (v1 streams Claude Code, plain chats can wait for full response).
- Cloud sync / multi-device.
- Collaborative / shared canvases.
- Re-running edges against updated sources ("refresh snapshot").
- Token-budget warnings on long `FULL` inherits.
- Non-Claude models (GPT / Gemini).
- Mobile.
- Auto-injecting terminal output into Claude's context (the terminal is user-only in v1).

## 12. Success criteria

The product is working if, in the first week:

- **Activation**: a new user creates at least **2 chats and 1 edge** in their first session. This is the "aha" — they've started *using the graph*, not just chatting.
- **Retention proxy**: users who draw 3+ edges in week 1 return in week 2 at noticeably higher rate than users who draw 0.
- **Mode distribution**: Summary + Detailed should dominate; Cherry-pick should be used by power users; Full-inherit should be rare but present. If everyone just picks Full, the modes aren't earning their complexity.
- **Qualitative**: users describe GitChat unprompted as "git for chats" or "a canvas for my Claude conversations." The metaphor lands or it doesn't.

## 13. Open product questions

Flag these before build:

1. **Summary/Detailed quality**: deterministic extraction (prototype) or LLM-generated compression? LLM is better, but adds cost/latency/failure modes on edge creation.
2. **Tauri vs. Electron**: Tauri is lighter but Claude Code subprocess management may be easier with full Node. Needs a spike.
3. **Claude Code auth model**: piggyback on the user's installed `claude` CLI (spawn subprocess) vs. Agent SDK with their API key directly? Subprocess is simpler but requires the user to have Claude Code installed.
4. **Workspace sharing**: ever? Or is GitChat always a single-player tool? Affects whether local-only SQLite is permanent or a stepping stone.
5. **Node size & zoom**: prototype is fixed 3×1 cells. Long titles truncate. Worth a zoom-out / minimap for 50+ node canvases?

## 14. Reference: prototype

The prototype React file is the canonical UI spec. This doc describes the *product*; the prototype describes the *pixels*. When they disagree, the prototype wins for visuals and this doc wins for semantics (rules, constraints, scope).
