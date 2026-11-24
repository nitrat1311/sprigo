import { test } from "node:test";
import assert from "node:assert/strict";
import { unlockOnGesture } from "./audioUnlock.ts";

/** A document stand-in that records listeners and can fire them like a real event target. */
function fakeDoc() {
  const listeners = new Map<string, { fn: () => void; opts?: AddEventListenerOptions }[]>();
  return {
    addEventListener(type: string, fn: () => void, opts?: AddEventListenerOptions) {
      const list = listeners.get(type) ?? [];
      list.push({ fn, opts });
      listeners.set(type, list);
    },
    removeEventListener(type: string, fn: () => void) {
      listeners.set(type, (listeners.get(type) ?? []).filter((l) => l.fn !== fn));
    },
    fire(type: string) { for (const l of [...(listeners.get(type) ?? [])]) l.fn(); },
    count: (type: string) => (listeners.get(type) ?? []).length,
    types: () => [...listeners.keys()].filter((k) => (listeners.get(k) ?? []).length).sort(),
  };
}

test("unlock runs on pointerup and touchend, not on the events that grant no activation", () => {
  const doc = fakeDoc();
  let calls = 0;
  unlockOnGesture(() => { calls++; return false; }, doc);
  assert.deepEqual(doc.types(), ["pointerup", "touchend"]); // touchstart/pointerdown would never unlock
  doc.fire("pointerdown"); doc.fire("touchstart");
  assert.equal(calls, 0);
  doc.fire("pointerup");
  assert.equal(calls, 1);
  doc.fire("touchend");
  assert.equal(calls, 2);
});

test("listeners are removed only once the unlock succeeds", () => {
  const doc = fakeDoc();
  let unlock = false;
  unlockOnGesture(() => unlock, doc);

  doc.fire("pointerup");
  assert.equal(doc.count("pointerup"), 1); // still suspended: keep listening...
  doc.fire("pointerup");
  assert.equal(doc.count("pointerup"), 1); // ...so it can retry on the next tap

  unlock = true;
  doc.fire("pointerup");
  assert.deepEqual(doc.types(), []); // running: stop listening on both events
});

test("the unlock listeners are registered passive, so they never hold up a tap", () => {
  const seen: AddEventListenerOptions[] = [];
  const doc = {
    addEventListener: (_t: string, _f: () => void, o?: AddEventListenerOptions) => { if (o) seen.push(o); },
    removeEventListener: () => {},
  };
  unlockOnGesture(() => false, doc);
  assert.equal(seen.length, 2);
  assert.ok(seen.every((o) => o.passive === true));
});

test("a rejected or throwing unlock stops retrying instead of listening forever", async () => {
  const rejected = fakeDoc();
  unlockOnGesture(() => Promise.reject(new Error("no audio")), rejected);
  rejected.fire("pointerup");
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(rejected.types(), []);

  const thrown = fakeDoc();
  unlockOnGesture(() => { throw new Error("no speechSynthesis"); }, thrown);
  thrown.fire("touchend");
  assert.deepEqual(thrown.types(), []);
});

test("an unlock that resolves true removes the listeners, one that resolves false keeps them", async () => {
  let ok = false;
  const doc = fakeDoc();
  unlockOnGesture(() => Promise.resolve(ok), doc);
  doc.fire("pointerup");
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(doc.types(), ["pointerup", "touchend"]);
  ok = true;
  doc.fire("touchend");
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(doc.types(), []);
});

test("the returned stop() takes the listeners off before any unlock", () => {
  const doc = fakeDoc();
  const stop = unlockOnGesture(() => false, doc);
  stop();
  assert.deepEqual(doc.types(), []);
});
