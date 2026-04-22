import { marked } from "marked";
import { highlightCode } from "./hljs";

marked.setOptions({
  gfm: true,
  breaks: false,
});

// Override the code renderer to use highlight.js with our cream-toned theme.
const renderer = new marked.Renderer();
renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
  const html = highlightCode(text, lang);
  const cls = lang ? `language-${lang}` : "";
  return `<pre class="md-code"><code class="hljs ${cls}">${html}</code></pre>`;
};
marked.use({ renderer });

export function renderMarkdown(src: string): string {
  return marked.parse(src, { async: false }) as string;
}

export function isMarkdownPath(path: string): boolean {
  const ext = path.toLowerCase().split(".").pop() || "";
  return ext === "md" || ext === "markdown" || ext === "mdx";
}
