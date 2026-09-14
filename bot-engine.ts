import { db } from "@/db";
import { botActivity, liveTrades, botSessions, pocketOptionConnection } from "@/db/schema";
import { desc, eq, and, sql, like } from "drizzle-orm";
import { analyzeMarketLive, MARKETS } from "./ai-engine";
import { fetchRealTicker } from "./live-market";
import { getSettings } from "./db-init";

// ═══════════════════════════════════════════════════════════════════
// TradeClaw bot-engine — v4.4.1 "BLIND GRACE" (2026-09-14 Monday build;
// owner authorisation: "if there is a fix it should be fixed". Bookkeeping +
// shield class ONLY — zero brain-touch, zero behaviour change on a healthy
// readable tape. Closes the shield blind spot that let 3 broker-confirmed rows
// leave as invisible CANCELLED/pnl-0 during the Fri 11 → Mon 14 58 h outage,
// which is also the $2.81 the owner's Friday balance receipt exposed.
// See the 🕳️ BLIND GRACE block below for the two measured receipts.)
//
// TradeClaw bot-engine — v4.4 "STABILITY RIDER + MIRROR EYES" (2026-09-13
// Sunday build; CONTRACT v6 clause "v0.1 STABILITY RIDER PASSED → Sunday
// build v4.4", owner-voted YES at Data Night #5, Thu Sep 10):
//  · ⏳ DWELL GATE ≥6h: a benched cell cannot be paroled until it has sat
//    out 6 hours. Cures the DN#5 Covenant Flag #4 THRASH — BTC-1D ↔ BNB-1D
//    musical chairs on the 2nd bench slot every 5–30 min (benched_at kept
//    resetting, 12 feed lines/hour, brief exposure windows mid-flip).
//  · 📏 EXIT MARGIN worst-3 (not worst-2): ENTRY cap stays max 2 cells
//    (Contract v5 clause #2 law, untouched), but the EXIT test now compares
//    against the worst THREE breaching cells — hysteresis, so a cell sitting
//    on the boundary can no longer flip out and straight back in.
//  · 🎺 WHISTLE HYGIENE: logThrottled() no longer reads only the single last
//    feed row (any interleaved line reset the window). It now matches on
//    type + digit-normalized signature across the last 25 rows, so throttled
//    lines actually throttle. Accepts a severity so errors can shout.
//  · 👁️ BRIDGE-DEAD GUARD (honesty class, zero trade-touch): syncBrokerResults
//    never checked res.ok, so a 502 from the bridge parsed as an empty tape
//    and the feed printed a healthy-looking "tape 0 closed". From Fri Sep 11
//    (account flag) to Sun Sep 13 the mirror was BLIND and said nothing —
//    receipts: GET /deals → 502 "Deals fetch failed: TimeoutError", while the
//    app logged tape 0 / 0 errors. Now: non-2xx or a body with no `closed`
//    array = BLIND, announced (throttled 1/hour), settles+adoptions skipped,
//    and DEALS_CACHE cleared so the seat rule never caches a lie.
//  · 🔪 Razor threshold <49% UNCHANGED one more week, for a clean
//    before/after (DN#5 Station 3, owner-voted).
// Foundation: v4.3 Rulebook v0 + Fall-Safe · v4.2 Friday Sweep · v4.1 Three
// Stopwatches · v4.0 Scout.
// PENDING OWNER VOTE (not shipped, deliberately): whether a BLIND bridge
// should also BLOCK new fire. The house rule is one change at a time and
// owner decisions final — see the marked one-liner in the fire path.
// Brain math FROZEN · scout law kept: notes only, never on the pitch. 🕵️
// ═══════════════════════════════════════════════════════════════════
// ── v4.3 HISTORY (2026-09-06 Sunday build; Contract v5 clause #2 + DN#4
// night riders — every item owner-voted, inked in CONTRACT.md):
//  · 🧠 LIMITED AUTO-BENCH "RULEBOOK v0" (DN#4 Motion A): a symbol×
//    timeframe cell with ≥700 graded pages + <49% wins + <−$50 virtual
//    @85% over the rolling last 7 days auto-benches STANDS-ONLY. Blocks
//    only — never fires · max 2 cells · auto_bench_cells table (raw
//    SQL, no schema binding) · bench/parole announced in feed with
//    receipts · owner override (overridden=true) respected FOREVER ·
//    1H cells excluded (clause #1 owns 1H) · tribunal pages keep
//    flowing on benched cells (guard_fired="auto-bench") so parole is
//    EARNED by data. Shield-class: WHO plays, never HOW the brain scores.
//  · 🔒 FALL-SAFE handling (owner YES, Thu DN#4 night): ai-engine v4.3
//    returns HOLD w/ "DATA-FEED-DOWN" marker when live candles fail —
//    counted + announced throttled here. Synthetic-fire is banned.
//  · 🩹 Scout grading ticker remap MATIC→POL (Binance retired MATIC
//    spot after the POL migration; broker symbol & labels unchanged).
// Foundation: v4.2 Friday Sweep · v4.1 Three Stopwatches · v4.0 Scout.
// Brain math FROZEN · scout law kept: notes only, never on the pitch. 🕵️
// ═══════════════════════════════════════════════════════════════════

export async function getBotStatus() {
  const [session, openTrades, recentActivity, connection] = await Promise.all([
    db.select().from(botSessions).orderBy(desc(botSessions.id)).limit(1).then((r) => r[0] ?? null),
    db.select().from(liveTrades).where(eq(liveTrades.status, "OPEN")).orderBy(desc(liveTrades.openedAt)),
    db.select().from(botActivity).orderBy(desc(botActivity.createdAt)).limit(30),
    db.select().from(pocketOptionConnection).limit(1).then((r) => r[0] ?? null),
  ]);
  return { session, openTrades, recentActivity, connection };
}
export async function logActivity(type: string, severity: string, message: string, details?: Record<string, unknown>) {
  await db.insert(botActivity).values({ type, severity, message, details });
}
// Exact broker symbols, verified against Pocket Option's LIVE asset list.
const POCKET_SYMBOLS: Record<string, string> = {
  "BTC/USDT": "BTCUSD_otc", "ETH/USDT": "ETHUSD_otc", "SOL/USDT": "SOL-USD_otc",
  "BNB/USDT": "BNB-USD_otc", "ADA/USDT": "ADA-USD_otc", "DOGE/USDT": "DOGE_otc",
  "AVAX/USDT": "AVAX_otc", "LINK/USDT": "LINK_otc", "MATIC/USDT": "MATIC_otc",
  "LTC/USDT": "LTCUSD_otc",
};

// v3.6.1 (2026-08-19): live_trades.strategy is varchar(64) — full-uuid tags made
// Postgres reject settle/adopt writes and the try/catch swallowed it (silent
// settle deaths all night). Every tag is fitted to <=63 chars; ids shortened to
// 8-char fingerprints (claim-once like-check still matches; tape exact-matches
// now use startsWith, which also covers legacy full-uuid tags).
const fitTag = (base: string, tag: string) => {
  const room = Math.max(10, 63 - tag.length);
  return base.length > room ? base.slice(0, room).trimEnd() + tag : base + tag;
};
const shortId = (id: string) => id.slice(0, 8);
const idMatch = (tapeId: unknown, want: string) => {
  const did = String(tapeId || "");
  return did === want || did.startsWith(want);
};
// v3.7 seat counter feed: syncBrokerResults already pulls /deals every cycle —
// cache the broker's LIVE-open count here so the SEAT RULE adds zero extra load.
let DEALS_CACHE: { opened: number; at: number } | null = null;

// v4.4 👁️ BRIDGE-DEAD GUARD state. The mirror's own honesty receipt: was the
// broker tape actually READABLE on the last cycle? Exported read-only so a
// dashboard/route can show the door state instead of guessing from an empty
// feed. Lambda instances are ephemeral — this is a best-effort live hint, the
// durable truth is the throttled MIRROR/ERROR line in botActivity.
let BRIDGE_TAPE: { ok: boolean; at: number; detail: string; reachMin: number; closedRows: number } =
  { ok: false, at: 0, detail: "never probed", reachMin: 0, closedRows: 0 };
export function bridgeTapeState() { return BRIDGE_TAPE; }

// ═══════════════════════════════════════════════════════════════════
// v4.4.1 🕳️ BLIND GRACE — "no broker trace" is only EVIDENCE when the tape
// was READABLE and DEEP ENOUGH to still contain the deal. Two measured facts
// force this (receipts, Mon 14 Sep 2026):
//  (a) DEPTH RACE — MEASURED, NOT GATED. The bridge returns at most ~20 closed
//      deals (`[:60]` in main.py, but the broker's own push carried 20). Live
//      Monday measurement: those 20 rows span **0.62 h = 37 minutes**, while
//      settleOpenTrades waits **45 minutes** (tagged) before declaring "no
//      broker trace". A tagged row only reaches that branch at age ≈ expiry +
//      grace ≈ 50 min — beyond a 37 min reach — so on paper the tape cannot
//      prove its absence. Gating on that was BUILT AND REJECTED TONIGHT: it
//      would hold every unmatched row 6 h and then hand the shields 3 losses,
//      tripping the daily stop on an ordinary Monday. Zero observed casualties,
//      so it ships as a LOGGED RECEIPT (`📏 DEPTH-RACE`) and nothing more.
//      Counting those lines across a week is the evidence DN#6 needs to decide
//      whether the 45 m grace or the broker's tape depth has to move.
//  (b) OUTAGE — GATED. Fri 11 Sep 14:32 UTC → Mon 14 Sep 00:00 UTC the door
//      was chained (58 h). 3 broker-confirmed rows were grace-cancelled to
//      pnl 0. The broker actually PAID them (~+$2.76, which is the $2.81 the
//      owner's Friday balance receipt exposed). Because they left as CANCELLED,
//      they were invisible to the ladder AND the daily stop, which read
//      WIN/LOSS rows only — the exact failure DIAGNOSIS v3.6 called "bot
//      traded blind". This one has a body count, so it is the one that ships.
// FIX (bookkeeping + shield class, ZERO brain-touch, ledger stays honest):
//   1. never grace-cancel while the bridge is provably BLIND (hold, don't guess)
//   2. after BLIND_HOLD_MAX_HOURS, stop holding seats — cancel with a DISTINCT
//      [UNVERIFIED-BLIND] marker (not [PO-NONE]: nothing was proven either way)
//   3. shields count [UNVERIFIED-BLIND] as a LOSS — worst case for RISK only.
//      The ledger keeps pnl 0 and the scoreboard still excludes it, so no
//      fabricated result ever enters the books (dice stay abolished).
//   4. the MIRROR pulse now prints `reach <n>m` so tape depth is always on the
//      feed, and settleOpenTrades logs the depth-race receipt from (a).
// ═══════════════════════════════════════════════════════════════════
const BLIND_FRESH_MS = 10 * 60e3;   // a tape reading older than this is STALE, not blind
const BLIND_HOLD_MAX_HOURS = 6;     // cap: never jam all 3 seats forever on unverifiable rows
const tapeBlindNow = () => !BRIDGE_TAPE.ok && (Date.now() - BRIDGE_TAPE.at) < BLIND_FRESH_MS;
const isUnverifiedBlind = (t: { status?: unknown; strategy?: unknown }) =>
  t.status === "CANCELLED" && String(t.strategy || "").includes("[UNVERIFIED-BLIND]");

