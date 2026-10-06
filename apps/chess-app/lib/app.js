import { esc, WriteRejectedError, WriteSessionExpiredError } from "@corvic/live";

export { esc };

const CHESS_URL = "https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.12.1/chess.min.js";
export const ONLINE_MS = 120000; // "online" = a heartbeat in the last 2 minutes
const HEARTBEAT_MS = 40000;
const CHALLENGE_TTL_MS = 10 * 60 * 1000;

// A UMD build is not an ES module: append a <script> once and await it.
export function loadScript(src) {
  const existing = document.head.querySelector(`script[src="${src}"]`);
  if (existing) return existing.corvicLoaded;
  const script = document.createElement("script");
  script.src = src;
  script.corvicLoaded = new Promise((resolve, reject) => {
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => {
      script.remove();
      reject(new Error(`could not load ${src}`));
    });
  });
  document.head.appendChild(script);
  return script.corvicLoaded;
}

export async function ensureChess() {
  await loadScript(CHESS_URL);
  if (typeof window.Chess !== "function") throw new Error("The chess engine did not load.");
  return window.Chess;
}

// ---- module state (outlives page renders) ------------------------------------
const pending = { presence: [], challenges: [], responses: [], moves: [] };
let meUid = null;
let lastBeat = 0;
let flash = "";
/** Challenges this session sent: open the game when one is accepted. */
export const watching = new Set();

export const newId = () => crypto.randomUUID();
export const setFlash = (m) => { flash = m; };
export function forceBeat() { lastBeat = 0; }

function hash(s) {
  let h = 5381;
  for (const ch of String(s)) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Set an element's HTML only when it differs from what is already painted. */
export function patch(el, html) {
  if (!el || el.__h === html) return false;
  el.innerHTML = html;
  el.__h = html;
  return true;
}

/** Coarse, slow-changing age text, so lists do not repaint every poll. */
export function ago(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  return m === 1 ? "1 min ago" : `${m} min ago`;
}

// ---- reading ----------------------------------------------------------------
const COLS = {
  presence: "id, name, updated_at",
  challenges: "id, to_user, to_name, from_name, deleted, updated_at",
  responses: "id, challenge_id, accepted, updated_at",
  moves: "id, game_id, ply, kind, uci, san, updated_at"
};

/** Rows from the table plus this session's own writes a cached read may not show yet. */
async function loadRows(ctx, t) {
  const limit = t === "moves" ? 20000 : 5000;
  const rows = await ctx.db.rows(
    `SELECT ${COLS[t]}, __corvic_app_row_author_id AS uid FROM ${t} ORDER BY updated_at DESC LIMIT ${limit}`,
    [], ctx.signal
  );
  const clean = rows.map((r) => ({ ...r, updated_at: Number(r.updated_at), ply: r.ply == null ? null : Number(r.ply) }));
  const seen = new Set(clean.map((r) => `${r.id}|${r.updated_at}`));
  const now = Date.now();
  pending[t] = pending[t].filter((p) => !seen.has(`${p.id}|${p.updated_at}`) && now - p.updated_at < 120000);
  return clean.concat(pending[t]).sort((a, b) => a.updated_at - b.updated_at);
}

/** Quietly re-fetch every declared source (unchanged ones are kept by the engine). */
async function refreshData(ctx) {
  await Promise.all(ctx.db.sources().map((s) => ctx.db.registerSource(s.name, s.url)));
}

const nameFor = (world, uid) => world.names.get(uid)?.name || `Player ${String(uid || "?").slice(-4)}`;
export { nameFor };

const GLYPH = { k: "\u265A", q: "\u265B", r: "\u265C", b: "\u265D", n: "\u265E", p: "\u265F" };
const PIECE_NAME = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };

