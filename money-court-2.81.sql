-- ═══════════════════════════════════════════════════════════════════════════
-- 💰 MONEY COURT — THE $2.81 GAP · receipt queries for DATA NIGHT #6
-- Built Mon 14 Sep 2026, Lagos. Rev 2 — corrected against the REAL schema.
-- Supabase → SQL Editor → paste ONE block at a time → Run.
--
-- READ-ONLY, AUDITED: 11 statements, every one a SELECT or WITH. No INSERT,
-- UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT or COPY anywhere.
-- Nothing here can write, bench, settle or trade.
--
-- ── SCHEMA FACTS (owner-supplied, Block 0, Mon 14 Sep) ─────────────────────
--  live_trades.id            integer          live_trades.strategy   TEXT  ← not varchar(64)!
--  live_trades.symbol        varchar(32)      live_trades.stake      real
--  live_trades.direction     varchar(16)      live_trades.payout     real
--  live_trades.status        varchar(16)      live_trades.pnl        real
--  live_trades.pnl_percent   real             live_trades.timeframe  varchar(16)
--  live_trades.opened_at     TIMESTAMP (no tz) live_trades.closed_at TIMESTAMP (no tz)
--  bot_activity.type         varchar(32)      bot_activity.severity  varchar(16)
--  bot_activity.message      text             bot_activity.details   jsonb
--  bot_activity.created_at   TIMESTAMP (no tz)
--  shadow_signals.created_at TIMESTAMPTZ      shadow_signals.result  text
--  shadow_signals.would_trade boolean         shadow_signals.guard_fired text
--  shadow_signals.result_3m  text             shadow_signals.result_4m text
--
-- ⚠️ THE TIMEZONE TRAP this revision exists to avoid:
--  live_trades and bot_activity store TIMESTAMP WITHOUT TIME ZONE, and the
--  values in them are UTC wall-clock (verified: a feed row stamped 09:28:07
--  matched a probe taken at 09:28:15 UTC). So:
--   · compare them against NAIVE literals — '2026-09-14 05:49:15', NOT
--     '...+00'. An offset literal forces Postgres to reinterpret the naive
--     column in the SESSION timezone and every boundary shifts.
--   · date_trunc('day', closed_at) on the naive value splits days at UTC
--     midnight, which is what the contract uses. Adding `at time zone 'UTC'`
--     first would convert to timestamptz and then split days at LAGOS midnight.
--   · shadow_signals.created_at IS timestamptz, so IT gets the +00 literal.
--  Display columns are labelled _utc and shown raw, because raw IS UTC.
--
-- ── THE CLAIM BEING TESTED ─────────────────────────────────────────────────
--   Owner receipt: balance was $49,565 before the door locked (Fri ~14:32 UTC).
--   Broker now:    $49,557.72 (Mon 14 Sep 09:30 UTC, read from the bridge).
--   => Monday moved the broker  −$7.28
--   App ledger said Monday's net P&L was −$10.09 (tripped the daily stop 06:28).
--   GAP = the broker lost $2.81 LESS than the app's own books recorded.
--
-- ── LEADING HYPOTHESIS (specific, falsifiable) ─────────────────────────────
--   Friday's "3 open-pending rows grace-cancel honestly" (DIAGNOSIS, Fri Sep 11
--   incident). Written pnl = 0 / CANCELLED. If the broker actually ran and WON
--   them, the broker is richer by ~3 × $0.85–0.92 ≈ +$2.6–2.8 while the app
--   recorded nothing. $2.81 ≈ three won $1 deals. The arithmetic fits.
--   Why the adoption mop missed them: it skips ghosts older than 36 h AND reads
--   only the last 40 CANCELLED rows. By Monday those rows were ~40 h old.
--   NOTE: v4.4.1 (live ~08:00–09:28 UTC Mon 14 Sep) now prevents this class of
--   loss going forward. These queries establish the RECEIPT for the one that
--   already happened.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── BLOCK 1 · the day-by-day money path vs the balance receipts ───────────
-- Compare against the known balance anchors:
--   Thu Sep 10 19:36 UTC  $49,546.67   (CONTRACT v6 opening anchor)
--   Fri Sep 11 ~14:32 UTC $49,565      (OWNER RECEIPT — before the door locked)
--   Mon Sep 14 09:30 UTC  $49,557.72   (bridge /balance, read live)
-- Whichever day's app pnl does not equal the broker's movement for that day is
-- where the leak lives. decided_pnl excludes CANCELLED, which is what the
-- scoreboard counts; app_pnl includes everything.
select
  date_trunc('day', closed_at)                                 as utc_day,
  count(*)                                                     as rows,
  count(*) filter (where status = 'WIN')                       as wins,
  count(*) filter (where status = 'LOSS')                      as losses,
  count(*) filter (where status = 'CANCELLED')                 as cancelled,
  round(sum(coalesce(pnl, 0))::numeric, 2)                     as app_pnl,
  round(sum(coalesce(pnl,0)) filter (where status in ('WIN','LOSS'))::numeric, 2) as decided_pnl