// === BROKER MIRROR: settle broker-tracked trades by Pocket Option's REAL verdict ===
// Trades that reached the broker are tagged "[PO]". This syncs their status/pnl
// from the broker's closed deals so the scoreboard matches Pocket Option exactly.
export async function syncBrokerResults() {
  const bridgeUrl = process.env.POCKET_BRIDGE_URL;
  const bridgeSecret = process.env.POCKET_BRIDGE_SECRET;
  if (!bridgeUrl || process.env.ENABLE_LIVE_TRADING !== 'true') return { synced: 0 };
  const openRows = await db.select().from(liveTrades).where(eq(liveTrades.status, "OPEN"));
  // v3.1 (2026-08-17): claim ANY live open row. Orders that lost their receipt
  // tag during slow cycles are REAL too (their deals sit on the broker tape) —
  // the fuzzy matcher (clock-skew-fixed) claims them by asset+direction+time.
  // Exclude only proven ghosts ([PO-NONE]).
  const pending = openRows.filter((t) => { const s = t.strategy || ""; return s.includes("LIVE") && !s.includes("[PO-NONE]"); });
  // v3.6 (2026-08-19): NO early return when pending is empty — the ghost-adoption
  // pass below still needs the broker tape even when nothing is OPEN.
  let synced = 0, adopted = 0;
  try {
    const cleanUrl = bridgeUrl.endsWith('/') ? bridgeUrl.slice(0, -1) : bridgeUrl;
    const res = await fetch(`${cleanUrl}/deals`, { headers: { 'X-Bridge-Secret': bridgeSecret || '' } });
    const data = await res.json().catch(() => ({}));
    // v4.4 👁️ BRIDGE-DEAD GUARD — "tape 0 closed" and "we are blind" must
    // never look the same again. fetch() does NOT throw on HTTP 5xx, so a 502
    // body {"detail":"Deals fetch failed: TimeoutError"} used to fall straight
    // through: data.closed undefined -> closed = [] -> a healthy-looking
    // MIRROR pulse with zero errors, for 55 hours straight.
    const tapeReadable = res.ok && Array.isArray((data as any)?.closed);
    if (!tapeReadable) {
      const detail = String((data as any)?.detail || (res.ok ? "body had no tape array" : `HTTP ${res.status}`)).slice(0, 150);
      BRIDGE_TAPE = { ok: false, at: Date.now(), detail, reachMin: 0, closedRows: 0 };
      DEALS_CACHE = null; // never cache a lie — the SEAT RULE falls back to app rows
      await logThrottled("MIRROR",
        `⚠️ BROKER MIRROR BLIND: bridge answered ${res.ok ? "a body with no tape" : `HTTP ${res.status}`} — ${detail} — tape is UNKNOWN, NOT empty. Settles & adoptions skipped this cycle; shields read the app book only. No trade was placed or cancelled by this line.`,
        { blind: true, status: res.status, detail, pending: pending.length },
        60 * 60e3, "ERROR");
      return { synced: 0, adopted: 0, blind: true };
    }
    const closed = ((data && data.closed) || []) as Array<Record<string, unknown>>;
    // v4.4.1: measure how far back this tape actually REACHES. Using the span
    // (max-min) cancels the +2 h broker clock skew, so this is a clean number.
    // It is the receipt for the depth race in (a) above — if reachMin drops
    // below the grace window, absence is NOT provable for older rows.
    const tapeTs = closed.map((d) => Number(d.openTimestamp)).filter((n) => Number.isFinite(n) && n > 0);
    const reachMin = tapeTs.length > 1 ? (Math.max(...tapeTs) - Math.min(...tapeTs)) / 60 : 0;
    BRIDGE_TAPE = { ok: true, at: Date.now(), detail: "", reachMin: Math.round(reachMin * 10) / 10, closedRows: closed.length };
    DEALS_CACHE = { opened: Array.isArray((data as any).opened) ? (data as any).opened.length : 0, at: Date.now() }; // v3.7
    for (const row of pending) {
      const asset = POCKET_SYMBOLS[row.symbol];
      if (!asset) continue;
      const wantCmd = row.direction === 'BUY' ? 0 : 1;
      const openedAtMs = new Date(row.openedAt).getTime();
      const idTag = (row.strategy || '').match(/\[PO:([^\]]+)\]/);
      let best: Record<string, unknown> | null = null;
      let bestDt = Infinity;
      if (idTag) {
        best = closed.find((d) => idMatch(d.id, idTag[1])) || null;
      }
      if (!best) {
        for (const d of closed) {
          if (d.asset !== asset || d.command !== wantCmd) continue;
          // BROKER CLOCK SKEW FIX (2026-08-17, Monday surgery): the broker stamps
      // deal epochs on a clock ~2h AHEAD of UTC, which blinded the fuzzy
      // matcher -> every live row grace-cancelled all week = empty ledger.
      // Accept the closest of the three plausible clock worlds.
      let dt = Math.abs(Number(d.openTimestamp) * 1000 - openedAtMs);
      dt = Math.min(dt, Math.abs(Number(d.openTimestamp) * 1000 - 7200e3 - openedAtMs));
      dt = Math.min(dt, Math.abs(Number(d.openTimestamp) * 1000 + 7200e3 - openedAtMs));
          if (dt < bestDt) { best = d; bestDt = dt; }
        }
      }
      if (!best || (!idTag && bestDt > 15 * 60 * 1000)) continue; // still running broker-side or not found
      // CLAIM-ONCE (v3.5; CURED v3.9): ONE broker deal = ONE settlement, EVER.
      // v3.6.1 bug: tags hold the SHORT 8-char fingerprint but this check hunted
      // the FULL uuid -> never matched -> ~630 phantom re-settlements (Data Night
      // #2 bust). Check the fingerprint that can actually EXIST on rows.
      const idStr = String(best.id || "");
      if (idStr) {
        const taken = await db.select({ id: liveTrades.id }).from(liveTrades)
          .where(like(liveTrades.strategy, `%${shortId(idStr)}%`)).limit(1).then((r) => r[0]);
        if (taken && taken.id !== row.id) continue; // this deal already has a home
      }
      const won = Number(best.profit ?? 0) > 0;
      const pnlVal = Number(best.profit ?? -row.stake);
      const exitPrice = Number(best.closePrice ?? row.entryPrice);
      const pct = won ? Number(best.percentProfit ?? 85) : -Number(best.percentLoss ?? 100);
      // v3.6.1: tag fitted to varchar(64); write isolated so one bad row can't
      // abort the whole mirror (old behavior: single throw = silent total death)
      const newStrategy = /\[PO(:|\])/.test(row.strategy || '')
        ? fitTag((row.strategy || '').replace(/ \[PO(:[^\]]+)?\]/, ''), ' [BROKER-SETTLED] #' + shortId(idStr))
        : fitTag(row.strategy || '', ' [BROKER-SETTLED] #' + shortId(idStr));
      try {
        await db.update(liveTrades).set({
          status: won ? "WIN" : "LOSS",
          exitPrice, currentPrice: exitPrice, pnl: pnlVal, pnlPercent: pct, closedAt: new Date(),
          strategy: newStrategy,
        }).where(eq(liveTrades.id, row.id));
      } catch (ue: any) {
        await logActivity("MIRROR", "ERROR", `⚠️ settle write rejected for ${row.symbol}: ${String(ue?.message || ue).slice(0, 140)}`, { id: row.id });
        continue;
      }
      synced++;
      await logActivity("CLOSE", won ? "SUCCESS" : "WARNING",
        `BROKER ${row.symbol} ${row.direction} ${won ? "WON" : "LOST"} — P&L $${pnlVal.toFixed(2)} — Pocket Option verdict (order ${best.id})`,
        { symbol: row.symbol, direction: row.direction, won, pnl: pnlVal, broker: true, orderId: best.id });
    }

    // === GHOST ADOPTION (v3.6, 2026-08-19, owner-spotted: card frozen at 113) ===
    // The bridge ladder ("checked 2x clean, zero trace") false-cancelled trades
    // the broker ACTUALLY ran (late-stamp went chronic Wed night). Their rows sit
    // CANCELLED + [PO-NONE], invisible to the card AND to the shields (daily-stop /
    // loss-streak counted zero outcomes -> bot traded blind). The broker's closed
    // tape is the truth: resurrect fresh ghosts whose deals really exist.
    // Class = bookkeeping repair (same family as v3.5 claim-once). No brain math.
    const usedThisPass = new Set<string>();
    const ghosts = await db.select().from(liveTrades)
      .where(eq(liveTrades.status, "CANCELLED"))
      .orderBy(desc(liveTrades.closedAt)).limit(40);
    for (const row of ghosts) {
      const s = row.strategy || "";
      if (!s.includes("LIVE") || s.includes("[BROKER-SETTLED")) continue; // sim-era or already home
      if (row.closedAt && Date.now() - new Date(row.closedAt as unknown as string).getTime() > 36 * 3600e3) continue; // cold cases stay frozen
      const asset = POCKET_SYMBOLS[row.symbol];
      if (!asset) continue;
      const wantCmd = row.direction === 'BUY' ? 0 : 1;
      const openedAtMs = new Date(row.openedAt).getTime();
      const idTag = s.match(/\[PO:([^\]]+)\]/);
      let bestG: Record<string, unknown> | null = null;
      let bestGDt = Infinity;
      if (idTag) bestG = closed.find((d) => idMatch(d.id, idTag[1])) || null;
      if (!bestG) {
        for (const d of closed) {
          if (d.asset !== asset || d.command !== wantCmd) continue;
          // three clock worlds (same skew worlds as the settle pass above)
          let gdt = Math.abs(Number(d.openTimestamp) * 1000 - openedAtMs);
          gdt = Math.min(gdt, Math.abs(Number(d.openTimestamp) * 1000 - 7200e3 - openedAtMs));
          gdt = Math.min(gdt, Math.abs(Number(d.openTimestamp) * 1000 + 7200e3 - openedAtMs));
          if (gdt < bestGDt) { bestG = d; bestGDt = gdt; }
        }
      }
      if (!bestG || (!idTag && bestGDt > 15 * 60 * 1000)) continue; // tape shows no such deal
      const gId = String(bestG.id || "");
      const gKey = shortId(gId); // v3.9: claim-once uses the 8-char fingerprint rows can actually hold
      if (gId && usedThisPass.has(gKey)) continue;
      if (gId) { // CLAIM-ONCE for adoptions too: one deal = one home, ever
        const taken = await db.select({ id: liveTrades.id }).from(liveTrades)
          .where(like(liveTrades.strategy, `%${gKey}%`)).limit(1).then((r) => r[0]);
        if (taken) continue;
      }
      const wonG = Number(bestG.profit ?? 0) > 0;
      const pnlG = Number(bestG.profit ?? -row.stake);
      const exitG = Number(bestG.closePrice ?? row.entryPrice);
      const pctG = wonG ? Number(bestG.percentProfit ?? 85) : -Number(bestG.percentLoss ?? 100);
      const closedReal = Number(bestG.closeTimestamp) > 0
        ? new Date(Number(bestG.closeTimestamp) * 1000 - 7200e3) // broker epoch is +2h skewed
        : new Date();
      // v3.6.1: fitted tag + isolated write (varchar-64 door was rejecting these)
      try {
        await db.update(liveTrades).set({
          status: wonG ? "WIN" : "LOSS",
          exitPrice: exitG, currentPrice: exitG, pnl: pnlG, pnlPercent: pctG, closedAt: closedReal,
          strategy: fitTag(s, ' [BROKER-SETTLED] #' + shortId(gId)),
        }).where(eq(liveTrades.id, row.id));
      } catch (ue: any) {
        await logActivity("MIRROR", "ERROR", `⚠️ adoption write rejected for ${row.symbol}: ${String(ue?.message || ue).slice(0, 140)}`, { id: row.id });
        continue;
      }
      adopted++;
      if (gId) usedThisPass.add(gKey);
      await logActivity("CLOSE", wonG ? "SUCCESS" : "WARNING",
        `👻➡️📒 GHOST-ADOPTED ${row.symbol} ${row.direction} ${wonG ? "WON" : "LOST"} — P&L $${pnlG.toFixed(2)} — broker tape proves the deal lived (order ${gId.slice(0, 8)}) — card & shields updated`,
        { symbol: row.symbol, direction: row.direction, won: wonG, pnl: pnlG, broker: true, orderId: bestG.id, adopted: true });
    }
    // v3.6.1 BLACK-BOX: the mirror reports its own work while there's work to
    // report. Silent when idle (no opens settling, no ghosts around).
    if (ghosts.length > 0 || synced > 0 || adopted > 0) {
      await logActivity("MIRROR", "INFO",
        `🔎 MIRROR pulse: tape ${closed.length} closed | reach ${BRIDGE_TAPE.reachMin}m | open-pending ${pending.length} | ghosts seen ${ghosts.length} | settled ${synced} | adopted ${adopted}`,
        { tape: closed.length, reachMin: BRIDGE_TAPE.reachMin, pending: pending.length, ghosts: ghosts.length, synced, adopted });
    }
  } catch (e: any) {
    console.error("Broker mirror sync failed", e);
    try {
      await logActivity("MIRROR", "ERROR", `⚠️ BROKER MIRROR sick: ${String(e?.message || e).slice(0, 150)} — tape unreachable or DB rejected; shields may read stale books`, {});
    } catch {}
  }
  return { synced, adopted };
}

