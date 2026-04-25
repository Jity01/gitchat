import { invoke } from "@tauri-apps/api/core";

export interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface FileRead {
  content: string;
  too_big: boolean;
  binary: boolean;
  size: number;
}

export const fsList = (path: string) => invoke<FsEntry[]>("fs_list", { path });
export const fsRead = (path: string) => invoke<FileRead>("fs_read", { path });
export const fsWrite = (path: string, content: string) =>
  invoke<void>("fs_write", { path, content });
export const fsCreateFile = (path: string) =>
  invoke<void>("fs_create_file", { path });
export const stateLoad = () => invoke<string | null>("state_load");
export const stateSave = (content: string) =>
  invoke<void>("state_save", { content });
export const pseudocode = (path: string, content: string, language: string) =>
  invoke<string>("pseudocode", { path, content, language });

export interface ImportedChat {
  title: string;
  messages: { role: "user" | "assistant"; content: string }[];
}
export const importPastedChat = (content: string) =>
  invoke<ImportedChat>("import_pasted_chat", { content });

export interface ChatMessagePayload {
  role: "user" | "assistant";
  content: string;
}
export const chatSend = (args: {
  model: string;
  system?: string;
  messages: ChatMessagePayload[];
}) => invoke<string>("chat_send", args);

export const claudeSend = (args: {
  requestId: string;
  chatId: string;
  cwd: string;
  permissionMode: "plan" | "accept" | "bypass";
  sessionId?: string;
  system?: string;
  userMessage: string;
}) =>
  invoke<void>("claude_send", {
    requestId: args.requestId,
    chatId: args.chatId,
    cwd: args.cwd,
    permissionMode: args.permissionMode,
    sessionId: args.sessionId,
    system: args.system,
    userMessage: args.userMessage,
  });

export const claudeCancel = (requestId: string) =>
  invoke<void>("claude_cancel", { requestId });
