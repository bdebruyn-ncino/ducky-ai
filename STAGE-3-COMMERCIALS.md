# Ducky AI: Stage 3, the commercials

Who pays, what it costs, and whether it makes financial sense. The product is described in [STAGE-2-SOLUTION.md](STAGE-2-SOLUTION.md) and the problem in [STAGE-1-PROBLEM.md](STAGE-1-PROBLEM.md).

**How to read the numbers.** Nothing here is a bill.
- **Measured:** the cost and time of a question, from 12 real runs on our own repos (section 3). The cost is the Agent SDK's own estimate, in US dollars, for Claude on AWS Bedrock.
- **[CONFIRM]:** a figure that needs a number from nCino.
- **Assumption:** everything else, listed in section 4. The tables are computed from those assumptions, so they can be re-run when a number changes. Rand figures use an assumed R18 to the dollar.

## 1. The short version

- **A question costs about 7 US cents and takes about 11 seconds** (median of 12 real questions: $0.021 to $0.115, 6 to 27 seconds). That is the agent's time; speaking and the two-second send countdown come on top. Follow-ups in a long conversation cost more, up to about 12 cents.
- **As an internal tool it pays for itself many times over.** A developer asking 10 questions a day costs about **$14.70 a month (about R265)** and, on the Stage 1 estimate, saves about 2.9 hours. It breaks even if a developer's time is worth more than about **$5.10 an hour**. The AutoSpread team can all use it.
- **As a product for others it is also viable**, at about **R520 a seat a month** (40% of the value delivered) for a 49% gross margin, with a usage allowance so a heavy user cannot turn a seat into a loss.
- **The biggest unknowns are the time saved and how many questions people really ask.** The trial measures the first. The risks section shows what happens if we are wrong about either.

## 2. Who pays, and the pricing model

| Stage | Who pays | How |
|---|---|---|
| **Now: internal tool** | The engineering budget | No price to the developer. The only running cost is model usage on the company's AWS account. |
| **Internal chargeback (optional)** | Each team, per active developer | Cost plus 20% for support: $14.70 + 20% is about **$17.60 a month (about R320)** per active developer. |
| **If offered to other teams or companies** | The customer, per seat | **About R520 ($29) a seat a month**, including 10 questions a day (210 a month). Extra questions at about **R2.50 each** (cost of 7 cents at a 49% margin). |

**How the seat price is set.** Two checks, both must hold:
1. **Margin:** a 60% gross margin needs price of at least cost ÷ 0.4. Here $14.70 ÷ 0.4 = $36.75 (about R660).
2. **Value:** price no more than about 40% of the value delivered. Here value is about R1,300 a developer a month, so the ceiling is R520.

At the measured cost the two checks no longer agree: R520 gives a 49% margin, and a 60% margin needs R660, which is 51% of the value, so the customer keeps under half of the benefit. We take R520 and the lower margin. At a price of 20% of value (R260) the seat loses money. So the price is a real choice, and it moves with the cost per question, which is why that is measured and capped.

## 3. Cost and unit economics

**Measured, per question** (12 questions on our own repos: the first four run with the command-line `ask`, the other eight by voice in one working session, in the order asked):

| Question | Time | Turns | Cost |
|---|---|---|---|
| What does the autospread repo do? | 10.3 s | 2 | $0.071 |
| How is the global hotkey registered? (ducky) | 14.9 s | 4 | $0.021 |
| What tests exist? (doc extraction) | 17.1 s | 5 | $0.038 |
| How does the sidecar pick a repo, with file names? (several files) | 19.2 s | 5 | $0.065 |
| Voice: what does the auto spreads repo do (asked in ducky-ai, 3 file reads approved) | 26.5 s | 4 | $0.062 |
| Voice: summarise this in a few words | 6.6 s | 1 | $0.068 |
| Voice: and where is this configured (follow-up) | 11.7 s | 2 | $0.084 |
| Voice: summarise our chat into a few words | 7.2 s | 1 | $0.091 |
| Voice: what is 2+2 | 6.2 s | 1 | $0.095 |
| Voice: the answer to life, the universe and everything (repo picked from buttons) | 9.2 s | 1 | $0.029 |
| Voice: thank you ducky, is there anything you want to tell me | 9.0 s | 1 | $0.101 |
| Voice: check the open AI issues (GitHub, one approval) | 14.8 s | 2 | $0.115 |
| **Median of all 12** | **11.0 s** | | **$0.070** |