// ==== SHIELD PACK v1 (user-approved 2026-08-09) — DEFENSIVE RISK FILTERS ONLY ====
// Brain math (ai-engine scoring/confidence) is NOT touched. Shields only decide
// WHEN the bot stands down. Every block is announced in the activity feed.
const SHIELD = {
  WEEKEND: true,              // Sat/Sun UTC: broker crypto feed is synthetic OTC
  MAX_SAME_DIR_PER_CYCLE: 2,  // correlation guard: crypto moves as one
  LOSS_STREAK_N: 3,           // ladder floor: 3 straight broker losses...
  // LOSS-STREAK LADDER (v3.8, 2026-08-19, OWNER ORDER, supersedes the flat
  // 20-min cooling of 2026-08-17): "3 losses then 20 min; resume and the first
  // 2 lose again (5 in a row) -> 40 min; resume and 2 more lose (7) -> 1 hour."
  // Owner observed 8-in-a-row walking through flat 20-min coolings.
  LOSS_STREAK_LADDER: [[3, 20], [5, 40], [7, 60]] as Array<[number, number]>,
  DAILY_STOP_USD: -10,        // net P&L <= -$10 (UTC day) -> shield till next day
  // SEAT RULE: 5 seats (v3.7, 2026-08-19, OWNER ORDER) -> 3 seats (v3.9,
  // DATA NIGHT #2, 2026-08-20, owner motion #1: "replace the 5 to 3, nothing
  // more than 3 in a circle") — counted by BROKER truth, not app cards.
  MAX_LIVE_POSITIONS: 3,
};

// 🏆 V4 CLAUSE #1 — THE 1H BENCH (Data Night #3 Station 2, 2026-08-27,
// owner vote YES): 1H carried 87% of the all-era bleed (-$53.47 of -$61.48).
// For Contract v4 the 1H timeframe is STANDS-ONLY: the scout keeps logging
// every 1H page (paper data for the DN#4 re-trial), the real team never
// fires it. Real seats belong to 4H + 1D. Shield-class: WHO plays, never
// HOW the brain scores. Re-trial vote at Data Night #4 (Thu Sep 3).
const BENCHED_TIMEFRAMES = new Set<string>(["1H"]);

function _isWeekendUTC(d = new Date()) {
  const day = d.getUTCDay(); // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6;
}

// v4.4.1: exported for the behavioural harness ONLY. Zero behaviour change —
// shieldCheck is a pure reader of the ledger; this just lets the test rig prove
// the shields actually SEE an [UNVERIFIED-BLIND] row instead of regex-guessing.
export async function shieldCheck(): Promise<{ blocked: boolean; reason: string; name: string }> {
  // 1) WEEKEND SHIELD: the app reads real Binance candles, but the broker
  //    settles on its own synthetic weekend feed -> edge becomes coin-flip.
  if (SHIELD.WEEKEND && _isWeekendUTC()) {
    return { blocked: true, name: "weekend", reason: "🛡️ WEEKEND SHIELD: broker settles crypto on its synthetic OTC feed Sat/Sun (UTC) — analysis only, NO new trades until Monday 00:00 UTC" };
  }
  const recent = await db.select().from(liveTrades).orderBy(desc(liveTrades.id)).limit(80);
  const isLiveEra = (t: typeof liveTrades.$inferSelect) => (t.strategy || "").includes("LIVE");
  // v4.4.1: [UNVERIFIED-BLIND] rows join the shields as a LOSS for RISK ONLY.
  // They are not settled results — the ledger keeps pnl 0 and the scoreboard
  // still excludes them — but a shield that cannot see an unverified position is
  // exactly the blind spot that let Friday's 3 broker-confirmed rows walk past
  // both the ladder and the daily stop.
  const closed = recent.filter((t) => ((t.status === "WIN" || t.status === "LOSS") || isUnverifiedBlind(t)) && t.closedAt && isLiveEra(t));
  // 2) LOSS-STREAK BREAKER: consecutive broker losses = regime shift / tilt risk
  let streak = 0;
  for (const t of closed) { if (t.status === "LOSS" || isUnverifiedBlind(t)) streak++; else break; }
  if (streak >= SHIELD.LOSS_STREAK_N) {
    // v3.8 ladder: longer streaks earn longer coolings (owner's exact steps)
    const tier = [...SHIELD.LOSS_STREAK_LADDER].reverse().find(([n]) => streak >= n) || SHIELD.LOSS_STREAK_LADDER[0];
    const pauseMin = tier[1];
    const lastLossAt = new Date(closed[0].closedAt as unknown as string).getTime();
    const until = lastLossAt + pauseMin * 60e3;
    if (Date.now() < until) {
      const hh = new Date(until).toISOString().slice(11, 16);
      return { blocked: true, name: "loss-streak-ladder", reason: `🛡️ LOSS-STREAK LADDER: ${streak} straight broker losses (level ${tier[0]} = ${pauseMin} min) — cooling off until ${hh} UTC (about ${Math.ceil((until - Date.now()) / 60000)} min)` };
    }
  }
  // 3) DAILY STOP-LOSS: hard floor for the day (UTC)
  const today = new Date().toISOString().slice(0, 10);
  let dayPnl = 0;
  for (const t of closed) {
    if (!t.closedAt) continue;
    if (new Date(t.closedAt as unknown as string).toISOString().slice(0, 10) !== today) continue;
    // v4.4.1 worst-case-for-risk: an unverified blind row costs its STAKE, never
    // the 0 the ledger is forced to carry when the tape proves nothing either way.
    dayPnl += isUnverifiedBlind(t) ? -Math.abs(Number(t.stake ?? 1)) : Number(t.pnl ?? 0);
  }
  if (dayPnl <= SHIELD.DAILY_STOP_USD) {
    return { blocked: true, name: "daily-stop", reason: `🛡️ DAILY STOP-LOSS: today's net P&L $${dayPnl.toFixed(2)} hit the -$${Math.abs(SHIELD.DAILY_STOP_USD)} floor — shielded until 00:00 UTC tomorrow` };
  }
  return { blocked: false, name: "", reason: "" };
}

