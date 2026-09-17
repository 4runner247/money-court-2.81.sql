# 🛠️ BUILD NOTE — v4.5 "PAPER TRAIL"
### Thu 17 Sep 2026 · Data Night #6 build · owner voice: "build as recommended" (V1–V10)
**File:** `deliver/bot-engine.ts` · 1,220 lines · md5 `53d4bacd90e684927ae0318995f44eec`
**Class:** bookkeeping + plumbing ONLY. Zero brain-math, zero shield-law change,
zero new fire paths, zero new orders. Rollback: `~/v4.4-bot-engine.ts` (v4.4) or
re-upload v4.4.2 (md5 e3003f).

## What ships (the three voted code amendments, nothing else)

**6B · STAGE-2 PROVENANCE (V3).** New read-only helper `shadowFate()` + a `fate`
write on every final-bell shadow page (and every NO-PRICE give-up):
`broker-confirmed` ([PO:…] receipt row in ±120 s) · `ghost` ([PO-NONE] row) ·
`held` (no order attempted) · `unmatched` (honest don't-know). The SCOUT GRADED
feed line names the fate. This closes the scout's "beautiful lie" half: the label
now carries its own truth (28.7% of seated pages were ghosts, PASTE 18a).
**Upload-safe either way:** if the `fate` column does not exist yet, the grade
write retries without it — provenance is best-effort until **PASTE 25** runs.

**6C · PULSE HYGIENE (V4).** The MIRROR heartbeat was a raw log line every cron
beat whenever ghosts sat on the tape (~2/min; feed window ~15 min; every receipt
drowned — DN#6 Station 8 item 1). Now `logThrottled(..., 15 * 60e3)`. Per-trade
CLOSE lines and all SHIELD / SHADOW / ERROR receipts keep their own cadence.

**6D · DASHBOARD TRUTH (V5).** `getBotStatus()` now asks the bridge for the live
balance (one GET /balance, never /trade) and ALWAYS returns a `balanceTruth`
stamp: `{balance, asOf, source:"bridge-live"}` or `{balance, source:"stale-row",
rowAgeMin}`. The `connection` object carries the same stamp so existing UI shows
the live number where reachable and can never show a stale one unlabelled.

## Receipts

- `tscheck` strict harness: **exit 0**.
- Behavioural suites: test.js **36** · test-v441.js **44** · test-v442.js **21** ·
  **test-v45.js 31 (new)** = **132/132**.
- test-v45 proves: all four fate labels · held skips the ledger read · grade math
  untouched (BUY 90→100 = WIN) · fate named on the feed line · missing-column
  fallback lands the grade · heartbeat 1/15 min with beat-2 suppressed and 16-min
  wake · CLOSE cadence untouched · bridge-live and stale-row stamps · /balance-only
  truth call · every shield/bell/rulebook constant byte-identical · no dice ·
  shadowFate read-only · settleShadows never touches the trade path.

## Disclosures (house rule: say it, don't hide it)

1. `settleShadows` is now `export`ed — test-only surface on a pure notebook
   grader, same disclosure as v4.4.1's `shieldCheck`. Production call site
   unchanged (still `runAutopilotCycle`).
2. v4.5 adds ONE bridge call per dashboard status read (GET /balance). Cron beats
   do not call getBotStatus, so per-minute bridge load is unchanged.
3. The fate lookup adds one `live_trades` range read per final-bell would_trade
   page (±120 s window, ≤12 pages per cycle cap). Bounded, indexed column
   (`opened_at` filter on a small window); if the read fails the page is labelled
   `unmatched`, never guessed.

## Owner actions, in order

1. Run **PASTE 25** (Supabase SQL Editor): adds the `fate` column. Optional but
   recommended BEFORE upload; the build is safe either order.
2. Upload `deliver/bot-engine.ts` to Vercel (same slot as v4.4.2).
3. First cron beat after upload: a SCOUT GRADED line with `fate …` = proof 6B is
   live; MIRROR pulses at ≤4/hour = proof 6C; `/api/autopilot` shows
   `balanceTruth.source = "bridge-live"` = proof 6D.