/** Replay a game's move rows. Only the player to move may move; illegal rows are ignored. */
function buildGame(Chess, ch, rows) {
  const white = hash(ch.id) % 2 === 0 ? ch.from : ch.to;
  const black = white === ch.from ? ch.to : ch.from;
  const chess = new Chess();
  const moves = [];
  let over = false, winner = null, reason = "";
  const sorted = rows.slice().sort((a, b) => a.ply - b.ply || a.updated_at - b.updated_at);
  for (const r of sorted) {
    if (over) break;
    if (r.ply !== moves.length + 1) continue;
    const side = chess.turn() === "w" ? white : black;
    if (r.kind === "resign") {
      if (r.uid === white || r.uid === black) {
        over = true; winner = r.uid === white ? "b" : "w"; reason = "resignation";
      }
      continue;
    }
    if (r.uid !== side || !r.uci || r.uci.length < 4) continue;
    const m = chess.move({ from: r.uci.slice(0, 2), to: r.uci.slice(2, 4), promotion: r.uci[4] || undefined });
    if (!m) continue;
    moves.push({ ply: r.ply, san: m.san, from: m.from, to: m.to });
  }
  if (!over) {
    if (chess.in_checkmate()) { over = true; winner = chess.turn() === "w" ? "b" : "w"; reason = "checkmate"; }
    else if (chess.in_stalemate()) { over = true; reason = "stalemate"; }
    else if (chess.insufficient_material()) { over = true; reason = "insufficient material"; }
    else if (chess.in_threefold_repetition()) { over = true; reason = "threefold repetition"; }
    else if (chess.in_draw()) { over = true; reason = "the fifty-move rule"; }
  }
  const lastAt = rows.length ? Math.max(...rows.map((r) => r.updated_at)) : ch.respondedAt;
  return { id: ch.id, white, black, chess, moves, over, winner, reason, startedAt: ch.respondedAt, lastAt };
}