from live_trades
where strategy like '%LIVE%'
  and (strategy like '%[PO:%' or strategy like '%[BROKER-SETTLED]%')
  and closed_at >= '2026-09-10 00:00:00'
group by 1
order by 1;


-- ─── BLOCK 2 · THE SUSPECTS: Friday's cancelled rows the broker may have paid ─
-- A CANCELLED row with pnl = 0 means "the app decided this never happened".
-- If the broker disagrees, the money moved and the ledger did not.
select
  id, symbol, direction, timeframe, status,
  round(coalesce(pnl,0)::numeric, 2)  as pnl,
  stake, payout,
  opened_at                           as opened_utc,
  closed_at                           as closed_utc,
  strategy
from live_trades
where status = 'CANCELLED'
  and strategy like '%LIVE%'
  and opened_at >= '2026-09-11 00:00:00'
  and opened_at <  '2026-09-12 00:00:00'
order by opened_at;
-- EXPECTED if the hypothesis is right: ~3 rows, Friday, pnl 0.00, and either no
-- [PO:...] tag (open-pending, never got a receipt) or [PO-NONE].
-- Note the symbols / directions / times — Thursday we ask the broker's own trade
-- history whether those three deals existed and what they paid.


-- ─── BLOCK 3 · how many cold-case ghosts are permanently out of reach ──────
-- The adoption mop reads only the LAST 40 CANCELLED rows and skips anything
-- older than 36 h. This measures how much broker truth is structurally
-- unreachable right now. If unreachable_cold is large, the mop's windows are too
-- small — a DN#6 amendment candidate (bookkeeping class, not brain).
with g as (
  select id, closed_at, strategy,
         row_number() over (order by closed_at desc) as rn
  from live_trades
  where status = 'CANCELLED'
    and strategy like '%LIVE%'
    and strategy not like '%[BROKER-SETTLED]%'
)
select
  count(*)                                                              as cancelled_live_total,
  count(*) filter (where rn <= 40)                                      as inside_last40_window,
  count(*) filter (where rn <= 40
                     and closed_at >= (now() at time zone 'UTC') - interval '36 hours') as adoptable_now,
  count(*) filter (where rn > 40
                     or closed_at <  (now() at time zone 'UTC') - interval '36 hours') as unreachable_cold
from g;


-- ─── BLOCK 4 · Monday's real tape, split THREE ways at each deploy ──────────
-- TAPE SPLITS (inked in DIAGNOSIS.md):
--   v4.4   live 05:49:15–05:50:06 UTC (known exactly)
--   v4.4.1 live somewhere in 07:59–09:28 UTC (bracketed by two probes: the
--          07:59:07 pulse had no `reach`, the 09:28:07 pulse did)
-- Rather than guess, this derives the v4.4.1 boundary ITSELF: the first MIRROR
-- pulse carrying `reach` is the first beat the new build served.
with deploys as (
  select min(created_at) as v441_at
  from bot_activity
  where message like '%MIRROR pulse%reach %'
)
select
  case when t.closed_at < '2026-09-14 05:49:15' then '1 · v6-b  v4.3   LIVE'
       when d.v441_at is null                   then '2 · v6-c  v4.4   LIVE (v4.4.1 not detected)'
       when t.closed_at < d.v441_at             then '2 · v6-c  v4.4   LIVE'
       else                                          '3 · v6-d  v4.4.1 LIVE' end as era,
  count(*)                                                as rows,
  count(*) filter (where t.status='WIN')                  as wins,
  count(*) filter (where t.status='LOSS')                 as losses,
  count(*) filter (where t.status='CANCELLED')            as cancelled,
  round(sum(coalesce(t.pnl,0))::numeric, 2)               as pnl
from live_trades t cross join deploys d
where t.strategy like '%LIVE%'
  and (t.strategy like '%[PO:%' or t.strategy like '%[BROKER-SETTLED]%')
  and t.closed_at >= '2026-09-14 00:00:00'