// ==== MORNING CARD LINE (Fix-B, owner-approved 2026-08-16, Data Night) ====
// Display-only: once a day writes a broker-verified 24h summary into the
// activity feed so the owner sees the report WITHOUT opening external links.
async function logMorningCardIfDue() {
  try {
    const last = await db.select().from(botActivity).where(eq(botActivity.type, "REPORT")).orderBy(desc(botActivity.createdAt)).limit(1).then((r) => r[0]);
    const age = last?.createdAt ? Date.now() - new Date(last.createdAt as unknown as string).getTime() : Infinity;
    // first card: immediately; afterwards: only in the 05:00+ UTC morning window (06:00+ Lagos)
    const due = age === Infinity || (age > 20 * 3600e3 && new Date().getUTCHours() >= 5) || age > 36 * 3600e3;
    if (!due) return;
    const rows = await db.select().from(liveTrades).orderBy(desc(liveTrades.id)).limit(3000);
    const isReal = (t: any) => { const s: string = t.strategy || ""; return s.includes("[PO:") || s.includes("[BROKER-SETTLED]"); };
    const in24h = (t: any) => t.openedAt && Date.now() - new Date(t.openedAt as unknown as string).getTime() < 24 * 3600e3;
    const day = rows.filter((t) => isReal(t) && (t.status === "WIN" || t.status === "LOSS") && in24h(t));
    const open = rows.filter((t) => isReal(t) && t.status === "OPEN").length;
    const money = (v: number) => (v >= 0 ? "+$" : "-$") + Math.abs(v).toFixed(2);
    if (!day.length) {
      await logActivity("REPORT", "INFO", "📋 MORNING CARD — last 24h: no broker-verified trades yet (shield/weekend or fresh ledger). Quiet is honest. 📦 Full card: /api/scoreboard", { open });
      return;
    }
    const w = day.filter((t) => t.status === "WIN").length;
    const net = day.reduce((a, t) => a + Number(t.pnl ?? 0), 0);
    const by: Record<string, { n: number; w: number; net: number }> = {};
    for (const t of day) {
      const k: string = t.symbol || "?";
      (by[k] ||= { n: 0, w: 0, net: 0 });
      by[k].n += 1; by[k].net += Number(t.pnl ?? 0);
      if (t.status === "WIN") by[k].w += 1;
    }
    const xs = Object.entries(by).sort((a, b) => a[1].net - b[1].net);
    const best = xs[xs.length - 1];
    const worst = xs[0];
    await logActivity("REPORT", "INFO",
      `📋 MORNING CARD — last 24h: ${day.length} trades · ${w}W/${day.length - w}L (${Math.round((100 * w) / day.length)}% WR) · net ${money(net)} · 🏆 ${best[0]} (${money(best[1].net)}, ${Math.round((100 * best[1].w) / best[1].n)}% WR) · 🪑 ${worst[0]} (${money(worst[1].net)}) · full card: /api/scoreboard 📊`,
      { trades: day.length, wins: w, net: +net.toFixed(2), best: best[0], worst: worst[0], open });
  } catch (e: any) {
    console.error("morning card failed:", e?.message || e);
  }
}

// ═══════════════════════════════════════════════════════════════════
// 🕵️ THE SCOUT — SHADOW REFEREE (v4.0-shadow, 2026-08-22, Saturday build
// session with owner; CONTRACT v3 clause #1 = FLOOR-2). Notebook = the
// shadow_signals table (fixes/shadow-signals.sql).
// LAW: notes only. This block can never place, move, or cancel a trade,
// and it never touches brain math or shields.
// PAGE LAW: ONE open (ungraded) page per (coin, timeframe) — a new page
// opens only after the referee has graded the last one (≈ one page every
// ~5 min per pair), so the notebook stays readable, never a flood.
// ═══════════════════════════════════════════════════════════════════
const SHADOW_FLAT_EPS = 1e-7;  // relative band that counts the page FLAT (dead price)
const SHADOW_NOPRICE_MIN = 15; // give up pricing a page after this age (retries till then)
// (v4.1: the old SHADOW_GRADE_SEC constant retired — bell windows BELL3/4/5 below replaced it)

type ShadowNote = {
  symbol: string; timeframe: string; direction: string;
  confidence: number | null; winProb: number | null; entryPrice: number | null;
  passesGates: boolean; wouldTrade: boolean; guardFired: string | null;
};

// One notebook page. HOLD = the brain saw no chance = no page. The dedupe
// lives INSIDE the insert (one open page per pair) so a page costs exactly
// ONE database round trip, even when the scout watches all night.
function shadowNote(n: ShadowNote): Promise<void> {
  if (!n.direction || n.direction === "HOLD") return Promise.resolve(); // no chance = no page
  // v4.1 RIDER (Vote 2, Tue Aug 25): SEAT PAGES GET THEIR OWN LANE. A
  // would_trade=true page records a REAL decision the machine just made —
  // it files instantly (fire path awaits it, not the end-of-cycle queue)
  // and bypasses the page-law dedupe, so an open stands page for the same
  // pair can never stop it landing. Stands pages keep the lane law: one
  // open page per (symbol, timeframe) at a time.
  const q = n.wouldTrade
    ? sql`
    insert into shadow_signals
      (symbol, timeframe, direction, confidence, win_prob, entry_price, passes_gates, would_trade, guard_fired)
    values (${n.symbol}, ${n.timeframe}, ${n.direction}, ${n.confidence}, ${n.winProb}, ${n.entryPrice}, ${n.passesGates}, ${n.wouldTrade}, ${n.guardFired})
  `
    : sql`
    insert into shadow_signals
      (symbol, timeframe, direction, confidence, win_prob, entry_price, passes_gates, would_trade, guard_fired)
    select ${n.symbol}, ${n.timeframe}, ${n.direction}, ${n.confidence}, ${n.winProb}, ${n.entryPrice}, ${n.passesGates}, ${n.wouldTrade}, ${n.guardFired}
    where not exists (
      select 1 from shadow_signals
      where symbol = ${n.symbol} and timeframe = ${n.timeframe} and settled = false
    )
  `;
  return Promise.resolve(db.execute(q)).then(() => undefined).catch((e: any) => { console.error("🕵️ scout page failed:", e?.message || e); });
}

const _rowsOf = (r: any): Array<Record<string, unknown>> => (Array.isArray(r) ? r : (r?.rows ?? []));

async function shadowOpenPages(): Promise<number> {
  try {
    const rows = _rowsOf(await db.execute(sql`select count(*)::int as n from shadow_signals where settled = false`));
    return Number((rows[0] as any)?.n ?? 0);
  } catch { return -1; } // table not created yet / DB blip — the caller prints "warming up"
}

// ═══════════════════════════════════════════════════════════════════
// ⏱️⏱️⏱️ THE THREE STOPWATCHES (v4.1, Vote 1 "OPTION 1", Tue Aug 25 design
// night, inked in CONTRACT.md): EVERY page is graded at minute 3 AND
// minute 4 AND minute 5 — three virtual verdicts for the same chance,
// so Data Night #3 can ask "if the whistle had blown at 3m/4m instead
// of 5m, would we be richer?" — on paper, $0 risk, thousands of samples.
// BELL LAW: each bell may only ring inside its honest window —
//   3m bell: 175–225s · 4m bell: 235–285s · 5m bell: 295s+ (final, settles)
// A bell missed in its window stays NULL forever — night school counts
// missed bells openly; a late grade would be a lie. The 5m bell is the
// page's FINAL verdict (= old behavior): it has no upper bound so no
// page lives forever. Runs EVERY cron beat — weekend/shield cycles too.
// ═══════════════════════════════════════════════════════════════════
const BELL3_LO = 175, BELL3_HI = 225;
const BELL4_LO = 235, BELL4_HI = 285;
const BELL5_LO = 295; // final bell: 295s+ (was 300 — one beat of pacing)

