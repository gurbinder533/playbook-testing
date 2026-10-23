import { esc, WriteRejectedError, WriteSessionExpiredError } from "@corvic/live";

const UPDATE_PRICES = "/pipeline/22393";

// Module state outlives ctx.reload(): the module is imported once.
const written = new Map(); // id -> row appended this session (reads can lag)
let flash = "";
let confirming = ""; // id awaiting delete confirmation

const CURRENT = `SELECT id, symbol, updated_at, deleted FROM (
  SELECT *, row_number() OVER (PARTITION BY id ORDER BY updated_at DESC) AS rn FROM watchlist
) WHERE rn = 1 AND deleted IS NOT TRUE LIMIT 500`;

const PRICES = `SELECT symbol, name, price, change, change_pct, day_low, day_high, quoted_at FROM prices LIMIT 1000`;

const ms = (v) => new Date(v).getTime();
const fmt = (n, d = 2) => (n === null || n === undefined ? "—" : Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }));

async function loadEntries(ctx) {
  const rows = await ctx.db.rows(CURRENT, [], ctx.signal);
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const [id, row] of written) {
    const read = byId.get(id);
    if (read && ms(read.updated_at) >= ms(row.updated_at)) written.delete(id);
    else if (row.deleted) byId.delete(id);
    else byId.set(id, row);
  }
  return [...byId.values()].sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));
}

async function loadPrices(ctx) {
  try {
    const rows = await ctx.db.rows(PRICES, [], ctx.signal);
    return new Map(rows.map((r) => [String(r.symbol).toUpperCase(), r]));
  } catch (err) {
    if (ctx.signal.aborted) return new Map();
    ctx.reportError(err);
    return new Map();
  }
}

function quotedAt(s) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(s || ""));
  if (!m) return "";
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])).toLocaleString();
}

async function append(ctx, row, message) {
  try {
    await ctx.write.rows("watchlist", [row], { signal: ctx.signal });
  } catch (err) {
    if (err instanceof WriteSessionExpiredError) return "Your session expired — reload and try again. Nothing was saved.";
    if (err && err.kind === "write-sign-in-required") return err.message || "Login to use the app.";
    return err instanceof WriteRejectedError ? err.message : `Nothing was saved: ${err}`;
  }
  written.set(row.id, row);
  flash = message;
  await ctx.reload();
  return "";
}