group by 1
order by 1;
-- ALSO CHECK: the 3 rows that settled as LOSS between the 05:56 and 09:30
-- scoreboard reads (all-time 3,325 → 3,328, −$105.89 → −$108.89, wins
-- unchanged at 65). They should sit in split 2 carrying [BROKER-SETTLED] — i.e.
-- the mirror got a real broker verdict, which is the good path. If they are
-- CANCELLED instead, or carry no broker tag, TELL ME: that changes the story
-- and it is exactly the class of row v4.4.1 exists to protect.


-- ─── BLOCK 5 · CONTRACT v6 clause #9(b) — the SEAT-RANKING MINE ────────────
-- Zero-code docket item owed at DN#6. Question: do the signals HELD because all
-- 3 seats were full outperform the ones that got a seat? Yes → ranking
-- amendment. No → the first-come law earns its gold star and stays free.
-- virtual_pnl is an approximation: shadow_signals carries no stake column, so
-- this assumes the $1 broker deal at 85% payout. Fine for a RELATIVE comparison,
-- not for money court.
select
  case when would_trade then 'SEATED (really fired)'
       else 'HELD — ' || coalesce(guard_fired, '?') end      as bucket,
  count(*)                                                   as pages,
  count(*) filter (where result in ('WIN','LOSS'))           as graded,
  round((100.0 * count(*) filter (where result='WIN')
         / nullif(count(*) filter (where result in ('WIN','LOSS')),0))::numeric, 1) as win_pct,
  round(sum(case when result='WIN' then 0.85
                 when result='LOSS' then -1 else 0 end)::numeric, 2)                as virtual_pnl
from shadow_signals
where settled
  and created_at >= '2026-09-11 00:00:00+00'
group by 1
having count(*) filter (where result in ('WIN','LOSS')) > 0
order by win_pct desc;


-- ─── BLOCK 6 · v4.4.1 deploy receipt + whistle hygiene, off the feed itself ─
-- Pins the exact first beat of the new build and proves the v4.4 throttle law
-- survived the swap — counted off bot_activity, not off my memory.
select
  min(created_at) filter (where message like '%MIRROR pulse%reach %')  as v441_first_beat,
  max(created_at) filter (where message like '%MIRROR pulse%reach %')  as v441_last_beat,
  count(*)        filter (where message like '%MIRROR pulse%reach %')  as pulses_with_reach,
  count(*)        filter (where message like '%MIRROR pulse%'
                            and message not like '%reach %')           as pulses_without_reach,
  count(*)        filter (where severity = 'ERROR')                    as errors,
  count(*)        filter (where message like '%BROKER MIRROR BLIND%')  as blind_lines,
  count(*)        filter (where message like '%DAILY STOP-LOSS%')      as daily_stop_lines,
  count(*)        filter (where message like '%HELD OPEN%')            as held_open_lines,
  count(*)        filter (where message like '%UNVERIFIED-BLIND%')     as unverified_lines,
  count(*)        filter (where message like '%DEPTH-RACE%')           as depth_race_lines
from bot_activity
where created_at >= '2026-09-14 00:00:00';
-- WHISTLE HYGIENE: daily_stop_lines should be roughly 1 per hour, NOT 1 per
-- beat. v4.3 printed it every beat — the 12-lines/hour thrash. If that count is
-- close to the number of beats since 06:28 UTC, the throttle has regressed.


-- ─── BLOCK 7 · THE DEPTH-RACE COUNTER — the DN#6 ask ───────────────────────
-- v4.4.1 MEASURES the depth race but deliberately does not GATE on it: gating
-- would hold every unmatched row 6 h and hand the shields three losses, tripping
-- the daily stop on an ordinary Monday. It ships as a receipt so Thursday's
-- decision rests on data instead of argument.
--   reach = how far back the broker's tape reaches (measured 37–41 min)
--   grace = how long the settler waits before declaring "no trace" (45 min)
-- reach < grace is TRUE right now, so absence is not provable from the tape for
-- any row that reaches the cancel branch.
select
  count(*)                                                        as grace_cancels_total,
  count(*) filter (where message like '%DEPTH-RACE%')             as unprovable_absence,
  count(*) filter (where message not like '%DEPTH-RACE%')         as provable_absence,
  round(100.0 * count(*) filter (where message like '%DEPTH-RACE%')
        / nullif(count(*),0), 1)                                  as pct_unprovable
