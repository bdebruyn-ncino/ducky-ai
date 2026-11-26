# Ducky AI

A rubber duck for your Mac that can read your code and tickets.

Press a hotkey, say or type a question, and Ducky answers by looking at the right repo, Jira and GitHub. It's rubber duck debugging, except the duck can look things up.

> Status: hackathon project. See [STAGE-1-PROBLEM.md](STAGE-1-PROBLEM.md) for the problem we're solving, [STAGE-2-SOLUTION.md](STAGE-2-SOLUTION.md) for what we built and why, and [TRIAL.md](TRIAL.md) for the trial sheet.

## How it works

```
Voice (macOS speech) -> widget -> sidecar (agent) -> tools -> answer back
```

- **Voice:** macOS Dictation types into the widget's input box today. Click-to-talk with macOS speech recognition is planned (#21, #22).
- **Widget:** a macOS menu-bar app built with Tauri and plain HTML, CSS and TypeScript (Vite, vanilla-ts). It handles the hotkey, tray icon, input box, message list and "working..." state.
- **Sidecar:** a Node + TypeScript process started and stopped by the widget. It runs the agent and holds the AWS credentials, so they never reach the widget.
- **Agent:** the Claude Agent SDK, running Claude on AWS Bedrock inside the right repo.
- **Connectors:** read-only Jira and GitHub through MCP.
- **Shared types:** one `messages.ts` used by both the widget and the sidecar.

## Protocol

The widget starts the sidecar (`npm run serve` in `sidecar/`) and talks to it over its stdin and stdout, one JSON object per line. The message types live in `shared/messages.ts`. stdout carries protocol messages only; the sidecar logs to stderr.

| Direction | Message | Purpose |
|---|---|---|
| widget to sidecar | `ask` | A question. `project` is optional; if it is missing the sidecar finds the repo in the question text |
| widget to sidecar | `cancel` | Stop a running question |
| widget to sidecar | `confirmation-response` | Answer a confirmation request: approve or deny, and `choice` when picking from `options` |
| sidecar to widget | `ready` | The sidecar has started |
| sidecar to widget | `status` | The question is being worked on |
| sidecar to widget | `answer` | The final answer |
| sidecar to widget | `cancelled` | The question was cancelled |
| sidecar to widget | `error` | Something failed; `id` is absent when the input line itself was invalid |
| sidecar to widget | `confirmation-request` | Needs the user: approve an action, or pick one of `options` (for example which repo) |

Every message about a question carries the `id` the widget gave it, so several questions can run at once.

## Running in development

1. Create `ducky.config.json` (see Configuration) and sign in to AWS (`aws sso login --profile <profile>`).
2. `cd sidecar && npm install`
3. `cd widget && npm install && npm run tauri dev`
4. Press `Control+Option+D`, or click the duck in the menu bar, and ask a question.

The first time Ducky opens with nothing saved, the window comes forward by itself and setup starts: it asks for your AWS profile, your model ARN and where your repos are, pre-filling what it can. The Setup button in the footer re-runs it later.

The app starts and stops the sidecar itself (`node --import tsx src/server.ts` in `sidecar/`). Rust owns the process: the webview can only call one command, `send_to_sidecar`, and listen for `sidecar-message` events. If the sidecar crashes it is restarted once; if it keeps stopping, the widget shows an error.

### Voice

Click the duck, speak, and pause. The words appear in the text box as you speak, and about a second after you stop, Ducky counts down two seconds and then sends the question. Recognition runs on this Mac using macOS's own speech recognition, so no audio leaves the machine.

- **During the countdown** you can click the duck or press Esc to stop it and edit the text, start typing to change it, or press Enter to send straight away.
- **Esc** stops the countdown, then stops listening, then hides the window.
- **Text only:** the "Text only" link under the box hides the duck and keeps the text box. Your choice is remembered.

Setup notes:

