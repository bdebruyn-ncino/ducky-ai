import { expect, test } from "vitest";
import { CANCELLED_NOTE, pickPhrase, WAITING_PHRASES, WORKING_PHRASES } from "./phrases.ts";

test("a phrase always comes from the list", () => {
  for (let run = 0; run < 50; run++) {
    expect(WORKING_PHRASES).toContain(pickPhrase(WORKING_PHRASES));
  }
});

test("the same phrase is never picked twice in a row", () => {
  for (const phrase of WAITING_PHRASES) {
    for (const random of [0, 0.25, 0.5, 0.99]) {
      expect(pickPhrase(WAITING_PHRASES, phrase, () => random)).not.toBe(phrase);
    }
  }
});

test("a list with one phrase still works", () => {
  expect(pickPhrase(["Only one"], "Only one")).toBe("Only one");
});

test("the jokes never leave the status line empty", () => {
  for (const phrase of [...WORKING_PHRASES, ...WAITING_PHRASES, CANCELLED_NOTE]) {
    expect(phrase.trim().length).toBeGreaterThan(0);
  }
});