from bot_activity
where type = 'CLOSE'
  and message like '%CANCELLED — no broker trace%'
  and created_at >= '2026-09-14 00:00:00';

-- 7b · how deep IS the tape, hour by hour? (the number behind the argument)
-- regexp_match returns NULL on no-match, so a malformed line can never throw a
-- cast error and abort the block.
select
  date_trunc('hour', created_at)                                     as utc_hour,
  count(*)                                                           as pulses,
  min((regexp_match(message, '\| reach ([0-9.]+)m \|'))[1]::numeric)  as reach_lowest,
  max((regexp_match(message, '\| reach ([0-9.]+)m \|'))[1]::numeric)  as reach_highest,
  round(avg((regexp_match(message, '\| reach ([0-9.]+)m \|'))[1]::numeric), 1) as reach_avg
from bot_activity
where message like '%MIRROR pulse%reach %'
  and created_at >= '2026-09-14 00:00:00'
group by 1
order by 1;
-- READ IT THIS WAY: if reach_highest stays under 45 across a full trading day,
-- the grace window is structurally longer than the evidence window and the
-- choice is real — shorten the grace, or ask the broker for a deeper tape
-- (main.py:577 already slices [:60], so the 20-row ceiling is broker-side, not
-- ours). If reach climbs well past 45 in quiet hours, the race only bites at
-- peak volume and a volume-aware grace is the cheaper fix.

-- 7c · any row actually held or marked blind yet? (expected: NONE, no outage)
select id, symbol, direction, status,
       round(coalesce(pnl,0)::numeric,2) as pnl, stake,
       opened_at as opened_utc, closed_at as closed_utc, strategy
from live_trades
where strategy like '%[UNVERIFIED-BLIND]%'
order by id desc
limit 50;
-- Empty is the CORRECT result while the bridge is healthy. This is the tripwire:
-- if it ever returns rows, an outage happened AND the shields were told about it
-- instead of being walked past it.


-- ─── BLOCK 8 · CONTRACT v6 clause #9(a) — the SOL-3m REPLICATION ───────────
-- The schema already carries exit_3m / result_3m / exit_4m / result_4m, so the
-- docket item is answerable with zero code. Does the 3-minute verdict agree with
-- the timeframe the brain actually traded? If 3m grades a signal the traded
-- expiry lost (or vice versa), the scout is grading on the wrong clock.
select
  coalesce(timeframe, '?')                                          as tf,
  count(*)                                                          as pages,
  count(*) filter (where result    in ('WIN','LOSS'))               as graded_std,
  count(*) filter (where result_3m in ('WIN','LOSS'))               as graded_3m,
  count(*) filter (where result_4m in ('WIN','LOSS'))               as graded_4m,
  round((100.0 * count(*) filter (where result='WIN')
         / nullif(count(*) filter (where result in ('WIN','LOSS')),0))::numeric,1)    as wr_std,
  round((100.0 * count(*) filter (where result_3m='WIN')
         / nullif(count(*) filter (where result_3m in ('WIN','LOSS')),0))::numeric,1) as wr_3m,
  round((100.0 * count(*) filter (where result_4m='WIN')
         / nullif(count(*) filter (where result_4m in ('WIN','LOSS')),0))::numeric,1) as wr_4m,
  count(*) filter (where result in ('WIN','LOSS')
                     and result_3m in ('WIN','LOSS')
                     and result <> result_3m)                       as disagree_3m
from shadow_signals
where created_at >= '2026-09-01 00:00:00+00'
group by 1
having count(*) filter (where result in ('WIN','LOSS')) > 0
order by pages desc;

-- 8b · SOL specifically — the docket names it
select
  count(*)                                                          as sol_pages,
  count(*) filter (where result    in ('WIN','LOSS'))               as graded_std,
  count(*) filter (where result_3m in ('WIN','LOSS'))               as graded_3m,
  round((100.0 * count(*) filter (where result='WIN')
         / nullif(count(*) filter (where result in ('WIN','LOSS')),0))::numeric,1)    as wr_std,
  round((100.0 * count(*) filter (where result_3m='WIN')
         / nullif(count(*) filter (where result_3m in ('WIN','LOSS')),0))::numeric,1) as wr_3m
from shadow_signals
where symbol like 'SOL%'
  and created_at >= '2026-09-01 00:00:00+00';
-- If graded_3m is 0 everywhere, the 3m referee was never populated and the
-- docket item is blocked on plumbing, not on analysis. That is itself the
-- answer DN#6 needs.
