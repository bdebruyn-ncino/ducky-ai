// Messages between the widget and the sidecar.
// One JSON object per line over the sidecar's stdin and stdout.
// stdout carries protocol messages only; the sidecar logs to stderr.

export type ClientMessage =
  | { type: "ask"; id: string; question: string; project?: string }
  | { type: "cancel"; id: string }
  | { type: "confirmation-response"; id: string; confirmationId: string; approved: boolean; choice?: string };

export type ServerMessage =
  | { type: "ready" }
  | { type: "status"; id: string; state: "working" }
  | { type: "answer"; id: string; text: string }
  | { type: "cancelled"; id: string }
  | { type: "error"; id?: string; message: string }
  // Asks the user to approve an action, or to pick one of `options` (for example which repo).
  | { type: "confirmation-request"; id: string; confirmationId: string; summary: string; options?: string[] };

export function encode(message: ClientMessage | ServerMessage): string {
  return JSON.stringify(message) + "\n";
}

const SERVER_MESSAGE_TYPES = ["ready", "status", "answer", "cancelled", "error", "confirmation-request"];

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
      isOptionalString(value.choice));

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
