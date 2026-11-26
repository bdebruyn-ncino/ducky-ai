import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import type { ServerMessage } from "../../shared/messages.ts";
import { createDuck } from "./duck.ts";
import { renderMarkdown } from "./markdown.ts";
import {
  CANCELLED_NOTE,
  IDLE_PLACEHOLDER,
  LISTENING_PLACEHOLDER,
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
const duck = createDuck(duckButton);
const modeToggle = byId<HTMLButtonElement>("mode-toggle");
const newSessionButton = byId<HTMLButtonElement>("new-session");
const runSetupButton = byId<HTMLButtonElement>("run-setup");

// When non-null, the form input answers a setup prompt instead of sending an ask.
let activeSetupId: string | undefined;

function addMessage(kind: MessageKind, text: string) {
  const item = document.createElement("li");
  item.className = `message ${kind}`;
  // textContent, never innerHTML: answers come from an agent reading arbitrary repos.
  item.textContent = text;
  messageList.append(item);
  item.scrollIntoView({ block: "end" });
}

// While Ducky works, the joke changes now and then so the line does not go stale.
const WORKING_PHRASE_MS = 4000;
let currentActivity: Activity = "idle";
let phraseTimer: number | undefined;

function showPhrase(phrases: string[]) {
  workingText.textContent = pickPhrase(phrases, workingText.textContent ?? undefined);
}

function setActivity(activity: Activity) {
  const changed = activity !== currentActivity;
  currentActivity = activity;
  workingBar.hidden = activity === "idle";
  if (changed) {
    window.clearInterval(phraseTimer);
    if (activity === "working") {
      showPhrase(WORKING_PHRASES);
      phraseTimer = window.setInterval(() => showPhrase(WORKING_PHRASES), WORKING_PHRASE_MS);
    } else if (activity === "waiting") {
      showPhrase(WAITING_PHRASES);
    }
  }
  askButton.disabled = activity === "working" || activity === "waiting";
  newSessionButton.disabled = activity !== "idle";
  duck.setActivity(activity);
}

function finishQuestion() {
  activeQuestionId = undefined;
  // Confirmation buttons left over from this question (for example after Cancel) can no longer be used.
  messageList.querySelectorAll(".message.confirmation button").forEach((button) => button.remove());
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
  workingText.textContent = `${SENDING_TEXT} ${secondsLeft}... click the duck or press Esc to edit`;
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
    case "answer": {
      const item = document.createElement("li");
      item.className = "message answer";
      item.append(renderMarkdown(message.text));
      messageList.append(item);
      item.scrollIntoView({ block: "end" });
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
      const item = document.createElement("li");
      item.className = "message confirmation";
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

      if (message.options && message.options.length > 0) {
        // Repo picker or other multi-choice prompt.
        for (const option of message.options) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "confirm-option";
          btn.textContent = option;
          btn.addEventListener("click", () => respond(true, option));
          item.append(btn);
        }
        const denyBtn = document.createElement("button");
        denyBtn.type = "button";
        denyBtn.className = "confirm-deny";
        denyBtn.textContent = "Cancel";
        denyBtn.addEventListener("click", () => respond(false));
        item.append(denyBtn);
      } else {
        // Approve / Deny for a write-action confirmation.
        const approveBtn = document.createElement("button");
        approveBtn.type = "button";
        approveBtn.className = "confirm-approve";
        approveBtn.textContent = "Approve";
        approveBtn.addEventListener("click", () => respond(true));

        const denyBtn = document.createElement("button");
        denyBtn.type = "button";
        denyBtn.className = "confirm-deny";
        denyBtn.textContent = "Deny";
        denyBtn.addEventListener("click", () => respond(false));

        item.append(approveBtn, denyBtn);
      }

      messageList.append(item);
      item.scrollIntoView({ block: "end" });
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
      addMessage("note", "New conversation started.");
      break;
    case "setup-prompt": {
      // Switch the input into setup mode: next submit answers the prompt.
      activeSetupId = message.id;
      addMessage("note", message.prompt);
      if (message.placeholder) {
        questionInput.placeholder = message.placeholder;
      }
      // Enable the form so the user can type their answer.
      askButton.disabled = false;
      questionInput.focus();
      break;
    }
    case "note":
      addMessage("note", message.text);
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
  onError: (message) => {
    addMessage("error", message);
    duck.react("error");
  },
  onDictationChanged: (isOn) => duck.setVoiceAvailable(isOn),
  onListeningChanged: (isListening) => {
    duck.setListening(isListening);
    questionInput.placeholder = isListening ? LISTENING_PLACEHOLDER : IDLE_PLACEHOLDER;
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
  // During setup, the input answers the current setup prompt, not a question.
  if (activeSetupId) {
    const value = questionInput.value.trim();
    if (!value) {
      return;
    }
    const id = activeSetupId;
    activeSetupId = undefined;
    addMessage("question", value);
    questionInput.value = "";
    questionInput.placeholder = IDLE_PLACEHOLDER;
    transport.send({ type: "setup-response", id, value });
    return;
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

newSessionButton.addEventListener("click", () => {
  transport.send({ type: "new-session" });
});

runSetupButton.addEventListener("click", () => {
  transport.send({ type: "run-setup" });
});

transport.onMessage(handleMessage);
