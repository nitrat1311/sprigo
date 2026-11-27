import { expect, test } from "@playwright/test";

test("Romanian Piper recovers from a hung worker without reloading the app", async ({ page }) => {
  await page.addInitScript(() => {
    const RealWorker = window.Worker;
    let piperWorkers = 0;
    window.Worker = class extends RealWorker {
      private piperId = 0;

      constructor(url: string | URL, options?: WorkerOptions) {
        const piper = String(url).includes("piper.worker");
        super(piper ? "data:text/javascript," : url, options);
        if (piper) this.piperId = ++piperWorkers;
      }

      postMessage(message: { type: string; voice: string; id: number }, ...args: []) {
        if (!this.piperId) { super.postMessage(message, ...args); return; }
        const deliver = (data: Record<string, unknown>) => queueMicrotask(() =>
          this.dispatchEvent(new MessageEvent("message", { data })));
        if (message.type === "load") deliver({ type: "ready", voice: message.voice });
        if (message.type === "speak" && this.piperId > 1) {
          deliver({ type: "chunk", id: message.id, audio: new Float32Array(2400), rate: 24000 });
          deliver({ type: "end", id: message.id });
        }
      }
    };
    const realTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) =>
      realTimeout(callback, delay === 60_000 ? 100 : delay, ...args);
  });
  await page.goto("/");
  const play = await page.evaluate(async () => {
    const dbPath = "/src/db.ts", ttsPath = "/src/tts.ts";
    const [{ setSetting }, tts] = await Promise.all([import(dbPath), import(ttsPath)]);
    await setSetting("tts", "piper");
    const played: string[] = [];
    for (const line of ["Bună ziua!", "După ce primim răspunsul, stabilim data."]) {
      await tts.speak(line, "ro", undefined, () => played.push(tts.speakingWith()));
    }
    return played;
  });
  expect(play).toEqual(["piper", "piper"]);
});
