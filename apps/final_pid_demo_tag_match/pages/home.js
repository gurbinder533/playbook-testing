import { shell, esc, creditHtml, sheetHref, mountCompare, setImg, thumbSvg } from "../lib/app.js";

let filter = "all";

export default async function render(ctx) {
  ctx.content.innerHTML = shell("home", `
<section class="hero">
  <div><div class="eyebrow">Piping &amp; instrumentation diagrams</div>
    <h1>Turn a plant drawing into a graph you can check.</h1>
    <p>The reader finds the valves, instruments, pumps and tanks on a P&amp;ID, traces the pipes, rebuilds the drawing and scores itself against an answer key. Explore the result as a plant graph or ask it questions.</p>
    <div class="row"><a class="btn" href="#samples" id="try">Try a sample sheet</a><a class="btn ghost" href="drawings">Upload your own</a></div></div>
  <div class="shot"><div id="hero-cmp" class="muted small" style="padding:40px;text-align:center">Loading a sample…</div><div class="cap" id="hero-cap">Drag to compare the original with the rebuilt drawing.</div></div>
</section>
<div class="steps">
  <div class="card step"><b class="n">1</b><h3>Pick or upload</h3><p class="muted small">Start with one of 12 sample sheets or add a PDF or image of your own.</p></div>
  <div class="card step"><b class="n">2</b><h3>The reader scans it</h3><p class="muted small">Overlapping tiles and zoomed quarters, so small symbols and tags are not missed.</p></div>
  <div class="card step"><b class="n">3</b><h3>Compare and check</h3><p class="muted small">Slide between original and rebuilt, and see which symbols match the answer key.</p></div>
</div>
<div id="samples" class="row" style="justify-content:space-between"><div><h2>Sample sheets</h2><p class="muted small" style="margin:0">Twelve drawings from the OPEN100 design.</p></div>
  <div class="seg" id="flt"><button type="button" data-f="all">All</button><button type="button" data-f="read">Read</button><button type="button" data-f="unread">Not read yet</button></div></div>
<div id="cards" class="grid g3"><p class="muted">Loading sheets…</p></div>
${creditHtml()}`);

  let sheets = [];
  try {
    sheets = await ctx.db.rows(`SELECT drawing_id, title, ok, n_valves, n_instruments, n_equipment FROM sheets WHERE source = 'sample' ORDER BY drawing_id LIMIT 50`, [], ctx.signal);
  } catch (e) {
    if (ctx.signal.aborted) return;
    ctx.reportError(e);
    ctx.content.querySelector("#cards").innerHTML = `<p class="muted">The sample sheets could not be loaded yet. Try Reload in a moment.</p>`;
    return;
  }
  if (ctx.signal.aborted) return;
  const byId = new Map(sheets.map((s) => [s.drawing_id, s]));
  const thumbs = new Map();
  const paint = () => {
    const cards = [];
    for (let i = 0; i < 12; i++) {
      const id = `sample-${String(i).padStart(2, "0")}`;
      const s = byId.get(id);
      const read = !!(s && s.ok);
      if ((filter === "read" && !read) || (filter === "unread" && read)) continue;
      cards.push(`<a class="scard" href="${sheetHref(id)}"><div class="sc-head">${thumbs.has(id) ? `<img data-t="${id}" alt="Drawing of ${esc(s?.title || "sheet " + i)}" decoding="async">` : thumbSvg()}</div><div class="sc-body">
        <div class="top"><h3>${esc(read ? s.title || "Sheet " + i : "Sheet " + i)}</h3><span class="badge ${read ? "read" : "unread"}">${read ? "Read" : "Not read yet"}</span></div>
        ${read ? `<div class="sc-nums"><span><b>${s.n_valves}</b>valves</span><span><b>${s.n_instruments}</b>instruments</span><span><b>${s.n_equipment}</b>equipment</span></div>` : `<p class="muted small" style="margin:0">Open it to see the original drawing.</p>`}
        <span class="btn blk">${read ? "Open reading" : "Open sheet"}</span></div></a>`);
    }
    ctx.content.querySelector("#cards").innerHTML = cards.join("") || `<p class="muted">No sheets in this view.</p>`;
    ctx.content.querySelectorAll("#cards img[data-t]").forEach((im) => { const t = thumbs.get(im.dataset.t); if (t) setImg(im, t, "image/jpeg"); });
    ctx.content.querySelectorAll("#flt button").forEach((b) => b.classList.toggle("on", b.dataset.f === filter));
  };
  paint();
  // Real drawings load after the cards are on screen: the placeholder line art shows until they arrive.
  ctx.db.rows(`SELECT drawing_id, thumb_b64 FROM thumbs WHERE source = 'sample' LIMIT 20`, [], ctx.signal).then((rs) => { if (ctx.signal.aborted) return; rs.forEach((r) => thumbs.set(r.drawing_id, r.thumb_b64)); paint(); }).catch((e) => { if (!ctx.signal.aborted) ctx.reportError(e); });
  ctx.content.querySelectorAll("#flt button").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.f; paint(); }, { signal: ctx.signal }));

  const pick = byId.get("sample-04")?.ok ? byId.get("sample-04") : sheets.find((s) => s.ok);
  const hero = ctx.content.querySelector("#hero-cmp");
  if (!pick) { hero.textContent = "The first sample sheet will appear here once it has been read."; return; }
  try {
    const rows = await ctx.db.rows(`SELECT orig_b64, rebuilt_b64 FROM images WHERE drawing_id = ? LIMIT 1`, [pick.drawing_id], ctx.signal);
    const w = (await ctx.db.rows(`SELECT width, height FROM sheets WHERE drawing_id = ? LIMIT 1`, [pick.drawing_id], ctx.signal))[0] || {};
    if (ctx.signal.aborted) return;
    if (!rows[0]) { hero.textContent = "Preview not available yet."; return; }
    hero.removeAttribute("style");
    mountCompare(hero, rows[0].orig_b64, rows[0].rebuilt_b64, w.width, w.height, ctx.signal);
    ctx.content.querySelector("#hero-cap").innerHTML = `Drag to compare. A real read of <b>${esc(pick.title)}</b>.`;
  } catch (e) {
    if (ctx.signal.aborted) return;
    ctx.reportError(e);
    hero.textContent = "Preview could not be loaded.";
  }
}
