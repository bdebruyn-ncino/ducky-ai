# Ducky AI

A rubber duck for your Mac that can read your code and tickets.

Press a hotkey, say or type a question, and Ducky answers by looking at the right repo, Jira and GitHub. It's rubber duck debugging, except the duck can look things up.

> Status: hackathon project, in active development. See [STAGE-1-PROBLEM.md](STAGE-1-PROBLEM.md) for the problem we're solving and the [stage-2 issues](../../issues?q=is%3Aissue+label%3Astage-2) for the build plan.

## How it works

```
Wispr Flow (voice) -> widget -> sidecar (agent) -> tools -> answer back
```

- **Voice:** [Wispr Flow](https://wisprflow.ai) dictates straight into the widget's input box.
- **Widget:** a macOS menu-bar app built with Tauri and plain HTML, CSS and TypeScript (Vite, vanilla-ts). It handles the hotkey, tray icon, input box, message list and "working..." state.
- **Sidecar:** a Node + TypeScript process started and stopped by the widget. It runs the agent and holds the AWS credentials, so they never reach the widget.
- **Agent:** the Claude Agent SDK, running Claude on AWS Bedrock inside the right repo.
- **Connectors:** read-only Jira and GitHub through MCP.
- **Shared types:** one `messages.ts` used by both the widget and the sidecar.

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
- Wispr Flow, if you want voice input

## Configuration

Nothing environment-specific is hard coded. Settings live in `ducky.config.json`, which is gitignored. Copy `ducky.config.example.json` to `ducky.config.json` and fill in your own values:

- `modelArn`: the Bedrock model or inference profile ARN to use
- `awsProfile` and `awsRegion`
- `reposRoot`: the folder where you keep your repos. Every git repo directly inside it becomes a project you can name out loud

The example config and the loader arrive with [issue 1](../../issues/1). Never commit your real config, ARNs, account IDs or local paths.

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