The cost varied more than fivefold between questions. In the voice session each follow-up cost more than the one before it ($0.062, 0.068, 0.084, 0.091, 0.095, 0.101, 0.115) because the conversation so far is sent every time, and even a question with no tools (2+2) cost about 9 cents. A new conversation resets this. These are estimates from the SDK, not a Bedrock bill. Right and wrong answers were not recorded in that session, and Jira lookups are still not measured.

**Build (one-off).** Two developers building for [CONFIRM: developer-days] using Claude Code, Tauri, the Claude Agent SDK and Apple's on-device speech. No separate licences identified beyond the AWS Bedrock use the company already has [CONFIRM].

**Run.** The only per-use cost is the model on AWS Bedrock. Voice recognition is on the Mac and free; Jira and GitHub are read through logins the developer already has; there is no server to host. **Every question has a spending cap** (default $1.00, `DUCKY_MAX_COST_USD`), about 14 times the median, so a runaway loop of tool calls stops and the user is told.

**Support (ongoing).** About [CONFIRM: hours a month] to keep up with SDK and macOS changes. If the app is distributed outside the team it needs code signing and notarising, about $99 a year for Apple's developer programme (assumption; the company may already have an account).

**Cost per developer per month** (questions a day × 21 working days × cost per question). The middle column is three times the measured median, as a cushion:

| Questions a day | $0.07 (measured) | $0.21 (3× cushion) | $0.40 (stress) |
|---|---|---|---|
| 5 | $7.35 | $22.05 | $42.00 |
| 10 | **$14.70** | $44.10 | $84.00 |
| 20 | $29.40 | $88.20 | $168.00 |

**Ways to bring cost down further** (each to be measured, none assumed): narrower questions (the repo is chosen first, so the agent reads less); a shorter system prompt and a cap on how much conversation is sent with each follow-up; a cheaper model for simple questions; and the cap.

## 4. Business case and assumptions

| Assumption | Value | Where it comes from | Confidence |
|---|---|---|---|
| Cost per question | **$0.07** (range $0.02 to $0.12) | Measured: 12 real questions | Medium: one tester, no Jira lookups |
| Time to answer | **11 seconds**, at most 27 in 12 runs | Measured | Medium |
| Time saved per developer | 15 / **40** / 60 minutes a week | Stage 1: 1 to 2 undocumented lookups a day at 3 to 5 minutes each, plus the cost of switching context | Low until the trial measures it |
| Questions per developer | 5 / **10** / 20 a day | Judgement: a few per ticket, and voice makes asking cheap | Low until measured in use |
| Working days a month | 21 | Calendar | High |
| Loaded cost of a developer | R450 an hour (illustration only) | **[CONFIRM]** nCino's real figure | Placeholder |
| Exchange rate | R18 to the dollar | Assumption, update | Medium |
| Users | **The AutoSpread team**, [CONFIRM: headcount] | Everyone on the team can use it | Needs the number |

**Base case** (40 minutes a week saved, 10 questions a day, $0.07 a question, R450 an hour):

| | Per developer a month |
|---|---|
| Hours saved | 2.9 |
| Value of the time | about R1,300 |
| Cost to run | about R265 ($14.70) |
| **Net saving** | **about R1,035** (value is 4.9 times cost) |

| Team size (illustration) | Cost a month | Value a month | Net a month |
|---|---|---|---|
| 5 developers | R1,323 | R6,500 | R5,177 |
| 10 developers | R2,646 | R13,000 | R10,354 |
| 15 developers | R3,969 | R19,500 | R15,531 |

**Payback on the build** is [CONFIRM: build cost] divided by the net saving a month for the real team size.

