// What the duck says in the status line. The jokes are about being a duck; the facts stay clear.

export const WORKING_PHRASES = [
  "Paddling furiously...",
  "Waddling through your repo...",
  "Getting my ducks in a row...",
  "Diving for answers...",
  "Following the breadcrumbs...",
  "Ducking into the code...",
  "Quack-ulating...",
  "Wading through the details...",
  "Preening my feathers while I think...",
  "Swimming upstream...",
  "Looking under every lily pad...",
  "Feeling a bit quacky, almost there...",
];

export const WAITING_PHRASES = [
  "Quack! Your call.",
  "Over to you, I'm just a duck.",
  "Your move, I'll tread water.",
  "Paddling in place until you answer...",
  "I need a quick yes or no from you.",
];

export const IDLE_EMPTY = "Click me and ask away";
export const IDLE_FOLLOW_UP = "Anything else? Click me or just start typing.";
export const IDLE_TEXT_ONLY = "Type your question below.";
export const LISTENING_HINT = "Click the duck to stop";
export const NEW_CONVERSATION_HINT = "Fresh pond. New conversation.";

export const SETUP_STATUS = "Setting up Ducky...";
export const SETUP_HINT = "Answer below, or click Cancel to stop.";
export const SETUP_DEFAULT_HINT = "Press Enter to use this, or type your own.";
export const SETUP_UNFINISHED_HINT = "Setup wasn't finished. Click Setup to try again.";

export const SENDING_TEXT = "Taking flight in";
export const LISTENING_PLACEHOLDER = "Quack away, I'm listening...";
export const IDLE_PLACEHOLDER = "Ask Ducky...";
export const CANCELLED_NOTE = "Cancelled. Back to the pond.";
export const DICTATION_OFF_TOOLTIP =
  "Ducky is out cold. Turn on Dictation (System Settings, Keyboard, Dictation) to wake the duck up.";

export const NOTIFICATION_ANSWER = "Quack! Your answer is ready";
export const NOTIFICATION_ERROR = "Ducky hit a snag";
export const NOTIFICATION_WAITING = "Quack! Ducky needs you";

// A random phrase, but never the same one twice in a row.
export function pickPhrase(phrases: string[], previous?: string, random: () => number = Math.random): string {
  const choices = phrases.length > 1 ? phrases.filter((phrase) => phrase !== previous) : phrases;
  return choices[Math.floor(random() * choices.length)];
}
