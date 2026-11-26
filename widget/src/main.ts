import { getCurrentWindow } from "@tauri-apps/api/window";
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

function handleMessage(message: ServerMessage) {
  switch (message.type) {
    case "status":
      setActivity("working");
      break;
    case "answer":
      addMessage("answer", message.text);
      finishQuestion();
      break;
    case "error":
      addMessage("error", message.message);
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

transport.onMessage(handleMessage);
