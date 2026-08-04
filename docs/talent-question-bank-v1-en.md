# Hero Talent Compass — Question Bank v1 (English master)

**Status:** DRAFT for Kamal's review. English is the master; BM and ID are translated only after this is signed off.
**Total:** 47 items — A 8 · B 8 · C 8 · D 8 · E 12 (Kamal's scenarios) · F 3
**Estimated time:** 20–25 minutes.

## How scoring works

Every option carries a `contributes` map, e.g. `{"role.closer": 2, "motivation.achievement": 1}`.
Scores are summed deterministically, normalised 0–100 within each family, and banded
(Strong / Good / Emerging / Development / Insufficient). **AI never touches these numbers.**

**Reverse-scored items** are marked ⟲ — agreement counts *against* the dimension. They exist so
that answering "5" to everything produces an internally inconsistent profile, which is what the
consistency flags detect.

Scale for A–D unless stated: **1 Strongly disagree · 2 Disagree · 3 Neutral · 4 Agree · 5 Strongly agree**
Frequency items use: **1 Never · 2 Rarely · 3 Sometimes · 4 Often · 5 Almost always**

---

## Section A — Working Style (8 items)

Measures how someone naturally works. No option is "better".

**A1** *(frequency)* In the last 30 days, how often did you start a conversation with someone you did not know well?
→ `style.social_energy`, `role.prospector`

**A2** *(frequency)* In the last 30 days, how often did you post, speak or present where others could see you?
→ `style.visibility`, `role.content_creator`, `role.live_host`

**A3** I prefer to plan the steps before I begin rather than start and adjust as I go.
→ `style.planning`

**A4** ⟲ When plans change at short notice, I find it hard to change direction.
→ `style.adaptability` *(reverse)*

**A5** I usually decide quickly, even when I do not have every detail.
→ `style.decision_speed`

**A6** *(frequency)* In the last 30 days, how often did you notice an error in a document or listing that others had missed?
→ `style.detail`

**A7** I do my best work with other people rather than alone.
→ `style.collaboration`, `role.leader`

**A8** When I need a new skill, I prefer to learn by trying it rather than by studying it first.
→ `style.learning`

---

## Section B — Entrepreneurial Readiness (8 items)

**B1** *(frequency)* In the last 30 days, how often did you act on an opportunity without being told to?
→ `ent.initiative`, `ent.opportunity`

**B2** When something I am responsible for goes wrong, I look first at what I could have done differently.
→ `ent.ownership`, `success.accountability`

**B3** *(frequency)* In the last 30 days, how often did you find a way forward using whatever you already had, instead of waiting for better resources?
→ `ent.resourcefulness`

**B4** I am willing to spend my own money or time on something that may not work, if the possible gain is worth it.
→ `ent.calculated_risk`, `role.team_growth_funder`

**B5** ⟲ When something does not work after a few tries, I usually move on to something else.
→ `ent.persistence` *(reverse)*

**B6** *(frequency)* In the last 30 days, how often did you finish an important task without anyone reminding you?
→ `ent.execution`, `success.consistency`

**B7** I change my approach quickly when I see it is not producing results.
→ `ent.adaptability`, `ent.learning_agility`

**B8** Before recommending anything, I try to understand what the customer actually needs.
→ `ent.customer_value`, `role.relationship_builder`

---

## Section C — Motivation Map (8 items)

C1–C4 identify **drivers** (forced-choice — participants pick what matters most, so everything cannot be "very important"). C5–C6 rank supporting drivers. C7–C8 identify **demotivators**.

**C1** *(forced choice)* Which of these would make you most proud after a successful year?
- A. My family is financially secure → `motivation.family_security`
- B. I earned significantly more than before → `motivation.financial_growth`
- C. I control my own time and decisions → `motivation.freedom`
- D. My work was recognised by people I respect → `motivation.recognition`

**C2** *(forced choice)* Which would you find most satisfying?
- A. Hitting a target I set for myself → `motivation.achievement`
- B. Helping someone solve a real problem → `motivation.helping_others`
- C. Being trusted to guide others → `motivation.leadership_influence`
- D. Becoming genuinely skilled at something difficult → `motivation.learning_mastery`

**C3** *(forced choice)* Which working situation appeals to you most?
- A. Being part of a team that feels like family → `motivation.community`
- B. Building something that is recognisably mine → `motivation.creativity`
- C. Competing and seeing where I stand → `motivation.challenge`
- D. Building something that outlasts me → `motivation.legacy`

**C4** *(forced choice)* If income were equal, which would you choose?
- A. Secure and predictable work → `motivation.family_security`
- B. Higher risk with higher potential → `motivation.financial_growth`, `ent.calculated_risk`
- C. Complete flexibility over my schedule → `motivation.freedom`
- D. Visible responsibility for a team's results → `motivation.leadership_influence`, `role.leader`

**C5** Money is one of the main reasons I am doing this work.
→ `motivation.financial_growth`

**C6** I want people to come to me when they need to learn how to do this work.
→ `motivation.leadership_influence`, `role.coach_trainer`, `role.leader`

**C7** *(multi-select, choose up to 3)* Which of these drains your motivation most?
- Repeated rejection → `demotivator.rejection`
- Unclear instructions → `demotivator.unclear_instructions`
- Not being recognised → `demotivator.no_recognition`
- Working alone for long periods → `demotivator.working_alone`
- Not seeing visible progress → `demotivator.no_progress`
- Conflict with others → `demotivator.conflict`
- Uncertainty about the future → `demotivator.uncertainty`

**C8** *(multi-select, choose up to 3)* And which of these?
- Repetitive work → `demotivator.repetitive`
- Pressure in front of others → `demotivator.public_pressure`
- Being criticised → `demotivator.criticism`
- Slow financial results → `demotivator.slow_money`
- Lack of support → `demotivator.no_support`
- Feeling unprepared → `demotivator.unprepared`

---

## Section D — Success Drive (8 items)

Per spec §7D: this section must **not** reward overwork, unsafe financial risk, lost sleep, or
neglected responsibilities. D6 and D7 deliberately reward *sustainable* commitment.

**D1** I have a specific income or achievement target for the next 12 months.
→ `success.goal_clarity`

**D2** I am willing to work hard now for a reward that may take a year to arrive.
→ `success.delayed_reward`, `success.ambition`

**D3** *(frequency)* In the last 30 days, how often did you keep a work routine even when you did not feel like it?
→ `success.consistency`

**D4** After a setback, I usually recover within a day or two.
→ `success.resilience`

**D5** I believe I can become genuinely good at this work.
→ `success.self_belief`

**D6** I know which things I am prepared to give up for the next 12 months — and which I am not.
→ `success.realistic_commitment`

**D7** ⟲ To succeed, I would sacrifice my health, sleep or family time.
→ `success.realistic_commitment` *(reverse — agreement lowers the score)*

**D8** ⟲ When I miss a target, it is usually because of circumstances outside my control.
→ `success.accountability` *(reverse)*

---

## Section E — Real-Estate Scenarios (12 items)

**Supplied by Kamal — individual-contributor framing, no team-leader wording.** Each option is a
credible contribution style; there is no "best" answer. Options are randomised on screen.

E1 short reply "Send price" → A Relationship Builder · B Presenter · C Prospector · D Content Creator
E2 "price too high" → A Relationship Builder · B Presenter · C Closer · D Financing Coordinator
E3 no leads today → A Prospector · B Relationship Builder · C Content Creator · D Advertiser
E4 promote a project online → A Content Creator · B Live Host · C Presenter · D Advertiser
E5 buyer keeps postponing → A Relationship Builder · B Presenter · C Closer · D Financing Coordinator
E6 small advertising budget → A Team Growth Funder · B Team Growth Funder + calculated risk · C Advertiser · D Prospector
E7 loan eligibility worry → A Relationship Builder · B Presenter · C Financing Coordinator · D Closer
E8 satisfied customer → A Relationship Builder · B Prospector · C Content Creator · D Recruiter
E9 friend asks about joining → A Recruiter · B Presenter · C Recruiter + Prospector · D Coach/Trainer
E10 explaining a complex project → A Content Creator · B Live Host · C Presenter · D Relationship Builder
E11 lead rejects first suggestion → A Relationship Builder · B Presenter · C Closer · D Prospector + Relationship Builder
E12 20 minutes to prepare → A Relationship Builder · B Presenter · C Closer · D Financing Coordinator

**E6 carries a mandatory on-screen note** (spec §8): funding a campaign does not guarantee sales
or financial returns; never use essential household funds or borrowed money; agree budget,
ownership, reporting and lead distribution first.

### Pathway coverage check

| Pathway | Signals from E | Also carried by |
|---|---|---|
| Relationship Builder | 10 | B8 |
| Presenter | 8 | — |
| Prospector | 6 | A1 |
| Closer | 5 | — |
| Content Creator | 5 | A2 |
| Financing Coordinator | 4 | — |
| Recruiter | 3 | — |
| Advertiser | 3 | — |
| Live Host | 2 | A2 |
| Team Growth Funder | 2 | B4 |
| **Coach / Trainer** | **1** | **C6** |
| **Leader** | **0** | **A7, C4-D, C6** |

Leader and Coach/Trainer are scored from traits, not scenarios — a direct consequence of keeping
scenarios individual-contributor. Worth confirming with Kamal.

---

## Section F — Written Reflection (3 items)

Max 1,500 characters each. Treated as untrusted input; never placed into AI system instructions.

**F1** What does success mean to you personally?
**F2** What are you willing to do consistently for the next 12 months to achieve it?
**F3** What usually causes you to stop, delay, or lose confidence?

Blank or meaningless answers raise the neutral `insufficient_written_detail` flag — never an
accusation, just a note that the narrative will be lighter.

---

## Consistency flags (spec §10)

| Flag | Triggered when |
|---|---|
| `uniform_responding` | ≥85% of A–D answers are the same value |
| `contradictory_pairs` | Reverse-scored items agree with their positive twins |
| `unrealistically_fast` | Completed in under 8 minutes |
| `many_skipped` | More than 6 optional items unanswered |
| `insufficient_written_detail` | Written answers under ~20 useful characters |

Flags are shown to facilitators as *review notes*, never to participants as accusations.

---

## Open questions for Kamal

1. Confirm Leader and Coach/Trainer are scored from traits rather than scenarios.
2. Keep all 12 scenarios (47 items, ~20–25 min) or cut to 6?
3. Experience bands for §5 — suggest: *Not yet started · Under 1 year · 1–3 years · 3+ years*.
4. Leadership responsibility options — suggest: *None · Informal mentor · Leads a small team · Leads leaders*.
