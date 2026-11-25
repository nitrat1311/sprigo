import React from "react";
import i18n from "./i18n";

type Props = { children: React.ReactNode; scope?: "app" | "call" };
type State = { error: Error | null; info: React.ErrorInfo | null; version: string; copied: boolean };

/** A missing translation comes back as its key: show the English default instead. */
function tr(key: string, fallback: string) {
  try {
    const v = i18n.t(key);
    return typeof v === "string" && v && v !== key ? v : fallback;
  } catch { return fallback; }
}

/** Last line of defence: a render crash shows a report instead of a blank window.
 *  It deliberately uses no store, database or React hooks, since any of them can be the thing that failed;
 *  translations come straight from the i18n instance. */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: null, version: "", copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> { return { error }; }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("render error", error, info.componentStack);
    this.setState({ info });
    // The version exists only in the Tauri shell; a browser preview (dev, e2e) goes without it, and this must never throw.
    if ("__TAURI_INTERNALS__" in window)
      void import("@tauri-apps/api/app").then((a) => a.getVersion()).then((version) => this.setState({ version }), () => {});
  }

  private details = () => {
    const { error, info, version } = this.state;
    return [
      `${error?.name ?? "Error"}: ${error?.message ?? String(error)}`,
      error?.stack ?? "",
      info?.componentStack ? `Component stack:${info.componentStack}` : "",
      version ? `${tr("error.version", "Version")}: ${version}` : "",
    ].filter(Boolean).join("\n\n");
  };

  private copy = () => {
    void navigator.clipboard?.writeText(this.details()).then(() => this.setState({ copied: true }), () => {});
  };

  render() {
    const { error, copied } = this.state;
    if (!error) return this.props.children;
    const title = tr("error.title", "Something went wrong");
    const screen = (
      <div className="boot-error" role="alert">
        <div className="card od-stack" style={{ "--od-gap": "var(--s-4)" } as React.CSSProperties}>
          <h3>{title}</h3>
          <p className="muted">{tr("error.desc", "Sprigo hit an unexpected error while drawing this screen. Your data is safe. Reload to carry on; if it happens again, copy the details below and send them to the developer.")}</p>
          <button className="btn btn-primary btn-block" onClick={() => location.reload()}>{tr("error.reload", "Reload")}</button>
          <details>
            <summary>{tr("error.details", "Technical details")}</summary>
            <pre className="boot-detail">{this.details()}</pre>
          </details>
          <button className="btn btn-ghost btn-block" onClick={this.copy}>{copied ? tr("error.copied", "Copied") : tr("error.copy", "Copy details")}</button>
        </div>
      </div>
    );
    // Inside a live lesson the fallback takes the whole screen, as the call it replaces did.
    return this.props.scope === "call"
      ? <div className="lesson-overlay open" role="dialog" aria-modal="true" aria-label={title}>{screen}</div>
      : screen;
  }
}

/** e2e only: `?crash=1` forces a render error, so the error screen itself is covered. Never included in production builds. */
export function CrashProbe({ children }: { children: React.ReactNode }) {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has("crash")) throw new Error("Forced render error for the error screen test");
  return <>{children}</>;
}
