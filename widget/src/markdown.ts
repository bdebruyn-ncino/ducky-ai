import DOMPurify from "dompurify";
import { marked } from "marked";

// Standard GFM Markdown; no async extensions so parse() is always synchronous.
marked.use({ gfm: true, breaks: false });

// Explicit tag allowlist. <a> is intentionally excluded: links in answers
// must not navigate the webview, so they render as plain text instead.
const ALLOWED_TAGS = [
  "p", "br",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "em", "del", "s",
  "code", "pre",
  "ul", "ol", "li",
  "blockquote",
  "table", "thead", "tbody", "tr", "th", "td",
  "hr",
  "img",
];

// Only img attributes. Href/src on unknown elements are stripped by default.
const ALLOWED_ATTR = ["src", "alt", "width", "height"];

/**
 * Parse `text` as Markdown, sanitize the HTML, inject copy buttons on code
 * blocks, and return the result as a DocumentFragment ready to append.
 *
 * Safe to call with untrusted agent output: no inline event handlers,
 * no javascript: URLs, no <script>/<style>/<iframe>, no navigable links.
 */
export function renderMarkdown(text: string): DocumentFragment {
  const html = marked.parse(text, { async: false }) as string;

  const frag = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    RETURN_DOM_FRAGMENT: true,
  });

  // Add a copy button to every <pre><code> block.
  for (const pre of frag.querySelectorAll("pre")) {
    const code = pre.querySelector("code");
    if (!code) {
      continue;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    btn.textContent = "Copy";
    btn.setAttribute("aria-label", "Copy code to clipboard");
    btn.addEventListener("click", () => {
      void navigator.clipboard.writeText(code.textContent ?? "").then(() => {
        btn.textContent = "Copied!";
        setTimeout(() => {
          btn.textContent = "Copy";
        }, 2000);
      });
    });

    const wrapper = document.createElement("div");
    wrapper.className = "code-block";
    pre.replaceWith(wrapper);
    wrapper.append(pre, btn);
  }

  return frag;
}
