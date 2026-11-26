import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import type { ServerMessage } from "../../shared/messages.ts";
import { createDuck } from "./duck.ts";
import { renderHistory } from "./history.ts";
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
  SETUP_DEFAULT_HINT,
  SETUP_HINT,
  SETUP_STATUS,
  SETUP_UNFINISHED_HINT,
  WAITING_PHRASES,
  WORKING_PHRASES,
} from "./phrases.ts";
import { createTransport } from "./transport.ts";
import { setUpVoice } from "./voice.ts";

type MessageKind = "question" | "answer" | "error" | "note" | "prompt" | "reply";
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
const runSetupButton = byId<HTMLButtonElement>("run-setup");
const historyPanel = byId<HTMLElement>("history");
const historyList = byId<HTMLOListElement>("history-list");
const historyToggle = byId<HTMLButtonElement>("history-toggle");
const historyClear = byId<HTMLButtonElement>("history-clear");
const historyClose = byId<HTMLButtonElement>("history-close");

// When non-null, the form input answers a setup prompt instead of sending an ask.
let activeSetupId: string | undefined;
// True from the first setup step until the sidecar says setup is over.
let setupActive = false;
// The id of the setup step that is waiting, so Cancel can name it.
let setupStepId: string | undefined;

// ---- The conversation: exchanges, newest open, older ones folded to one line ----

function setView() {
  // Anything in the list (an exchange, a setup note, an error) means a conversation has begun.
  widget.dataset.view = messageList.childElementCount > 0 ? "conversation" : "empty";
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
  setView();
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
  if (setupActive) {
    return SETUP_STATUS;
  }
  if (textOnly) {
    return IDLE_TEXT_ONLY;
  }
  return widget.dataset.view === "empty" ? IDLE_EMPTY : IDLE_FOLLOW_UP;
}

function showIdleStatus() {
  statusLine.textContent = idleStatus();
  statusHint.textContent = setupActive ? SETUP_HINT : "";
}

// Which buttons make sense right now. Setup counts as busy, so Cancel stays available throughout it.
function updateControls() {
  const free = currentActivity === "idle" && !setupActive;
  cancelButton.hidden = free;
  askButton.disabled = currentActivity === "working" || currentActivity === "waiting";
  newSessionButton.disabled = !free;
  // While setup is running the Setup button has nothing to offer, so it steps out of the way.
  runSetupButton.hidden = setupActive;
  runSetupButton.disabled = !free;
}

function showPhrase(phrases: string[]) {
  statusLine.textContent = pickPhrase(phrases, statusLine.textContent ?? undefined);
}

function setActivity(activity: Activity) {
  const changed = activity !== currentActivity;
  currentActivity = activity;
  if (changed) {
    window.clearInterval(phraseTimer);
    statusHint.textContent = "";
    if (activity === "working") {
      showPhrase(WORKING_PHRASES);
      phraseTimer = window.setInterval(() => showPhrase(WORKING_PHRASES), WORKING_PHRASE_MS);
    } else if (activity === "waiting") {
      showPhrase(WAITING_PHRASES);
    } else if (activity === "idle" && !listening) {
      showIdleStatus();
    }
  }
  updateControls();
  duck.setActivity(activity);
}

// ---- First-run setup: the sidecar asks the questions, the widget makes room for them ----

// Ducky starts hidden in the menu bar, so the first setup step brings the window forward.
async function bringWindowForward() {
  if (!isTauri()) {
    return;
  }
  const appWindow = getCurrentWindow();
  if (!(await appWindow.isVisible())) {
    await appWindow.show();
    await appWindow.setFocus();
  }
}

function beginSetup(stepId: string) {
  const isFirstStep = !setupActive;
  setupActive = true;
  setupStepId = stepId;
  if (isFirstStep) {
    void bringWindowForward();
  }
  updateControls();
  if (currentActivity === "idle" && !listening) {
    showIdleStatus();
  }
}

