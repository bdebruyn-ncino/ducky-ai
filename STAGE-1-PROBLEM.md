# Ducky AI: Stage 1, Define the Problem

> DRAFT. Items marked **[TODO]** need real numbers or facts from Brandon. Do not invent them.

## 1. Problem clarity and specificity

**Persona:** Brandon, a developer at nCino working across several repos (AWS and Salesforce) and Jira projects.

**Pain point:** When a developer hits a problem, they stop and context-switch. They open a terminal, find the right repo, open Jira, open GitHub and type out their question. Thinking out loud is natural, but acting on a thought costs several manual steps.

**The idea:** Rubber duck debugging is a well-known practice where a developer explains a problem out loud to a rubber duck and often solves it while talking. Ducky AI is that duck on your Mac. You press a hotkey, **speak** the problem, and the duck answers. Unlike a rubber duck, it can look at your code and your Jira tickets.

**Scope (narrow):** One developer, one machine (macOS), voice in and text out, over two systems: GitHub repos and Jira.

## 2. Evidence of real need

- Rubber duck debugging is standard practice in programming. Developers already talk through problems out loud because it works.
- A normal rubber duck is passive. It can't read the code, look up the ticket or answer back.
- Brandon is the first user and has this problem day to day.
- Observed behaviour (Brandon): he works with Claude throughout the day. The context switch is mostly moving between tickets and repos, so it varies by ticket.
- Lookups take noticeably longer when the answer is not documented anywhere.
- Brandon keeps a personal notes vault (an index of how-tos and gotchas) to cover the missing documentation. His teammates have no such index.
- Workload: roughly 1 to 2 tickets a day, or a single ticket on a day with a big one. Each ticket can mean a switch of repo and context.
- **[TODO]** Exact numbers: we don't have timings yet. Time a few lookups of undocumented things during the trial.
- Honest limits: this is one user, so the evidence is anecdotal. The tool itself is not specific to Brandon, since anyone on the team can use it. **[TODO]** Get 1 or 2 colleagues to try it.

## 3. Opportunity and "why now"

- **Voice dictation is now good enough.** Wispr Flow turns speech into accurate text anywhere on the Mac.
- **Agents can use tools.** The Claude Agent SDK can read a repo and call Jira and GitHub through MCP connectors, so the duck can look things up for you.
- **Our models are already on Bedrock.** There is no new vendor or data-sharing approval needed for the core flow.
- **Existing alternative:** developers on the team already work with Claude Code. It is powerful but needs a terminal, the right working directory and typing. It can't be reached from anywhere with one hotkey, doesn't take a spoken request, and doesn't map "the autospread repo" to a folder. Ducky aims to be a voice-first front door to that, not a replacement.
- **Cost of the status quo:** **[TODO]** (lookups per day) × (minutes per lookup) × (working days per week).

## 4. Success definition

**Measurable outcomes (targets to confirm after a trial):**
- Ask a spoken question about a repo or Jira ticket and get an answer in under **[TODO] seconds**.
- A real user (not only Brandon) completes **[TODO] n** tasks end to end.
- **[TODO]** Time per lookup is lower than doing it by hand.

**In scope**
- macOS menu-bar widget with a hotkey and text box (dictation via Wispr Flow).
- Questions about code, answered by an agent running inside the right repo.
- Jira lookups (read tickets).
- GitHub lookups (read PRs and issues).
- Confirmation before any risky action.

**Out of scope (for now)**
- Slack, Google Drive and other connectors.
- Windows and Linux.
- Multi-user support, accounts and hosting.
- Web search.
- Autonomous writes (pushing code, posting comments) without confirmation.
