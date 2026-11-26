import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { decodeServerMessage, encode, type ClientMessage, type ServerMessage } from "../../shared/messages.ts";

export interface Transport {
  send(message: ClientMessage): void;
  onMessage(listener: (message: ServerMessage) => void): void;
}

const MOCK_THINKING_MS = 1500;

// Inside the app, talk to the real sidecar. In a plain browser (npm run dev), use the mock.
export function createTransport(): Transport {
  return isTauri() ? createSidecarTransport() : createMockTransport();
}

// Rust runs the sidecar and passes its messages along as events.
function createSidecarTransport(): Transport {
  let listener: (message: ServerMessage) => void = () => {};

  void listen<string>("sidecar-message", (event) => {
    try {
      listener(decodeServerMessage(event.payload));
    } catch (error) {
      console.error(error);
    }
  });

  return {
    onMessage(newListener) {
      listener = newListener;
    },
    send(message) {
      invoke("send_to_sidecar", { line: encode(message).trimEnd() }).catch((error) =>
        listener({ type: "error", message: String(error) }),
      );
    },
  };
}

function createMockTransport(): Transport {
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
