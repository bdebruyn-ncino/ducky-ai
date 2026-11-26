import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import type { ServerMessage } from "../../shared/messages.ts";
import { createTransport } from "./transport.ts";
import { setUpVoice } from "./voice.ts";

type MessageKind = "question" | "answer" | "error" | "note";
type Activity = "idle" | "working" | "waiting" | "sending";

// After a spoken question, wait this long so the user can stop it before it is sent.
const SEND_DELAY_SECONDS = 2;

const transport = createTransport();
let activeQuestionId: string | undefined;
let pendingSend: { secondsLeft: number; timer: number } | undefined;

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
const duckButton = byId<HTMLButtonElement>("duck");
const modeToggle = byId<HTMLButtonElement>("mode-toggle");

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
  askButton.disabled = activity === "working" || activity === "waiting";
  duckButton.classList.toggle("working", activity === "working");
  duckButton.classList.toggle("sending", activity === "sending");
}

function finishQuestion() {
  activeQuestionId = undefined;
  setActivity("idle");
  questionInput.focus();
}

function sendQuestion(question: string) {
  if (!question || activeQuestionId) {
    return;
  }

  activeQuestionId = crypto.randomUUID();
  addMessage("question", question);
  questionInput.value = "";
  setActivity("working");
  transport.send({ type: "ask", id: activeQuestionId, question });
}

function showCountdown(secondsLeft: number) {
  setActivity("sending");
  workingText.textContent = `Sending in ${secondsLeft}... click the duck or press Esc to edit`;
}

function stopCountdownTimer() {
  if (pendingSend) {
    window.clearInterval(pendingSend.timer);
    pendingSend = undefined;
  }
}

function tickCountdown() {
  if (!pendingSend) {
    return;
  }

  pendingSend.secondsLeft -= 1;
  if (pendingSend.secondsLeft > 0) {
    showCountdown(pendingSend.secondsLeft);
    return;
  }

  stopCountdownTimer();
  setActivity("idle");
  sendQuestion(questionInput.value.trim());
}

// A spoken question goes into the box, then is sent after a short delay unless the user steps in.
function startCountdown(text: string) {
  questionInput.value = text;
  if (activeQuestionId) {
    // Still answering the last question: leave the text in the box for the user to send.
    return;
  }

  stopCountdownTimer();
  pendingSend = { secondsLeft: SEND_DELAY_SECONDS, timer: window.setInterval(tickCountdown, 1000) };
  showCountdown(SEND_DELAY_SECONDS);
}

// Returns true if there was a countdown to stop. The text stays in the box for editing.
function cancelCountdown(): boolean {
  if (!pendingSend) {
    return false;
  }

  stopCountdownTimer();
  setActivity("idle");
  questionInput.focus();
  return true;
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

const voice = setUpVoice(duckButton, modeToggle, {
  onPartialTranscript: (text) => {
    questionInput.value = text;
  },
  onFinalTranscript: (text) => {
    if (text.trim()) {
      startCountdown(text.trim());
    }
  },
  onError: (message) => addMessage("error", message),
  onListeningChanged: (isListening) => {
    questionInput.placeholder = isListening ? "Listening..." : "Ask Ducky...";
  },
  onDuckClick: cancelCountdown,
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (pendingSend) {
    // Enter during the countdown means "send it now".
    stopCountdownTimer();
    setActivity("idle");
  }
  sendQuestion(questionInput.value.trim());
});

// Typing during the countdown means the user wants to change the question.
questionInput.addEventListener("input", () => {
  cancelCountdown();
});

cancelButton.addEventListener("click", () => {
  if (cancelCountdown()) {
    return;
  }
  if (activeQuestionId) {
    transport.send({ type: "cancel", id: activeQuestionId });
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }
  if (cancelCountdown()) {
    return;
  }
  if (voice.isListening()) {
    voice.stop();
    return;
  }
  void getCurrentWindow().hide();
});

// The hotkey shows the window, so start typing straight away.
window.addEventListener("focus", () => questionInput.focus());

transport.onMessage(handleMessage);
