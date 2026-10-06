import {
  esc, ago, patch, loadWorld, renderChrome, paintHeader, live, append,
  newId, nameFor, statusOf, watching, setFlash, forceBeat
} from "../lib/app.js";

const initial = (s) => esc((String(s || "?")[0] || "?").toUpperCase());

export default async function render(ctx) {
  const main = renderChrome(ctx.content);
  main.innerHTML = `
  <div class="lobby">
    <div class="col"><div id="sec-name"></div><div id="sec-in"></div><div id="sec-out"></div><div id="sec-mine"></div></div>
    <div class="col"><div id="sec-online"></div><div id="sec-others"></div></div>
  </div>
  <div class="err bottom" id="act-err" role="alert"></div>`;
  const $ = (id) => main.querySelector(id);
  const errEl = $("#act-err");
  let leaving = false;

  function paint(world) {
    paintHeader(ctx.content, world);

    // A challenge this session sent was accepted: go to the board.
    for (const id of [...watching]) {
      if (world.games.has(id) && !leaving) {
        watching.delete(id);
        leaving = true;
        setFlash("Challenge accepted \u2014 good luck!");
        ctx.navigate(`game/${id}`);
        return;
      }
    }

    const uid = world.me.uid;
    const outTo = new Set(world.outgoing.map((c) => c.to));
    const inFrom = new Set(world.incoming.map((c) => c.from));
    const canPlay = world.me.signedIn && world.myName;

    patch($("#sec-name"), !world.me.signedIn
      ? `<div class="card note"><h2>Take a seat</h2><p>Login to use the app. You can look around the lobby, but you need an account to challenge someone and play.</p></div>`
      : `<form id="name-form" class="card name-form">
           <h2>${world.myName ? "Your name at the table" : "Choose a display name"}</h2>
           <p class="muted">${world.myName ? "Other players see this name in the lobby." : "You'll appear in the online list once you pick one."}</p>
           <div class="row">
             <input name="name" maxlength="20" required placeholder="e.g. Magnus" value="${esc(world.myName)}" autocomplete="off">
             <button class="btn primary" type="submit">${world.myName ? "Rename" : "Join the lobby"}</button>
           </div>
           <div class="err" id="name-err" role="alert"></div>
         </form>`);

    patch($("#sec-in"), world.incoming.length ? `
      <section class="card">
        <h2>Challenges for you</h2>
        <ul class="list">${world.incoming.map((c) => `
          <li><span class="av">${initial(nameFor(world, c.from))}</span>
            <span class="grow"><strong>${esc(nameFor(world, c.from))}</strong> wants to play <span class="muted">\u00b7 ${ago(c.at)}</span></span>
            <button class="btn primary" data-act="accept" data-id="${esc(c.id)}">Accept</button>
            <button class="btn" data-act="decline" data-id="${esc(c.id)}">Decline</button></li>`).join("")}
        </ul></section>` : "");

    patch($("#sec-out"), world.outgoing.length ? `
      <section class="card">
        <h2>Waiting for a reply</h2>
        <ul class="list">${world.outgoing.map((c) => `
          <li><span class="av">${initial(nameFor(world, c.to))}</span>
            <span class="grow">Challenge sent to <strong>${esc(nameFor(world, c.to))}</strong> <span class="muted">\u00b7 ${ago(c.at)}</span></span>
            <button class="btn" data-act="cancel" data-id="${esc(c.id)}">Cancel</button></li>`).join("")}
        </ul></section>` : "");

    patch($("#sec-online"), `
      <section class="card">
        <h2>Players online <span class="count">${world.online.length}</span></h2>
        ${world.online.length ? `<ul class="list">${world.online.map((p) => `
          <li><span class="av"><i class="dot-on"></i>${initial(p.name)}</span>
            <span class="grow"><strong>${esc(p.name)}</strong> <span class="muted">\u00b7 online</span></span>
            ${inFrom.has(p.uid) ? `<span class="muted">challenged you</span>`
              : outTo.has(p.uid) ? `<button class="btn" disabled>Challenge sent</button>`
              : `<button class="btn primary" data-act="challenge" data-uid="${esc(p.uid)}" data-name="${esc(p.name)}" ${canPlay ? "" : "disabled"}>Challenge</button>`}</li>`).join("")}
        </ul>` : `<p class="muted empty-line">Nobody else is online right now. Players show up here while the app is open and they're signed in \u2014 share the link with a friend.</p>`}
      </section>`);

    patch($("#sec-mine"), world.myGames.length ? `
      <section class="card">
        <h2>Your games</h2>
        <ul class="list">${world.myGames.slice(0, 10).map((g) => {
          const opp = g.white === uid ? g.black : g.white;
          const st = statusOf(world, g);
          return `<li><span class="av">${initial(nameFor(world, opp))}</span>
            <span class="grow">vs <strong>${esc(nameFor(world, opp))}</strong> <span class="muted">\u00b7 ${g.moves.length} moves \u00b7 ${esc(st.text)}</span></span>
            <a class="btn ${st.mine ? "primary" : ""}" href="game/${esc(g.id)}">${g.over ? "Review" : st.mine ? "Your move" : "Open"}</a></li>`;
        }).join("")}</ul></section>` : "");

    patch($("#sec-others"), world.otherGames.length ? `
      <section class="card">
        <h2>Games in progress</h2>
        <ul class="list">${world.otherGames.slice(0, 5).map((g) => `
          <li><span class="grow"><strong>${esc(nameFor(world, g.white))}</strong> vs <strong>${esc(nameFor(world, g.black))}</strong> <span class="muted">\u00b7 ${g.moves.length} moves</span></span>
            <a class="btn" href="game/${esc(g.id)}">Watch</a></li>`).join("")}</ul></section>` : "");
  }

  const lv = live(ctx, main, paint, 4000);
  const local = () => lv.run(false);

  // Typing never disturbs the form: the poll only patches sections whose HTML changed.
  main.addEventListener("submit", async (e) => {
    const form = e.target.closest("#name-form");
    if (!form) return;
    e.preventDefault();
    const name = new FormData(form).get("name").toString().trim().slice(0, 20);
    if (!name) return;
    const btn = form.querySelector("button");
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = "Saving\u2026";
    const err = await append(ctx, "presence", { id: newId(), name }, { onLocal: local });
    if (ctx.signal.aborted) return;
    btn.disabled = false; btn.textContent = label;
    const errBox = form.querySelector("#name-err");
    if (errBox) errBox.textContent = err;
    if (!err) forceBeat();
  }, { signal: ctx.signal });

  main.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    const world = lv.world;
    if (!btn || btn.disabled || !world) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    const label = btn.textContent;
    btn.disabled = true;
    errEl.textContent = "";
    let err = "";
    if (act === "challenge") {
      btn.textContent = "Sending\u2026";
      const cid = newId();
      watching.add(cid);
      err = await append(ctx, "challenges", { id: cid, to_user: btn.dataset.uid, to_name: btn.dataset.name, from_name: world.myName }, { onLocal: local });
      if (err) watching.delete(cid);
    } else if (act === "cancel") {
      const c = world.challenges.get(id);
      err = await append(ctx, "challenges", { id, to_user: c.to, to_name: c.toName, from_name: c.fromName, deleted: true }, { onLocal: local });
      if (!err) watching.delete(id);
    } else if (act === "accept" || act === "decline") {
      err = await append(ctx, "responses", { id: newId(), challenge_id: id, accepted: act === "accept" }, { onLocal: act === "decline" ? local : undefined });
      if (!err && act === "accept") {
        setFlash("Challenge accepted \u2014 good luck!");
        ctx.navigate(`game/${id}`);
        return;
      }
    }
    if (ctx.signal.aborted) return;
    if (err) {
      errEl.textContent = err;
      btn.disabled = false;
      btn.textContent = label;
      local();
    }
  }, { signal: ctx.signal });

  await lv.start();
  return lv.stop;
}
