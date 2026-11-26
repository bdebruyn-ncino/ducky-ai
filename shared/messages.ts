// Messages between the widget and the sidecar.
// One JSON object per line over the sidecar's stdin and stdout.
// stdout carries protocol messages only; the sidecar logs to stderr.

// One line in the history: something Ducky was asked, did or answered.
export type HistoryKind = "question" | "answer" | "error" | "cancelled" | "approval" | "activity";

export interface HistoryEntry {
  id: number;
  at: string; // ISO time
  kind: HistoryKind;
  repo?: string;
  text: string;
  durationMs?: number; // how long an answer took
}

export type ClientMessage =
  | { type: "ask"; id: string; question: string; project?: string }
  | { type: "cancel"; id: string }
  | { type: "confirmation-response"; id: string; confirmationId: string; approved: boolean; choice?: string }
  | { type: "new-session" }
  // User's answer to a free-text setup prompt.
  | { type: "setup-response"; id: string; value: string }
  // User clicked the Setup button to (re-)run first-time setup.
  | { type: "run-setup" }
  // The widget has loaded and is listening. The sidecar may have said things before that, which were lost.
  | { type: "widget-ready" }
  // Ask for the most recent history entries, newest first.
  | { type: "history-request"; limit?: number }
  // Delete all history.
  | { type: "history-clear" };

export type ServerMessage =
  | { type: "ready" }
  | { type: "status"; id: string; state: "working" }
  | { type: "answer"; id: string; text: string }
  | { type: "cancelled"; id: string }
  | { type: "error"; id?: string; message: string }
  // Asks the user to approve an action, or to pick one of `options` (for example which repo).
  | { type: "confirmation-request"; id: string; confirmationId: string; summary: string; options?: string[] }
  // Nobody answered in time, so the request was denied. The widget can remove its buttons.
  | { type: "confirmation-expired"; id: string; confirmationId: string }
  | { type: "session-cleared" }
  // A setup step that needs free-text input from the user.
  // `defaultValue` is a suggestion to pre-fill in the text box, which the user can accept or change.
  | { type: "setup-prompt"; id: string; prompt: string; placeholder?: string; defaultValue?: string }
  // An informational note with no user input required (used by setup for status updates).
  | { type: "note"; text: string }
  // Setup is over, finished or cancelled. The widget can stop showing setup state.
  | { type: "setup-finished"; completed: boolean }
  // What the agent is doing right now, for example "Reading README.md".
  | { type: "activity"; id: string; text: string }
  | { type: "history"; entries: HistoryEntry[] };

export function encode(message: ClientMessage | ServerMessage): string {
  return JSON.stringify(message) + "\n";
}

const SERVER_MESSAGE_TYPES = ["ready", "status", "answer", "cancelled", "error", "confirmation-request", "confirmation-expired", "session-cleared", "setup-prompt", "note", "setup-finished", "activity", "history"];

const isString = (value: unknown): value is string => typeof value === "string";
const isOptionalString = (value: unknown) => value === undefined || isString(value);

function parseObject(line: string): Record<string, unknown> {
  const value = JSON.parse(line);
  if (typeof value !== "object" || value === null) {
    throw new Error(`Not a JSON object: ${line}`);
  }
  return value;
}

export function decodeClientMessage(line: string): ClientMessage {
  const value = parseObject(line);
  const isValid =
    (value.type === "ask" && isString(value.id) && isString(value.question) && isOptionalString(value.project)) ||
    (value.type === "cancel" && isString(value.id)) ||
    (value.type === "confirmation-response" &&
      isString(value.id) &&
      isString(value.confirmationId) &&
      typeof value.approved === "boolean" &&
      isOptionalString(value.choice)) ||
    value.type === "new-session" ||
    (value.type === "setup-response" && isString(value.id) && isString(value.value)) ||
    value.type === "run-setup" ||
    value.type === "widget-ready" ||
    (value.type === "history-request" && (value.limit === undefined || typeof value.limit === "number")) ||
    value.type === "history-clear";

  if (!isValid) {
    throw new Error(`Not a valid client message: ${line}`);
  }
  return value as ClientMessage;
}

export function decodeServerMessage(line: string): ServerMessage {
  const value = parseObject(line);
  if (!SERVER_MESSAGE_TYPES.includes(value.type as string)) {
    throw new Error(`Not a valid server message: ${line}`);
  }
  return value as ServerMessage;
}