- **Turn on Dictation** in System Settings, Keyboard, Dictation. If it is off, Ducky says so.
- **Set your language.** Run with `DUCKY_SPEECH_LOCALE` set to the language you dictate in, for example `DUCKY_SPEECH_LOCALE=en-ZA npm run tauri dev`. Without it Ducky uses your system language, and that language may have no on-device speech model (macOS then reports "Siri and Dictation are disabled").
- **Start the app from a terminal that already has Speech Recognition permission** (System Settings, Privacy & Security, Speech Recognition lists them). macOS asks the app that launched Ducky for permission, not Ducky itself. Starting from VS Code's terminal makes macOS stop the app the first time you click the duck, because VS Code has no speech usage text. A built app is its own app and should ask for its own permission; that is not tested yet (#17).
- **Microphone access** is checked first. If it is off, Ducky says so instead of silently hearing nothing.
- **Timings:** run with `DUCKY_DEBUG=1` to print how long each step of listening takes.

Limitations for now:
- Development only. Packaging the sidecar into a release build is not done.
- Node must be on the `PATH` of the terminal you start it from. Launching from Finder will not see your shell's `PATH`.
- A question in flight is lost if the sidecar crashes.

## Confirmations

Ducky never changes anything without your yes. Read-only tools (reading files, searching, and the Jira and GitHub lookups) run on their own. Any other tool, such as editing a file, running a command or changing a ticket, stops and asks first:

- The widget shows what Ducky wants to do with **Approve** and **Deny** buttons. If you hide the window, you get a notification.
- No answer within 30 seconds counts as a no: the buttons disappear and Ducky carries on without it.
- When Ducky is not sure which repo you mean, the same mechanism shows one button per repo.
- Every decision is logged to the terminal as `[confirmation] approved: ...`, `denied`, `timed out, denied` and so on.
- The gate is the SDK's `canUseTool`, which is skipped for anything your own Claude settings already allow. Ducky also reads your global Claude settings, so a broad `allow` rule there would let a tool run without asking. #27 covers hardening this.

## History

Click **History** in the footer to see what happened: your questions, the answers, what Ducky looked at along the way ("Reading README.md"), the approvals you gave or denied, and how long each answer took. While Ducky works, the same "what it is doing" line shows under the status.

History is stored in the local database next to your settings (`~/Library/Application Support/ducky-ai/ducky.db`). It is never sent anywhere, it keeps the latest 500 entries, and the **Clear** button (two clicks) deletes it. It contains your questions and the answers, so treat it like shell history.

## Scope

In scope:
- Questions about code, answered by an agent running in the right repo
- Read-only Jira lookups (tickets)
- Read-only GitHub lookups (pull requests and issues)
- Confirmation before any risky action
- A notification when a long task finishes

Out of scope for now: Slack, Google Drive and other connectors, web search, Windows and Linux, multi-user hosting, and any write action without confirmation.

## Requirements

- macOS
- Node.js 24 or later
- Rust (`rustup`), needed to build the Tauri widget
- An AWS profile with access to Amazon Bedrock, signed in (for example `aws sso login --profile <profile>`)
- macOS Dictation turned on (System Settings, Keyboard, Dictation), if you want voice input

## Configuration

Nothing environment-specific is hard coded. Settings live in `ducky.config.json`, which is gitignored. Copy `ducky.config.example.json` to `ducky.config.json` and fill in your own values:

- `modelArn`: the Bedrock model or inference profile ARN to use
- `awsProfile` and `awsRegion`
- `reposRoot`: the folder where you keep your repos. Every git repo directly inside it becomes a project you can name out loud

The example config and the loader arrive with [issue 1](../../issues/1). Never commit your real config, ARNs, account IDs or local paths.

## Connectors

Ducky inherits MCP servers from your global Claude Code settings (`settingSources: ["user", "project"]`). If you have the Atlassian MCP server configured there, Ducky will automatically use it for Jira lookups — no extra credentials needed.

Only read-only tools are allowed; Ducky will never create or edit a ticket.

### GitHub

No extra setup needed. Ducky reads your GitHub token from the `gh` CLI at startup (`gh auth token`). If `gh` is installed and authenticated, the GitHub connector is active automatically. Ducky will never comment, push, or merge.

## Project layout

Planned layout; folders appear as their issues are completed.

```
ducky-ai/
  sidecar/      Node + TypeScript agent runner
  widget/       Tauri menu-bar app
  shared/       messages.ts, used by both
```

## Contributing

- Pick an issue labelled `stage-2` whose dependencies are done, and comment on it to claim it.
- Keep the agent read-only. Anything that writes or sends must go through the confirmation step.
- Keep commit messages to a single line.
