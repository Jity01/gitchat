import type { Message } from "../types";

export function genSummary(ms: Message[]): string {
  if (!ms.length) return "empty.";
  return ms
    .filter((m) => m.role === "assistant")
    .map((m) => "• " + m.content.split("\n")[0].slice(0, 80))
    .join("\n");
}

export function genDetailed(ms: Message[]): string {
  if (!ms.length) return "empty.";
  const out: string[] = [];
  ms.forEach((m) => {
    const lines = m.content.split("\n").filter((x) => /^\s*[•\-\d]/.test(x));
    if (lines.length) lines.forEach((x) => out.push(x.trim()));
    else out.push("[" + m.role + "] " + m.content.slice(0, 100));
  });
  return out.join("\n");
}