async function settleShadows() {
  let due: Array<Record<string, unknown>> = [];
  try {
    due = _rowsOf(await db.execute(sql`
      select id, symbol, timeframe, direction, entry_price, would_trade, guard_fired, created_at,
             exit_3m, result_3m, exit_4m, result_4m
      from shadow_signals
      where settled = false and entry_price is not null
        and created_at <= now() - make_interval(secs => ${BELL3_LO})
      order by created_at asc limit 12`));
  } catch (e: any) { console.error("🕵️ scout grade-scan failed:", e?.message || e); return; }
  if (!due.length) return;
  const jobs = due.map((row) => (async () => {
    const createdMs = Date.parse(String(row.created_at)) || 0;
    const ageSec = (Date.now() - createdMs) / 1000;
    // which bells are honestly due right now?
    const ring3 = row.exit_3m == null && ageSec >= BELL3_LO && ageSec <= BELL3_HI;
    const ring4 = row.exit_4m == null && ageSec >= BELL4_LO && ageSec <= BELL4_HI;
    const ring5 = ageSec >= BELL5_LO; // final bell (no upper bound)
    if (!ring3 && !ring4 && !ring5) return; // between bells (or a missed bell) — next cycle
    const symbol = String(row.symbol || "");
    const tf = String(row.timeframe || "");
    const dir = String(row.direction || "");
    const entry = Number(row.entry_price);
    const id = Number(row.id);
    let px: number | null = null;
    try {
      const feedSym = symbol.replace("/", "").replace("USDT", "") + "USDT";
      const tick = await fetchRealTicker(TICKER_SYMBOL_MAP[feedSym] || feedSym); // v4.3 MATIC→POL grading remap
      const p = Number((tick as any)?.price);
      if (Number.isFinite(p) && p > 0) px = p;
    } catch { /* blip — handled below */ }
    if (px == null) {
      // ticker sick: retry next cycle while the bell window is open.
      // final-bell pages that can't be priced for 15 min are ruled NO-PRICE
      // so no page ever lives forever (unchanged v4.0 rule).
      if (ring5 && ageSec > SHADOW_NOPRICE_MIN * 60) {
        try { await db.execute(sql`update shadow_signals set settled = true, settled_at = now(), exit_price = null, result = 'NO-PRICE' where id = ${id} and settled = false`); } catch {}
      }
      return;
    }
    const verdict = (price: number) => {
      const rel = entry > 0 ? (price - entry) / entry : 0;
      return Math.abs(rel) <= SHADOW_FLAT_EPS ? "FLAT"
        : (dir === "BUY" ? (price > entry ? "WIN" : "LOSS") : (price < entry ? "WIN" : "LOSS"));
    };
    const result = verdict(px);
    try {
      if (ring5) {
        await db.execute(sql`update shadow_signals set settled = true, settled_at = now(), exit_price = ${px}, result = ${result} where id = ${id} and settled = false`);
      } else if (ring4) {
        await db.execute(sql`update shadow_signals set exit_4m = ${px}, result_4m = ${result} where id = ${id} and exit_4m is null`);
      } else { // ring3
        await db.execute(sql`update shadow_signals set exit_3m = ${px}, result_3m = ${result} where id = ${id} and exit_3m is null`);
      }
    } catch (e: any) { console.error("🕵️ scout grade-write failed:", e?.message || e); return; }
    // Feed line ONLY for final-bell pages the machine actually fired on
    // (would_trade=true) — "what did the seat just do". Everything else is
    // answered by the night-school SELECTs (fixes/shadow-report.sql).
    // (v4.1.1 TS2367: verdict() can only be WIN/LOSS/FLAT here — the
    // NO-PRICE path lives in the px==null give-up above, never reaching this
    // line, so the old impossible comparison is gone.)
    if (ring5 && row.would_trade) {
      const sw3 = row.result_3m != null ? String(row.result_3m) : "·";
      const sw4 = row.result_4m != null ? String(row.result_4m) : "·";
      await logActivity("SHADOW", result === "WIN" ? "SUCCESS" : result === "LOSS" ? "WARNING" : "INFO",
        `🕵️ SCOUT GRADED ${symbol} ${tf} ${dir} — virtual ${result} at 5m (${entry} → ${px}) · ⏱️ 3m:${sw3} 4m:${sw4} — the seat ${result === "WIN" ? "WOULD have WON ✅" : result === "LOSS" ? "WOULD have LOST ❌" : "would have gone FLAT ➖"}`,
        { scout: true, symbol, timeframe: tf, direction: dir, entry, exit: px, result, bell3: row.result_3m ?? null, bell4: row.result_4m ?? null });
    }
  })());
  await Promise.allSettled(jobs);
}

// v4.3 🩹 MATIC/POL GRADING REMAP: Binance retired MATICUSDT spot after the
// POL token migration — every MATIC page graded NO-PRICE for a week (DN#4
// advisor report caught it). Grade MATIC pages against POL prices now (same
// underlying, 1:1 migration). Broker symbol & notebook labels stay "MATIC".
const TICKER_SYMBOL_MAP: Record<string, string> = { "MATICUSDT": "POLUSDT" };

// ═══════════════════════════════════════════════════════════════════
// 🧠 LIMITED AUTO-BENCH — "RULEBOOK v0" (v4.3, DN#4 Motion A owner vote)
// The scout's first HANDS. LAW: blocks-only (never fires) · max 2 cells ·
// owner override obeyed forever · every act announced with receipts ·
// tribunal pages keep flowing so parole is EARNED, never given. 1H cells
// excluded — clause #1 owns the whole 1H timeframe already.
// Runs every cron beat (also under shields — weekend benches announce
// tonight, bite Monday). Quiet when nothing changes ("quiet is honest").
// ═══════════════════════════════════════════════════════════════════
const AUTO_BENCH_MIN_GRADED = 700;
const AUTO_BENCH_MAX_WINPCT = 49;
const AUTO_BENCH_MAX_VPNL = -50;
const AUTO_BENCH_MAX_CELLS = 2;
const AUTO_BENCH_WINDOW_DAYS = 7;
// v4.4 ⏳📏 STABILITY RIDER (DN#5 Station 3, owner vote YES Thu Sep 10).
// ENTRY cap stays 2 — "max 2 cells" is Contract v5 clause #2 LAW and is not
// amended. These two only make the EXIT slower and stickier:
const AUTO_BENCH_EXIT_MARGIN = 3;  // parole test reads the worst THREE breaching cells (hysteresis band)
const AUTO_BENCH_DWELL_HOURS = 6;  // a bench must be SERVED 6h before parole is even considered

async function evalAutoBench() {
  let rows: Array<Record<string, unknown>> = [];
  try {
    rows = _rowsOf(await db.execute(sql`
      select symbol, timeframe,
             count(*) filter (where result in ('WIN','LOSS'))::int as graded,
             round((100.0 * count(*) filter (where result = 'WIN')
                    / nullif(count(*) filter (where result in ('WIN','LOSS')),0))::numeric, 1) as win_pct,
             round(sum(case when result = 'WIN' then 0.85
                            when result = 'LOSS' then -1 else 0 end)::numeric, 2) as vpnl
      from shadow_signals
      where settled and created_at >= now() - make_interval(days => ${AUTO_BENCH_WINDOW_DAYS})
        and timeframe <> '1H'
      group by symbol, timeframe
      order by vpnl asc`));
  } catch (e: any) { console.error("🧠 rulebook scan failed:", e?.message || e); return; }

  let current: Array<Record<string, unknown>> = [];
  try {
    current = _rowsOf(await db.execute(sql`select symbol, timeframe, active, overridden, benched_at from auto_bench_cells`));
  } catch (e: any) { console.error("🧠 rulebook table not ready (owner SQL pending?):", e?.message || e); return; }

  const wanted = qualifies(rows);                                    // ENTRY: worst 2 (law, unchanged)
  const holdSet = qualifies(rows, AUTO_BENCH_EXIT_MARGIN);           // v4.4 EXIT margin: worst 3
  const currentByKey = new Map(current.map((c) => [`${c.symbol}|${c.timeframe}`, c] as [string, Record<string, unknown>]));

  // BENCH: newly qualifying cells (worst-first, capped), respecting overrides
  for (const q of wanted) {
    const key = `${q.symbol}|${q.timeframe}`;
    const cur = currentByKey.get(key);
    if (cur && (cur.active as boolean)) continue;      // already benched
    if (cur && (cur.overridden as boolean)) continue;  // owner said no — forever law
    const graded = Number(q.graded), winPct = Number(q.win_pct), vpnl = Number(q.vpnl);
    try {
      if (cur) {
        await db.execute(sql`update auto_bench_cells set active = true, graded = ${graded}, win_pct = ${winPct}, virtual_pnl = ${vpnl}, benched_at = now(), paroled_at = null, reason = 'rulebook-v0' where symbol = ${q.symbol} and timeframe = ${q.timeframe}`);
      } else {
        await db.execute(sql`insert into auto_bench_cells (symbol, timeframe, active, graded, win_pct, virtual_pnl, reason) values (${q.symbol}, ${q.timeframe}, true, ${graded}, ${winPct}, ${vpnl}, 'rulebook-v0')`);
      }
    } catch (e: any) { console.error("🧠 rulebook bench write failed:", e?.message || e); continue; }
    await logActivity("SHIELD", "WARNING",
      `🧠 AUTO-BENCH (Rulebook v0): ${q.symbol} ${q.timeframe} benched STANDS-ONLY — ${graded} graded / ${winPct}% wins / vP&L −${Math.abs(vpnl).toFixed(2)} over ${AUTO_BENCH_WINDOW_DAYS}d — tribunal pages keep flowing, parole earned by data — owner can revoke anytime`,
      { symbol: q.symbol, timeframe: q.timeframe, graded, winPct, vPnl: vpnl, autoBench: true });
  }

  // PAROLE: active cells that healed past the line (overrides untouched)
  // v4.4 STABILITY RIDER — two new gates, both make the bench STICKIER:
  //   1) EXIT MARGIN: still inside the worst-3 breaching cells -> stay benched
  //      (was worst-2, i.e. `wanted`). This is the hysteresis band that stops a
  //      boundary cell from stepping out and straight back in on the next beat.
  //   2) DWELL ≥6h: benched_at must be at least AUTO_BENCH_DWELL_HOURS old.
  //      Together these kill the DN#5 Covenant Flag #4 thrash (BTC-1D ↔ BNB-1D
  //      swapping the 2nd slot every 5–30 min, benched_at resetting each time).
  // Quiet when a gate simply holds — a non-event is not news (whistle hygiene).
  let dwellHeld: Array<string> = [];
  for (const c of current) {
    if (!c.active || (c.overridden as boolean)) continue;
    const key = `${c.symbol}|${c.timeframe}`;
    if (holdSet.some((q) => `${q.symbol}|${q.timeframe}` === key)) continue; // still inside the exit margin
    const benchedMs = c.benched_at ? Date.parse(String(c.benched_at)) : NaN;
    const dwellH = Number.isFinite(benchedMs) ? (Date.now() - benchedMs) / 3600e3 : AUTO_BENCH_DWELL_HOURS; // unreadable stamp -> don't trap the cell forever
    if (dwellH < AUTO_BENCH_DWELL_HOURS) {
      dwellHeld.push(`${c.symbol} ${c.timeframe} (${dwellH.toFixed(1)}h/${AUTO_BENCH_DWELL_HOURS}h)`);
      continue; // healed on paper, but the bench is not served yet
    }
    try {
      await db.execute(sql`update auto_bench_cells set active = false, paroled_at = now() where symbol = ${c.symbol} and timeframe = ${c.timeframe}`);
    } catch (e: any) { console.error("🧠 rulebook parole write failed:", e?.message || e); continue; }
    await logActivity("SHIELD", "SUCCESS",
      `🧠 AUTO-PAROLE: ${c.symbol} ${c.timeframe} — paper healed past the Rulebook v0 line AND outside the worst-${AUTO_BENCH_EXIT_MARGIN} exit margin, after serving ${dwellH.toFixed(1)}h on the bench (dwell law ≥${AUTO_BENCH_DWELL_HOURS}h) — cell returns to play 🟢 (scout keeps watching)`,
      { symbol: c.symbol, timeframe: c.timeframe, dwellHours: +dwellH.toFixed(1), autoBench: true });
  }
  // v4.4 receipt: one throttled line while cells sit out their dwell, so the
  // owner can SEE the stability rider working instead of wondering why a
  // healed cell never paroled. Max 1/hour (whistle hygiene).
  if (dwellHeld.length > 0) {
    await logThrottled("SHIELD",
      `⏳ DWELL GATE (v4.4): ${dwellHeld.length} healed cell(s) still serving the ${AUTO_BENCH_DWELL_HOURS}h bench — ${dwellHeld.join(", ")} — no flip-flop until the time is served`,
      { dwellHeld: dwellHeld.length, cells: dwellHeld, autoBench: true }, 60 * 60e3);
  }
}

