import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import { C, FONT_MONO } from "../theme";

interface Props {
  chatId: string;
  cwd: string;
}

export function Terminal({ chatId, cwd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;

    const term = new XTerm({
      fontFamily: FONT_MONO,
      fontSize: 12.5,
      lineHeight: 1.35,
      theme: {
        background: "#2a241c",
        foreground: "#f0e7d6",
        cursor: "#b77a3c",
        cursorAccent: "#2a241c",
        selectionBackground: "rgba(183,122,60,0.28)",
        black: "#3a2f22",
        red: "#c87670",
        green: "#7a9a5f",
        yellow: "#caa55a",
        blue: "#6b8db5",
        magenta: "#c47d8a",
        cyan: "#6fa8a0",
        white: "#f0e7d6",
        brightBlack: "#6b5f4d",
        brightRed: "#e09993",
        brightGreen: "#a0c087",
        brightYellow: "#e0bc7a",
        brightBlue: "#8eafd1",
        brightMagenta: "#dfa0ad",
        brightCyan: "#9dc7c0",
        brightWhite: "#fbf8f2",
      },
      cursorBlink: true,
      convertEol: true,
      scrollback: 5000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    const cols = term.cols;
    const rows = term.rows;

    (async () => {
      try {
        const ptyId = await invoke<string>("pty_open", { chatId, cwd, cols, rows });
        if (disposed) {
          await invoke("pty_close", { ptyId }).catch(() => {});
          return;
        }
        ptyIdRef.current = ptyId;

        const unlisten = await listen<string>(`pty://${ptyId}/data`, (e) => {
          term.write(e.payload);
        });
        unlistenRef.current = unlisten;

        term.onData((data) => {
          const id = ptyIdRef.current;
          if (id) invoke("pty_write", { ptyId: id, data }).catch(() => {});
        });

        term.onResize(({ cols, rows }) => {
          const id = ptyIdRef.current;
          if (id) invoke("pty_resize", { ptyId: id, cols, rows }).catch(() => {});
        });
      } catch (err) {
        term.write(
          `\x1b[31m[terminal failed to start: ${String(err)}]\x1b[0m\r\n`,
        );
      }
    })();

    const onResize = () => {
      try {
        fit.fit();
      } catch {}
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(containerRef.current);

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      if (unlistenRef.current) unlistenRef.current();
      if (ptyIdRef.current) {
        invoke("pty_close", { ptyId: ptyIdRef.current }).catch(() => {});
      }
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, cwd]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#2a241c",
        display: "flex",
        flexDirection: "column",
        borderLeft: `1px solid ${C.cardBd}`,
      }}
    >
      <div
        style={{
          padding: "9px 14px",
          borderBottom: "1px solid #3a2f22",
          fontSize: 11,
          color: "#c9bba0",
          fontFamily: FONT_MONO,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: 4, background: "#7a9a5f" }} />
        <span style={{ opacity: 0.8 }}>terminal</span>
        <span style={{ color: "#6b5f4d" }}>·</span>
        <span>{cwd}</span>
      </div>
      <div ref={containerRef} style={{ flex: 1, padding: "8px 0 0 10px", overflow: "hidden" }} />
    </div>
  );
}
