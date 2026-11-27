// OpenRouter sign-in (#197): OAuth PKCE in the system browser. The code is exchanged on the Rust side and the API key
// goes straight into the OS keychain (DECISIONS A6), so the key never passes through the webview.
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./db";

/** ok: the key is saved. cancelled: the learner closed or denied. timeout: no answer in five minutes. */
export type OpenRouterSignIn = "ok" | "cancelled" | "timeout";

export async function signInOpenRouter(p: { verifier: string; challenge: string; state: string }): Promise<OpenRouterSignIn> {
  if (!isTauri) throw new Error("OpenRouter sign-in needs the desktop app");
  return invoke<OpenRouterSignIn>("openrouter_signin", p);
}

/** Stops a pending sign-in, e.g. when its sheet closes. Harmless when none is running. */
export async function cancelOpenRouter(): Promise<void> {
  if (isTauri) await invoke("openrouter_cancel").catch(() => {});
}