// v4.4: `limit` defaults to the ENTRY cap (2, Contract v5 clause #2 law).
// The EXIT-margin call passes 3 — same razor, same worst-first order, wider
// band. rows arrive `order by vpnl asc`, so slice(0, n) == the worst n.
function qualifies(rows: Array<Record<string, unknown>>, limit: number = AUTO_BENCH_MAX_CELLS): Array<{ symbol: string; timeframe: string; graded: number; win_pct: number; vpnl: number }> {
  return rows
    .filter((r) => Number(r.graded) >= AUTO_BENCH_MIN_GRADED && Number(r.win_pct) < AUTO_BENCH_MAX_WINPCT && Number(r.vpnl) < AUTO_BENCH_MAX_VPNL)
    .slice(0, limit)
    .map((r) => ({ symbol: String(r.symbol), timeframe: String(r.timeframe), graded: Number(r.graded), win_pct: Number(r.win_pct), vpnl: Number(r.vpnl) }));
}
async function shadowScanShielded(settings: any, guardName: string, notes: Array<Promise<void>>) {
  const watchlist: string[] = (settings.watchlist as unknown as string[]) || MARKETS.map(m => m.symbol);
  const timeframes: string[] = (settings.preferredTimeframes as unknown as string[]) || ["1H", "4H"];
  for (const symbol of watchlist) {
    const asset = MARKETS.find((m) => m.symbol === symbol);
    if (!asset) continue;
    for (const tf of timeframes) {
      try {
        const signal = await analyzeMarketLive(asset, tf, settings.riskLevel, 85);
        const passes = signal.confidence >= settings.minConfidence && signal.winProbability >= settings.minWinProbability && signal.direction !== "HOLD";
        notes.push(shadowNote({
          symbol: signal.symbol, timeframe: tf, direction: signal.direction,
          confidence: signal.confidence, winProb: signal.winProbability, entryPrice: signal.entryPrice,
          passesGates: passes, wouldTrade: false, guardFired: guardName,
        }));
      } catch (e: any) { console.error("🕵️ scout watch failed:", symbol, tf, e?.message || e); }
    }
  }
}

// Throttled feed logger (45-min digit-normalized repeat window — the exact
// anti-spam rule the shield lines have used since Data Night 2026-08-16:
// countdown numbers get neutralized so a ticking message can't spam).
// v4.4 🎺 WHISTLE HYGIENE: the old version read ONLY the single most recent
// feed row, so ANY interleaved line (a scout page, a mirror pulse, a shield
// note) silently reset the window and the "throttled" line printed again next
// beat — that is how the bench/parole thrash reached 12 lines/hour. Now the
// window is matched on type + digit-normalized signature across the last 25
// rows of that type. Also takes a severity so an ERROR can shout as an ERROR.
async function logThrottled(type: string, message: string, details: Record<string, unknown>, windowMs = 45 * 60e3, severity = "INFO") {
  const sig = (m: string) => m.replace(/\d+/g, "#");
  const want = sig(message);
  const since = Date.now() - windowMs;
  let recent: Array<Record<string, unknown>> = [];
  try {
    recent = await db.select().from(botActivity).where(eq(botActivity.type, type)).orderBy(desc(botActivity.createdAt)).limit(25);
  } catch { recent = []; } // feed unreadable -> fall through and log honestly
  const repeated = recent.some((a) => !!a?.createdAt &&
    new Date(a.createdAt as unknown as string).getTime() >= since &&
    sig(String(a.message)) === want);
  if (!repeated) await logActivity(type, severity, message, details);
}

