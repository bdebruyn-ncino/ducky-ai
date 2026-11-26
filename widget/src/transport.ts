import type { ClientMessage, ServerMessage } from "../../shared/messages.ts";

export interface Transport {
  send(message: ClientMessage): void;
  onMessage(listener: (message: ServerMessage) => void): void;
}

const MOCK_THINKING_MS = 1500;

// Stands in for the sidecar until #8 connects the real one.
export function createMockTransport(): Transport {
  let listener: (message: ServerMessage) => void = () => {};
  const timers = new Map<string, number>();

  return {
    onMessage(newListener) {
      listener = newListener;
    },
    send(message) {
      if (message.type === "ask") {
        listener({ type: "status", id: message.id, state: "working" });
        timers.set(
          message.id,
          window.setTimeout(() => {
            timers.delete(message.id);
            listener({ type: "answer", id: message.id, text: `(mock) You asked: ${message.question}` });
          }, MOCK_THINKING_MS),
        );
      } else if (message.type === "cancel") {
        window.clearTimeout(timers.get(message.id));
        timers.delete(message.id);
        listener({ type: "cancelled", id: message.id });
      }
    },
  };
}
