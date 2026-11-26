import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const TEXT_ONLY_KEY = "ducky.textOnly";

export interface VoiceHandlers {
  onPartialTranscript(text: string): void;
  onFinalTranscript(text: string): void;
  onError(message: string): void;
  onListeningChanged(isListening: boolean): void;
  // Lets the page use a duck click for something else, like stopping a countdown. Return true if it did.
  onDuckClick(): boolean;
}

export interface Voice {
  isListening(): boolean;
  stop(): void;
}

// Rust listens through the Mac's own speech recognition and sends the words as events.
export function setUpVoice(duckButton: HTMLButtonElement, modeToggle: HTMLButtonElement, handlers: VoiceHandlers): Voice {
  if (!isTauri()) {
    duckButton.hidden = true;
    modeToggle.hidden = true;
    return { isListening: () => false, stop: () => {} };
  }

  let listening = false;
  let textOnly = localStorage.getItem(TEXT_ONLY_KEY) === "true";

  function stop() {
    void invoke("stop_listening");
  }

  function setListening(next: boolean) {
    listening = next;
    duckButton.classList.toggle("listening", next);
    duckButton.title = next ? "Stop listening" : "Talk to Ducky";
    handlers.onListeningChanged(next);
  }

  function applyMode() {
    duckButton.hidden = textOnly;
    modeToggle.textContent = textOnly ? "Use voice" : "Text only";
    if (textOnly && listening) {
      stop();
    }
  }

  duckButton.addEventListener("click", () => {
    if (handlers.onDuckClick()) {
      return;
    }
    if (listening) {
      stop();
      return;
    }
    setListening(true);
    void invoke("start_listening");
  });

  modeToggle.addEventListener("click", () => {
    textOnly = !textOnly;
    localStorage.setItem(TEXT_ONLY_KEY, String(textOnly));
    applyMode();
  });

  void listen<{ text: string; isFinal: boolean }>("voice-transcript", (event) => {
    const { text, isFinal } = event.payload;
    if (isFinal) {
      handlers.onFinalTranscript(text);
    } else {
      handlers.onPartialTranscript(text);
    }
  });
  void listen<string>("voice-error", (event) => handlers.onError(event.payload));
  void listen("voice-stopped", () => setListening(false));

  applyMode();
  return { isListening: () => listening, stop };
}
