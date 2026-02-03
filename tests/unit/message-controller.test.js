import test from "node:test";
import assert from "node:assert/strict";

import { createMessageController } from "../../src/ux/popup/home/message-controller.js";

function makeFakeTimers() {
  let nextId = 1;
  const timers = new Map();

  return {
    setTimeoutFn: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { fn, ms, cleared: false });
      return id;
    },
    clearTimeoutFn: (id) => {
      const t = timers.get(id);
      if (t) t.cleared = true;
    },
    run: (id) => {
      const t = timers.get(id);
      if (!t || t.cleared) return;
      t.fn();
    },
    latestId: () => Math.max(0, ...timers.keys()),
    isCleared: (id) => timers.get(id)?.cleared ?? false,
  };
}

function makeFakeDocument() {
  const listeners = new Map();

  const makeEl = (id) => ({
    id,
    hidden: true,
    textContent: "",
    addEventListener: (evt, cb) => {
      listeners.set(`${id}:${evt}`, cb);
    },
  });

  const els = {
    message: makeEl("message"),
    messageText: makeEl("messageText"),
    messageClose: makeEl("messageClose"),
  };

  return {
    getElementById: (id) => els[id],
    click: (id) => {
      const cb = listeners.get(`${id}:click`);
      if (!cb) throw new Error(`No click listener for ${id}`);
      cb({ stopPropagation: () => {} });
    },
    els,
  };
}

test("message controller: auto-despawn + click-to-dismiss", () => {
  const doc = makeFakeDocument();
  const timers = makeFakeTimers();

  const controller = createMessageController(doc, timers);

  controller.showText("Hello", { durationMs: 4000 });
  assert.equal(doc.els.message.hidden, false);
  assert.equal(doc.els.messageText.textContent, "Hello");

  const firstTimer = timers.latestId();
  controller.showText("Second", { durationMs: 4000 });

  // Previous timer is cleared; message updates immediately.
  assert.equal(timers.isCleared(firstTimer), true);
  assert.equal(doc.els.messageText.textContent, "Second");

  const secondTimer = timers.latestId();
  timers.run(secondTimer);
  assert.equal(doc.els.message.hidden, true);
  assert.equal(doc.els.messageText.textContent, "");

  controller.showText("Dismiss me", { durationMs: 4000 });
  assert.equal(doc.els.message.hidden, false);

  doc.click("message");
  assert.equal(doc.els.message.hidden, true);
});

test("message controller: message kinds are informative", () => {
  const doc = makeFakeDocument();
  const timers = makeFakeTimers();
  const controller = createMessageController(doc, timers);

  assert.equal(
    controller.getMessage("topic-empty", { topic: "trees", target: "suggested", availability: "no-problems" }),
    "No problems found for trees."
  );

  assert.equal(
    controller.getMessage("topic-empty", { topic: "trees", target: "easy", availability: "no-problems" }),
    "No easy problems found for trees."
  );

  assert.equal(
    controller.getMessage("topic-empty", { topic: "trees", target: "easy", availability: "no-unsolved" }),
    "No unsolved easy problems left for trees."
  );

  assert.equal(
    controller.getMessage("practice-empty", { practiceType: "suggested" }),
    "No recommended problems available right now. Try refresh."
  );

  assert.equal(
    controller.getMessage("practice-empty", { practiceType: "suggested", availability: "no-unsolved" }),
    "No recommended problems left. Pick a topic or use Random."
  );

  assert.equal(
    controller.getMessage("practice-empty", { practiceType: "suggested", availability: "no-problems" }),
    "No recommended problems found. Try refresh."
  );

  assert.equal(
    controller.getMessage("practice-empty", { practiceType: "random", availability: "no-unsolved" }),
    "No unsolved problems left. Try Review or pick a topic."
  );
});
