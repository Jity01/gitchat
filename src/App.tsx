import { useState } from "react";
import type { ModeKey, ModelId, PermissionMode } from "./theme";
import { CELL } from "./theme";
import type { Chat, Edge, Message, Stroke, TextBox } from "./types";
import { Topbar } from "./components/Topbar";
import { Canvas } from "./components/Canvas";
import { ChatView } from "./components/ChatView";
import { ImportChatModal } from "./components/ImportChatModal";

/* Preexisting chats arranged in a single top→bottom column.
   Node is 240×120 on a 60px grid, so 3-cell y-stride leaves a tidy 60px gap. */
const COL_X = CELL * 4;

const DEMO_CHATS: Chat[] = [
  {
    id: "c1",
    x: COL_X,
    y: CELL * 1,
    title: "business idea brainstorm",
    model: "sonnet",
    updatedAt: Date.now() - 1000 * 60 * 120,
    messages: [
      { role: "user", content: "i want to build a tool that lets people manage their ai chat context manually." },
      { role: "assistant", content: "three primitives:\n• branch — fork a chat\n• merge — combine threads\n• cherry-pick — grab specific exchanges" },
      { role: "user", content: "calling it gitchat. canvas ui." },
      { role: "assistant", content: "canvas as home screen. each chat = node.\n\nmvp: canvas, click-to-create, drag-to-connect, four context modes." },
    ],
  },
  {
    id: "c3",
    x: COL_X,
    y: CELL * 4,
    title: "product spec",
    model: "opus",
    updatedAt: Date.now() - 1000 * 60 * 15,
    messages: [
      { role: "user", content: "product spec." },
      { role: "assistant", content: "```typescript\ninterface Chat { id: string; title: string; messages: Message[]; }\ninterface Edge { from: string; to: string; mode: string; }\n```" },
    ],
  },
  {
    id: "c2",
    x: COL_X,
    y: CELL * 7,
    title: "landing page design",
    model: "sonnet",
    updatedAt: Date.now() - 1000 * 60 * 40,
    messages: [
      { role: "user", content: "landing page. dark, minimal." },
      { role: "assistant", content: "hero: 'stop losing context between ai chats.'\ncta: email input, single field." },
    ],
  },
  {
    id: "c4",
    x: COL_X,
    y: CELL * 10,
    title: "agent runner",
    model: "code",
    updatedAt: Date.now() - 1000 * 60 * 3,
    cwd: undefined,
    messages: [],
  },
];

const DEMO_EDGES: Edge[] = [
  { id: "e1", from: "c1", to: "c3", mode: "DETAILED" },
  { id: "e2", from: "c3", to: "c2", mode: "SUMMARY" },
  { id: "e3", from: "c2", to: "c4", mode: "FULL" },
];

export default function App() {
  const [chats, setChats] = useState<Chat[]>(DEMO_CHATS);
  const [edges, setEdges] = useState<Edge[]>(DEMO_EDGES);
  const [openId, setOpenId] = useState<string | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [textBoxes, setTextBoxes] = useState<TextBox[]>([]);
  const [importOpen, setImportOpen] = useState(false);

  const onCreateChat = (x: number, y: number): string => {
    const id = "c" + Date.now();
    setChats((p) => [
      ...p,
      {
        id,
        x,
        y,
        title: "new chat",
        model: "sonnet",
        messages: [],
        updatedAt: Date.now(),
      },
    ]);
    return id;
  };

  const onMoveChat = (id: string, x: number, y: number) => {
    setChats((p) => p.map((c) => (c.id === id ? { ...c, x, y } : c)));
  };
  const onTitle = (id: string, v: string) => {
    setChats((p) => p.map((c) => (c.id === id ? { ...c, title: v } : c)));
  };
  const onDeleteChat = (id: string) => {
    setChats((p) => p.filter((c) => c.id !== id));
    setEdges((p) => p.filter((e) => e.from !== id && e.to !== id));
    if (openId === id) setOpenId(null);
  };
  const onCreateEdge = (from: string, to: string, mode: ModeKey, indices?: number[]) => {
    const id = "e" + Date.now();
    setEdges((p) => [...p, { id, from, to, mode, indices }]);
  };
  const onSetModel = (id: string, model: ModelId) => {
    setChats((p) => p.map((c) => (c.id === id ? { ...c, model } : c)));
  };
  const onSetCwd = (id: string, cwd: string) => {
    setChats((p) => p.map((c) => (c.id === id ? { ...c, cwd } : c)));
  };
  const onSetPermissionMode = (id: string, mode: PermissionMode) => {
    setChats((p) => p.map((c) => (c.id === id ? { ...c, permissionMode: mode } : c)));
  };
  const onAppend = (id: string, m: Message) => {
    setChats((p) =>
      p.map((c) =>
        c.id === id ? { ...c, messages: [...c.messages, m], updatedAt: Date.now() } : c,
      ),
    );
  };

  // annotations
  const onAddStroke = (s: Stroke) => setStrokes((p) => [...p, s]);
  const onUpdateStroke = (id: string, patch: Partial<Stroke>) =>
    setStrokes((p) => p.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const onRemoveStroke = (id: string) =>
    setStrokes((p) => p.filter((s) => s.id !== id));
  const onAddTextBox = (t: TextBox) => setTextBoxes((p) => [...p, t]);
  const onUpdateTextBox = (id: string, patch: Partial<TextBox>) =>
    setTextBoxes((p) => p.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const onRemoveTextBox = (id: string) =>
    setTextBoxes((p) => p.filter((t) => t.id !== id));

  // import shared chat
  const onImportedChat = (title: string, messages: Message[]) => {
    const id = "c" + Date.now();
    // place at first free row below existing column
    const maxY = chats.reduce((m, c) => Math.max(m, c.y), 0);
    const x = CELL * 4;
    const y = maxY + CELL * 3;
    setChats((p) => [
      ...p,
      {
        id,
        x,
        y,
        title,
        model: "sonnet",
        messages,
        updatedAt: Date.now(),
      },
    ]);
    setImportOpen(false);
  };

  const openChat = openId ? chats.find((c) => c.id === openId) : null;

  return (
    <>
      <Topbar />
      <Canvas
        chats={chats}
        edges={edges}
        strokes={strokes}
        textBoxes={textBoxes}
        onCreateChat={onCreateChat}
        onMoveChat={onMoveChat}
        onTitle={onTitle}
        onDeleteChat={onDeleteChat}
        onOpenChat={setOpenId}
        onCreateEdge={onCreateEdge}
        onAddStroke={onAddStroke}
        onUpdateStroke={onUpdateStroke}
        onRemoveStroke={onRemoveStroke}
        onAddTextBox={onAddTextBox}
        onUpdateTextBox={onUpdateTextBox}
        onRemoveTextBox={onRemoveTextBox}
        onOpenImport={() => setImportOpen(true)}
      />
      {importOpen && (
        <ImportChatModal
          onDone={onImportedChat}
          onClose={() => setImportOpen(false)}
        />
      )}
      {openChat && (
        <ChatView
          chat={openChat}
          edges={edges}
          allChats={chats}
          onBack={() => setOpenId(null)}
          onTitle={onTitle}
          onSetModel={onSetModel}
          onSetCwd={onSetCwd}
          onSetPermissionMode={onSetPermissionMode}
          onAppend={onAppend}
        />
      )}
    </>
  );
}
