//! OpenRouter sign-in (#197, OAuth PKCE). A one-shot HTTP server on 127.0.0.1 catches the browser's callback; the
//! code is exchanged for an API key here and the key is written straight into the OS keychain (DECISIONS A6).
//! Neither the code nor the key is logged, and the key never reaches the webview.
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

const AUTH: &str = "https://openrouter.ai/auth";
const EXCHANGE: &str = "https://openrouter.ai/api/v1/auth/keys";
const CALLBACK: &str = "/callback";
const WAIT: Duration = Duration::from_secs(300); // OpenRouter's codes live 10 minutes; five is plenty for a sign-in

/// The listener of the sign-in in progress, so the sheet can stop it when it closes.
static SERVER: Mutex<Option<Arc<Server>>> = Mutex::new(None);
static CANCELLED: AtomicBool = AtomicBool::new(false);

const DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Sprigo</title>
<body style=\"font-family:system-ui;padding:12vh 1.5rem;text-align:center\">
<h1>Signed in to OpenRouter</h1><p>You can close this tab and return to Sprigo.</p>";
const DENIED_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Sprigo</title>
<body style=\"font-family:system-ui;padding:12vh 1.5rem;text-align:center\">
<h1>Sign-in cancelled</h1><p>Nothing was changed. You can close this tab.</p>";
const WRONG_STATE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Sprigo</title>
<body style=\"font-family:system-ui;padding:12vh 1.5rem;text-align:center\">
<h1>Sign-in did not match</h1><p>Close this tab and try again from Sprigo.</p>";

enum Waiting {
    Code(String),
    Denied,
    Cancelled,
    Timeout,
}

fn page(status: u16, body: &'static str) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_string(body)
        .with_status_code(StatusCode(status))
        .with_header(Header::from_bytes("Content-Type", "text/html; charset=utf-8").unwrap())
}

fn header<'a>(req: &'a Request, name: &'static str) -> Option<&'a str> {
    req.headers().iter().find(|h| h.field.equiv(name)).map(|h| h.value.as_str())
}

/// Opens the browser at OpenRouter's consent page and waits (up to five minutes) for the loopback callback.
/// `challenge` and `state` come from the webview's PKCE helper; `verifier` returns with the code to exchange.
/// Returns "ok", "cancelled" or "timeout" so the sheet can stay quiet on a close and explain a timeout.
#[tauri::command]
pub async fn openrouter_signin(app: tauri::AppHandle, challenge: String, verifier: String, state: String) -> Result<String, String> {
    if [&challenge, &verifier, &state].iter().any(|v| v.is_empty() || v.len() > 256) {
        return Err("The sign-in request is incomplete".into());
    }
    let server = {
        let mut slot = SERVER.lock().map_err(|e| e.to_string())?;
        if slot.is_some() {
            return Err("An OpenRouter sign-in is already open".into());
        }
        // Port 0: the OS picks a free port, which OpenRouter allows for localhost callbacks.
        let server = Arc::new(Server::http(("127.0.0.1", 0)).map_err(|e| e.to_string())?);
        *slot = Some(server.clone());
        server
    };
    CANCELLED.store(false, Ordering::SeqCst);
    let port = match server.server_addr().to_ip() {
        Some(addr) => addr.port(),
        None => {
            finish();
            return Err("Could not start the sign-in listener".into());
        }
    };
    let url = match auth_url(&format!("http://127.0.0.1:{port}{CALLBACK}"), &challenge, &state) {
        Ok(url) => url,
        Err(e) => {
            finish();
            return Err(e);
        }
    };

    use tauri_plugin_opener::OpenerExt;
    if let Err(e) = app.opener().open_url(url, None::<&str>) {
        finish();
        return Err(e.to_string());
    }
    let waited = tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        match wait_for_callback(&server, port, &state)? {
            Waiting::Code(code) => {
                exchange(&code, &verifier)?;
                Ok("ok".into())
            }
            Waiting::Denied | Waiting::Cancelled => Ok("cancelled".into()),
            Waiting::Timeout => Ok("timeout".into()),
        }
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|r| r);
    finish();
    waited
}

/// Stops a pending sign-in, e.g. when its sheet closes.
#[tauri::command]
pub fn openrouter_cancel() {
    CANCELLED.store(true, Ordering::SeqCst);
    if let Ok(slot) = SERVER.lock() {
        if let Some(s) = slot.as_ref() {
            s.unblock();
            return;
        }
    }
    CANCELLED.store(false, Ordering::SeqCst); // nothing was waiting: keep the flag clear for the next sign-in
}

/// App exit: frees the port if a sign-in is still waiting.
pub fn stop() {
    finish();
}

fn finish() {
    if let Ok(mut slot) = SERVER.lock() {
        if let Some(s) = slot.take() {
            s.unblock();
        }
    }
}

