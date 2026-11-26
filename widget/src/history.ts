import type { HistoryEntry, HistoryKind } from "../../shared/messages.ts";

const KIND_LABELS: Record<HistoryKind, string> = {
  question: "Asked",
  answer: "Answered",
  error: "Failed",
  cancelled: "Cancelled",
  approval: "Approval",
  activity: "Looked at",
};

// Long answers show a preview; click an entry to read it all.
const PREVIEW_LENGTH = 160;

// "14:32" for today, "26 Nov 14:32" for earlier days.
export function formatTime(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  if (at.toDateString() === now.toDateString()) {
    return time;
  }
  return `${at.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
}

function describe(entry: HistoryEntry, now: Date): string {
  const parts = [formatTime(entry.at, now), KIND_LABELS[entry.kind]];
  if (entry.repo) {
    parts.push(entry.repo);
  }
  if (entry.durationMs !== undefined) {
    parts.push(`${(entry.durationMs / 1000).toFixed(1)}s`);
  }
  return parts.join(" · ");
}

// Fills the list, newest first (the order the sidecar sends). Everything goes in with textContent:
// answers come from an agent reading arbitrary repos, so they are never treated as markup.
export function renderHistory(list: HTMLElement, entries: HistoryEntry[], now = new Date()) {
  list.replaceChildren();

  if (entries.length === 0) {
    const empty = document.createElement("li");
    empty.className = "history-empty";
    empty.textContent = "Nothing here yet. Ask Ducky something.";
    list.append(empty);
    return;
  }

  for (const entry of entries) {
    const item = document.createElement("li");
    item.className = "history-entry";
    item.dataset.kind = entry.kind;

    const meta = document.createElement("div");
    meta.className = "history-meta";
    meta.textContent = describe(entry, now);

    const text = document.createElement("div");
    text.className = "history-text";
    const isLong = entry.text.length > PREVIEW_LENGTH;
    text.textContent = isLong ? `${entry.text.slice(0, PREVIEW_LENGTH)}…` : entry.text;

    if (isLong) {
      item.classList.add("expandable");
      item.addEventListener("click", () => {
        const expanded = item.classList.toggle("expanded");
        text.textContent = expanded ? entry.text : `${entry.text.slice(0, PREVIEW_LENGTH)}…`;
      });
    }

    item.append(meta, text);
    list.append(item);
  }
}