export async function loadWorld(ctx) {
  const Chess = await ensureChess();
  const me = await ctx.reader(ctx.signal);
  meUid = me.signedIn ? me.userId : null;
  const world = { Chess, me: { signedIn: !!me.signedIn, uid: me.signedIn ? me.userId : null } };
  const pres = await loadRows(ctx, "presence");
  const chal = await loadRows(ctx, "challenges");
  const resp = await loadRows(ctx, "responses");
  const mv = await loadRows(ctx, "moves");
  const now = Date.now();

  const names = new Map();
  for (const p of pres) {
    const cur = names.get(p.uid);
    names.set(p.uid, { name: p.name || cur?.name, seen: Math.max(p.updated_at, cur?.seen || 0) });
  }
  world.names = names;
  world.myName = world.me.uid ? names.get(world.me.uid)?.name || "" : "";
  world.online = [...names.entries()]
    .filter(([uid, v]) => uid !== world.me.uid && v.name && now - v.seen < ONLINE_MS)
    .map(([uid, v]) => ({ uid, name: v.name, seen: v.seen }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const chMap = new Map();
  for (const c of chal) {
    const cur = chMap.get(c.id);
    if (!cur) {
      chMap.set(c.id, { id: c.id, from: c.uid, to: c.to_user, toName: c.to_name, fromName: c.from_name, at: c.updated_at, cancelledAt: c.deleted ? c.updated_at : 0, response: null });
    } else if (c.uid === cur.from && c.deleted && !cur.cancelledAt) {
      cur.cancelledAt = c.updated_at;
    }
  }
  for (const r of resp) {
    const ch = chMap.get(r.challenge_id);
    if (!ch || ch.response !== null || r.uid !== ch.to || ch.from === ch.to) continue;
    if (ch.cancelledAt && r.updated_at >= ch.cancelledAt) continue;
    ch.response = !!r.accepted;
    ch.respondedAt = r.updated_at;
  }
  const movesBy = new Map();
  for (const m of mv) {
    if (!movesBy.has(m.game_id)) movesBy.set(m.game_id, []);
    movesBy.get(m.game_id).push(m);
  }
  world.challenges = chMap;
  world.games = new Map();
  for (const ch of chMap.values()) {
    if (ch.response === true && ch.from !== ch.to) world.games.set(ch.id, buildGame(Chess, ch, movesBy.get(ch.id) || []));
  }
  const live = (ch) => ch.response === null && !ch.cancelledAt && ch.from !== ch.to && now - ch.at < CHALLENGE_TTL_MS;
  const uid = world.me.uid;
  world.incoming = uid ? [...chMap.values()].filter((c) => live(c) && c.to === uid).sort((a, b) => b.at - a.at) : [];
  world.outgoing = uid ? [...chMap.values()].filter((c) => live(c) && c.from === uid).sort((a, b) => b.at - a.at) : [];
  const games = [...world.games.values()];
  world.myGames = uid ? games.filter((g) => g.white === uid || g.black === uid).sort((a, b) => Number(a.over) - Number(b.over) || b.lastAt - a.lastAt) : [];
  world.otherGames = games.filter((g) => !g.over && g.white !== uid && g.black !== uid && now - g.lastAt < 6 * 3600 * 1000).sort((a, b) => b.lastAt - a.lastAt);
  return world;
}

// ---- writing ----------------------------------------------------------------
function errorText(err) {
  if (err && err.kind === "write-sign-in-required") return err.message || "Login to use the app.";
  if (err instanceof WriteSessionExpiredError) return "Your session expired \u2014 reload and try again. Nothing was saved.";
  return err instanceof WriteRejectedError ? err.message : `Nothing was saved: ${err && err.message ? err.message : err}`;
}

/**
 * Append one row. The row shows up locally at once (`onLocal` runs right after) and is
 * taken back if the write fails. Resolves to "" on success or the text to show.
 */
export async function append(ctx, table, row, opts = {}) {
  const full = { deleted: false, ...row, updated_at: Date.now() };
  if (table !== "challenges") delete full.deleted;
  const local = { ply: null, ...full, uid: meUid };
  pending[table].push(local);
  if (opts.onLocal) opts.onLocal();
  try {
    await ctx.write.rows(table, [full], { signal: ctx.signal });
  } catch (err) {
    pending[table] = pending[table].filter((p) => p !== local);
    if (ctx.signal.aborted) return "";
    return errorText(err);
  }
  return "";
}

// ---- chrome ------------------------------------------------------------------
export function renderChrome(content) {
  const message = flash;
  flash = "";
  content.innerHTML = `
<div id="app">
  <header id="header">
    <a class="brand" href="home"><span class="crest">\u265E\uFE0E</span><span>Walnut Chess Club</span></a>
    <div id="who" class="who"></div>
  </header>
  ${message ? `<div class="flash" role="status">${esc(message)}</div>` : ""}
  <main id="main"></main>
</div>`;
  return content.querySelector("#main");
}

export function paintHeader(content, world) {
  const who = content.querySelector("#who");
  if (!who) return;
  patch(who, !world.me.signedIn
    ? `<span class="pill off">Guest</span><span class="muted">Login to use the app.</span>`
    : world.myName
      ? `<span class="dot-on"></span><strong>${esc(world.myName)}</strong><span class="muted">online</span>`
      : `<span class="muted">Choose a display name to appear online</span>`);
}

export function showLoadError(main, err) {
  const msg = err && err.message ? err.message : String(err);
  main.innerHTML = `<div class="load-note">Couldn't load the club: ${esc(msg)}</div>`;
}

/**
 * Keep a page up to date WITHOUT re-rendering it: re-read the data on a timer and call
 * `paint(world)` which patches only what changed. `run(false)` re-reads locally (instant,
 * used right after the reader does something); `run(true)` re-fetches from the server first.
 */
export function live(ctx, main, paint, interval) {
  const L = { world: null };
  let busy = false, again = false, againNet = false, stopped = false, reported = false;

  async function run(net) {
    if (stopped || ctx.signal.aborted) return;
    if (busy) { again = true; againNet = againNet || net; return; }
    busy = true;
    try {
      if (net) await refreshData(ctx);
      const w = await loadWorld(ctx);
      if (stopped || ctx.signal.aborted) return;
      L.world = w;
      paint(w);
    } catch (err) {
      if (stopped || ctx.signal.aborted) return;
      if (!L.world) { showLoadError(main, err); }
      if (!reported) { reported = true; ctx.reportError(err); }
    } finally {
      busy = false;
      if (again && !stopped) {
        const n = againNet; again = false; againNet = false;
        run(n);
      }
    }
  }

  async function beat() {
    const w = L.world;
    if (!w || !w.me.signedIn || !w.myName) return;
    if (Date.now() - lastBeat < HEARTBEAT_MS) return;
    lastBeat = Date.now();
    await append(ctx, "presence", { id: newId(), name: w.myName });
  }

  const tick = async () => {
    if (stopped || ctx.signal.aborted || document.hidden) return;
    await beat();
    await run(true);
  };
  const timer = setInterval(tick, interval);
  const onVis = () => { if (!document.hidden) tick(); };
  document.addEventListener("visibilitychange", onVis);

  L.run = run;
  L.start = async () => {
    await run(false);          // paint at once from what is already loaded
    run(true);                 // then catch up with the server in the background
    beat();
  };
  L.stop = () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVis);
  };
  return L;
}

