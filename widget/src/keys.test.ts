import { expect, test } from "vitest";
import { startsTyping } from "./keys.ts";

const plain = { metaKey: false, ctrlKey: false, altKey: false };

test("a letter starts typing", () => {
  expect(startsTyping({ key: "w", ...plain }, false)).toBe(true);
  expect(startsTyping({ key: "w", ...plain }, true)).toBe(true);
});

test("shortcuts do not start typing", () => {
  expect(startsTyping({ key: "c", ...plain, metaKey: true }, false)).toBe(false);
  expect(startsTyping({ key: "c", ...plain, ctrlKey: true }, false)).toBe(false);
  expect(startsTyping({ key: "c", ...plain, altKey: true }, false)).toBe(false);
});

test("keys that are not characters do not start typing", () => {
  for (const key of ["Enter", "Escape", "Tab", "ArrowUp", "Shift"]) {
    expect(startsTyping({ key, ...plain }, false)).toBe(false);
  }
});

test("space on a focused button presses the button instead", () => {
  expect(startsTyping({ key: " ", ...plain }, true)).toBe(false);
  expect(startsTyping({ key: " ", ...plain }, false)).toBe(true);
});
