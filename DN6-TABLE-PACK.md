# 🏛️ DATA NIGHT #6 — TABLE PACK
### CONTRACT v6 CLOSE · Thursday 17 September 2026, 8:00 PM Lagos
**One document. Ten stations. Built Thu 17 Sep ~08:30 UTC (09:30 Lagos) at the owner's
request — early, because the daily stop had already parked the engine and there was
nothing left to babysit.**

> Law reminder (CONTRACT.md §THE LAW #4): every clause below is a standing order. Where a
> clause slipped, the slip is named with a reason and a new date — not buried.

---

## 🔴 STATION 0 — THE VERDICT (read aloud first)

| | |
|---|---|
| **Window** | Fri 11 Sep → Thu 17 Sep 2026 |
| **Anchor** | $49,546.67 (Thu 10 Sep, 19:36 UTC) |
| **Final balance** | **$49,515.89** (bridge `/balance`, Thu 17 Sep 08:22:33 UTC) |
| **Result** | **−$30.78** (bridge balance delta) |
| **Witnessed ledger sum** | **−$30.60** (owner-run PASTE 20, 09:36 Lagos) — $0.18 settlement residual |
| **🎯 GREEN target (≥ $0)** | ❌ **MISSED** |
| **🛡️ Fail line (−$50)** | ✅ **HELD** — $19.22 of room unused |
| **Trend (contained weeks)** | −261 → −53.47 → −11.99 → −16.32 → −33.78 → **−30.78** |

**The week is LOCKED.** Today's daily stop tripped at **08:20:13 UTC on −$12.16** and the
engine is parked until 00:00 UTC Friday — which is *after* the window closes. Zero open
trades. No further trade can land inside contract v6. The number above is final unless a
late settlement moves it (see the $2.81 lesson, Station 3).

**Honest read, three sentences.** Five contained weeks and still no green week: v6 beat v5
by $3.00 and lost to v3/v4 by a wide margin. The week was not a fair seven-day sample —
roughly 58–62 hours of it was an infrastructure outage (Station 2), leaving about 3.5
tradeable days, and two of those days went to emergency shield surgery. The shields
defended the fail line again; nothing scored.

---

## 📅 STATION 1 — THE WEEK, DAY BY DAY

**WITNESSED at the table — owner-run PASTE 20, Thu 17 Sep 09:36 Lagos.** Engine arithmetic
(WIN/LOSS pnl, `[UNVERIFIED-BLIND]` at −stake, ghosts at 0, `strategy like '%LIVE%'`,
window Fri 11 → Thu 17):

| Day | Wins | Losses | Win% | Ghosts | P&L | Note |
|---|---|---|---|---|---|---|
| **Fri 11 Sep** | 193 | 155 | **55.5%** | 166 | **+20.77** | record burst → PO account flag ~14:32 UTC · 2 broker-confirmed cancels 15:20–15:21 |
| Sat 12 / Sun 13 | 0 | 0 | — | 0 | 0.00 | weekend shield + door refused (Doorbell #2, Sun 20:25 UTC) |
| Mon 14 Sep | 65 | 67 | 49.2% | 43 | −8.54 | door open 00:00 UTC, v4.4 verified 05:49 UTC, ladder lifted 06:28 UTC, daily stop same beat |
| Tue 15 Sep | 226 | 227 | 49.9% | 177 | **−18.73** | **the keyhole day** — stop printed −10.16 at 11:44 UTC, un-rang, traded 10 more hours |
| Wed 16 Sep | 16 | 26 | 38.1% | 24 | −10.94 | **v4.4.2 first day** — day-scoped stop, parked 18:42 UTC, held |
| Thu 17 Sep | 50 | 57 | 46.7% | 77 | −12.16 | stop tripped 08:20 UTC, window locked |
| **WINDOW** | **550** | **532** | **50.8%** | **487** | **−30.60** | vs balance delta −30.78 ⇒ **$0.18 settlement residual** (the $2.81 lesson, 18 cents wide) |

Three things the table says out loud:

1. **Friday paid for the week** (+20.77 at 55.5%) and every day after it was red. The only
   day above 50% is the day the account got flagged.
2. **The busiest settled day (Tue, 453 rows) was the worst day** — exactly what the keyhole
   bug predicted: *the busier the day, the weaker the stop.*
3. **`blind = 0` on every day.** v4.4.1's `[UNVERIFIED-BLIND]` path never fired once this
   week — the blind spot that ate Friday's three rows has stayed shut since the fix.

**Corrections inked, per the honesty covenant:** PASTE 1 read Tuesday as **−19.42** on
Tuesday night; the full-window witness reads **−18.73** — $0.69 of late settlement moved
after the first read. And PASTE 1's "407 trades Tue" was a rolling-24h count, not the UTC
day: the day holds 453 settled rows. The witness wins; the earlier reads stand as
timestamps of what was knowable then.

---

## 🕳️ STATION 2 — THE OUTAGE, REWRITTEN (honesty clause)

**The story we told on Saturday:** the door snapped shut Fri 14:32 UTC and reopened Mon
00:00 UTC — 58 hours.

**What PASTE 2 proved:** ~100 `[PO-NONE]` ghost rows between **00:06 and 07:29 UTC on
Friday 11 Sep** — the bridge answering "no order id" every few minutes all morning. The
door was **degrading from midnight**, and 14:32 UTC was the moment of total refusal, not
the start of the trouble.

| Phase | From | To | Character |
|---|---|---|---|
| Degradation | Fri 11 Sep ~00:06 UTC | Fri 14:32 UTC | ghosts accumulate, orders intermittently not placed |
| Hard refusal | Fri 11 Sep 14:32 UTC | Mon 14 Sep 00:00 UTC | PO auth layer rejects uid 85170680 from any datacenter |
| Recovery | Mon 14 Sep 00:00 UTC | Mon 05:49 UTC | door open, v4.4 verified live, first clean beat |

**Rewritten total: ≈62 hours of degradation, ≈58 hours of hard outage.** Cause of record:
account-level API flag after the 319-trade burst (bot-pattern detection). Slot-kicking
suspect acquitted by receipt. Browser and QT app were unaffected throughout — different
front door. **Consequence for the contract: v6's sample is ~3.5 tradeable days.** Any
"the strategy had a bad week" reading of −30.78 is unsupported by this timeline.

---

## ⚖️ STATION 3 — MONEY COURT: CLOSED

- **The $2.81 gap** (owner's Friday receipt $49,565.00 vs ledger $49,566.06-class figure):
  asynchronous settlement, per the owner's own ruling. Not an error.
- **PASTE 16 class split of cancelled LIVE rows:** `[PO-NONE]` ghosts **4,545** ·
  PO-tagged cancels **2** · settled-then-cancelled **365** · **UNTAGGED 1,948**.
- The only two broker-confirmed cancellations in the live era are named: **Fri 11 Sep
  15:20–15:21 UTC** — inside the flag window, and the $2.81 suspects.
- **Maximum exposure proven: +$1.70.** No missing money, no unaccounted stake.
- Case closed. The residual is not a money question, it's a *provenance* question — which
  is Station 8 item 4 and Amendment 6A.

---

## 🔧 STATION 4 — WHAT SHIPPED THIS WEEK

| Build | Date | Class | Tests | Live proof |
|---|---|---|---|---|
| **v4.4.1 "BLIND GRACE"** | Mon 14 Sep | shield/plumbing | 80/80 | verified 09:28 UTC — fingerprint `reach 41.2m`, balance $49,557.72 |
| **v4.4.2 "THE DAY IS A DAY"** | Wed 16 Sep | shield/plumbing | **101/101** | **verified by PASTE 19 (below)** |

**Zero brain-math changed in either build.** Both are honesty/plumbing class: what the
shields can *see*, and how the existing −$10 floor is *measured*.

### v4.4.2 deployment receipt — PASTE 19, owner-run Wed 16 Sep

| column | value | meaning |
|---|---|---|
| stop_time | 2026-09-16 18:42:09 UTC | the stop line's own timestamp |
| latch_lines | 0 | latch never had to fire in production |
| day_rows | 42 | fewer rows today than the 80-row window |
| **day_at_stop** | **−10.94** | **full-day sum = the number the line printed** |
| keyhole80 | −15.67 | what v4.4.1's window would have printed |
| day_now | −10.94 | unchanged after the trip ⇒ park held |

The printed line and the day-scoped sum agree to the cent; the keyhole sum differs by
$4.73. **v4.4.2 wrote it.** The keyhole bug is dead in production, not only in the harness.

### Day 2 — PASTE 21, owner-run Thu 17 Sep 09:42 Lagos

| column | value | meaning |
|---|---|---|
| stop_time | 2026-09-17 08:20:13 UTC | today's stop line timestamp |
| latch_lines | 0 | latch still never needed in production |
| **day_at_stop** | **−12.16** | **full-day sum = the number the line printed** |
| keyhole80 | −17.34 | what v4.4.1's window would have printed ($5.18 of Wednesday's losses leaking in) |
| day_now | −12.16 | unchanged since 08:20 ⇒ the park that locks contract v6 is holding |

**Two days, two receipts, zero ambiguity.** Under the old code today's line would have read
−17.34 — a number contaminated by Wednesday — and would have un-rung as that window rolled
forward, exactly Tuesday's failure mode. `day_now = day_at_stop` also certifies that no trade
has landed since the trip: **the park is what locks the contract verdict.**

### PASTE 24 — LEAK-HOUR REPLICATION, witnessed Thu 17 Sep 10:00 Lagos (v5+v6, two weeks)

| cohort | graded | wins | win% | vP&L @85 |
|---|---|---|---|---|
| 03 UTC leak | 3,360 | 1,600 | **47.6** | −400.00 |
| 14 UTC leak | 3,148 | 1,513 | **48.1** | −348.95 |
| all other hours | 70,740 | 35,420 | 50.1 | −5,213.00 |

- **REPLICATED.** 03 UTC −2.5pp ≈ **2.8 SE**; 14 UTC −2.0pp ≈ **2.2 SE**, both against
  70,740 pages. Pre-registered hours re-tested on double the original sample — Law #2
  satisfied. Magnitude halved vs the original −5pp read (regression toward truth); direction
  and significance survived, which is what replication means.
- **Clause #4's if-branch fires: the curfew-shield STUDY is now a v7 docket item.** Not a
  shield tonight: house order is study → paper → vote → ship. Money is real but small —
  leak hours lose ≈4.1 v-cents/page more than the rest ≈ **−$13–14 virtual/week** — and even
  "all other hours" (50.1%) sits below the 52.9% breakeven at 89% payout, so a curfew
  shrinks losing volume without creating a winner.
- **Proposed v7 docket shape:** zero-cost paper curfew trial — grade all pages as now,
  report weekly what blocking 03:00–03:59 and 14:00–14:59 UTC would have saved — DN#7 vote
  on any live shield. 03 UTC = 04:00 Lagos (Asia session), 14 UTC = 15:00 Lagos (US open);
  regime story plausible, unproven, and stays unproven until the paper says otherwise.

**Every number in this pack has now passed through the owner's hands: eleven pastes,
zero unwitnessed figures.**

**What is still unproven:** the **LATCH** (`latch_lines = 0` both days). It is covered by 21
harness assertions but production has never needed it — on neither day did the P&L recover
above the floor after tripping. Recorded as a **lab result**, not a live receipt. Do not
let anyone at the table upgrade it.

**Before/after in one line:** Tue (v4.4.1) stop printed −10.16 on a 4-hour keyhole, un-rang,
and the day closed −18.73 (witnessed; −19.42 was Tuesday night's reading before $0.69 of
late settlement landed). Wed/Thu (v4.4.2) stops printed −10.94 and −12.16 on the true day
and both held. Overshoot: **−$8.73 → −$2.16.**

---

## 🕵️ STATION 5 — SCOUT HONESTY: GRADUATION CLOSED

**The owner's principle, adopted as house law:** *"we need to build the app to stop lying
if not scout will learn beautiful lie."* Honesty gates graduation. Stages run in order.

**Stage-1 measurement — complete (PASTE 17 / 18a / 18b):**

- Agreement between the scout's Binance grade and the broker's actual verdict:
  **1,085 / 2,131 = 50.9% = chance.** Zero predictive information.
- Symmetric inversion (46.8 vs 53.2) ⇒ noise, not a tilted ledger.
- **PASTE 18b** (±45 s match window) left AGREE at exactly 1,085 ⇒ the result is **not** a
  loose-matching artifact. Independence is real.
- **PASTE 18a:** seated 3,113 ≈ broker rows 2,190 + ghosts 841 (+82 unexplained) ⇒
  **28.7% of pages the scout calls SEATED are `[PO-NONE]` ghosts** — orders that never
  reached the broker.

**The beautiful lie, precisely defined:** it is a false **LABEL**, not a false verdict. The
scout grades a never-executed order on Binance and writes `would_trade` on a page whose
trade never existed. The math is honest; the bookkeeping is not.

**Third independent no-edge confirmation** (after bench receipts 50.5% / 50.7% and live win
rate ~50%). Three different instruments, three different datasets, one answer.

**RULING: graduation to real money stays CLOSED.** It cannot reopen until (1) agreement is
materially above chance, and (2) shadow pages carry provenance labels (Amendment 6B).

**Assistant's own error, on the record:** PASTE 17's third bucket was labelled
"NO-BROKER-ROW" by me; those pages actually matched CANCELLED ghost rows. Corrected in
DIAGNOSIS.md the same night. The honesty covenant runs both directions.

---

## 🛒 STATION 6 — CLAUSE #7: FOREX PRICE-SHOP ✅ DELIVERED

Full sheet: `deliver/FOREX-PRICE-SHOP.md`. **Zero-code, $0.00 spent** — every figure from
public pricing pages and published comparisons. No account opened, no card touched.

| Shelf item | All-in / std lot | Min deposit | Nigeria rails | $0 API |
|---|---|---|---|---|
| Exness Standard | ≈ $2 | $10 | ✅ local bank transfer | demo |
| Octa | ≈ $7 | $20–25 | ✅ GT Bank (₦36,000 min) | demo |
| XM Zero | ≈ $9 | $5 | ❌ | demo |
| OANDA Core | ≈ $9 | $0 | ❌ | ✅ v20 free on practice |
| Fusion Zero | ≈ $5.50 | $10 | ❌ | demo |
| HFM | ≈ $5–8 | low | ✅ **only NGN base currency** | demo |
| Deriv (MT5/CFD) | varies | ~$10 | ⚠️ **UNRESOLVED** | ✅ official WS API + $10k demo |

**Recommendation to the table: SHOP RECORDED, DOOR KEPT.** A $1 binary stake has no forex
analogue — binary cost is the stake plus the payout gap (85% ⇒ breakeven ≈ 54.0% win rate),
forex cost is spread + commission + stop distance. Cheaper spreads shrink friction; they do
not create edge, and Station 5 just measured the edge at zero. The one action worth taking
is the **Deriv Nigeria signup test** ($0, owner's connection) — Deriv is the only shelf item
whose API shape matches the bridge we already run, and its gate is the last unknown.

---

## 📋 STATION 7 — CONTRACT v6 CLAUSE AUDIT (promised / delivered / slipped)

| # | Clause | Status | Receipt or reason |
|---|---|---|---|
| 1 | 🏆 1H bench extended — re-trial #3 at DN#6 | ✅ **RUN (PASTE 22)** | v6 window: 1H stands 11,325p **49.5%** (−946.50 v$) vs seated-held 23,469p 49.9% — gap 0.4pp ≈ 0.7 SE = zero. Below re-trial #2's 50.5%. **Parole refused; bench extended; re-trial #4 at DN#7.** Bonus finding: FIRED lane 1,604p **47.8%** < both held cohorts (−2.1pp ≈ 1.6 SE = hint, not finding) → feeds PASTE 23 |
| 2 | 🧠 Rulebook v0.1 "Stability Rider" | ✅ **SHIPPED** | v4.4 (DN#5 vote), dwell ≥6 h + calm-door parole; dwell receipts throttled in feed |
| 3 | ⏱️ 5m whistle HELD | ✅ **HELD** | no whistle change made; SOL-3m replication → clause 9a |
| 4 | 🕳️ Leak-hour logged, not law | ✅ **HELD** | no curfew shield built; replication → clause 9c |
| 5 | 🛡️ Shield law UNCHANGED | ⚠️ **RATIFICATION NEEDED** | v4.4.1 + v4.4.2 are shield-class. Owner authorised verbally ("if there is a fix it should be fixed"); **Amendment 6E asks for the formal stamp** |
| 6 | 🩺 MATIC→POL transplant PROVEN | ✅ **STANDS** | fall-safe rider unchanged; no synthetic brain-food |
| 7 | 🚀 Floor-3 gate: forex price-shop | ✅ **DELIVERED** | Station 6 · `FOREX-PRICE-SHOP.md` · $0.00 |
| 8 | 📖 Advisor report read aloud | ✅ **DELIVERED** | Station 5 *is* the scout report |
| 9 | 📚 Study docket (a) SOL-3m replication (b) seat-ranking mine (c) leak-hour replication | ⚠️ **9b + 9c RUN · 9a NOT RUN** | 9b (PASTE 23): gold star kept, +2.2pp ≈1.3 SE below the 3pp rule; fired-lane-last in 4 cuts = observation #8. 9c (PASTE 24): **replicated**, curfew study promoted to v7 docket. 9a (SOL-3m slice) needs its own paste — booked for v7 week 1 |

**Clause-law #4 satisfied:** both slips (#1 partial, #9) are named with reasons and dates.

---

## 👁️ STATION 8 — OPEN OBSERVATIONS (booked, unfixed)

1. **Pulse spam — now quantified.** At 19:04 UTC Wed the last 30 activity lines were
   **30/30 MIRROR at ~2 per minute**. The feed's visible window is ~15 minutes deep, so
   every SHIELD / SHADOW / CLOSE / ERROR receipt drowns inside a quarter-hour.
   **Verification by feed is no longer possible — it now requires SQL.** → Amendment 6C.
2. **The dashboard card lies by ~$461.** `pocketOptionConnection.balance` reads **$49,976.70**
   while the bridge reads **$49,515.89**. `botSessions` still shows a session opened
   **2026-08-19** with initialBalance 10000 and totalTrades 0. Both are stale rows the app
   displays as live truth. → Amendment 6D.
3. **Bridge-dead fire-block.** v4.4's guard measures and reports a dead tape; whether a dead
   bridge should *block* firing is an owner vote, not an assistant decision.
4. **Mop cold-hole.** PASTE 3: 6,495 cancelled LIVE rows · the mop sees 40 · **6,455
   permanently cold**. Of those, **1,948 carry no provenance tag at all** (PASTE 16). → 6A.
5. **Feed reach varies wildly:** 41.2 m (Mon) → 79.1 m (Tue) → 90 m (Wed). Tape depth is not
   constant, which is why the ±45 s matching test in PASTE 18b mattered.
6. **Unauthenticated status routes** (`/api/pocket-option`, `/api/autopilot` without key)
   expose email, balance and the activity feed. Owner's standing ruling: *"not a problem for
   now."* Recorded, deprioritised, not forgotten.
7. **Ghost rate is not historical — it is ongoing, and Thursday's is the worst of the week.**
   From PASTE 20: ghosts as a share of fired orders per day — Fri 32.3% · Mon 24.6% ·
   Tue 28.1% · Wed 36.4% · **Thu 41.8%** (77 ghosts against 107 settled rows in 8h20m before
   the park). 487 of 1,569 fired orders this week (31.0%) never reached the broker. They move
   no money (pnl 0) and consume seats and cycles, but they are the live face of the 28.7%
   contamination in Station 5 and the strongest single argument for Amendment 6B.
   **Watch item:** if Friday's first un-parked hours hold a 35%+ ghost rate, doorbell the
   bridge before assuming strategy fault — the door degrades before it dies (Station 2).
8. **The fired lane graded below the held lanes (PASTE 22, hint-class).** FIRED 47.8% vs
   seated-held 49.9% (−2.1pp ≈ 1.6 SE). Candidate explanations, cheapest to test first:
   (a) first-come seat assignment picks arbitrarily inside correlated signal clusters —
   PASTE 23 measures exactly this; (b) fire-time selection (a free seat means a trade just
   closed); (c) plain noise at n=1,604. **No action proposed tonight** — one more week of
   paper decides whether it is a finding. **PASTE 23 update:** seat-full-held 50.0% vs fired
   47.8% = +2.2pp ≈ 1.3 SE — below the pre-registered 3pp rule, gold star kept; pooled
   held-vs-fired = 1.5 SE, four concordant cuts. Seat-full binds ~as often as we fire
   (1,738 vs 1,604), and a fourth seat would only add sub-50% paper.

---

## 📜 STATION 9 — AMENDMENT DRAFTS FOR CONTRACT v7

**6A · MOP COLD-HOLE (owed by clause-law #4).** The retired adoption mop can only ever see
the last ~40 tape rows; 6,455 cancelled rows are permanently out of reach and 1,948 of them
have no provenance label. Options:
- **(A) NAME AND SEAL — recommended.** Zero writes, zero code: record in CONTRACT.md that
  1,948 pre-labelling cancels are permanently untagged and out of audit scope, and that all
  rows from the v4.4.1 era forward carry provenance. The hole is documented, not retro-fitted.
- **(B) SQL STAMP.** One owner-run UPDATE appending `[COLD-UNVERIFIED]` to `strategy`.
  **Hazard: `live_trades.strategy` is varchar(64)** (v3.6.1 lesson) — an append can overflow
  and Postgres will reject the write, so it must be length-guarded. Reversible, but it edits
  history, and this house does not edit history without a vote.
- **(C) RE-ACTIVATE THE MOP** with a deeper tape window. Code change, shield/plumbing class,
  needs a build slot. Not recommended: the ghosts are already excluded from the ledger, so
  the mop would spend effort labelling rows that cannot move money.

**6B · STAGE-2 PROVENANCE (bookkeeping class).** Every shadow page records the order's fate
at grade time: `broker-confirmed` / `ghost` / `held`. This is the precondition for any future
graduation conversation, and it is the fix for the 28.7% contamination in Station 5. Zero
brain-math — it writes one more column's worth of truth onto pages that already exist.

**6C · PULSE HYGIENE.** Throttle the MIRROR pulse from ~2/min to one line per 15 min (or fold
it into a single heartbeat), and give SHIELD / SHADOW / CLOSE / ERROR lines priority so a
receipt is never buried. Zero brain-math, plumbing only.

**6D · DASHBOARD TRUTH.** The card reads the bridge (or stamps the row's age) instead of
showing a stale balance as live. The owner should never have to ask me what his balance is.

**6E · SHIELD-LAW RATIFICATION.** Formal owner stamp on v4.4.1 + v4.4.2 as shield-class
amendments to clause #5, so the contract record and the deployed code agree.

---

## 🗳️ STATION 10 — DECISION MENU (tonight's votes)

| # | Question | Options |
|---|---|---|
| **V1** | Ratify v4.4.1 + v4.4.2 as shield-class amendments (6E)? | YES / NO / NO-revert |
| **V2** | Mop cold-hole (6A)? | A name-and-seal / B SQL stamp / C re-activate mop / defer |
| **V3** | Stage-2 provenance (6B) — build slot in v7? | YES / NO / defer to DN#7 |
| **V4** | Pulse hygiene (6C)? | YES / NO |
| **V5** | Dashboard truth (6D)? | YES / NO |
| **V6** | Study docket — 9b **RUN** (gold star kept) · 9c **RUN** (leak replicated ⇒ curfew paper trial into v7 docket?) · 9a not run | YES paper trial into v7 / defer / drop |
| **V7** | 1H bench re-trial #3 (clause #1) — **RUN: parole refused, 49.5% vs seated 49.9%** | extend bench + re-trial #4 at DN#7 / parole anyway / permanent bench |
| **V8** | **Contract v7 terms** — proposed: anchor **$49,515.89** (Thu 17 Sep 08:22 UTC), window **Fri 18 → Thu 24 Sep**, target ≥ $0, fail line −$50, **DN#7 Thu 24 Sep 8 PM Lagos** | sign / amend |
| **V9** | Deriv Nigeria signup test ($0, owner's connection)? | go / no-go |
| **V10** | Graduation status | confirm **CLOSED** (per Station 5) |

**Rollback, always available:** `~/v4.4-bot-engine.ts` (v4.4 pristine, md5 bd74dab2) and
`~/v4.3-bot-engine.ts` (md5 c1b7f338). One upload restores either.

---

## 📎 APPENDIX A — PASTES FOR THE TABLE

**PASTE 20 — the whole window, one statement (7 columns, ~7 rows):**
```sql
select to_char(closed_at,'Dy DD') as day,
 count(*) filter (where status='WIN')  as wins,
 count(*) filter (where status='LOSS') as losses,
 count(*) filter (where status='CANCELLED' and strategy like '%[PO-NONE]%') as ghosts,
 count(*) filter (where status='CANCELLED' and strategy like '%[UNVERIFIED-BLIND]%') as blind,
 round(sum(case when status='CANCELLED' and strategy like '%[UNVERIFIED-BLIND]%'
                then -abs(coalesce(stake,1))
                when status in ('WIN','LOSS') then coalesce(pnl,0)
                else 0 end)::numeric,2) as pnl
from live_trades
where strategy like '%LIVE%'
  and closed_at >= '2026-09-11'::timestamp
  and closed_at <  '2026-09-18'::timestamp
group by 1 order by min(closed_at);
```

**PASTE 21 — today's stop, version-checked (1 row, 5 columns):**
```sql
with stop as (select max(created_at) t from bot_activity
  where type='SHIELD' and message like '%DAILY STOP-LOSS%'
    and created_at >= '2026-09-17'::timestamp),
eff as (select id, closed_at,
   case when status='CANCELLED' then -abs(coalesce(stake,1))
        else coalesce(pnl,0) end pnl_eff
 from live_trades where strategy like '%LIVE%'
   and (status in ('WIN','LOSS')
     or (status='CANCELLED' and strategy like '%[UNVERIFIED-BLIND]%')))
select (select t from stop) stop_time,
 (select count(*) from bot_activity where message like '%latched%'
   and created_at >= '2026-09-17'::timestamp) latch_lines,
 (select round(sum(pnl_eff)::numeric,2) from eff
   where closed_at >= '2026-09-17'::timestamp
     and closed_at <= (select t from stop)) day_at_stop,
 (select round(sum(pnl_eff)::numeric,2) from (
   select pnl_eff from eff where closed_at <= (select t from stop)
   order by id desc limit 80) k) keyhole80,
 (select round(sum(pnl_eff)::numeric,2) from eff
   where closed_at >= '2026-09-17'::timestamp) day_now;
```
Reads the same way PASTE 19 did: `day_at_stop = −12.16` ⇒ v4.4.2 wrote today's line;
`keyhole80 = −12.16` instead ⇒ it did not.

**PASTE 22 / 23 / 24** (1H bench re-trial · seat-ranking mine · leak-hour replication) are
drafted on request — say the word and they arrive as chat blocks before 8 PM.

## 📎 APPENDIX B — FILES, PATHS, HARNESS

| Thing | Path |
|---|---|
| Live engine (v4.4.2, 1,105 lines, md5 e3003f) | `deliver/bot-engine.ts` |
| Build notes | `deliver/BUILD-NOTE-v4.4.2.md` · `BUILD-NOTE-v4.4.1.md` · `BUILD-NOTE.md` |
| House history (1,221+ lines) | `deliver/DIAGNOSIS.md` |
| Forex price-shop (clause #7) | `deliver/FOREX-PRICE-SHOP.md` |
| API-durability research | `deliver/BROKER-RESEARCH.md` |
| Money-court pack | `deliver/money-court-2.81.sql` |
| Rollback v4.4 / v4.3 | `~/v4.4-bot-engine.ts` · `~/v4.3-bot-engine.ts` |
| Type check | `cd workspace/tscheck && ./node_modules/.bin/tsc -p tsconfig.json` → exit 0 |
| Behavioural harness | `cd test && node test.js` (36) · `node test-v441.js` (44) · `node test-v442.js` (21) = **101** |

**Live probes at pack-build time (Thu 08:22 UTC):** bridge `/health` ok · uid 85170680 ·
balance $49,515.89 · last engine beat 08:22:08 UTC · 0 open trades · today's stop line
08:20:13 UTC (−$12.16) · scout on duty, 16 pages in the notebook.
