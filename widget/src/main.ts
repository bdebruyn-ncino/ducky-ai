import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import type { ServerMessage } from "../../shared/messages.ts";
import { createDuck } from "./duck.ts";
import { startsTyping } from "./keys.ts";
import { renderMarkdown } from "./markdown.ts";
import {
  CANCELLED_NOTE,
  IDLE_EMPTY,
  IDLE_FOLLOW_UP,
  IDLE_PLACEHOLDER,
  IDLE_TEXT_ONLY,
  LISTENING_HINT,
  LISTENING_PLACEHOLDER,
  NEW_CONVERSATION_HINT,
  NOTIFICATION_ANSWER,
  NOTIFICATION_ERROR,
  NOTIFICATION_WAITING,
  pickPhrase,
  SENDING_TEXT,
  WAITING_PHRASES,
  WORKING_PHRASES,
} from "./phrases.ts";
import { createTransport } from "./transport.ts";
import { setUpVoice } from "./voice.ts";

type MessageKind = "question" | "answer" | "error" | "note";
type Activity = "idle" | "working" | "waiting" | "sending";

// After a spoken question, wait this long so the user can stop it before it is sent.
const SEND_DELAY_SECONDS = 2;
// While Ducky works, the joke changes now and then so the line does not go stale.
const WORKING_PHRASE_MS = 4000;

