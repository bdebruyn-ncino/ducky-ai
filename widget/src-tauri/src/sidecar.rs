use std::{
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager};

const MESSAGE_EVENT: &str = "sidecar-message";
const MAX_LINE_BYTES: usize = 1_000_000;
const POLL_INTERVAL: Duration = Duration::from_millis(300);
// A sidecar that stops sooner than this after starting counts as failing, not as a one-off crash.
const MIN_HEALTHY_RUN: Duration = Duration::from_secs(10);

#[derive(Default)]
pub struct Sidecar {
    child: Mutex<Option<Child>>,
    stdin: Mutex<Option<ChildStdin>>,
    shutting_down: AtomicBool,
}

impl Sidecar {
    pub fn send(&self, line: &str) -> Result<(), String> {
        if line.contains('\n') || line.len() > MAX_LINE_BYTES {
            return Err("Invalid message".to_string());
        }
        let mut guard = self
            .stdin
            .lock()
            .map_err(|_| "The sidecar is unavailable".to_string())?;
        let stdin = guard.as_mut().ok_or("The sidecar is not running")?;
        writeln!(stdin, "{line}")
            .and_then(|_| stdin.flush())
            .map_err(|error| error.to_string())
    }

    pub fn shutdown(&self) {
        self.shutting_down.store(true, Ordering::SeqCst);
        if let Ok(mut stdin) = self.stdin.lock() {
            stdin.take();
        }
        if let Ok(mut guard) = self.child.lock()
            && let Some(mut child) = guard.take()
        {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    fn is_shutting_down(&self) -> bool {
        self.shutting_down.load(Ordering::SeqCst)
    }
}

// In development the sidecar runs from the repo; DUCKY_SIDECAR_DIR overrides the location.
fn sidecar_dir() -> PathBuf {
    std::env::var_os("DUCKY_SIDECAR_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../../sidecar")))
}

fn report_error(app: &AppHandle, message: &str) {
    let payload = serde_json::json!({ "type": "error", "message": message }).to_string();
    let _ = app.emit(MESSAGE_EVENT, payload);
}

fn start(app: &AppHandle, sidecar: &Sidecar) -> Result<(), String> {
    let mut child = Command::new("node")
        .args(["--import", "tsx", "src/server.ts"])
        .current_dir(sidecar_dir())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|error| error.to_string())?;

    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stdin = child.stdin.take().ok_or("no stdin")?;

    let app = app.clone();
    thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let _ = app.emit(MESSAGE_EVENT, line);
        }
    });

    *sidecar.stdin.lock().map_err(|_| "lock poisoned")? = Some(stdin);
    *sidecar.child.lock().map_err(|_| "lock poisoned")? = Some(child);
    Ok(())
}

fn wait_for_exit(sidecar: &Sidecar) {
    while !sidecar.is_shutting_down() {
        thread::sleep(POLL_INTERVAL);
        let has_exited = match sidecar.child.lock() {
            Ok(mut child) => child
                .as_mut()
                .is_none_or(|child| !matches!(child.try_wait(), Ok(None))),
            Err(_) => true,
        };
        if has_exited {
            break;
        }
    }
    if let Ok(mut stdin) = sidecar.stdin.lock() {
        stdin.take();
    }
}

// Starts the sidecar and restarts it once if it crashes. If it stops again straight away, give up and say so.
pub fn supervise(app: AppHandle) {
    thread::spawn(move || {
        let sidecar = app.state::<Sidecar>();
        let mut quick_failures = 0;

        while !sidecar.is_shutting_down() {
            let started_at = Instant::now();
            match start(&app, &sidecar) {
                Ok(()) => wait_for_exit(&sidecar),
                Err(error) => report_error(&app, &format!("Could not start the sidecar: {error}")),
            }
            if sidecar.is_shutting_down() {
                break;
            }

            quick_failures = if started_at.elapsed() < MIN_HEALTHY_RUN {
                quick_failures + 1
            } else {
                0
            };
            if quick_failures > 1 {
                report_error(
                    &app,
                    "The sidecar keeps stopping. Check the terminal output and restart Ducky.",
                );
                break;
            }
            report_error(
                &app,
                "The sidecar stopped, so the question was lost. Restarting it.",
            );
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_a_message_with_a_newline() {
        assert!(
            Sidecar::default()
                .send("{\"type\":\"cancel\"}\n{}")
                .is_err()
        );
    }

    #[test]
    fn rejects_an_oversized_message() {
        assert!(
            Sidecar::default()
                .send(&"x".repeat(MAX_LINE_BYTES + 1))
                .is_err()
        );
    }

    #[test]
    fn reports_when_the_sidecar_is_not_running() {
        let error = Sidecar::default().send("{}").unwrap_err();
        assert_eq!(error, "The sidecar is not running");
    }
}
