import {
  esc, patch, renderChrome, paintHeader, live, append,
  newId, nameFor, statusOf, boardInner
} from "../lib/app.js";

// Module state outlives page renders.
let selected = null; // { id, sq }
let confirmResign = false;

const SKELETON = `
  <div class="game">
    <div class="boardwrap">
      <div id="top"></div>
      <div class="frame"><div class="board" id="board"></div></div>
      <div id="bot"></div>
    </div>
    <aside class="side">
      <section class="card">
        <div id="status"></div>
        <p class="muted small" id="hint"></p>
        <div class="err" id="note" role="alert"></div>
        <div class="row" id="actions"></div>
      </section>
      <section class="card histcard">
        <h2>Move history <span class="count" id="count">0</span></h2>
        <div class="histbox" id="histbox"></div>
      </section>
      <a class="btn" href="home">\u2190 Back to the lobby</a>
    </aside>
  </div>`;

const NOT_FOUND = `<div class="card note"><h2>Game not found</h2>
  <p class="muted">This game doesn't exist yet, or the challenge hasn't been accepted.</p>
  <a class="btn primary" href="home">Back to the lobby</a></div>`;

export default async function render(ctx) {
  const main = renderChrome(ctx.content);
  const id = ctx.route.params.id;
  let mode = "";
  let busy = false;
  let lastCount = -1;
  const $ = (sel) => main.querySelector(sel);

  const view = (world) => {
    const g = world.games.get(id);
    if (!g) return null;
    const uid = world.me.uid;
    const myColor = uid && uid === g.white ? "w" : uid && uid === g.black ? "b" : null;
    const myTurn = !!myColor && !g.over && g.chess.turn() === myColor;
    return { g, uid, myColor, myTurn, flipped: myColor === "b" };
  };

  function paint(world) {
    paintHeader(ctx.content, world);
    const v = view(world);
    if (!v) {
      if (mode !== "nf") { main.innerHTML = NOT_FOUND; mode = "nf"; }
      return;
    }
    if (mode !== "game") { main.innerHTML = SKELETON; mode = "game"; lastCount = -1; }
    const { g, uid, myColor, myTurn, flipped } = v;
    const st = statusOf(world, g);
    if (selected && (selected.id !== id || !myTurn)) selected = null;
    if (!myTurn) confirmResign = false;

    const bar = (color) => {
      const u = color === "w" ? g.white : g.black;
      const turn = !g.over && g.chess.turn() === color;
      return `<div class="pbar ${turn ? "turn" : ""}"><span class="chip ${color === "w" ? "white" : "black"}"></span>
        <strong>${esc(nameFor(world, u))}</strong>${u === uid ? ' <span class="muted">(you)</span>' : ""}
        <span class="grow"></span>${turn ? '<span class="pill on">to move</span>' : ""}</div>`;
    };
    patch($("#top"), bar(flipped ? "w" : "b"));
    patch($("#bot"), bar(flipped ? "b" : "w"));

    const targets = selected && myTurn ? g.chess.moves({ square: selected.sq, verbose: true }) : [];
    patch($("#board"), boardInner(g, flipped, selected && selected.sq, targets));

    patch($("#status"), `<div class="status ${st.over ? "over" : st.mine ? "mine" : ""}">${esc(st.text)}</div>`);
    patch($("#hint"), esc(myColor
      ? (myTurn ? "Click a piece, then a highlighted square. Pawns promote to a queen." : g.over ? "This game is finished." : "Waiting for your opponent\u2026")
      : "You're watching this game."));

    patch($("#actions"), !myColor || g.over ? "" : confirmResign
      ? `<span class="muted">Resign this game?</span><button class="btn danger" type="button" data-a="yes">Confirm resign</button><button class="btn" type="button" data-a="no">Keep playing</button>`
      : `<button class="btn" type="button" data-a="resign">Resign</button>`);

    const rows = [];
    for (let i = 0; i < g.moves.length; i += 2) rows.push([g.moves[i], g.moves[i + 1]]);
    const lastPly = g.moves.length;
    const changed = patch($("#histbox"), rows.length
      ? `<ol class="hist">${rows.map(([w, b], i) => `<li><span class="num">${i + 1}.</span>
          <span class="mv ${w.ply === lastPly ? "cur" : ""}">${esc(w.san)}</span>
          <span class="mv ${b && b.ply === lastPly ? "cur" : ""}">${b ? esc(b.san) : ""}</span></li>`).join("")}</ol>`
      : `<p class="muted empty-line">No moves yet \u2014 White opens.</p>`);
    patch($("#count"), String(g.moves.length));
    if (changed && lastCount !== lastPly) {
      const box = $("#histbox");
      box.scrollTop = box.scrollHeight;
    }
    lastCount = lastPly;
  }

  const lv = live(ctx, main, paint, 2500);
  const repaint = () => { if (lv.world) paint(lv.world); };
  const local = () => lv.run(false);

  main.addEventListener("click", async (e) => {
    const world = lv.world;
    const v = world && view(world);
    if (!v) return;
    const note = $("#note");
    if (!note) return;

    const act = e.target.closest("button[data-a]");
    if (act) {
      if (busy) return;
      const a = act.dataset.a;
      if (a === "resign") { confirmResign = true; repaint(); return; }
      if (a === "no") { confirmResign = false; repaint(); return; }
      busy = true; act.disabled = true; act.textContent = "Resigning\u2026";
      confirmResign = false;
      const err = await append(ctx, "moves", { id: newId(), game_id: id, ply: v.g.moves.length + 1, kind: "resign", uci: "", san: "" }, { onLocal: local });
      busy = false;
      if (ctx.signal.aborted) return;
      note.textContent = err;
      if (err) local();
      return;
    }

    const btn = e.target.closest(".sq");
    if (!btn || !v.myTurn || busy) return;
    const { g, myColor } = v;
    const sq = btn.dataset.sq;
    note.textContent = "";
    const legal = selected ? g.chess.moves({ square: selected.sq, verbose: true }).filter((m) => m.to === sq) : [];
    if (legal.length) {
      const mv = legal.find((m) => m.promotion === "q") || legal[0];
      busy = true;
      selected = null;
      // The move appears on the board immediately; the write finishes in the background.
      const err = await append(ctx, "moves", {
        id: newId(), game_id: id, ply: g.moves.length + 1, kind: "move",
        uci: mv.from + mv.to + (mv.promotion || ""), san: mv.san
      }, { onLocal: local });
      busy = false;
      if (ctx.signal.aborted) return;
      if (err) { note.textContent = err; local(); }
      return;
    }
    const p = g.chess.get(sq);
    selected = p && p.color === myColor && !(selected && selected.sq === sq) ? { id, sq } : null;
    repaint();
  }, { signal: ctx.signal });

  await lv.start();
  return lv.stop;
}