const transport = createTransport();
let activeQuestionId: string | undefined;
let pendingSend: { secondsLeft: number; timer: number } | undefined;
let currentActivity: Activity = "idle";
let phraseTimer: number | undefined;
let listening = false;
let textOnly = false;
let dictationOn = true;
// Where new messages go: the body of the latest exchange (a question and everything that followed it).
let currentBody: HTMLElement | undefined;

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id} in index.html`);
  }
  return element as T;
}

const widget = byId<HTMLElement>("widget");
const messageList = byId<HTMLOListElement>("messages");
const statusLine = byId<HTMLParagraphElement>("working-text");
const statusHint = byId<HTMLParagraphElement>("status-hint");
const cancelButton = byId<HTMLButtonElement>("cancel");
const form = byId<HTMLFormElement>("ask-form");
const questionInput = byId<HTMLInputElement>("question");
const askButton = byId<HTMLButtonElement>("ask");
const duckButton = byId<HTMLButtonElement>("duck");
const duck = createDuck(duckButton);
const typeToggle = byId<HTMLButtonElement>("type-toggle");
const modeToggle = byId<HTMLButtonElement>("mode-toggle");
const newSessionButton = byId<HTMLButtonElement>("new-session");

// ---- The conversation: exchanges, newest open, older ones folded to one line ----

function setView() {
  widget.dataset.view = messageList.querySelector(".exchange") ? "conversation" : "empty";
}

function startExchange(question: string) {
  currentBody?.parentElement?.classList.add("collapsed");

  const exchange = document.createElement("li");
  exchange.className = "exchange";
  const title = document.createElement("button");
  title.type = "button";
  title.className = "exchange-title";
  // textContent, never innerHTML: this is the user's own text, but the habit keeps us safe.
  title.textContent = question;
  title.addEventListener("click", () => exchange.classList.toggle("collapsed"));
  const body = document.createElement("div");
  body.className = "exchange-body";
  exchange.append(title, body);

  messageList.append(exchange);
  currentBody = body;
  setView();
  exchange.scrollIntoView({ block: "end" });
}

// Messages inside an exchange are divs; before the first question they sit straight in the list.
function createMessageElement(className: string): HTMLElement {
  const element = document.createElement(currentBody ? "div" : "li");
  element.className = `message ${className}`;
  return element;
}

function appendToConversation(element: HTMLElement) {
  (currentBody ?? messageList).append(element);
  element.scrollIntoView({ block: "end" });
}

function addMessage(kind: MessageKind, text: string) {
  if (kind === "question") {
    startExchange(text);
    return;
  }
  const item = createMessageElement(kind);
  // textContent, never innerHTML: answers come from an agent reading arbitrary repos.
  item.textContent = text;
  appendToConversation(item);
}

// ---- The stage: the duck and one line saying what is going on ----

function idleStatus(): string {
  if (textOnly) {
    return IDLE_TEXT_ONLY;
  }
  return widget.dataset.view === "empty" ? IDLE_EMPTY : IDLE_FOLLOW_UP;
}

function showIdleStatus() {
  statusLine.textContent = idleStatus();
  statusHint.textContent = "";
}

function showPhrase(phrases: string[]) {
  statusLine.textContent = pickPhrase(phrases, statusLine.textContent ?? undefined);
  statusHint.textContent = "";
}

function setActivity(activity: Activity) {
  const changed = activity !== currentActivity;
  currentActivity = activity;
  cancelButton.hidden = activity === "idle";
  if (changed) {
    window.clearInterval(phraseTimer);
    if (activity === "working") {
      showPhrase(WORKING_PHRASES);
      phraseTimer = window.setInterval(() => showPhrase(WORKING_PHRASES), WORKING_PHRASE_MS);
    } else if (activity === "waiting") {
      showPhrase(WAITING_PHRASES);
    } else if (activity === "idle" && !listening) {
      showIdleStatus();
    }
  }
  askButton.disabled = activity === "working" || activity === "waiting";
  newSessionButton.disabled = activity !== "idle";
  duck.setActivity(activity);
}

function syncDuckVoice() {
  // In text-only mode voice is not wanted, so a missing Dictation switch is nothing to mourn.
  duck.setVoiceAvailable(dictationOn || textOnly);
}

// ---- The text box: tucked away until wanted, always there in text-only mode ----

function showTextBox() {
  form.hidden = false;
  typeToggle.hidden = true;
  questionInput.focus();
}

function hideTextBox() {
  if (textOnly) {
    return;
  }
  form.hidden = true;
  typeToggle.hidden = false;
}

function applyTextOnly(on: boolean) {
  textOnly = on;
  form.hidden = !on;
  typeToggle.hidden = on;
  syncDuckVoice();
  if (currentActivity === "idle" && !listening && !pendingSend) {
    showIdleStatus();
  }
}

// ---- Asking ----

function finishQuestion() {
  activeQuestionId = undefined;
  // Confirmation buttons left over from this question (for example after Cancel) can no longer be used.
  messageList.querySelectorAll(".message.confirmation button").forEach((button) => button.remove());
  setActivity("idle");
  if (!form.hidden) {
    questionInput.focus();
  }
}

function sendQuestion(question: string) {
  if (!question || activeQuestionId) {
    return;
  }

  activeQuestionId = crypto.randomUUID();
  addMessage("question", question);
  questionInput.value = "";
  hideTextBox();
  setActivity("working");
  transport.send({ type: "ask", id: activeQuestionId, question });
}

function showCountdown(secondsLeft: number) {
  setActivity("sending");
  statusHint.textContent = `${SENDING_TEXT} ${secondsLeft}... click the duck or press Esc to edit`;
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
// The stage shows what Ducky heard while it counts down.
function startCountdown(text: string) {
  questionInput.value = text;
  if (activeQuestionId) {
    // Still answering the last question: leave the text in the box for the user to send.
    showTextBox();
    return;
  }

  stopCountdownTimer();
  statusLine.textContent = text;
  pendingSend = { secondsLeft: SEND_DELAY_SECONDS, timer: window.setInterval(tickCountdown, 1000) };
  showCountdown(SEND_DELAY_SECONDS);
}

// Returns true if there was a countdown to stop. The text moves to the box so it can be edited.
function cancelCountdown(): boolean {
  if (!pendingSend) {
    return false;
  }

  stopCountdownTimer();
  setActivity("idle");
  showTextBox();
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

// ---- Messages from the sidecar ----

function handleMessage(message: ServerMessage) {
  switch (message.type) {
    case "status":
      setActivity("working");
      break;
    case "answer": {
      const item = createMessageElement("answer");
      item.append(renderMarkdown(message.text));
      appendToConversation(item);
      void notifyIfHidden(NOTIFICATION_ANSWER);
      finishQuestion();
      duck.react("done");
      break;
    }
    case "error":
      addMessage("error", message.message);
      void notifyIfHidden(NOTIFICATION_ERROR);
      finishQuestion();
      duck.react("error");
      break;
    case "cancelled":
      addMessage("note", CANCELLED_NOTE);
      finishQuestion();
      duck.react("cancelled");
      break;
    case "confirmation-request": {
      const item = createMessageElement("confirmation");
      item.dataset.confirmationId = message.confirmationId;

      const label = document.createElement("span");
      // textContent, never innerHTML: summary comes from the agent.
      label.textContent = message.summary;
      item.append(label);

      const respond = (approved: boolean, choice?: string) => {
        item.querySelectorAll("button").forEach((b) => b.remove());
        const result = document.createElement("span");
        result.className = "confirmation-result";
        result.textContent = approved ? (choice ?? "Approved") : "Denied";
        item.append(result);
        transport.send({
          type: "confirmation-response",
          id: message.id,
          confirmationId: message.confirmationId,
          approved,
          choice,
        });
        // The agent carries on after any answer. If it was a no, the sidecar follows up with "cancelled".
        setActivity("working");
      };

      const addButton = (className: string, label: string, onClick: () => void) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = className;
        button.textContent = label;
        button.addEventListener("click", onClick);
        item.append(button);
      };

      if (message.options && message.options.length > 0) {
        // Repo picker or other multi-choice prompt.
        for (const option of message.options) {
          addButton("confirm-option", option, () => respond(true, option));
        }
        addButton("confirm-deny", "Cancel", () => respond(false));
      } else {
        // Approve / Deny for a write-action confirmation.
        addButton("confirm-approve", "Approve", () => respond(true));
        addButton("confirm-deny", "Deny", () => respond(false));
      }

      appendToConversation(item);
      setActivity("waiting");
      void notifyIfHidden(NOTIFICATION_WAITING);
      break;
    }
    case "confirmation-expired": {
      const item = [...messageList.querySelectorAll<HTMLElement>(".message.confirmation")].find(
        (candidate) => candidate.dataset.confirmationId === message.confirmationId,
      );
      if (item) {
        item.querySelectorAll("button").forEach((button) => button.remove());
        const result = document.createElement("span");
        result.className = "confirmation-result";
        result.textContent = "No answer, so it was denied.";
        item.append(result);
      }
      // The agent carries on without it.
      setActivity("working");
      break;
    }
    case "session-cleared":
      messageList.replaceChildren();
      currentBody = undefined;
      setView();
      showIdleStatus();
      statusHint.textContent = NEW_CONVERSATION_HINT;
      break;
    case "ready":
      break;
  }
}

// ---- Wiring ----

const voice = setUpVoice(duckButton, modeToggle, {
  onPartialTranscript: (text) => {
    // What Ducky hears shows on the stage as you speak.
    statusLine.textContent = text;
    questionInput.value = text;
  },
  onFinalTranscript: (text) => {
    if (text.trim()) {
      startCountdown(text.trim());
    }
  },
  onError: (message) => {
    addMessage("error", message);
    duck.react("error");
  },
  onDictationChanged: (isOn) => {
    dictationOn = isOn;
    syncDuckVoice();
  },
  onModeChanged: applyTextOnly,
  onListeningChanged: (isListening) => {
    listening = isListening;
    duck.setListening(isListening);
    questionInput.placeholder = isListening ? LISTENING_PLACEHOLDER : IDLE_PLACEHOLDER;
    if (isListening) {
      statusLine.textContent = LISTENING_PLACEHOLDER;
      statusHint.textContent = LISTENING_HINT;
    } else if (currentActivity === "idle" && !pendingSend) {
      showIdleStatus();
    }
  },
  onDuckClick: () => {
    if (cancelCountdown()) {
      return true;
    }
    if (textOnly) {
      // No voice in text-only mode: the duck just points at the text box.
      showTextBox();
      return true;
    }
    return false;
  },
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

typeToggle.addEventListener("click", showTextBox);

cancelButton.addEventListener("click", () => {
  if (cancelCountdown()) {
    return;
  }
  if (activeQuestionId) {
    transport.send({ type: "cancel", id: activeQuestionId });
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (cancelCountdown()) {
      return;
    }
    if (voice.isListening()) {
      voice.stop();
      return;
    }
    void getCurrentWindow().hide();
    return;
  }

  // Just start typing: the text box appears and takes the key.
  const focusIsOnButton = document.activeElement instanceof HTMLButtonElement;
  if (document.activeElement !== questionInput && !listening && startsTyping(event, focusIsOnButton)) {
    showTextBox();
  }
});

// The hotkey shows the window, so start typing straight away if the box is showing.
window.addEventListener("focus", () => {
  if (!form.hidden) {
    questionInput.focus();
  }
});

newSessionButton.addEventListener("click", () => {
  transport.send({ type: "new-session" });
});

transport.onMessage(handleMessage);
