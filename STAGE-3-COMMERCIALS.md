# Ducky AI: Stage 3, the commercials

Who pays, what it costs, and whether it makes financial sense. The product is described in [STAGE-2-SOLUTION.md](STAGE-2-SOLUTION.md) and the problem in [STAGE-1-PROBLEM.md](STAGE-1-PROBLEM.md).

**How to read the numbers.** Nothing here is a bill.
- **Measured:** the cost and time of a question, from real runs on our own repos (section 3). The cost is the Agent SDK's own estimate, in US dollars, for Claude on AWS Bedrock.
- **[CONFIRM]:** a figure that needs a number from nCino.
- **Assumption:** everything else, listed in section 4. The tables are computed from those assumptions, so they can be re-run when a number changes. Rand figures use an assumed R18 to the dollar.

## 1. The short version

- **A question costs about 5 US cents and takes about 16 seconds** (median of four real questions: $0.021 to $0.071, 10 to 19 seconds). That is the agent's time; speaking and the two-second send countdown come on top.
- **As an internal tool it pays for itself many times over.** A developer asking 10 questions a day costs about **$10.50 a month (about R190)** and, on the Stage 1 estimate, saves about 2.9 hours. It breaks even if a developer's time is worth more than about **$3.60 an hour**. The AutoSpread team can all use it.
- **As a product for others it is also viable**, at about **R470 a seat a month** (36% of the value delivered) for a 60% gross margin, with a usage allowance so a heavy user cannot turn a seat into a loss.
- **The biggest unknowns are the time saved and how many questions people really ask.** The trial measures the first. The risks section shows what happens if we are wrong about either.

## 2. Who pays, and the pricing model

| Stage | Who pays | How |
|---|---|---|
| **Now: internal tool** | The engineering budget | No price to the developer. The only running cost is model usage on the company's AWS account. |
| **Internal chargeback (optional)** | Each team, per active developer | Cost plus 20% for support: $10.50 + 20% is about **$12.60 a month (about R230)** per active developer. |
| **If offered to other teams or companies** | The customer, per seat | **About R470 ($26) a seat a month**, including 10 questions a day (210 a month). Extra questions at about **R2.25 each** (cost of 5 cents at a 60% margin). |

**How the seat price is set.** Two checks, both must hold:
1. **Margin:** price at least cost ÷ 0.4, so a 60% gross margin. Here $10.50 ÷ 0.4 = $26.25 (about R470).
2. **Value:** price no more than about 40% of the value delivered. Here value is about R1,300 a developer a month, so R470 is 36% of it, and the customer keeps about two thirds of the benefit.

At a lower price of 20% of value (R260) the gross margin falls to 27%. So the price is a real choice, and it moves with the cost per question, which is why that is measured and capped.

## 3. Cost and unit economics

**Measured, per question** (four read-only questions on our own repos, run with the command-line `ask`):

| Question | Time | Turns | Cost |
|---|---|---|---|
| What does the autospread repo do? | 10.3 s | 2 | $0.071 |
| How is the global hotkey registered? (ducky) | 14.9 s | 4 | $0.021 |
| What tests exist? (doc extraction) | 17.1 s | 5 | $0.038 |
| How does the sidecar pick a repo, with file names? (several files) | 19.2 s | 5 | $0.065 |
| **Median** | **16.0 s** | | **$0.052** |

The cost varied threefold between questions. These are estimates from the SDK, not a Bedrock bill, and they cover only questions about code. Jira and GitHub lookups and follow-up questions are not measured yet, so the trial adds them.

**Build (one-off).** Two developers building for [CONFIRM: developer-days] using Claude Code, Tauri, the Claude Agent SDK and Apple's on-device speech. No separate licences identified beyond the AWS Bedrock use the company already has [CONFIRM].

**Run.** The only per-use cost is the model on AWS Bedrock. Voice recognition is on the Mac and free; Jira and GitHub are read through logins the developer already has; there is no server to host. **Every question has a spending cap** (default $1.00, `DUCKY_MAX_COST_USD`), about 19 times the median, so a runaway loop of tool calls stops and the user is told.

**Support (ongoing).** About [CONFIRM: hours a month] to keep up with SDK and macOS changes. If the app is distributed outside the team it needs code signing and notarising, about $99 a year for Apple's developer programme (assumption; the company may already have an account).

**Cost per developer per month** (questions a day × 21 working days × cost per question). The middle column is three times the measured median, as a cushion:

