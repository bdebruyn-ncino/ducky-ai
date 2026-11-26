// Click-to-talk using macOS's own speech recognition, on the device. No audio leaves the Mac.
//
// Apple's objects must stay on the main thread, so every step runs through `on_main`, and the
// live session sits in a thread-local that only the main thread touches.

use std::{
    cell::RefCell,
    process::Command,
    ptr::NonNull,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

use block2::RcBlock;
use objc2::{AnyThread, rc::Retained, runtime::Bool};
use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};
use objc2_avf_audio::{AVAudioEngine, AVAudioPCMBuffer, AVAudioTime};
use objc2_foundation::{NSError, NSLocale, NSString};
use objc2_speech::{
    SFSpeechAudioBufferRecognitionRequest, SFSpeechRecognitionResult, SFSpeechRecognitionTask,
    SFSpeechRecognizer, SFSpeechRecognizerAuthorizationStatus,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

const TRANSCRIPT_EVENT: &str = "voice-transcript";
const ERROR_EVENT: &str = "voice-error";
const STOPPED_EVENT: &str = "voice-stopped";

// The transcript must stay unchanged this long before we decide the speaker has finished.
const SILENCE_MEANS_DONE: Duration = Duration::from_millis(1000);
const MAX_LISTEN: Duration = Duration::from_secs(60);
// If the final result never arrives after we stop listening, clean up anyway.
const FINAL_RESULT_GRACE: Duration = Duration::from_secs(3);

const NOT_ALLOWED: &str = "Speech recognition is not allowed. Turn it on in System Settings, Privacy & Security, Speech Recognition.";
const DICTATION_OFF: &str = "Voice needs macOS Dictation. Turn it on in System Settings, Keyboard, Dictation, then click the duck again.";
const DICTATION_UNAVAILABLE: &str = "macOS says Dictation is off, or is not set up for this language. In System Settings, Keyboard, Dictation, check it is on and set to your language, or set DUCKY_SPEECH_LOCALE to the language you dictate in (for example en-ZA).";
const MIC_DENIED: &str =
    "Microphone access is off. Turn it on in System Settings, Privacy & Security, Microphone.";
const NO_RECOGNIZER: &str = "No on-device speech recognition is available for your language. Check System Settings, Keyboard, Dictation, or set DUCKY_SPEECH_LOCALE (for example en-ZA).";

// Ids tell old sessions from new ones. LISTENING is cleared when we stop listening; ACTIVE when
// the session is fully torn down, which is after the final result has arrived.
static NEXT_ID: AtomicU64 = AtomicU64::new(1);
static LISTENING: AtomicU64 = AtomicU64::new(0);
static ACTIVE: AtomicU64 = AtomicU64::new(0);

// To see where the time goes, run with DUCKY_DEBUG set: each step prints how long after the click it happened.
static CLICKED_AT: Mutex<Option<Instant>> = Mutex::new(None);

fn debug_log(step: &str) {
    if std::env::var_os("DUCKY_DEBUG").is_none() {
        return;
    }
    let elapsed = CLICKED_AT
        .lock()
        .ok()
        .and_then(|clicked_at| *clicked_at)
        .map(|clicked_at| clicked_at.elapsed().as_millis())
        .unwrap_or(0);
    eprintln!("[voice +{elapsed}ms] {step}");
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Transcript {
    text: String,
    is_final: bool,
}

struct Progress {
    text: String,
    changed_at: Instant,
}

struct Session {
    engine: Retained<AVAudioEngine>,
    request: Retained<SFSpeechAudioBufferRecognitionRequest>,
    // Held so Apple's objects live as long as the session.
    _recognizer: Retained<SFSpeechRecognizer>,
    _task: Retained<SFSpeechRecognitionTask>,
}

thread_local! {
    static SESSION: RefCell<Option<Session>> = const { RefCell::new(None) };
}

fn on_main(app: &AppHandle, work: impl FnOnce(AppHandle) + Send + 'static) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || work(handle));
}

fn report_error(app: &AppHandle, message: &str) {
    let _ = app.emit(ERROR_EVENT, message);
}

// Reads the Dictation switch in System Settings. If it cannot be read, assume it is on and let
// the recognizer decide, since the setting's name is not a documented, stable API.
pub fn dictation_enabled() -> bool {
    !dictation_is_off()
}

fn dictation_is_off() -> bool {
    Command::new("defaults")
        .args(["read", "com.apple.assistant.support", "Dictation Enabled"])
        .output()
        .map(|output| String::from_utf8_lossy(&output.stdout).trim() == "0")
        .unwrap_or(false)
}

// macOS says "Siri and Dictation are disabled" both when the switch is off and when the language's
// speech model is missing, so the friendly message covers both.
fn friendly_error(reason: &str, locale: &str) -> String {
    if reason.contains("disabled") {
        format!("{DICTATION_UNAVAILABLE} (language: {locale})")
    } else {
        format!("{reason} (language: {locale})")
    }
}

pub fn start(app: AppHandle) {
    if let Ok(mut clicked_at) = CLICKED_AT.lock() {
        *clicked_at = Some(Instant::now());
    }
    debug_log("click received");
    on_main(&app, start_on_main);
}

pub fn stop(app: AppHandle) {
    on_main(&app, |app| {
        if LISTENING.load(Ordering::SeqCst) != 0 {
            finish(app);
        }
    });
}

fn start_on_main(app: AppHandle) {
    if ACTIVE.load(Ordering::SeqCst) != 0 {
        return;
    }
    if dictation_is_off() {
        report_error(&app, DICTATION_OFF);
        let _ = app.emit(STOPPED_EVENT, ());
        return;
    }
    debug_log("dictation check passed");

    let status = unsafe { SFSpeechRecognizer::authorizationStatus() };
    if status == SFSpeechRecognizerAuthorizationStatus::Authorized {
        with_microphone_access(app);
    } else if status == SFSpeechRecognizerAuthorizationStatus::NotDetermined {
        let handle = app.clone();
        let handler = RcBlock::new(move |status: SFSpeechRecognizerAuthorizationStatus| {
            if status == SFSpeechRecognizerAuthorizationStatus::Authorized {
                on_main(&handle, with_microphone_access);
            } else {
                report_error(&handle, NOT_ALLOWED);
                let _ = handle.emit(STOPPED_EVENT, ());
            }
        });
        unsafe { SFSpeechRecognizer::requestAuthorization(&handler) };
    } else {
        report_error(&app, NOT_ALLOWED);
        let _ = app.emit(STOPPED_EVENT, ());
    }
}

// Without microphone permission the engine would just hear silence, so ask first and say so if
// the answer is no.
fn with_microphone_access(app: AppHandle) {
    let Some(audio) = (unsafe { AVMediaTypeAudio }) else {
        begin(app);
        return;
    };

    let status = unsafe { AVCaptureDevice::authorizationStatusForMediaType(audio) };
    if status == AVAuthorizationStatus::Authorized {
        begin(app);
    } else if status == AVAuthorizationStatus::NotDetermined {
        let handle = app.clone();
        let handler = RcBlock::new(move |granted: Bool| {
            if granted.as_bool() {
                on_main(&handle, begin);
            } else {
                stop_with_error(&handle, MIC_DENIED);
            }
        });
        unsafe { AVCaptureDevice::requestAccessForMediaType_completionHandler(audio, &handler) };
    } else {
        stop_with_error(&app, MIC_DENIED);
    }
}

fn stop_with_error(app: &AppHandle, message: &str) {
    report_error(app, message);
    let _ = app.emit(STOPPED_EVENT, ());
}

// The language to listen in: DUCKY_SPEECH_LOCALE if set, then the system's own settings.
fn pick_recognizer() -> Option<(Retained<SFSpeechRecognizer>, String)> {
    let mut identifiers = Vec::new();
    if let Ok(identifier) = std::env::var("DUCKY_SPEECH_LOCALE") {
        identifiers.push(identifier);
    }
    identifiers.push(NSLocale::currentLocale().localeIdentifier().to_string());
    identifiers.extend(
        NSLocale::preferredLanguages()
            .to_vec()
            .iter()
            .map(|language| language.to_string()),
    );

    identifiers.into_iter().find_map(|identifier| unsafe {
        let locale =
            NSLocale::initWithLocaleIdentifier(NSLocale::alloc(), &NSString::from_str(&identifier));
        let recognizer = SFSpeechRecognizer::initWithLocale(SFSpeechRecognizer::alloc(), &locale)?;
        (recognizer.isAvailable() && recognizer.supportsOnDeviceRecognition())
            .then_some((recognizer, identifier))
    })
}

fn note_progress(progress: &Mutex<Progress>, text: &str) {
    if let Ok(mut progress) = progress.lock()
        && progress.text != text
    {
        progress.text = text.to_string();
        progress.changed_at = Instant::now();
    }
}

fn result_handler(
    app: AppHandle,
    id: u64,
    locale: String,
    progress: Arc<Mutex<Progress>>,
) -> RcBlock<dyn Fn(*mut SFSpeechRecognitionResult, *mut NSError)> {
    RcBlock::new(
        move |result: *mut SFSpeechRecognitionResult, error: *mut NSError| {
            if ACTIVE.load(Ordering::SeqCst) != id {
                return;
            }

            if let Some(result) = unsafe { result.as_ref() } {
                let text = unsafe { result.bestTranscription().formattedString() }.to_string();
                let is_final = unsafe { result.isFinal() };
                if !text.is_empty()
                    && progress
                        .lock()
                        .is_ok_and(|progress| progress.text.is_empty())
                {
                    debug_log("first words heard");
                }
                if is_final {
                    debug_log("final result");
                }
                note_progress(&progress, &text);
                let _ = app.emit(TRANSCRIPT_EVENT, Transcript { text, is_final });
                if is_final {
                    on_main(&app, teardown);
                }
            } else if let Some(error) = unsafe { error.as_ref() } {
                let reason = error.localizedDescription().to_string();
                report_error(&app, &friendly_error(&reason, &locale));
                on_main(&app, teardown);
            }
        },
    )
}

fn begin(app: AppHandle) {
    debug_log("permissions ok, creating the recognizer");
    let Some((recognizer, locale)) = pick_recognizer() else {
        report_error(&app, NO_RECOGNIZER);
        let _ = app.emit(STOPPED_EVENT, ());
        return;
    };

    let id = NEXT_ID.fetch_add(1, Ordering::SeqCst);
    ACTIVE.store(id, Ordering::SeqCst);
    LISTENING.store(id, Ordering::SeqCst);
    let progress = Arc::new(Mutex::new(Progress {
        text: String::new(),
        changed_at: Instant::now(),
    }));

    let request = unsafe { SFSpeechAudioBufferRecognitionRequest::new() };
    unsafe {
        request.setShouldReportPartialResults(true);
        // Keeps the audio on this Mac.
        request.setRequiresOnDeviceRecognition(true);
    }

    let handler = result_handler(app.clone(), id, locale, progress.clone());
    let task = unsafe { recognizer.recognitionTaskWithRequest_resultHandler(&request, &handler) };

    let engine = unsafe { AVAudioEngine::new() };
    let input = unsafe { engine.inputNode() };
    let format = unsafe { input.outputFormatForBus(0) };
    let tap_request = request.clone();
    let tap = RcBlock::new(
        move |buffer: NonNull<AVAudioPCMBuffer>, _time: NonNull<AVAudioTime>| {
            unsafe { tap_request.appendAudioPCMBuffer(buffer.as_ref()) };
        },
    );
    unsafe {
        input.installTapOnBus_bufferSize_format_block(0, 1024, Some(&format), RcBlock::as_ptr(&tap))
    };

    unsafe { engine.prepare() };
    if let Err(error) = unsafe { engine.startAndReturnError() } {
        let reason = error.localizedDescription().to_string();
        report_error(&app, &format!("Could not start the microphone: {reason}"));
        unsafe { input.removeTapOnBus(0) };
        ACTIVE.store(0, Ordering::SeqCst);
        LISTENING.store(0, Ordering::SeqCst);
        let _ = app.emit(STOPPED_EVENT, ());
        return;
    }

    debug_log("microphone started, listening");
    SESSION.with(|session| {
        *session.borrow_mut() = Some(Session {
            engine,
            request,
            _recognizer: recognizer,
            _task: task,
        });
    });
    watch_for_silence(app, id, progress);
}

// Ends the audio when the speaker goes quiet, or after the longest allowed time.
fn watch_for_silence(app: AppHandle, id: u64, progress: Arc<Mutex<Progress>>) {
    thread::spawn(move || {
        let started = Instant::now();
        while LISTENING.load(Ordering::SeqCst) == id {
            thread::sleep(Duration::from_millis(100));
            let has_spoken_and_stopped = progress
                .lock()
                .map(|progress| {
                    !progress.text.is_empty() && progress.changed_at.elapsed() > SILENCE_MEANS_DONE
                })
                .unwrap_or(false);
            if has_spoken_and_stopped || started.elapsed() > MAX_LISTEN {
                on_main(&app, finish);
                return;
            }
        }
    });
}

// Stops the microphone and asks for the final result, which arrives through the handler.
fn finish(app: AppHandle) {
    let id = LISTENING.swap(0, Ordering::SeqCst);
    if id == 0 {
        return;
    }
    debug_log("audio ended (silence or stop)");
    SESSION.with(|session| {
        if let Some(session) = session.borrow().as_ref() {
            unsafe {
                session.engine.stop();
                session.request.endAudio();
            }
        }
    });

    thread::spawn(move || {
        thread::sleep(FINAL_RESULT_GRACE);
        if ACTIVE.load(Ordering::SeqCst) == id {
            on_main(&app, teardown);
        }
    });
}

fn teardown(app: AppHandle) {
    ACTIVE.store(0, Ordering::SeqCst);
    LISTENING.store(0, Ordering::SeqCst);
    SESSION.with(|session| {
        if let Some(session) = session.borrow_mut().take() {
            unsafe {
                session.engine.inputNode().removeTapOnBus(0);
                session.engine.stop();
            }
        }
    });
    let _ = app.emit(STOPPED_EVENT, ());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explains_how_to_fix_the_disabled_message() {
        let message = friendly_error("Siri and Dictation are disabled", "en-US");
        assert!(message.contains("System Settings"));
        assert!(message.contains("DUCKY_SPEECH_LOCALE"));
        assert!(message.contains("en-US"));
    }

    #[test]
    fn passes_other_errors_through_with_the_language() {
        assert_eq!(
            friendly_error("No speech detected", "en-ZA"),
            "No speech detected (language: en-ZA)"
        );
    }
}
