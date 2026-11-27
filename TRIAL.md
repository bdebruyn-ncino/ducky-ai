# Ducky AI: trial sheet

Evidence for the Stage 1 targets. Fill this in while using Ducky for real work.

## Targets (from STAGE-1-PROBLEM.md)
- A spoken question gets an answer in **under 60 seconds**.
- Time per undocumented lookup is **at least halved** against doing it by hand.
- **2 colleagues each complete 3 tasks** end to end (6 in total).

## Before you start
- Run `cd widget && npm run tauri dev` from a terminal that has Speech Recognition permission. Keep that terminal visible: each answer prints a line like `[ask] aws-autospread: answered in 14.2s, 6 turns, about $0.082` (the cost is the SDK's own estimate) (the agent's time, including any approval waits). The same time is saved in History, so you can also read it there afterwards.
- Have a stopwatch (phone is fine).

## For each task
1. **By hand first:** start the stopwatch, find the answer the way you normally would (Claude Code, Jira, GitHub, grep), stop it, write the time down.
2. **With Ducky:** start the stopwatch, click the duck, say the question, stop when the answer is on screen. Write down the **total** time, and the `[ask]` time from the terminal.
3. Note whether the answer was right, what you had to correct or re-ask, and anything confusing.

## Suggested tasks
Use real questions from your own work if you can. These are safe starters:

| # | Task |
|---|---|
| 1 | "What does the autospread repo do?" |
| 2 | "In the ducky repo, how is the hotkey registered?" |
| 3 | A question about an undocumented corner of a repo you know |
| 4 | Look up a Jira ticket by key and summarise it |
| 5 | A follow-up to task 3 that only makes sense if Ducky remembers it ("and where is that configured?") |
| 6 | Ask something with no repo in it, and pick the repo from the buttons |

## Results

| # | By hand (s) | Ducky total (s) | Ducky `[ask]` (s) | Cost (US$) | Right? (yes / partly / no) | What was corrected or re-asked | Confusing? |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4 | | | | | | | |
| 5 | | | | | | | |
| 6 | | | | | | | |

Tester: ______________  Date: ______________  Voice or typed: ______________

## Early log: one voice session (Brandon, 26 Nov 2026)

Eight questions asked by voice in one sitting, read from the terminal log. This is cost and time only: whether each answer was right was not recorded, and there is no by-hand time, so it does not count towards the targets above.

| # | Question (as heard) | `[ask]` time | Turns | Cost (US$) | Approvals asked |
|---|---|---|---|---|---|
| 1 | What does the auto spreads repo do? | 26.5 s | 4 | $0.062 | 2 (reading READMEs) |
| 2 | Can you summarise this in a few words | 6.6 s | 1 | $0.068 | 0 |
| 3 | And where is this configured? | 11.7 s | 2 | $0.084 | 0 |
| 4 | Can you summarise our chat into a few words so it's easy to read | 7.2 s | 1 | $0.091 | 0 |
| 5 | What is 2+2 | 6.2 s | 1 | $0.095 | 0 |
| 6 | And what is the answer or the question to life the universe and everything in it | 9.2 s | 1 | $0.029 | 1 (picking a repo) |
| 7 | Thank you ducky, is there anything that you want to tell me | 9.0 s | 1 | $0.101 | 0 |
| 8 | Can you check the AI issues that are outstanding | 14.8 s | 2 | $0.115 | 1 (listing GitHub issues) |

What it showed:
- **Cost climbs with the conversation:** questions 1 to 8 (except 6, which was a fresh start) cost more each time, because the whole conversation is sent again. Even 2+2 cost about 9 cents.
- **Approval friction:** three harmless lookups stopped to ask. Safe read-only shell commands now run without asking.
- **Repo mix-ups:** greeting Ducky by name ("hey ducky ...") was taken as the ducky repo, and loose word matches turned the general question (6) into a repo prompt. Both fixed.
- **Speech:** "Ducky" is often heard as "Duggee", and the first words are sometimes garbled until the final result corrects them.

## Summary (fill in at the end)
- Median Ducky total time: ____ s (target: under 60 s). Slowest: ____ s.
- Median by-hand time: ____ s. Ducky was ____ times faster / slower.
- Answers right: ____ of ____. Partly right: ____. Wrong: ____.
- Things the tester corrected: ______________________________________
- Things that confused the tester: ___________________________________
- Median cost per question: US$ ____ (this feeds [STAGE-3-COMMERCIALS.md](STAGE-3-COMMERCIALS.md), which already has 12 questions measured at a median of about $0.07 and 11 seconds; the trial should add Jira lookups and longer conversations).
- Honest limits: number of testers ____, what kind of questions, anything that made the numbers unrepresentative.

## Check once before the demo
These are in the demo script in [STAGE-2-SOLUTION.md](STAGE-2-SOLUTION.md). Tick each one off by seeing it work, not by assuming.

- [ ] **First run:** with the settings database moved aside, the window opens by itself and setup completes. (`mv ~/Library/Application\ Support/ducky-ai/ducky.db{,.bak}`; move it back afterwards.)
- [ ] **A change needs a yes:** in a *scratch* repo, ask "create a file called notes.txt containing hello". Ducky stops and shows Approve and Deny. Deny it and confirm nothing was written. Approve it once and confirm the file appears.
- [ ] **No answer means no:** do the same and leave it for 30 seconds. The buttons disappear and nothing is written.
- [ ] **Jira lookup:** ask for a ticket by key.
- [ ] **GitHub lookup:** ask what changed in a specific pull request (needs `gh auth login`).
- [ ] **History:** open History, see your questions, answers and what Ducky looked at, restart the app and see them again, then clear them.
- [ ] **Follow-up memory:** ask a question, then a follow-up that only makes sense if Ducky remembers it.
- [ ] **Hidden window:** ask something slow, press Esc to hide the window, and get the macOS notification.
- [ ] **Dead duck:** turn Dictation off and look at the duck; turn it on again.
- [ ] **Text only:** switch to text only and ask a question.
- [ ] **Light and dark:** look at the widget in both appearances.
