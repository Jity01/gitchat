import { useEffect, useRef, useState } from "react";
import type { ModeKey, ModelId, PermissionMode } from "./theme";
import { CELL } from "./theme";
import type { Chat, Edge, Message, Stroke, TextBox } from "./types";
import { Topbar } from "./components/Topbar";
import { Canvas } from "./components/Canvas";
import { ChatView } from "./components/ChatView";
import { ImportChatModal } from "./components/ImportChatModal";
import { stateLoad, stateSave } from "./lib/rpc";

interface PersistedState {
  version: 1;
  chats: Chat[];
  edges: Edge[];
  strokes: Stroke[];
  textBoxes: TextBox[];
}

export default function App() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [textBoxes, setTextBoxes] = useState<TextBox[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load persisted state once at startup.
  useEffect(() => {
    let cancelled = false;
    stateLoad()
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          const parsed = JSON.parse(raw) as Partial<PersistedState>;
          if (parsed.chats) setChats(parsed.chats);
          if (parsed.edges) setEdges(parsed.edges);
          if (parsed.strokes) setStrokes(parsed.strokes);
          if (parsed.textBoxes) setTextBoxes(parsed.textBoxes);
        } catch (e) {
          console.error("failed to parse saved state", e);
        }
      })
      .catch((e) => console.error("failed to load state", e))
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced save whenever persistable state changes (after initial load).
  const saveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const payload: PersistedState = {
        version: 1,
        chats,
        edges,
        strokes,
        textBoxes,
      };
      stateSave(JSON.stringify(payload)).catch((e) =>
        console.error("failed to save state", e),
      );
    }, 300);
    return () => {
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
    };
  }, [loaded, chats, edges, strokes, textBoxes]);

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
