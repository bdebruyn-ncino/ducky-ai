import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeClientMessage, decodeServerMessage, encode } from "../../shared/messages.ts";

test("a client message survives encode and decode", () => {
  const message = { type: "ask", id: "q1", question: "why is it failing?" } as const;
  assert.deepEqual(decodeClientMessage(encode(message)), message);
});

test("a widget-ready message is understood", () => {
  assert.deepEqual(decodeClientMessage('{"type":"widget-ready"}'), { type: "widget-ready" });
});

test("an ask may omit the project but not the question", () => {
  assert.doesNotThrow(() => decodeClientMessage('{"type":"ask","id":"q1","question":"hi"}'));
  assert.throws(() => decodeClientMessage('{"type":"ask","id":"q1"}'), /valid client message/);
});

test("a confirmation response needs a boolean approved", () => {
  const line = '{"type":"confirmation-response","id":"q1","confirmationId":"c1","approved":"yes"}';
  assert.throws(() => decodeClientMessage(line), /valid client message/);
});

test("a setup-finished message is understood", () => {
  const message = decodeServerMessage('{"type":"setup-finished","completed":true}');
  assert.deepEqual(message, { type: "setup-finished", completed: true });
});

test("a setup prompt can carry a suggestion to pre-fill", () => {
  const line = '{"type":"setup-prompt","id":"setup-repos-root","prompt":"Where?","defaultValue":"/Users/me/Repos"}';
  assert.deepEqual(decodeServerMessage(line), {
    type: "setup-prompt",
    id: "setup-repos-root",
    prompt: "Where?",
    defaultValue: "/Users/me/Repos",
  });
});

test("an unknown server message type is rejected", () => {
  assert.throws(() => decodeServerMessage('{"type":"nonsense"}'), /valid server message/);
});
