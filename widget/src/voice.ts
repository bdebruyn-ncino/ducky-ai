import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DICTATION_OFF_TOOLTIP } from "./phrases.ts";

const TEXT_ONLY_KEY = "ducky.textOnly";

export interface VoiceHandlers {
  onPartialTranscript(text: string): void;
  onFinalTranscript(text: string): void;
  onError(message: string): void;
  onListeningChanged(isListening: boolean): void;
  onDictationChanged(isOn: boolean): void;
  onModeChanged(textOnly: boolean): void;
  // Lets the page use a duck click for something else, like stopping a countdown. Return true if it did.
  onDuckClick(): boolean;
}

export interface Voice {
  isListening(): boolean;
  isTextOnly(): boolean;
  stop(): void;
}

// Rust listens through the Mac's own speech recognition and sends the words as events.
export function setUpVoice(duckButton: HTMLButtonElement, modeToggle: HTMLButtonElement, handlers: VoiceHandlers): Voice {
  if (!isTauri()) {
    // In a plain browser there is no microphone: the duck stays as a mascot and typing is the only way in.
    modeToggle.hidden = true;
    handlers.onModeChanged(true);
    return { isListening: () => false, isTextOnly: () => true, stop: () => {} };
  }

  let listening = false;
  let dictationOn = true;
  let textOnly = localStorage.getItem(TEXT_ONLY_KEY) === "true";

  function stop() {
    void invoke("stop_listening");
  }

  function updateTitle() {
    if (!dictationOn) {
      duckButton.title = DICTATION_OFF_TOOLTIP;
    } else {
      duckButton.title = listening ? "Stop listening" : "Talk to Ducky";
    }
  }

  // The switch lives in System Settings, so look again whenever the window comes back into focus.
  function refreshDictation() {
    invoke<boolean>("dictation_enabled")
      .then((isOn) => {
        if (isOn !== dictationOn) {
          dictationOn = isOn;
          updateTitle();
          handlers.onDictationChanged(isOn);
        }
      })
      .catch(() => {});
  }

  function setListening(next: boolean) {
    listening = next;
    updateTitle();
    handlers.onListeningChanged(next);
  }

  function applyMode() {
    modeToggle.textContent = textOnly ? "Use voice" : "Text only";
    handlers.onModeChanged(textOnly);
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
    // The page shows "listening" only when Rust says the microphone is on ("voice-started").
    // With Dictation off, Rust says so in the conversation.
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
  void listen("voice-started", () => setListening(true));
  void listen<string>("voice-error", (event) => handlers.onError(event.payload));
  void listen("voice-stopped", () => {
    setListening(false);
    refreshDictation();
  });
  window.addEventListener("focus", refreshDictation);

  applyMode();
  refreshDictation();
  return { isListening: () => listening, isTextOnly: () => textOnly, stop };
}
