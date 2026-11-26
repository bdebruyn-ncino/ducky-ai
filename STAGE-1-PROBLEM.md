# Ducky AI: Stage 1, Define the Problem

> Status: ready for review. Timing figures are rough estimates until they are measured in the trial.

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
- Time (estimate): finding something that is not in the notes index takes a few minutes, because it costs one or more MCP calls to Jira. We have not timed it yet. We will measure it during the trial.
- Honest limits: this is one user, so the evidence is anecdotal. The tool itself is not specific to Brandon, since anyone on the team can use it. Clinton will trial it, and more testers are to be recruited.

## 3. Opportunity and "why now"

- **Voice dictation is now good enough.** Wispr Flow turns speech into accurate text anywhere on the Mac.
- **Agents can use tools.** The Claude Agent SDK can read a repo and call Jira and GitHub through MCP connectors, so the duck can look things up for you.
- **Our models are already on Bedrock.** There is no new vendor or data-sharing approval needed for the core flow.
- **Existing alternative:** developers on the team already work with Claude Code. It is powerful but needs a terminal, the right working directory and typing. It can't be reached from anywhere with one hotkey, doesn't take a spoken request, and doesn't map "the autospread repo" to a folder. Ducky aims to be a voice-first front door to that, not a replacement.
- **Cost of the status quo (estimate):** about 1 to 2 undocumented lookups per ticket-day at a few minutes each (call it 3 to 5) comes to roughly 30 to 50 minutes a week per developer. The time saved is modest per person. The bigger cost is the break in focus and the risk of a wrong answer when nothing is documented. We will replace this estimate with measured figures after the trial.

## 4. Success definition

**Measurable outcomes (targets to confirm after a trial):**
- Ask a spoken question about a repo or Jira ticket and get an answer in under **60 seconds**.
- At least 2 colleagues (starting with Clinton) each complete 3 tasks end to end, 6 in total.
- Time per undocumented lookup is at least halved against the measured baseline.

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