export async function runAutopilotCycle() {
  const settings = await getSettings();
  const session = await db.select().from(botSessions).orderBy(desc(botSessions.id)).limit(1).then((r) => r[0]);
  if (!session || session.status !== "RUNNING") return { executed: false, reason: "Bot not running" };
  await syncBrokerResults(); // settle any broker-tracked trades with real verdicts first
  await settleShadows(); // 🕵️ SCOUT: grade due notebook pages (runs on EVERY beat — weekday, ladder, daily-stop, weekend)
  await evalAutoBench(); // 🧠 RULEBOOK v0 (v4.3): evaluate cells every beat — announces ONLY on change (quiet is honest)
  await logMorningCardIfDue(); // Fix-B: daily report line in the feed (display-only)
  // ---- SHIELD PACK gate: open trades still settle above; only NEW fire is gated ----
  const shield = await shieldCheck();
  if (shield.blocked) {
    await logThrottled("SHIELD", shield.reason, {});
    // 🕵️ SCOUT (v4.0-shadow): while the shield rests the team, the scout stays
    // on watch — every coin × timeframe gets paged, zero fire. Receipts for
    // Data Night #3. MTN/data cost = the same one scan the bot already runs
    // on a trading minute; only the trigger button is removed.
    const notes: Array<Promise<void>> = [];
    await shadowScanShielded(settings, shield.name || "shield", notes);
    await Promise.allSettled(notes);
    const openPages = await shadowOpenPages();
    await logThrottled("SHADOW",
      `🕵️ SCOUT on duty — notes only, the team rests (${shield.name || "shield"}) — ${openPages >= 0 ? `${openPages} page(s)` : "notebook warming up"} in the notebook`,
      { scout: true, shield: shield.name, openPages });
    return { executed: false, reason: shield.reason, shielded: true };
  }
  const dirCount: Record<string, number> = { BUY: 0, SELL: 0 }; // 4) correlation guard tally
  await logActivity("SCAN", "INFO", `LIVE Scanning ${MARKETS.length} real markets (Binance)`, {});
  const watchlist: string[] = (settings.watchlist as unknown as string[]) || MARKETS.map(m => m.symbol);
  const timeframes: string[] = (settings.preferredTimeframes as unknown as string[]) || ["1H", "4H"];
  const executed: typeof liveTrades.$inferSelect[] = [];
  const notes: Array<Promise<void>> = []; // 🕵️ SCOUT page queue for this cycle
  const openCount = await db.select({ count: sql<number>`count(*)` }).from(liveTrades).where(eq(liveTrades.status, "OPEN")).then((r) => Number(r[0]?.count ?? 0));
  if (openCount >= settings.maxPositions) return { executed: false, reason: "Max positions reached" };
  // === SEAT RULE (v3.7 5-seat -> v3.9 3-seat, owner orders): at most MAX_LIVE_POSITIONS trades live
  // at the BROKER. Seat count = broker's live-open list (fresh from the mirror's
  // /deals pull) OR the app's open rows — whichever sees more. A seat frees when
  // a trade full-times at the broker; only then may a substitute enter.
  const liveCap = Math.min(Number(settings.maxPositions || 5), SHIELD.MAX_LIVE_POSITIONS);
  const brokerLive = DEALS_CACHE && Date.now() - DEALS_CACHE.at < 60e3 ? DEALS_CACHE.opened : null;
  let committed = brokerLive !== null ? Math.max(openCount, brokerLive) : openCount;
  let capSkips = 0;
  let benchedSignals = 0; // v4 clause #1: 1H signals held to stands-only this cycle
  let autoBenchHolds = 0; // v4.3 Rulebook v0: signals held on auto-benched cells
  let feedDownNotices = 0; // v4.3 fall-safe: DATA-FEED-DOWN holds this cycle
  // 🧠 RULEBOOK v0: cells benched stands-only right now (silent if table pending)
  let benchCellSet = new Set<string>();
  try {
    const bc = _rowsOf(await db.execute(sql`select symbol, timeframe from auto_bench_cells where active = true`));
    benchCellSet = new Set(bc.map((b) => `${b.symbol}|${b.timeframe}`));
  } catch { /* table not created yet — the rulebook boots quietly */ }
  for (const symbol of watchlist) {
    const asset = MARKETS.find((m) => m.symbol === symbol);
    if (!asset) continue;
    for (const tf of timeframes) {
      const signal = await analyzeMarketLive(asset, tf, settings.riskLevel, 85);
      // 🔒 FALL-SAFE (v4.3): live candle feed failed on the brain's side —
      // it answered HOLD with a marker. Count it, never touch the synthetic path.
      if (signal.direction === "HOLD" && (signal.strategy || "").includes("DATA-FEED-DOWN")) { feedDownNotices++; continue; }
      // 🧠 AUTO-BENCH cell (Rulebook v0, v4 clause #2): stands-only for this
      // exact (symbol, timeframe) — page for the tribunal, never fire the seat.
      if (signal.direction !== "HOLD" && benchCellSet.has(`${symbol}|${tf}`)) {
        const passesCell = signal.confidence >= settings.minConfidence && signal.winProbability >= settings.minWinProbability;
        notes.push(shadowNote({ symbol: signal.symbol, timeframe: tf, direction: signal.direction, confidence: signal.confidence, winProb: signal.winProbability, entryPrice: signal.entryPrice, passesGates: passesCell, wouldTrade: false, guardFired: "auto-bench" }));
        autoBenchHolds++;
        continue;
      }
      // 🏆 1H BENCH (v4 clause #1): stands-only — page the chance for the
      // scout, never fire the seat. passes_gates recorded honestly so night
      // school (and the DN#4 re-trial) slices benched quality separately.
      if (BENCHED_TIMEFRAMES.has(String(tf).toUpperCase()) && signal.direction !== "HOLD") {
        const passesBenched = signal.confidence >= settings.minConfidence && signal.winProbability >= settings.minWinProbability;
        notes.push(shadowNote({ symbol: signal.symbol, timeframe: tf, direction: signal.direction, confidence: signal.confidence, winProb: signal.winProbability, entryPrice: signal.entryPrice, passesGates: passesBenched, wouldTrade: false, guardFired: "1h-bench" }));
        benchedSignals++;
        continue;
      }
      if (signal.confidence >= settings.minConfidence && signal.winProbability >= settings.minWinProbability && signal.direction !== "HOLD") {
        // 4) CORRELATION GUARD: crypto moves as one basket — cap same-direction fire per cycle
        const dc = dirCount[signal.direction] ?? 0;
        if (dc >= SHIELD.MAX_SAME_DIR_PER_CYCLE) {
          await logActivity("SHIELD", "INFO", `🛡️ CORRELATION GUARD: skipped ${signal.symbol} ${signal.direction} — already ${dc} ${signal.direction} trade(s) this cycle (one-direction overload is one big bet)`, { symbol: signal.symbol, direction: signal.direction, shield: "correlation" });
          notes.push(shadowNote({ symbol: signal.symbol, timeframe: tf, direction: signal.direction, confidence: signal.confidence, winProb: signal.winProbability, entryPrice: signal.entryPrice, passesGates: true, wouldTrade: false, guardFired: "correlation" }));
          continue;
        }
        const existing = await db.select().from(liveTrades).where(and(eq(liveTrades.symbol, symbol), eq(liveTrades.status, "OPEN"))).limit(1);
        if (existing.length > 0) {
          notes.push(shadowNote({ symbol: signal.symbol, timeframe: tf, direction: signal.direction, confidence: signal.confidence, winProb: signal.winProbability, entryPrice: signal.entryPrice, passesGates: true, wouldTrade: false, guardFired: "already-open" }));
          continue;
        }
        // GHOST QUARANTINE (v3.4, 2026-08-17, owner-spotted): a "truly NOT placed"
        // verdict burns the card — but Monday's late-stamp broker produced the
        // deal ~15s AFTER the verdict (BTC BUY+SELL hedge pair, 36s apart).
        // After any [PO-NONE] ghost, quarantine the symbol 10 min: the deal may
        // secretly exist; re-entering would hedge the same asset.
        const ghost = await db.select().from(liveTrades).where(and(eq(liveTrades.symbol, symbol), eq(liveTrades.status, "CANCELLED"))).orderBy(desc(liveTrades.closedAt)).limit(1).then((r) => r[0]);
        if (ghost && (ghost.strategy || "").includes("[PO-NONE]") && ghost.closedAt &&
            (Date.now() - new Date(ghost.closedAt as unknown as string).getTime()) < 10 * 60e3) {
          notes.push(shadowNote({ symbol: signal.symbol, timeframe: tf, direction: signal.direction, confidence: signal.confidence, winProb: signal.winProbability, entryPrice: signal.entryPrice, passesGates: true, wouldTrade: false, guardFired: "ghost-quarantine" }));
          continue;
        }
        const currentOpen = await db.select({ count: sql<number>`count(*)` }).from(liveTrades).where(eq(liveTrades.status, "OPEN")).then((r) => Number(r[0]?.count ?? 0));
        if (currentOpen >= settings.maxPositions) {
          notes.push(shadowNote({ symbol: signal.symbol, timeframe: tf, direction: signal.direction, confidence: signal.confidence, winProb: signal.winProbability, entryPrice: signal.entryPrice, passesGates: true, wouldTrade: false, guardFired: "max-positions" }));
          break;
        }
        // SEAT RULE (broker truth): all seats taken -> hold the signal
        if (committed >= liveCap) {
          capSkips++;
          notes.push(shadowNote({ symbol: signal.symbol, timeframe: tf, direction: signal.direction, confidence: signal.confidence, winProb: signal.winProbability, entryPrice: signal.entryPrice, passesGates: true, wouldTrade: false, guardFired: "seat-full" }));
          continue;
        }
        // 💵 v4.2 $1 STAKE TRUTH (Friday sweep, Law #4 debt #1): the bridge
        // call below has ALWAYS sent exactly $1 (amount: 1) — the old card
        // printed the app's own stake math ($2+, minStake-clamped), so the
        // feed lied to the wallet. Ledger, feed and broker now speak ONE
        // dollar. Display-class only: pnl columns were always broker-settled.
        const BROKER_DEAL_USD = 1;
        const realTicker = await fetchRealTicker(asset.symbol.replace('/', '').replace('USDT','') + 'USDT');
        const realPrice = realTicker?.price || signal.entryPrice;
        const [trade] = await db.insert(liveTrades).values({
          symbol: signal.symbol, direction: signal.direction, entryPrice: realPrice, currentPrice: realPrice,
          stake: BROKER_DEAL_USD, payout: Number((BROKER_DEAL_USD * 0.85).toFixed(2)),
          winProbability: signal.winProbability, confidence: signal.confidence,
          strategy: signal.strategy + " (LIVE)", timeframe: signal.timeframe,
          expiryMinutes: 5, // ALL trades settle in 5 min now (user request 2026-08-09: 1-5 min trades only)
        }).returning();
        executed.push(trade);
        // 🕵️ SCOUT: the seat really fired — page it INSTANTLY with the REAL
        // entry price (v4.1 rider: awaited NOW, own lane — immune to 60s
        // cycle clock-outs and never blocked by a stands page of this pair)
        await shadowNote({ symbol: signal.symbol, timeframe: tf, direction: signal.direction, confidence: signal.confidence, winProb: signal.winProbability, entryPrice: realPrice, passesGates: true, wouldTrade: true, guardFired: null });
        committed++; // SEAT RULE: this fire takes a seat for this cycle's tally
        dirCount[signal.direction] = dc + 1; // correlation guard tally
        await logActivity("EXECUTE", "SUCCESS", `LIVE ${signal.direction} ${signal.symbol} @ $${realPrice} — Stake $${BROKER_DEAL_USD} — Signal ${signal.winProbability}% — Conf ${signal.confidence}%`, { symbol: signal.symbol, direction: signal.direction, stake: BROKER_DEAL_USD, entryPrice: realPrice, winProbability: signal.winProbability, confidence: signal.confidence, live: true });
        const bridgeUrl = process.env.POCKET_BRIDGE_URL;
        const bridgeSecret = process.env.POCKET_BRIDGE_SECRET;
        if (bridgeUrl && process.env.ENABLE_LIVE_TRADING === 'true') {
          const pocketAsset = POCKET_SYMBOLS[symbol];
          if (!pocketAsset) {
            await logActivity("EXECUTE", "WARNING", `Pocket Option: no broker market for ${symbol} - broker order skipped`);
          } else {
          try {
            const cleanUrl = bridgeUrl.endsWith('/') ? bridgeUrl.slice(0, -1) : bridgeUrl;
            const direction = signal.direction === 'BUY' ? 'CALL' : 'PUT';
            const res = await fetch(`${cleanUrl}/trade`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Bridge-Secret': bridgeSecret || '' },
              body: JSON.stringify({ asset: pocketAsset, direction, amount: BROKER_DEAL_USD, duration: 300 }) // $1 + always 5 min at the broker (user request 2026-08-09)
            });
            const resJson = await res.json().catch(() => ({}));
            if (resJson.success) {
              await logActivity("EXECUTE", "SUCCESS", `Pocket REAL: ${direction} ${pocketAsset} $1 via bridge - Order ${resJson.order_id}`);
              // v3.6.1: fitted 8-char fingerprint tag (full uuid overflowed varchar(64))
              await db.update(liveTrades).set({ strategy: fitTag(trade.strategy, ` [PO:${shortId(String(resJson.order_id))}]`) }).where(eq(liveTrades.id, trade.id));
            } else {
              const detail = String((resJson as any)?.detail || JSON.stringify(resJson));
              await logActivity("EXECUTE", "WARNING", `Bridge error: ${JSON.stringify(resJson).slice(0,200)}`);
              if (/truly NOT placed|refused/i.test(detail)) {
                // Broker CONFIRMED it took nothing -> this card is a ghost.
                // Cancel it: never counted, never settled as a fake WIN/LOSS.
                await db.update(liveTrades).set({ status: "CANCELLED", pnl: 0, pnlPercent: 0, closedAt: new Date(), strategy: fitTag(trade.strategy, " [PO-NONE]") }).where(eq(liveTrades.id, trade.id));
                await logActivity("EXECUTE", "WARNING", `${signal.symbol} ${signal.direction} CANCELLED — broker took NOTHING, card not counted`);
              }
              // "UNKNOWN" (broker throttled / silent): leave OPEN — the broker
              // mirror claims it if it's real; otherwise it cancels at grace.
            }
          } catch (e:any) {
            await logActivity("EXECUTE", "ERROR", `Bridge call failed: ${e.message}`);
          }
          }
        }
      } else if (signal.direction !== "HOLD") {
        // 🕵️ SCOUT: the brain saw a chance but its OWN bar (confidence / win
        // probability) held it back — page it so night school can ask
        // "what if our gates were looser/tighter?" (Floor-3 material)
        notes.push(shadowNote({ symbol: signal.symbol, timeframe: tf, direction: signal.direction, confidence: signal.confidence, winProb: signal.winProbability, entryPrice: signal.entryPrice, passesGates: false, wouldTrade: false, guardFired: "brain-gates" }));
      }
    }
  }
  // 🏆 1H BENCH announcement (v4 clause #1): throttled, one line at a time
  if (benchedSignals > 0) {
    await logThrottled("SHIELD",
      `🛡️ 1H BENCH (v4 clause #1 · Data Night #3 owner vote): held ${benchedSignals} 1H signal(s) to stands-only — scout keeps the paper log, real seats stay with 4H + 1D · re-trial vote DN#5`,
      { benchedSignals });
  }
  // 🧠 AUTO-BENCH announcement (v4.3 Rulebook v0): throttled holds line
  if (autoBenchHolds > 0) {
    await logThrottled("SHIELD",
      `🛡️ AUTO-BENCH (Rulebook v0): held ${autoBenchHolds} signal(s) on benched cells — stands-only, tribunal pages keep flowing — owner revokes anytime`,
      { autoBenchHolds });
  }
  // 🔒 FALL-SAFE announcement (v4.3): throttled feed-down line
  if (feedDownNotices > 0) {
    await logThrottled("SHIELD",
      `🛡️ DATA FEED DOWN: no live Binance candles for ${feedDownNotices} market check(s) — holding fire, NEVER synthetic (fall-safe v4.3) — auto-retry every minute`,
      { feedDownNotices });
  }
  if (capSkips > 0) {
    // 3-SEAT RULE announcement: one line per capped cycle, never spammy
    // (v4.2: label fixed — it's been 3 seats since DN#2, the feed kept the
    // old 5-SEAT name. Display debt item #3, paid.)
    await logActivity("SHIELD", "INFO",
      `🛡️ 3-SEAT RULE: held ${capSkips} signal(s) — all ${liveCap} broker seats taken${brokerLive !== null ? ` (broker live: ${brokerLive})` : ""} — a substitute only enters when one full-times`,
      { capSkips, liveCap, committed, brokerLive });
  }
  await Promise.allSettled(notes); // 🕵️ SCOUT: file this cycle's pages before the whistle blows
  return { executed: true, trades: executed, totalExecuted: executed.length, live: true };
}
export async function settleOpenTrades() {
  await syncBrokerResults(); // broker verdicts first
  const openTrades = await db.select().from(liveTrades).where(eq(liveTrades.status, "OPEN"));
  const settled: typeof liveTrades.$inferSelect[] = [];
  // v4.4.1 🕳️ BLIND GRACE — evaluated once per run, right after the mirror
  // probed (line above). `blind` means "the bridge was ASKED just now and could
  // not answer". A STALE reading (cold lambda, mirror off, paper mode) is NOT
  // blind — those rows keep the exact old behaviour, so nothing changes for any
  // non-live path. This is the whole point: only real blindness changes anything.
  const blind = tapeBlindNow();
  const reach = BRIDGE_TAPE.reachMin;
  for (const trade of openTrades) {
    const openedAt = new Date(trade.openedAt).getTime();
    const elapsed = (Date.now() - openedAt) / 60000;
    if (elapsed < trade.expiryMinutes) continue;
    const rawStrategy = String(trade.strategy || '');
    const isBrokerTagged = /\[PO(:|\])/.test(rawStrategy);
    const grace = isBrokerTagged ? 45 : 20; // untagged: mirror gets 20m (broker stamps late) then we call it
    if (elapsed < grace) continue; // still waiting on broker truth
    // v4.4.1 (a) DEPTH RACE — MEASURED, NOT GATED. Reach is how far back the
    // tape still reaches (measured live Mon 14 Sep: 20 closed rows = 37 min).
    // A tagged row only arrives here at age = expiry + grace ≈ 50 min, which is
    // BEYOND a 37 min reach — so on paper the tape cannot prove absence for it.
    // Gating on that would hold EVERY unmatched row for 6 h and then hand the
    // shields 3 losses, tripping the daily stop on an ordinary Monday. That is a
    // behaviour change resting on a hypothesis with zero observed casualties, so
    // it is NOT shipped. It is logged instead: the counter below is the receipt
    // DN#6 needs to decide whether the 45 m grace or the tape depth must move.
    const depthRace = BRIDGE_TAPE.ok && reach > 0 && reach < elapsed;
    // v4.4.1 (b) OUTAGE — GATED, because this one has a body count.
    const unverifiable = isBrokerTagged && blind;
    // v4.4.1 (b) HOLD, don't guess. A broker-confirmed row we cannot verify
    // stays OPEN until the tape can speak again — capped so a 58 h outage cannot
    // jam all 3 seats forever. Under the cap the SEAT RULE does the safe thing
    // on its own: 3 unverifiable rows = 3 seats = the engine stops firing into a
    // broker it cannot read. That is the conservative direction, not a new rule.
    if (unverifiable && elapsed < BLIND_HOLD_MAX_HOURS * 60) {
      // v4.4 whistle hygiene: throttled to one line per hour per row-shape, so a
      // 6-hour hold cannot spam the feed. This deliberately does NOT use the
      // "only on the first beat past grace" trick — a lambda restart mid-grace
      // would have swallowed the receipt entirely, and the row would vanish from
      // the feed while silently eating a seat. A hold must always be visible.
      await logThrottled("CLOSE",
        `🕳️ ${trade.symbol} ${trade.direction} HELD OPEN — broker-confirmed but the bridge is blind (${BRIDGE_TAPE.detail}) — holding, NOT cancelling. Age ${Math.floor(elapsed)}m, cap ${BLIND_HOLD_MAX_HOURS}h.`,
        { symbol: trade.symbol, direction: trade.direction, held: true, blind: true, reach, elapsedMin: Math.floor(elapsed), strategy: rawStrategy, live: true },
        60 * 60e3, "WARNING");
      continue;
    }
    // LIVE mode = broker truth ONLY. No dice rolls, ever. If the broker has
    // no trace of this trade after its full lifetime + grace, the trade never
    // existed -> CANCELLED, not a fake WIN/LOSS (user demand 2026-08-09).
    // v4.4.1: two different kinds of CANCELLED now, because they mean different
    // things. Untagged/verifiable-absent = [PO-NONE] territory, genuinely never
    // existed. Broker-confirmed-but-unprovable = [UNVERIFIED-BLIND]: the broker
    // says it happened, we simply could not read the verdict. Ledger stays at
    // pnl 0 (no fabricated result, scoreboard still excludes it) but the SHIELDS
    // count it as a loss, because that is the honest worst case for RISK.
    let nextStrategy = rawStrategy;
    if (unverifiable) {
      const marker = ' [UNVERIFIED-BLIND]';
      const liveFlag = ' (LIVE)';
      const cleaned = rawStrategy.replace(/ \[PO(:[^\]]+)?\]/, '').replace(/ ?\(LIVE\)\s*$/, '').trimEnd();
      // The strategy column is varchar(63) and fitTag truncates the BASE — so
      // rebuild by hand and guarantee the LIVE era flag survives. The adoption
      // mop and the scoreboard both key off "LIVE"; losing it would strand this
      // row beyond repair. The [PO:id] is dropped here but preserved in the log
      // details below, which have no length limit.
      const room = Math.max(0, 63 - marker.length - liveFlag.length);
      nextStrategy = `${cleaned.length > room ? cleaned.slice(0, room).trimEnd() : cleaned}${liveFlag}${marker}`;
    }
    const [updated] = await db.update(liveTrades).set({ status: "CANCELLED", exitPrice: trade.entryPrice, currentPrice: trade.currentPrice ?? trade.entryPrice, pnl: 0, pnlPercent: 0, closedAt: new Date(), strategy: nextStrategy }).where(eq(liveTrades.id, trade.id)).returning();
    settled.push(updated);
    if (unverifiable) {
      await logActivity("CLOSE", "WARNING", `🕳️ ${trade.symbol} ${trade.direction} UNVERIFIED-BLIND after ${Math.floor(elapsed)}m — broker-confirmed row, held ${BLIND_HOLD_MAX_HOURS}h, the tape still cannot speak (${BRIDGE_TAPE.detail}). Ledger pnl 0 = NO fabricated result; shields count it as a LOSS for risk. Adoption mop may still rescue it.`, { symbol: trade.symbol, direction: trade.direction, cancelled: true, unverifiedBlind: true, blind: true, reach, elapsedMin: Math.floor(elapsed), stake: Number(trade.stake ?? 0), strategyBefore: rawStrategy, live: true });
    } else {
      // v4.4.1 depth-race receipt (see (a) above): log it, do not act on it.
      // Counting these lines over a week is exactly the evidence DN#6 needs to
      // decide whether the 45 m grace or the broker's tape depth has to move.
      await logActivity("CLOSE", "WARNING", `${trade.symbol} ${trade.direction} CANCELLED — no broker trace after ${Math.floor(elapsed)}m — NOT counted${depthRace ? ` | 📏 DEPTH-RACE: tape reach ${reach}m < row age ${Math.floor(elapsed)}m, so this absence was NOT provable from the tape` : ""}`, { symbol: trade.symbol, direction: trade.direction, cancelled: true, depthRace, reach, elapsedMin: Math.floor(elapsed), live: true });
    }
  }
  return settled;
}
