import { loadData, chrome, showError, loadScript, f, esc, STATUS_COLOR, STATUS_LABEL, M } from "../lib/core.js";
import * as AN from "../lib/analysis.js";
const buildCallouts = AN.buildCallouts, AHC_BY = AN.AHC_BY || {};
import { pill, metricCard } from "../lib/ui.js";
import { cite, ahc } from "../lib/refs.js";

const THREE_SRC = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
// Marker positions tuned to the figure below (metres, y up, +x = patient's left, +z = front).
const POS = { brain: [0, 1.79, 0], eyes: [0, 1.69, 0.1], throat: [0, 1.45, 0.05], thyroid: [0, 1.52, 0.06], heart: [0.05, 1.32, 0.09], muscle: [0.29, 1.2, 0.02], liver: [-0.08, 1.2, 0.05], abdomen: [0, 1.04, 0.12], kidney: [-0.07, 1.12, -0.07], gut: [0.06, 0.96, 0.1], spine: [0, 1.3, -0.09], prostate: [0, 0.88, 0.06], legs: [0.1, 0.55, 0.04] };

let selId = null, wire = true, auto = true, onlyConcerns = false;

export default async function render(ctx) {
  const main = chrome(ctx, "body");
  let st;
  try { st = await loadData(ctx); } catch (e) { showError(ctx, main, e); return; }
  if (ctx.signal.aborted) return;
  const allCalls = buildCallouts(st), shown = allCalls.some((c) => c.status !== "na") ? allCalls.filter((c) => c.status !== "na") : allCalls;
  const calls = shown.map((c, i) => ({ ...c, n: i + 1, pos: POS[c.id] || c.pos }));
  const byId = Object.fromEntries(calls.map((c) => [c.id, c]));
  const order = { crit: 0, flag: 1, watch: 2, ok: 3, na: 4 };

  main.innerHTML = `
<h1>3D body map</h1>
<p class="sub">Drag to spin, scroll to zoom, click a numbered marker for what was found there. Marker colour follows the worst status of the data attached to that region; green markers mark reassuring results.</p>
<div class="stage" id="stage">
  <div class="tools"><button type="button" class="btn" data-v="front">Front</button><button type="button" class="btn" data-v="side">Side</button><button type="button" class="btn" data-v="back">Back</button><button type="button" class="btn${auto ? " on" : ""}" id="tauto">Auto-spin</button><button type="button" class="btn${wire ? " on" : ""}" id="twire">Wireframe</button><button type="button" class="btn${onlyConcerns ? " on" : ""}" id="tconc">Concerns only</button></div>
  <div class="cvwrap" id="cvwrap"><canvas id="cv"></canvas><div class="ov" id="ov"></div></div>
  <div class="panel" id="panel"></div>
  <div class="hint">drag = rotate \u00b7 scroll = zoom \u00b7 click a marker</div></div>
<div class="legend">${["crit", "flag", "watch", "ok", "na"].map((s) => `<span><i style="background:${STATUS_COLOR[s]}"></i>${STATUS_LABEL[s]}</span>`).join("")}<span class="muted">Positions are schematic, not anatomical imaging.</span></div>
<div class="grid g4 sec" id="cards"></div>`;

  const stage = main.querySelector("#stage"), cv = main.querySelector("#cv"), ov = main.querySelector("#ov"), panel = main.querySelector("#panel");

  const detail = (c) => {
    const keys = c.metrics.filter((k) => M[k] && st.series[k]);
    return `<button type="button" class="btn" id="back">\u2190 All findings</button>
<h2 style="margin-top:10px"><span class="chip" style="background:${STATUS_COLOR[c.status]};color:#06101f;border:0">${c.n}</span> ${esc(c.name)}</h2>
<div>${pill(c.status)}</div>
<p style="margin-top:8px"><b>${esc(c.head)}</b></p>
<ul class="t">${c.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
${c.sig.length ? `<p style="margin-top:8px">Part of signal${c.sig.length > 1 ? "s" : ""}: ${c.sig.map((s) => `<a href="signals"><b>${s}</b></a>`).join(", ")} \u00b7 <a href="rootcause">root cause</a></p>` : ""}
${keys.length ? `<div class="grid" style="grid-template-columns:minmax(0,1fr);margin-top:8px">${keys.map((k) => metricCard(st, k, false)).join("")}</div>` : ""}
${c.cites.length ? `<div style="margin-top:8px"><small class="muted">PubMed</small><br>${cite(...c.cites)}</div>` : ""}
${AHC_BY[c.id] ? `<div style="margin-top:6px"><small class="muted">Academic health centres</small><br>${ahc(...AHC_BY[c.id])}</div>` : ""}`;
  };
  const listing = () => `<h2>Findings on the body</h2><p class="muted" style="font-size:12.5px">${calls.filter((c) => c.status !== "ok" && c.status !== "na").length} regions carry a concern; ${calls.filter((c) => c.status === "ok").length} are reassuring${calls.some((c) => c.status === "na") ? "; grey markers have no data in the records" : ""}.</p>${calls.slice().sort((a, b) => order[a.status] - order[b.status]).map((c) => `<button type="button" class="mcard s-${c.status}" data-id="${c.id}" style="margin:6px 0;width:100%"><div class="mc-h"><span><b>${c.n}</b> \u00b7 ${esc(c.name)}</span>${pill(c.status)}</div><div style="font-size:12px;margin-top:3px">${esc(c.head)}</div></button>`).join("")}`;
  const drawPanel = () => {
    panel.innerHTML = selId && byId[selId] ? detail(byId[selId]) : listing();
    panel.querySelectorAll("[data-id]").forEach((b) => b.addEventListener("click", () => select(b.dataset.id), { signal: ctx.signal }));
    const bk = panel.querySelector("#back"); if (bk) bk.addEventListener("click", () => select(null), { signal: ctx.signal });
    panel.scrollTop = 0;
  };
  const drawCards = () => {
    main.querySelector("#cards").innerHTML = calls.slice().sort((a, b) => order[a.status] - order[b.status]).map((c) => `<button type="button" class="mcard s-${c.status}${c.id === selId ? " sel" : ""}" data-id="${c.id}"><div class="mc-h"><span><b>${c.n}</b> \u00b7 ${esc(c.name)}</span>${pill(c.status)}</div><div style="font-size:12px;margin-top:4px">${esc(c.head)}</div></button>`).join("");
    main.querySelectorAll("#cards [data-id]").forEach((b) => b.addEventListener("click", () => { select(b.dataset.id); stage.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, { signal: ctx.signal }));
  };

  let target = null;
  const select = (id) => {
    selId = id; if (id && window.matchMedia("(max-width:900px)").matches) setTimeout(() => panel.scrollIntoView({ block: "nearest", behavior: "smooth" }), 60);
    if (id) { auto = false; main.querySelector("#tauto").classList.remove("on"); const c = byId[id]; target = { front: c.pos[2] >= 0 }; }
    drawPanel(); drawCards(); ov.querySelectorAll(".badge").forEach((b) => { b.style.outline = b.dataset.id === selId ? "3px solid #fff" : "none"; });
  };

  // Badges
  ov.innerHTML = calls.map((c) => `<div class="badge${c.status === "crit" || c.status === "flag" ? " pulse" : ""}" data-id="${c.id}" title="${esc(c.name)}" style="background:${STATUS_COLOR[c.status]}">${c.n}</div>`).join("");
  ov.querySelectorAll(".badge").forEach((b) => b.addEventListener("click", () => select(b.dataset.id), { signal: ctx.signal }));
  drawPanel(); drawCards();

  main.querySelector("#tauto").addEventListener("click", (e) => { auto = !auto; e.currentTarget.classList.toggle("on", auto); }, { signal: ctx.signal });

  try { await loadScript(THREE_SRC); } catch (e) { stage.querySelector(".hint").textContent = "3D engine could not load \u2014 findings are listed on the right."; ctx.reportError(e); return; }
  if (ctx.signal.aborted) return;
  const T = window.THREE;
  if (!T) { ctx.reportError(new Error("THREE missing")); return; }

  const renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(33, 1, 0.1, 50);
  camera.position.set(0, 1.05, 3.7); camera.lookAt(0, 1.0, 0);
  scene.add(new T.AmbientLight(0x88aaff, 0.7));
  const dl = new T.DirectionalLight(0xffffff, 0.8); dl.position.set(2, 3, 4); scene.add(dl);
  const pl = new T.PointLight(0x3ee0c4, 0.9, 6); pl.position.set(-2, 1.5, 2); scene.add(pl);

  const group = new T.Group(); scene.add(group);
  const solid = new T.MeshPhongMaterial({ color: 0x2a5d8f, transparent: true, opacity: 0.2, shininess: 90, side: T.DoubleSide, depthWrite: false });
  const wireM = new T.MeshBasicMaterial({ color: 0x3ee0c4, wireframe: true, transparent: true, opacity: 0.3 });
  const geos = [];
  const add = (geo, x, y, z, sx = 1, sy = 1, sz = 1) => { geos.push(geo); for (const m of [solid, wireM]) { const mesh = new T.Mesh(geo, m); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); group.add(mesh); } };
  const ell = (x, y, z, sx, sy, sz) => add(new T.SphereGeometry(1, 18, 14), x, y, z, sx, sy, sz);
  const limb = (a, b, r1, r2) => {
    const A = new T.Vector3(...a), B = new T.Vector3(...b), d = B.clone().sub(A), len = d.length();
    const g = new T.CylinderGeometry(r2, r1, len, 14, 4, true); geos.push(g);
    for (const m of [solid, wireM]) { const mesh = new T.Mesh(g, m); mesh.position.copy(A.clone().add(B).multiplyScalar(0.5)); mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); group.add(mesh); }
    ell(a[0], a[1], a[2], r1, r1, r1); ell(b[0], b[1], b[2], r2, r2, r2);
  };
  ell(0, 1.68, 0, 0.095, 0.12, 0.105);                 // head
  limb([0, 1.6, 0], [0, 1.5, 0], 0.045, 0.05);        // neck
  ell(0, 1.34, 0, 0.19, 0.2, 0.105);                  // chest
  ell(0, 1.1, 0, 0.165, 0.17, 0.12);                  // abdomen
  ell(0, 0.9, 0, 0.17, 0.1, 0.11);                    // pelvis
  for (const s of [-1, 1]) {
    ell(s * 0.21, 1.44, 0, 0.065, 0.06, 0.06);        // shoulders
    limb([s * 0.255, 1.4, 0], [s * 0.29, 1.15, 0], 0.048, 0.04);   // upper arm
    limb([s * 0.29, 1.15, 0], [s * 0.33, 0.9, 0.02], 0.04, 0.03);  // forearm
    ell(s * 0.335, 0.85, 0.02, 0.03, 0.05, 0.02);     // hand
    limb([s * 0.09, 0.88, 0], [s * 0.1, 0.5, 0], 0.088, 0.06);    // thigh
    limb([s * 0.1, 0.5, 0], [s * 0.1, 0.1, 0], 0.058, 0.04);      // shin
    ell(s * 0.1, 0.04, 0.04, 0.045, 0.03, 0.095);     // foot
  }
  // spine (thin line of beads) + base ring
  const beads = new T.Group(); group.add(beads);
  for (let i = 0; i < 24; i++) { const m = new T.Mesh(new T.SphereGeometry(0.012, 8, 6), new T.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.5 })); m.position.set(0, 0.92 + i * 0.027, -0.075 + Math.sin(i / 3.5) * 0.008); beads.add(m); }
  const ring = new T.Mesh(new T.RingGeometry(0.42, 0.44, 64), new T.MeshBasicMaterial({ color: 0x3ee0c4, transparent: true, opacity: 0.5, side: T.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; scene.add(ring);
  const ring2 = new T.Mesh(new T.RingGeometry(0.6, 0.605, 64), new T.MeshBasicMaterial({ color: 0x5cc8ff, transparent: true, opacity: 0.25, side: T.DoubleSide })); ring2.rotation.x = -Math.PI / 2; ring2.position.y = 0.002; scene.add(ring2);

  const markers = calls.map((c) => {
    const col = new T.Color(STATUS_COLOR[c.status]);
    const core = new T.Mesh(new T.SphereGeometry(0.02, 16, 12), new T.MeshBasicMaterial({ color: col }));
    const halo = new T.Mesh(new T.SphereGeometry(0.04, 16, 12), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, depthWrite: false }));
    core.position.set(...c.pos); halo.position.set(...c.pos); group.add(core, halo);
    return { c, core, halo };
  });

  const applyMats = () => { wireM.visible = wire; solid.opacity = wire ? 0.2 : 0.85; solid.depthWrite = !wire; solid.needsUpdate = true; };
  applyMats();
  main.querySelector("#twire").addEventListener("click", (e) => { wire = !wire; e.currentTarget.classList.toggle("on", wire); applyMats(); }, { signal: ctx.signal });
  const applyConc = () => { for (const m of markers) { const v = !onlyConcerns || m.c.status !== "ok"; m.core.visible = v; m.halo.visible = v; const b = ov.querySelector(`[data-id="${m.c.id}"]`); if (b) b.dataset.hide = v ? "0" : "1"; } };
  applyConc();
  main.querySelector("#tconc").addEventListener("click", (e) => { onlyConcerns = !onlyConcerns; e.currentTarget.classList.toggle("on", onlyConcerns); applyConc(); }, { signal: ctx.signal });

  let rotY = 0.5, rotX = 0.05, dragging = false, lx = 0, ly = 0, W = 1, H = 1, tgtY = null;
  const snap = (face) => { const k = Math.round(rotY / (2 * Math.PI)); tgtY = k * 2 * Math.PI + face; };
  main.querySelectorAll("[data-v]").forEach((b) => b.addEventListener("click", () => { auto = false; main.querySelector("#tauto").classList.remove("on"); snap({ front: 0, side: Math.PI / 2, back: Math.PI }[b.dataset.v]); }, { signal: ctx.signal }));
  cv.addEventListener("pointerdown", (e) => { dragging = true; lx = e.clientX; ly = e.clientY; tgtY = null; target = null; cv.setPointerCapture(e.pointerId); }, { signal: ctx.signal });
  cv.addEventListener("pointermove", (e) => { if (!dragging) return; rotY += (e.clientX - lx) * 0.009; rotX = Math.max(-0.5, Math.min(0.5, rotX + (e.clientY - ly) * 0.004)); lx = e.clientX; ly = e.clientY; }, { signal: ctx.signal });
  const up = () => { dragging = false; };
  cv.addEventListener("pointerup", up, { signal: ctx.signal }); cv.addEventListener("pointercancel", up, { signal: ctx.signal });
  cv.addEventListener("wheel", (e) => { e.preventDefault(); camera.position.z = Math.max(1.6, Math.min(5, camera.position.z + e.deltaY * 0.002)); }, { signal: ctx.signal, passive: false });

  const resize = () => { const r = cv.parentElement.getBoundingClientRect(); W = Math.max(240, r.width); H = Math.max(300, r.height); renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); group.position.x = W > 900 ? -0.45 : 0; camera.position.z = Math.max(camera.position.z, W < 520 ? 4.1 : 3.7); ring.position.x = ring2.position.x = group.position.x; };
  const ro = new ResizeObserver(resize); ro.observe(cv.parentElement); resize();

  const v3 = new T.Vector3();
  let raf = 0, t0 = performance.now();
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const t = (now - t0) / 1000;
    if (target) { snap(target.front ? 0 : Math.PI); target = null; }
    if (tgtY != null) { rotY += (tgtY - rotY) * 0.12; if (Math.abs(tgtY - rotY) < 0.003) { rotY = tgtY; tgtY = null; } } else if (auto && !dragging) rotY += 0.004;
    group.rotation.y = rotY; group.rotation.x = rotX; group.updateMatrixWorld(true);
    for (const m of markers) { const k = m.c.status === "ok" ? 1 : 1 + 0.25 * Math.sin(t * (m.c.id === "heart" ? 5 : 2.5) + m.c.n); m.halo.scale.setScalar(k * 1.1); }
    renderer.render(scene, camera);
    for (const m of markers) {
      const b = ov.querySelector(`[data-id="${m.c.id}"]`); if (!b) continue;
      if (b.dataset.hide === "1") { b.style.display = "none"; continue; }
      v3.set(...m.c.pos); group.localToWorld(v3); const front = v3.z - group.position.z > -0.035; v3.project(camera);
      b.style.display = "flex"; b.style.left = ((v3.x * 0.5 + 0.5) * W).toFixed(1) + "px"; b.style.top = ((-v3.y * 0.5 + 0.5) * H).toFixed(1) + "px"; b.style.opacity = front ? "1" : "0.35"; b.style.zIndex = front ? "3" : "1";
    }
  };
  raf = requestAnimationFrame(frame);
  if (selId) select(selId);

  return () => { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); geos.forEach((g) => g.dispose()); solid.dispose(); wireM.dispose(); };
}
