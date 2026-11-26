import { expect, test } from "vitest";
import type { HistoryEntry } from "../../shared/messages.ts";
import { formatTime, renderHistory } from "./history.ts";

const now = new Date("2026-11-26T15:00:00");

function entry(overrides: Partial<HistoryEntry>): HistoryEntry {
  return { id: 1, at: "2026-11-26T14:32:00", kind: "answer", text: "hello", ...overrides };
}

function render(entries: HistoryEntry[]): HTMLElement {
  const list = document.createElement("ol");
  renderHistory(list, entries, now);
  return list;
}

test("an empty history says so", () => {
  expect(render([]).textContent).toContain("Nothing here yet");
});

test("entries keep the order they arrive in, and say what happened", () => {
  const list = render([
    entry({ id: 2, kind: "answer", repo: "ducky-ai", durationMs: 3100, text: "It serves the API." }),
    entry({ id: 1, kind: "question", repo: "ducky-ai", text: "what does this do?" }),
  ]);
  const items = [...list.querySelectorAll(".history-entry")];

  expect(items).toHaveLength(2);
  expect(items[0].querySelector(".history-meta")?.textContent).toBe("14:32 · Answered · ducky-ai · 3.1s");
  expect(items[0].querySelector(".history-text")?.textContent).toBe("It serves the API.");
  expect(items[1].querySelector(".history-meta")?.textContent).toBe("14:32 · Asked · ducky-ai");
});

test("text is shown as text, never as markup", () => {
  const list = render([entry({ text: '<img src=x onerror="alert(1)"><script>bad()</script>' })]);

  expect(list.querySelector("img")).toBeNull();
  expect(list.querySelector("script")).toBeNull();
  expect(list.querySelector(".history-text")?.textContent).toContain("<script>bad()</script>");
});

test("a long entry shows a preview and opens in full when clicked", () => {
  const long = "word ".repeat(100).trim();
  const list = render([entry({ text: long })]);
  const item = list.querySelector<HTMLElement>(".history-entry")!;
  const text = item.querySelector(".history-text")!;

  expect(text.textContent!.length).toBeLessThan(long.length);
  expect(text.textContent!.endsWith("…")).toBe(true);

  item.click();
  expect(text.textContent).toBe(long);
  item.click();
  expect(text.textContent!.endsWith("…")).toBe(true);
});

test("today shows just the time, earlier days show the date too", () => {
  expect(formatTime("2026-11-26T09:05:00", now)).toBe("09:05");
  expect(formatTime("2026-11-24T09:05:00", now)).toMatch(/24/);
  expect(formatTime("2026-11-24T09:05:00", now)).toMatch(/09:05$/);
});