| Questions a day | $0.05 (measured) | $0.15 (3× cushion) | $0.40 (stress) |
|---|---|---|---|
| 5 | $5.25 | $15.75 | $42.00 |
| 10 | **$10.50** | $31.50 | $84.00 |
| 20 | $21.00 | $63.00 | $168.00 |

**Ways to bring cost down further** (each to be measured, none assumed): narrower questions (the repo is chosen first, so the agent reads less); session memory for follow-ups; a cheaper model for simple lookups; and the cap.

## 4. Business case and assumptions

| Assumption | Value | Where it comes from | Confidence |
|---|---|---|---|
| Cost per question | **$0.05** (range $0.02 to $0.07) | Measured: four real questions | Medium: few questions, code only |
| Time to answer | **16 seconds**, at most 19 in four runs | Measured | Medium |
| Time saved per developer | 15 / **40** / 60 minutes a week | Stage 1: 1 to 2 undocumented lookups a day at 3 to 5 minutes each, plus the cost of switching context | Low until the trial measures it |
| Questions per developer | 5 / **10** / 20 a day | Judgement: a few per ticket, and voice makes asking cheap | Low until measured in use |
| Working days a month | 21 | Calendar | High |
| Loaded cost of a developer | R450 an hour (illustration only) | **[CONFIRM]** nCino's real figure | Placeholder |
| Exchange rate | R18 to the dollar | Assumption, update | Medium |
| Users | **The AutoSpread team**, [CONFIRM: headcount] | Everyone on the team can use it | Needs the number |

**Base case** (40 minutes a week saved, 10 questions a day, $0.05 a question, R450 an hour):

| | Per developer a month |
|---|---|
| Hours saved | 2.9 |
| Value of the time | about R1,300 |
| Cost to run | about R190 ($10.50) |
| **Net saving** | **about R1,110** (value is 6.9 times cost) |

| Team size (illustration) | Cost a month | Value a month | Net a month |
|---|---|---|---|
| 5 developers | R945 | R6,500 | R5,550 |
| 10 developers | R1,890 | R12,990 | R11,100 |
| 15 developers | R2,835 | R19,485 | R16,650 |

**Payback on the build** is [CONFIRM: build cost] divided by the net saving a month for the real team size.

**Break-even.** The loaded hourly cost at which Ducky just pays for itself (monthly cost ÷ hours saved), in dollars an hour:

| Questions a day, cost per question | 15 min a week saved | 40 min a week | 60 min a week |
|---|---|---|---|
| 5 at $0.05 | $4.85 | $1.82 | $1.21 |
| 10 at $0.05 (measured) | $9.70 | **$3.64** | $2.42 |
| 10 at $0.15 | $29.10 | $10.91 | $7.27 |
| 20 at $0.40 (stress) | $155.20 | $58.20 | $38.80 |

At the measured cost it pays for itself for any developer worth more than about $10 an hour even if the time saved is only a quarter of the estimate. It stops paying for itself only in the stress corner of expensive questions, many of them, and little time saved.

## 5. Risk and sensitivity

| Risk | What if we are wrong | Control or response |
|---|---|---|
| **Cost per question is higher than measured** | At eight times the measured cost ($0.40) and 20 questions a day, the cost is $168 a developer a month and break-even is $58 an hour | Per-question cap; narrower questions; a cheaper model for simple lookups; a monthly allowance per seat. The trial adds Jira, GitHub and follow-up questions to the measurement |
| **Time saved is smaller than assumed** | At 15 minutes a week, break-even is still only about $10 an hour at the measured cost | Still far below a developer's cost. The trial measures the real figure |
| **Product margin** | At the middle cushion ($0.15), a 60% margin needs about R1,420 a seat, which is more than the value delivered | Only viable while cost stays near the measured level, or with a firm allowance. So the position is *internal first*, product second |
| **Wrong answers** | If developers stop trusting it they stop using it, and the saving is zero | Answers can be checked: History shows which files and tickets were read. Anything that changes something needs an approval. The trial records right, partly right and wrong |
| **Approvals add friction** | Even harmless shell commands (for example listing a repo's files) stop and ask, which slowed one of our test questions | Auto-allow a short list of safe read-only commands; keep asking for everything else |
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

1. **Time saved**, measured, from the trial table in `TRIAL.md`, and the cost of Jira, GitHub and follow-up questions.
2. **Loaded developer cost** and the **AutoSpread team headcount** from nCino.
3. **Build effort** in developer-days, and support hours a month.