function endSetup(completed: boolean) {
  setupActive = false;
  setupStepId = undefined;
  activeSetupId = undefined;
  questionInput.placeholder = IDLE_PLACEHOLDER;
  removeStaleConfirmations();
  hideTextBox();
  // Setup is over, so whatever the duck was doing (waiting on a step, or "working" after a timeout) is over too.
  setActivity("idle");
  if (!listening) {
    showIdleStatus();
    if (!completed) {
      statusHint.textContent = SETUP_UNFINISHED_HINT;
    }
  }
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

// Confirmation buttons left over from a question or a setup step (for example after Cancel) can no longer be used.
function removeStaleConfirmations() {
  messageList.querySelectorAll(".message.confirmation button").forEach((button) => button.remove());
}

function finishQuestion() {
  activeQuestionId = undefined;
  removeStaleConfirmations();
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
      // The sidecar repeats a setup step when the widget says it is ready, so skip one that is already showing.
      if (messageList.querySelector(`[data-confirmation-id="${CSS.escape(message.confirmationId)}"]`)) {
        break;
      }
      // Setup asks its multiple-choice questions the same way, with ids that start with "setup".
      if (message.id.startsWith("setup")) {
        beginSetup(message.id);
      }
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
        // During setup nothing is working: the next setup step simply arrives.
        setActivity(setupActive ? "idle" : "working");
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
      // The agent carries on without it. (During setup nothing is working: the wizard ends or moves on.)
      setActivity(setupActive ? "idle" : "working");
      break;
    }
    case "session-cleared":
      messageList.replaceChildren();
      currentBody = undefined;
      setView();
      showIdleStatus();
      statusHint.textContent = NEW_CONVERSATION_HINT;
      break;
    case "setup-prompt": {
      if (activeSetupId === message.id) {
        break;
      }
      // The text box opens for this answer, and the next submit answers the prompt.
      beginSetup(message.id);
      activeSetupId = message.id;
      addMessage("prompt", message.prompt);
      questionInput.placeholder = message.placeholder ?? IDLE_PLACEHOLDER;
      showTextBox();
      if (message.defaultValue) {
        // The answer most people want, pre-filled and selected: Enter accepts it, typing replaces it.
        questionInput.value = message.defaultValue;
        questionInput.select();
        statusHint.textContent = SETUP_DEFAULT_HINT;
      }
      void notifyIfHidden(NOTIFICATION_WAITING);
      break;
    }
    case "note":
      addMessage("note", message.text);
      if (setupActive && currentActivity === "idle" && !listening) {
        // The wizard's progress ("Verifying AWS credentials...") shows next to the duck, not only in the list.
        statusHint.textContent = message.text;
      }
      break;
    case "setup-finished":
      endSetup(message.completed);
      break;
    case "activity":
      // What the agent is doing right now ("Reading README.md") shows under the pun.
      if (currentActivity === "working" && message.id === activeQuestionId) {
        statusHint.textContent = message.text;
      }
      break;
    case "history":
      renderHistory(historyList, message.entries);
      break;
    case "ready":
      // The sidecar (re)started. Tell it we are listening, so first-run setup can begin.
      transport.send({ type: "widget-ready" });
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
    if (textOnly || activeSetupId) {
      // No voice in text-only mode, and setup answers are typed: the duck just points at the text box.
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
  // During setup, the input answers the current setup prompt, not a question.
  if (activeSetupId) {
    const value = questionInput.value.trim();
    if (!value) {
      return;
    }
    const id = activeSetupId;
    activeSetupId = undefined;
    addMessage("reply", value);
    questionInput.value = "";
    questionInput.placeholder = IDLE_PLACEHOLDER;
    hideTextBox();
    transport.send({ type: "setup-response", id, value });
    return;
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
  } else if (setupActive) {
    // Setup is not a question, so Cancel names the setup step that is waiting.
    transport.send({ type: "cancel", id: setupStepId ?? "setup" });
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!historyPanel.hidden) {
      closeHistory();
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

// ---- History: what was asked, what Ducky looked at, and how it went ----

const CLEAR_CONFIRM_MS = 3000;
let clearTimer: number | undefined;

function openHistory() {
  historyPanel.hidden = false;
  transport.send({ type: "history-request" });
}

function closeHistory() {
  historyPanel.hidden = true;
  resetClearButton();
}

function resetClearButton() {
  window.clearTimeout(clearTimer);
  historyClear.textContent = "Clear";
}

historyToggle.addEventListener("click", openHistory);
historyClose.addEventListener("click", closeHistory);
// Clearing deletes everything, so it takes two clicks.
historyClear.addEventListener("click", () => {
  if (historyClear.textContent === "Clear") {
    historyClear.textContent = "Click again to clear";
    clearTimer = window.setTimeout(resetClearButton, CLEAR_CONFIRM_MS);
    return;
  }
  resetClearButton();
  transport.send({ type: "history-clear" });
});

newSessionButton.addEventListener("click", () => {
  transport.send({ type: "new-session" });
});

runSetupButton.addEventListener("click", () => {
  transport.send({ type: "run-setup" });
});

transport.onMessage(handleMessage);
// The sidecar may have started before this page was listening, so say so now. If nothing is saved yet,
// this is what makes first-run setup begin as soon as Ducky opens.
transport.send({ type: "widget-ready" });