// ---- board -------------------------------------------------------------------
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

export function boardInner(g, flipped, selectedSq, targets) {
  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const fs = flipped ? [...FILES].reverse() : FILES;
  const tmap = new Map(targets.map((m) => [m.to, m]));
  const last = g.moves[g.moves.length - 1];
  let checkSq = null;
  if (g.chess.in_check()) {
    const turn = g.chess.turn();
    g.chess.board().forEach((row, ri) => row.forEach((p, ci) => {
      if (p && p.type === "k" && p.color === turn) checkSq = FILES[ci] + (8 - ri);
    }));
  }
  let out = "";
  for (const r of ranks) {
    for (const f of fs) {
      const sq = f + r;
      const dark = (FILES.indexOf(f) + r) % 2 === 0;
      const p = g.chess.get(sq);
      const cls = ["sq", dark ? "dark" : "light",
        sq === selectedSq ? "sel" : "",
        tmap.has(sq) ? (p ? "cap" : "tgt") : "",
        last && (last.from === sq || last.to === sq) ? "last" : "",
        sq === checkSq ? "check" : ""].filter(Boolean).join(" ");
      const label = `${sq}${p ? ` ${p.color === "w" ? "white" : "black"} ${PIECE_NAME[p.type]}` : ""}`;
      const rank = f === fs[0] ? `<b class="co r">${r}</b>` : "";
      const file = r === ranks[7] ? `<b class="co f">${f}</b>` : "";
      out += `<button type="button" class="${cls}" data-sq="${sq}" aria-label="${label}">${
        p ? `<span class="pc ${p.color === "w" ? "white" : "black"}">${GLYPH[p.type]}\uFE0E</span>` : ""
      }${tmap.has(sq) && !p ? '<i class="hint"></i>' : ""}${rank}${file}</button>`;
    }
  }
  return out;
}

export function statusOf(world, g) {
  const nm = (c) => nameFor(world, c === "w" ? g.white : g.black);
  if (g.over) {
    if (g.winner) return { text: `${g.reason === "checkmate" ? "Checkmate" : "Resignation"} \u2014 ${nm(g.winner)} wins`, over: true };
    return { text: `Draw by ${g.reason}`, over: true };
  }
  const t = g.chess.turn();
  const mine = world.me.uid === (t === "w" ? g.white : g.black);
  const chk = g.chess.in_check() ? " \u00b7 check!" : "";
  return { text: mine ? `Your move (${t === "w" ? "White" : "Black"})${chk}` : `${nm(t)} to move (${t === "w" ? "White" : "Black"})${chk}`, over: false, mine };
}