fn auth_url(callback: &str, challenge: &str, state: &str) -> Result<String, String> {
    let mut url = tauri::Url::parse(AUTH).map_err(|e| e.to_string())?;
    url.query_pairs_mut()
        .append_pair("callback_url", callback)
        .append_pair("code_challenge", challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", state)
        .append_pair("key_label", "Sprigo");
    Ok(url.to_string())
}

fn wait_for_callback(server: &Server, port: u16, state: &str) -> Result<Waiting, String> {
    let deadline = Instant::now() + WAIT;
    loop {
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            return Ok(Waiting::Timeout);
        }
        match server.recv_timeout(left) {
            Ok(None) => return Ok(Waiting::Timeout),
            Ok(Some(req)) => {
                if let Some(done) = handle(req, port, state)? {
                    return Ok(done);
                }
            }
            // unblocked: the sheet closed (a cancel) or the app is exiting
            Err(_) => return Ok(if CANCELLED.swap(false, Ordering::SeqCst) { Waiting::Cancelled } else { Waiting::Timeout }),
        }
    }
}

/// The callback, or None for anything else (a stray favicon request, say), which keeps the wait going.
fn handle(req: Request, port: u16, state: &str) -> Result<Option<Waiting>, String> {
    // Only this machine's own page: a web page that rebinds its domain to 127.0.0.1 would send its own Host.
    let host = header(&req, "Host").unwrap_or("");
    let name = host.rsplit_once(':').map_or(host, |(n, _)| n);
    let url = tauri::Url::parse(&format!("http://127.0.0.1:{port}{}", req.url())).map_err(|e| e.to_string())?;
    let mut mismatch = false;
    let (status, body, waiting) =
        if *req.method() != Method::Get { (405, DENIED_PAGE, None) }
        else if name != "127.0.0.1" && name != "localhost" { (403, DENIED_PAGE, None) }
        else if url.path() != CALLBACK { (404, DENIED_PAGE, None) }
        else {
            let (mut code, mut returned_state, mut denied) = (None, None, false);
            for (k, v) in url.query_pairs() {
                match k.as_ref() {
                    "code" => code = Some(v.into_owned()),
                    "state" => returned_state = Some(v.into_owned()),
                    "error" | "error_description" => denied = true, // the learner declined on OpenRouter's page
                    _ => {}
                }
            }
            if denied || code.is_none() {
                (200, DENIED_PAGE, Some(Waiting::Denied))
            } else if returned_state.as_deref() != Some(state) {
                mismatch = true;
                (400, WRONG_STATE_PAGE, None)
            } else {
                (200, DONE_PAGE, code.map(Waiting::Code))
            }
        };
    let _ = req.respond(page(status, body));
    if mismatch {
        return Err("The OpenRouter callback did not match this sign-in".into());
    }
    Ok(waiting)
}

/// Exchanges the one-time code for an API key and stores it in the keychain. A failed exchange never logs the code.
fn exchange(code: &str, verifier: &str) -> Result<(), String> {
    let client = tauri_plugin_http::reqwest::blocking::Client::builder().timeout(Duration::from_secs(30)).build().map_err(|e| e.to_string())?;
    let res = client
        .post(EXCHANGE)
        .header("Content-Type", "application/json")
        .body(serde_json::json!({ "code": code, "code_verifier": verifier, "code_challenge_method": "S256" }).to_string())
        .send()
        .map_err(|e| e.to_string())?;
    let status = res.status();
    // The plugin's reqwest has no `json` feature: read the text and parse it here.
    let body: serde_json::Value = serde_json::from_str(&res.text().unwrap_or_default()).unwrap_or_default();
    if !status.is_success() {
        let msg = body["error"].as_str().or_else(|| body["message"].as_str()).unwrap_or("OpenRouter refused the sign-in");
        return Err(format!("{msg} ({})", status.as_u16()));
    }
    let key = body["key"].as_str().filter(|k| !k.is_empty()).ok_or("OpenRouter did not return a key")?;
    crate::secret_entry("api-key.openrouter")?.set_password(key).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    fn auth_url_carries_pkce_and_the_loopback_callback() {
        let url = tauri::Url::parse(&super::auth_url("http://127.0.0.1:51234/callback", "ch", "st").unwrap()).unwrap();
        assert_eq!(url.as_str().split('?').next(), Some(super::AUTH));
        let q: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(q.get("callback_url").map(String::as_str), Some("http://127.0.0.1:51234/callback"));
        assert_eq!(q.get("code_challenge").map(String::as_str), Some("ch"));
        assert_eq!(q.get("code_challenge_method").map(String::as_str), Some("S256"));
        assert_eq!(q.get("state").map(String::as_str), Some("st"));
    }
}
