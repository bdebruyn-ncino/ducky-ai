# Ducky AI: Stage 2, the solution

A rubber duck for your Mac that can read your code and tickets. Press a hotkey, click the duck, say a question, and Ducky answers from the right repo, Jira and GitHub. The problem and the targets are in [STAGE-1-PROBLEM.md](STAGE-1-PROBLEM.md); the evidence is in [TRIAL.md](TRIAL.md).

## What it does (the demo, about 5 minutes)

1. **First run.** Open Ducky with nothing saved: the window comes forward by itself and setup asks for the AWS profile, the model ARN and where the repos live, with suggestions pre-filled.
2. **Ask by voice.** Click the duck and say "What does the autospread repo do?". The words appear as you speak; after a pause Ducky counts down two seconds (click the duck or press Esc to stop it), then sends. No repo name needed in the sentence: Ducky finds it, or asks with buttons. A general question that names no repo ("what is 2 + 2?") is simply answered.
3. **The answer** arrives as sanitised Markdown with copyable code blocks, and the duck reacts (working, thinking, done). Hide the window while it works and a macOS notification tells you when it is ready.
4. **Follow up.** "And where is that configured?" Ducky remembers the conversation and the repo.
   While it works, the status line shows what it is doing ("Reading README.md", "Searching for ...").
5. **Jira and GitHub.** "What is <ticket key> about?" and "What changed in that pull request?", read-only.
6. **Nothing happens without a yes.** Ask Ducky to change a file: it stops and asks Approve or Deny. No answer in 30 seconds counts as no.
7. **History.** Click History in the footer: what you asked, what Ducky looked at, the approvals you gave, and how long each answer took. It survives restarts and can be cleared.
8. **Small touches.** Turn macOS Dictation off and the duck is knocked out until you turn it back on. Text-only mode for quiet rooms.

## How it is built

```
 you ──voice──▶  widget (Tauri, TypeScript)  ──stdin/stdout JSON──▶  sidecar (Node, TypeScript)
   macOS speech      hotkey, tray, duck, chat                          runs the agent, holds the AWS profile
   on-device         no secrets, strict CSP                              │
                                                                         ├─▶ Claude on AWS Bedrock (Agent SDK)
                                                                         ├─▶ your repos (read-only tools)
                                                                         ├─▶ Jira (your Claude Code MCP login, read-only)
                                                                         └─▶ GitHub (read-only, token from `gh`)
```

- **Widget:** Tauri v2 with plain TypeScript. Rust owns the hotkey, tray, notifications, voice and the sidecar process; the page can call four commands and nothing else.
- **Sidecar:** the Claude Agent SDK on Bedrock, running inside the repo the question is about. One shared `messages.ts` defines the protocol both sides use.
- **Voice:** Apple's on-device speech recognition. Wispr Flow was blocked on the company network and cloud speech was ruled out, so this also means no audio leaves the Mac.

## Why it solves the problem

- **Problem-solution fit:** developers lose time context-switching between repos and tickets and re-explaining context. Ducky takes a spoken question, picks the right repo, and answers from the code and the ticket, with no terminal or `cd`. Scope is deliberately narrow: questions, read-only lookups, confirmation for anything else.
- **Working product:** the whole flow runs end to end on a real Mac, against real repos and Jira.
- **Usability and quality:** first-run setup with suggestions, clear states (the duck, one status line), errors that say what to do (Dictation off, microphone denied, setup cancelled), a notification when you walk away, and over 100 automated tests. Trial results are in [TRIAL.md](TRIAL.md).

## Security and data handling

- **Audio stays on the Mac.** Recognition is forced on-device; nothing is recorded to disk.
- **Credentials stay out of the page.** AWS access uses the user's own SSO profile inside the sidecar. The GitHub token comes from `gh auth token` and goes only to the GitHub tool. The Jira login is the user's own Claude Code one. The settings database holds a profile name, a model ARN and a folder path, no secrets.
- **Read-only by default.** Reading files, searching, and the Jira and GitHub lookups run on their own. A short list of read-only shell commands (listing files, `git status`, `gh issue list`, with no pipes or redirects) also runs on its own. Any other tool (editing, running another command, changing a ticket) shows what it wants to do and waits for Approve or Deny; silence is a no after 30 seconds, and every decision is logged.
- **The page is treated as untrusted.** A strict content-security policy, narrow Tauri permissions, four exposed commands, and agent output rendered only through a sanitiser (DOMPurify with an allow-list; links are never clickable; agent text is never inserted as raw HTML).
- **History stays on the Mac** in the same local database as the settings, capped at 500 entries, with a clear button. It holds your questions and the answers (so treat it like shell history); it is never sent anywhere.
- **Data that leaves the Mac:** the question and the files the agent reads go to Claude on Bedrock in the company's AWS account, the same as using Claude Code there. Nothing else, and no telemetry.
- **Known gap:** the approval step is skipped for any tool the user's own Claude settings already allow, and Ducky reads those settings. Closing that is issue #27.

## Trade-offs we made

- Read-only first; writes only behind a confirmation.
- Reuse Claude Code's Jira login and the `gh` CLI instead of building our own sign-in flows.
- On-device speech over a cloud service: less accurate than the best cloud models, but private and always available.
- A development build for the first version; packaging is not done.

## Path to scale

1. **Package it** into a signed `.app` with the sidecar bundled (#17), so it installs like any Mac app.
2. **Close the approval gap** by enforcing the gate before the user's permission rules (#27).
3. **Richer history:** search, export, and a "before" cursor for long histories (the first version of #13 is done).
4. **Team defaults:** an admin-provided default model ARN (already supported through an environment variable) and a shared list of repos.
5. **Cost and model choice:** Bedrock application inference profiles already allow per-team cost tracking and swapping the model without code changes.

## Known limits

- A development build only; it needs Node and the repo on the machine.
- Voice needs macOS Dictation switched on and a language with an on-device model.
- One question runs at a time per conversation, and conversation memory lasts as long as the app runs.
- Speech accuracy and answer quality depend on the model and the repo; wrong answers are possible and the trial sheet records them.
