# Ducky AI: trial sheet

Evidence for the Stage 1 targets. Fill this in while using Ducky for real work.

## Targets (from STAGE-1-PROBLEM.md)
- A spoken question gets an answer in **under 60 seconds**.
- Time per undocumented lookup is **at least halved** against doing it by hand.
- **2 colleagues each complete 3 tasks** end to end (6 in total).

## Before you start
- Run `cd widget && npm run tauri dev` from a terminal that has Speech Recognition permission. Keep that terminal visible: each answer prints a line like `[ask] aws-autospread: answered in 14.2s` (the agent's time, including any approval waits). The same time is saved in History, so you can also read it there afterwards.
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

| # | By hand (s) | Ducky total (s) | Ducky `[ask]` (s) | Right? (yes / partly / no) | What was corrected or re-asked | Confusing? |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |
| 6 | | | | | | |

Tester: ______________  Date: ______________  Voice or typed: ______________

## Summary (fill in at the end)
- Median Ducky total time: ____ s (target: under 60 s). Slowest: ____ s.
- Median by-hand time: ____ s. Ducky was ____ times faster / slower.
- Answers right: ____ of ____. Partly right: ____. Wrong: ____.
- Things the tester corrected: ______________________________________
- Things that confused the tester: ___________________________________
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
