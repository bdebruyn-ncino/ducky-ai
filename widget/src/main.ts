import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import type { ServerMessage } from "../../shared/messages.ts";
import { createTransport } from "./transport.ts";

type MessageKind = "question" | "answer" | "error" | "note";
type Activity = "idle" | "working" | "waiting";

const transport = createTransport();
let activeQuestionId: string | undefined;

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id} in index.html`);
  }
  return element as T;
}

const messageList = byId<HTMLOListElement>("messages");
const workingBar = byId<HTMLDivElement>("working");
const workingText = byId<HTMLSpanElement>("working-text");
const cancelButton = byId<HTMLButtonElement>("cancel");
const form = byId<HTMLFormElement>("ask-form");
const questionInput = byId<HTMLInputElement>("question");
const askButton = byId<HTMLButtonElement>("ask");
const micButton = byId<HTMLButtonElement>("mic");
let isListening = false;

function addMessage(kind: MessageKind, text: string) {
  const item = document.createElement("li");
  item.className = `message ${kind}`;
  // textContent, never innerHTML: answers come from an agent reading arbitrary repos.
  item.textContent = text;
  messageList.append(item);
  item.scrollIntoView({ block: "end" });
}

function setActivity(activity: Activity) {
  workingBar.hidden = activity === "idle";
  workingText.textContent = activity === "waiting" ? "Ducky needs your answer" : "Ducky is working...";
  askButton.disabled = activity !== "idle";
}

function finishQuestion() {
  activeQuestionId = undefined;
  setActivity("idle");
  questionInput.focus();
}

// If the window is hidden the user has walked away, so tell them. The text is generic on
// purpose: answers can contain repo content, and notifications show on the lock screen.
async function notifyIfHidden(title: string) {
  if (!isTauri() || (await getCurrentWindow().isVisible())) {
    return;
  }
  if (!(await isPermissionGranted()) && (await requestPermission()) !== "granted") {
    return;
  }
  sendNotification({ title, body: "Press Control+Option+D to see it." });
}

function handleMessage(message: ServerMessage) {
  switch (message.type) {
    case "status":
      setActivity("working");
      break;
    case "answer":
      addMessage("answer", message.text);
      void notifyIfHidden("Ducky has your answer");
      finishQuestion();
      break;
    case "error":
      addMessage("error", message.message);
      void notifyIfHidden("Ducky ran into a problem");
      finishQuestion();
      break;
    case "cancelled":
      addMessage("note", "Cancelled.");
      finishQuestion();
      break;
    case "confirmation-request":
      // The approve and choose buttons arrive with #9.
      addMessage("note", `Needs your input: ${message.summary}`);
      setActivity("waiting");
      void notifyIfHidden("Ducky needs your answer");
      break;
    case "ready":
      break;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (!question || activeQuestionId) {
    return;
  }

  activeQuestionId = crypto.randomUUID();
  addMessage("question", question);
  questionInput.value = "";
  setActivity("working");
  transport.send({ type: "ask", id: activeQuestionId, question });
});

cancelButton.addEventListener("click", () => {
  if (activeQuestionId) {
    transport.send({ type: "cancel", id: activeQuestionId });
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    void getCurrentWindow().hide();
  }
});

// The hotkey shows the window, so start typing straight away.
window.addEventListener("focus", () => questionInput.focus());

function setListening(listening: boolean) {
  isListening = listening;
  micButton.classList.toggle("listening", listening);
  micButton.title = listening ? "Stop listening" : "Talk to Ducky";
  questionInput.placeholder = listening ? "Listening..." : "Ask Ducky...";
}

// Rust listens through the Mac's own speech recognition and sends the words as events.
function setUpVoice() {
  if (!isTauri()) {
    micButton.hidden = true;
    return;
  }

  micButton.addEventListener("click", () => {
    if (isListening) {
      void invoke("stop_listening");
      return;
    }
    setListening(true);
    void invoke("start_listening");
  });

  void listen<{ text: string; isFinal: boolean }>("voice-transcript", (event) => {
    questionInput.value = event.payload.text;
  });
  void listen<string>("voice-error", (event) => addMessage("error", event.payload));
  void listen("voice-stopped", () => {
    setListening(false);
    questionInput.focus();
  });
}

setUpVoice();
transport.onMessage(handleMessage);
