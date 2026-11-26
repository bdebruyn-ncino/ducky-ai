import duckMarkup from "./assets/duck.svg?raw";

export type DuckActivity = "idle" | "working" | "waiting" | "sending";
type Reaction = "done" | "error" | "cancelled";
export type DuckState = DuckActivity | Reaction | "listening" | "dead";

// How long a reaction (done, error, cancelled) shows before the duck settles back down.
const REACTION_MS = 2000;

export interface Duck {
  setListening(listening: boolean): void;
  setActivity(activity: DuckActivity): void;
  setVoiceAvailable(available: boolean): void;
  react(reaction: Reaction): void;
}

// The duck's look comes from CSS: this only sets `data-state` on the button.
export function createDuck(button: HTMLElement): Duck {
  const art = button.querySelector(".duck-art");
  if (!art) {
    throw new Error("Missing .duck-art inside the duck button");
  }
  // Our own static drawing, never user or agent text, so it is safe to insert as markup.
  art.innerHTML = duckMarkup;

  let listening = false;
  let voiceAvailable = true;
  let activity: DuckActivity = "idle";
  let reaction: Reaction | undefined;
  let reactionTimer: number | undefined;

  // When several things are going on, what the user is doing wins, then a reaction, then what Ducky is doing.
  // With Dictation off the resting duck is knocked out, since voice cannot work.
  function currentState(): DuckState {
    if (listening) {
      return "listening";
    }
    if (reaction) {
      return reaction;
    }
    return activity === "idle" && !voiceAvailable ? "dead" : activity;
  }

  function render() {
    button.dataset.state = currentState();
  }

  function clearReaction() {
    window.clearTimeout(reactionTimer);
    reaction = undefined;
  }

  function react(next: Reaction) {
    clearReaction();
    reaction = next;
    reactionTimer = window.setTimeout(() => {
      reaction = undefined;
      render();
    }, REACTION_MS);
    render();
  }

  render();

  return {
    react,
    setListening(next) {
      listening = next;
      render();
    },
    setActivity(next) {
      activity = next;
      if (next !== "idle") {
        // A new question started, so the old reaction is over.
        clearReaction();
      }
      render();
    },
    setVoiceAvailable(next) {
      const revived = !voiceAvailable && next;
      voiceAvailable = next;
      if (revived) {
        // Dictation came back on: the duck perks up with sparkles.
        react("done");
      } else {
        render();
      }
    },
  };
}