**Break-even.** The loaded hourly cost at which Ducky just pays for itself (monthly cost ÷ hours saved), in dollars an hour:

| Questions a day, cost per question | 15 min a week saved | 40 min a week | 60 min a week |
|---|---|---|---|
| 5 at $0.07 | $6.78 | $2.54 | $1.70 |
| 10 at $0.07 (measured) | $13.57 | **$5.09** | $3.39 |
| 10 at $0.21 | $40.71 | $15.27 | $10.18 |
| 20 at $0.40 (stress) | $155.08 | $58.15 | $38.77 |

At the measured cost it pays for itself for any developer worth more than about $14 an hour even if the time saved is only a quarter of the estimate. It stops paying for itself only in the stress corner of expensive questions, many of them, and little time saved.

## 5. Risk and sensitivity

| Risk | What if we are wrong | Control or response |
|---|---|---|
| **Cost per question is higher than measured** | At about six times the measured cost ($0.40) and 20 questions a day, the cost is $168 a developer a month and break-even is $58 an hour | Per-question cap; narrower questions; a cheaper model for simple lookups; a monthly allowance per seat. Follow-ups already cost more (up to 12 cents); the trial adds Jira lookups and longer conversations |
| **Time saved is smaller than assumed** | At 15 minutes a week, break-even is still only about $14 an hour at the measured cost | Still far below a developer's cost. The trial measures the real figure |
| **Product margin** | At the middle cushion ($0.21), a 60% margin needs about R1,985 a seat, which is more than the value delivered. Even at the measured cost the margin is only 49% at a fair price | Only viable while cost stays near the measured level, or with a firm allowance. So the position is *internal first*, product second |
| **Wrong answers** | If developers stop trusting it they stop using it, and the saving is zero | Answers can be checked: History shows which files and tickets were read. Anything that changes something needs an approval. The trial records right, partly right and wrong |
| **Approvals add friction** | Harmless lookups (listing files, reading a README, listing GitHub issues) stopped to ask in our voice session, three times in eight questions | Done for shell commands: a short list of read-only commands (`ls`, `git status`, `gh issue list` and similar, with no pipes or redirects) now runs without asking; everything else still asks |
| **Private code leaves the machine** | Source and tickets go to the model | Runs on the company's own AWS account through Bedrock; voice never leaves the Mac; history is local and clearable; no telemetry |
| **Approval can be bypassed by settings** | A broad allow rule in someone's Claude settings skips the approval step | Ducky warns when it finds such rules and switches off personal shell hooks; enforcing the check ahead of the rules is the next step (#27) |
| **Dependencies move** | Claude Code login, the `gh` CLI, Apple's speech and the SDK can all change | Each is isolated behind one module; macOS only for now; no custom sign-in to maintain |
| **Adoption fades** | Novelty wears off | Voice, notifications and the duck make it quick to use; the trial and History show whether people come back |

**What would make us stop or change course** (proposed thresholds, to agree): measured cost per question above about $0.40; fewer than about three in four answers right; or developers not using it after the first fortnight.

## 6. Why Ducky, and not the alternatives

| Alternative | Where it falls short |
|---|---|
| **Claude Code in a terminal** | Needs the right folder, typing, and a developer who already lives in the terminal. Nothing remembers which repo you meant. |
| **IDE chat** | Tied to the one project that is open; no Jira or GitHub context; no voice. |
| **Asking a colleague** | Interrupts two people and the answer is not written down. |
| **Searching docs and Confluence** | Fails exactly where the problem is: the thing is undocumented. |

**Ducky's position:** the quickest way to ask a question about *any* of your repos and tickets, by voice from anywhere on the Mac, with answers that show their working and nothing changed without a yes. It adds no new accounts, no server, and keeps voice on the device.

## 7. Still to fill in

1. **Time saved**, measured, from the trial table in `TRIAL.md`, and the cost of Jira lookups and longer conversations.
2. **Loaded developer cost** and the **AutoSpread team headcount** from nCino.
3. **Build effort** in developer-days, and support hours a month.
