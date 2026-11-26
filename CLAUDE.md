# Ducky AI: project rules

macOS menu-bar assistant. Tauri widget (HTML, CSS, TypeScript via Vite) plus a Node + TypeScript sidecar that runs the Claude Agent SDK on AWS Bedrock.

## Project rules
- The agent is read-only. Anything that writes or sends goes through the confirmation step.
- Never hard code the model ARN, AWS profile, region, account IDs or local paths. They come from settings.
- AWS credentials stay in the sidecar and never reach the widget.
- Never commit secrets or real config. `ducky.config.json` is gitignored.
- Scope is Jira and GitHub reads plus code questions. No Slack, Drive or web search.
- npm is set to a 7-day minimum release age. Don't bypass it; pin to an older version if needed.
- Ask before every commit and separately before every push. Single-line commit messages.
- Work is split into GitHub issues labelled stage-2. Claim an issue before starting it.

## TypeScript
- Minimal, readable, idiomatic code. Named helpers over dense one-liners. Comment only the complex parts.
- Shared message types live in one `messages.ts` used by both sides.
- Run `npm run typecheck` and `npm test` in `sidecar/` before committing.

## Tauri (v2)
- Treat the webview as untrusted. Keep logic and secrets in the sidecar or Rust, not the frontend.
- One capability file per window under `src-tauri/capabilities`. Grant narrow `allow-*` permissions, not broad bundles or `"*"` windows.
- Expose only the commands the frontend needs. Restrict them with `AppManifest::commands` in `build.rs`.
- Commands must validate their own inputs and scopes. Capabilities don't protect against a bad check in Rust.
- Don't load remote content in the webview.

## Rust
- Run `cargo fmt` and `cargo clippy -- -D warnings` before committing.
- Return `Result` from commands and map errors to short messages for the widget. No `unwrap()` or `expect()` outside tests.
- Keep Rust thin: windowing, hotkey, tray, notifications and sidecar lifecycle. Business logic stays in the sidecar.
- Use typed, serialisable structs for anything crossing the Tauri command boundary.
