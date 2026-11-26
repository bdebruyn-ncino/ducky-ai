import { expect, test } from "vitest";
import { renderMarkdown } from "./markdown.ts";

// Serialise a fragment to HTML for assertions.
function html(frag: DocumentFragment): string {
  const div = document.createElement("div");
  div.append(frag);
  return div.innerHTML;
}

// --- Markdown rendering ---

test("renders a heading", () => {
  expect(html(renderMarkdown("# Hello"))).toContain("<h1>Hello</h1>");
});

test("renders an unordered list", () => {
  const out = html(renderMarkdown("- one\n- two"));
  expect(out).toContain("<ul>");
  expect(out).toContain("<li>one</li>");
});

test("renders a code block wrapped with a copy button", () => {
  const out = html(renderMarkdown("```\nconst x = 1;\n```"));
  expect(out).toContain('<div class="code-block">');
  expect(out).toContain("<pre>");
  expect(out).toContain("copy-btn");
});

test("renders inline code", () => {
  expect(html(renderMarkdown("use `npm install`"))).toContain("<code>npm install</code>");
});

// --- XSS / injection safety ---

test("strips <script> tags and their content", () => {
  const out = html(renderMarkdown('<script>alert("xss")</script>'));
  expect(out).not.toContain("<script");
  expect(out).not.toContain("alert");
});

test("strips inline event handlers on arbitrary elements", () => {
  const out = html(renderMarkdown('<img src="x" onerror="alert(1)">'));
  expect(out).not.toContain("onerror");
  expect(out).not.toContain("alert(1)");
});

test("strips <style> blocks", () => {
  const out = html(renderMarkdown("<style>* { color: red }</style>"));
  expect(out).not.toContain("<style");
});

test("strips <iframe>", () => {
  const out = html(renderMarkdown('<iframe src="https://evil.example"></iframe>'));
  expect(out).not.toContain("<iframe");
});

// --- Link safety ---

test("javascript: links produce no navigable anchor", () => {
  const out = html(renderMarkdown("[click me](javascript:alert(1))"));
  expect(out).not.toContain("javascript:");
  expect(out).not.toContain("<a ");
});

test("http links render as plain text without an <a> tag", () => {
  const out = html(renderMarkdown("[Docs](https://example.com)"));
  expect(out).not.toContain("<a ");
  expect(out).toContain("Docs");
});

test("bare URL in text is not made into a navigable link", () => {
  // GFM autolink converts bare URLs to <a>; we strip the tag but keep text.
  const out = html(renderMarkdown("See https://example.com for details."));
  expect(out).not.toContain('<a ');
  expect(out).toContain("https://example.com");
});
