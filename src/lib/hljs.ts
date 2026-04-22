import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import javascript from "highlight.js/lib/languages/javascript";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import go from "highlight.js/lib/languages/go";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import bash from "highlight.js/lib/languages/bash";
import yaml from "highlight.js/lib/languages/yaml";
import markdown from "highlight.js/lib/languages/markdown";
import sql from "highlight.js/lib/languages/sql";
import java from "highlight.js/lib/languages/java";
import cpp from "highlight.js/lib/languages/cpp";
import ini from "highlight.js/lib/languages/ini";
import ruby from "highlight.js/lib/languages/ruby";

hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("go", go);
hljs.registerLanguage("json", json);
hljs.registerLanguage("css", css);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("java", java);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("ini", ini);
hljs.registerLanguage("toml", ini);
hljs.registerLanguage("ruby", ruby);

export function langForPath(path: string): string | undefined {
  const ext = path.toLowerCase().split(".").pop() || "";
  const MAP: Record<string, string> = {
    ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
    js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    json: "json", jsonc: "json",
    css: "css", scss: "css", sass: "css", less: "css",
    html: "html", htm: "html", xml: "xml", svg: "xml",
    sh: "bash", bash: "bash", zsh: "bash", fish: "bash",
    yml: "yaml", yaml: "yaml",
    md: "markdown", markdown: "markdown",
    sql: "sql",
    java: "java",
    c: "cpp", cc: "cpp", cpp: "cpp", cxx: "cpp", h: "cpp", hpp: "cpp", hxx: "cpp",
    toml: "toml", ini: "ini",
    rb: "ruby", rake: "ruby",
  };
  return MAP[ext];
}

/** Returns false for docs, plain-text, and tabular data where pseudocode doesn't apply. */
export function isCodeLikeFile(path: string): boolean {
  const ext = path.toLowerCase().split(".").pop() || "";
  const DOC: Set<string> = new Set([
    // docs / prose
    "md", "markdown", "mdx", "rst", "txt", "text",
    // logs / plain data
    "log", "csv", "tsv",
    // explicitly documentation-style
    "license", "readme",
  ]);
  if (DOC.has(ext)) return false;
  // files with no extension and a doc-like base name
  const base = (path.split("/").pop() || path).toLowerCase();
  if (!base.includes(".")) {
    if (base === "readme" || base === "license" || base === "changelog") return false;
  }
  return true;
}

export function highlightCode(code: string, lang: string | undefined): string {
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    }
    return hljs.highlightAuto(code).value;
  } catch {
    return escapeHtml(code);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