export default async function render(ctx) {
  const msg = flash;
  flash = "";
  ctx.content.innerHTML = `
<div id="app">
  <header id="header">
    <div>
      <h1>My Watchlist</h1>
      <p class="sub">Private to you — nobody else can see your list.</p>
    </div>
    <div class="actions">
      <button type="button" id="update" class="btn">Update prices</button>
      <button type="button" id="reload" class="btn ghost">Reload</button>
    </div>
  </header>
  <div id="status" class="status" role="status">${esc(msg)}</div>
  <form id="add" class="add" autocomplete="off">
    <input id="sym" name="sym" placeholder="Ticker, e.g. AAPL" maxlength="12" required aria-label="Ticker symbol" />
    <button type="submit" class="btn primary" id="addbtn">Add</button>
  </form>
  <div id="err" class="err" role="alert"></div>
  <main id="list"><div class="load-note">Loading…</div></main>
</div>`;

  const $ = (s) => ctx.content.querySelector(s);
  const status = $("#status");
  const err = $("#err");

  let entries = [];
  let prices = new Map();
  try {
    [entries, prices] = await Promise.all([loadEntries(ctx), loadPrices(ctx)]);
  } catch (e) {
    if (ctx.signal.aborted) return;
    ctx.reportError(e);
    $("#list").innerHTML = `<div class="load-note">Couldn't load your watchlist: ${esc(e && e.message ? e.message : String(e))}</div>`;
    return;
  }
  if (ctx.signal.aborted) return;

  const list = $("#list");
  if (!entries.length) {
    list.innerHTML = `<div class="empty-note">Your watchlist is empty. Add a ticker above to start tracking it.</div>`;
  } else {
    const rows = entries.map((e) => {
      const sym = String(e.symbol).toUpperCase();
      const p = prices.get(sym);
      const up = p && p.change > 0;
      const down = p && p.change < 0;
      const cls = up ? "up" : down ? "down" : "";
      const sign = up ? "+" : "";
      const priceCell = p && p.price !== null && p.price !== undefined
        ? `<td class="num strong">${fmt(p.price)}</td>
           <td class="num ${cls}">${sign}${fmt(p.change)}</td>
           <td class="num ${cls}">${sign}${fmt(p.change_pct)}%</td>
           <td class="num muted">${fmt(p.day_low)} – ${fmt(p.day_high)}</td>`
        : `<td class="pending" colspan="4">Price pending — press “Update prices”</td>`;
      const action = confirming === e.id
        ? `<button type="button" class="btn small danger" data-confirm="${esc(e.id)}">Confirm</button>
           <button type="button" class="btn small ghost" data-cancel="1">Cancel</button>`
        : `<button type="button" class="btn small ghost" data-remove="${esc(e.id)}">Remove</button>`;
      return `<tr>
        <td><div class="sym">${esc(sym)}</div><div class="name muted">${esc(p && p.name ? p.name : "")}</div></td>
        ${priceCell}
        <td class="act">${action}</td>
      </tr>`;
    }).join("");
    const latest = [...prices.values()].map((p) => p.quoted_at).filter(Boolean).sort().pop();
    list.innerHTML = `
      <table class="wl">
        <thead><tr><th>Symbol</th><th class="num">Price (USD)</th><th class="num">Change</th><th class="num">Change %</th><th class="num">Day range</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="foot">${latest ? `Prices as of ${esc(quotedAt(latest))} (last update run). ` : ""}Prices refresh when you press “Update prices”, then “Reload”. Market data may be delayed.</p>`;
  }

  const opts = { signal: ctx.signal };

  $("#reload").addEventListener("click", () => { ctx.reload(); }, opts);

  const upd = $("#update");
  upd.addEventListener("click", async () => {
    upd.disabled = true;
    status.textContent = "Starting…";
    try {
      const response = await fetch(UPDATE_PRICES, { method: "POST", signal: ctx.signal });
      if (response.headers.get("x-corvic-error-reason") === "SIGN_IN_REQUIRED") {
        upd.disabled = false;
        status.textContent = "Login to use the app.";
        return;
      }
      if (response.status === 401 || response.status === 403) throw new Error("You can't start this update. Reload the page; if it still fails, ask the app's owner.");
      if (response.status === 429) throw new Error("Updated a lot recently. Try again later.");
      if (!response.ok) throw new Error(`Couldn't start the update (${response.status}). Try again in a minute.`);
      status.textContent = response.status === 202
        ? "An update is already running. Press Reload in a minute to see new prices."
        : "Update started. Press Reload in a minute to see new prices.";
    } catch (e) {
      if (ctx.signal.aborted) return;
      upd.disabled = false;
      status.textContent = e instanceof Error ? e.message : String(e);
      ctx.reportError(e);
    }
  }, opts);

  $("#add").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    err.textContent = "";
    const symbol = $("#sym").value.trim().toUpperCase();
    if (!/^[A-Z0-9.^-]{1,12}$/.test(symbol)) {
      err.textContent = "Enter a valid ticker (letters, numbers, . or -).";
      return;
    }
    if (entries.some((e) => String(e.symbol).toUpperCase() === symbol)) {
      err.textContent = `${symbol} is already on your watchlist.`;
      return;
    }
    const btn = $("#addbtn");
    btn.disabled = true;
    btn.textContent = "Adding…";
    const problem = await append(ctx, {
      id: crypto.randomUUID(),
      symbol,
      updated_at: new Date().toISOString(),
      deleted: false
    }, `${symbol} added. Press “Update prices” to fetch its price.`);
    if (problem && !ctx.signal.aborted) {
      err.textContent = problem;
      btn.disabled = false;
      btn.textContent = "Add";
    }
  }, opts);

  list.addEventListener("click", async (ev) => {
    const t = ev.target.closest("button");
    if (!t) return;
    if (t.dataset.remove) {
      confirming = t.dataset.remove;
      ctx.reload();
    } else if (t.dataset.cancel) {
      confirming = "";
      ctx.reload();
    } else if (t.dataset.confirm) {
      const entry = entries.find((e) => e.id === t.dataset.confirm);
      if (!entry) return;
      t.disabled = true;
      t.textContent = "Removing…";
      confirming = "";
      const problem = await append(ctx, {
        id: entry.id,
        symbol: entry.symbol,
        updated_at: new Date().toISOString(),
        deleted: true
      }, `${String(entry.symbol).toUpperCase()} removed.`);
      if (problem && !ctx.signal.aborted) {
        err.textContent = problem;
        t.disabled = false;
        t.textContent = "Confirm";
      }
    }
  }, opts);
}
