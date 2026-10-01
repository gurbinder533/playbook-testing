import { esc } from "@corvic/live";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function fmt(value, formatter = integer) {
  return value == null || !Number.isFinite(Number(value)) ? "—" : formatter.format(Number(value));
}

export default async function render(ctx) {
  ctx.content.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <a class="brand" href="home" aria-current="page">
          <span class="brand-mark">H</span>
          <span>Hello Market</span>
        </a>
        <button class="reload" type="button" disabled>Loading…</button>
      </header>
      <section class="hero loading-card">
        <div class="eyebrow">POLYGON.IO · PREVIOUS MARKET SESSION</div>
        <h1>Hello, market 👋</h1>
        <p>Fetching the latest AAPL snapshot…</p>
      </section>
    </main>`;

  const reload = ctx.content.querySelector(".reload");

  try {
    const rows = await ctx.db.rows(`
      SELECT ticker, open, high, low, close, volume, volume_weighted_price,
             transactions, market_timestamp, fetched_at
      FROM stocks
      ORDER BY market_timestamp DESC
      LIMIT 1
    `);
    if (ctx.signal.aborted) return;

    const row = rows[0];
    if (!row) {
      ctx.content.querySelector(".loading-card").outerHTML = `
        <section class="hero empty-state">
          <div class="eyebrow">POLYGON.IO</div>
          <h1>Hello, market 👋</h1>
          <p>No stock snapshot is available yet. Run the AAPL market snapshot pipeline, then reload.</p>
        </section>`;
    } else {
      const open = Number(row.open);
      const close = Number(row.close);
      const change = Number.isFinite(open) && open !== 0 && Number.isFinite(close)
        ? ((close - open) / open) * 100
        : null;
      const positive = change == null || change >= 0;
      const range = Number(row.high) - Number(row.low);
      const closePosition = Number.isFinite(range) && range > 0
        ? Math.max(0, Math.min(100, ((close - Number(row.low)) / range) * 100))
        : 50;
      const marketDate = row.market_timestamp
        ? new Date(row.market_timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : "Latest session";
      const fetched = row.fetched_at ? new Date(row.fetched_at).toLocaleString() : "recently";

      ctx.content.querySelector(".loading-card").outerHTML = `
        <section class="hero">
          <div class="hero-copy">
            <div class="eyebrow">HELLO, MARKET · ${esc(marketDate)}</div>
            <div class="ticker-row">
              <div class="ticker-icon">A</div>
              <div>
                <h1>${esc(row.ticker || "AAPL")}</h1>
                <p>Apple Inc. · Previous market session</p>
              </div>
            </div>
          </div>
          <div class="price-block">
            <span class="price-label">Close</span>
            <strong>${fmt(row.close, money)}</strong>
            <span class="change ${positive ? "up" : "down"}">${positive ? "↗" : "↘"} ${change == null ? "—" : `${Math.abs(change).toFixed(2)}%`} vs open</span>
          </div>
        </section>

        <section class="metrics" aria-label="Market metrics">
          <article><span>Open</span><strong>${fmt(row.open, money)}</strong></article>
          <article><span>Day high</span><strong>${fmt(row.high, money)}</strong></article>
          <article><span>Day low</span><strong>${fmt(row.low, money)}</strong></article>
          <article><span>VWAP</span><strong>${fmt(row.volume_weighted_price, money)}</strong></article>
        </section>

        <section class="detail-grid">
          <article class="card range-card">
            <div class="card-heading"><div><span class="eyebrow">SESSION RANGE</span><h2>Where AAPL closed</h2></div><span class="pill">${esc(marketDate)}</span></div>
            <div class="range-track"><div class="range-fill" style="width:${closePosition.toFixed(1)}%"></div><span class="range-dot" style="left:${closePosition.toFixed(1)}%"></span></div>
            <div class="range-labels"><span>${fmt(row.low, money)} low</span><strong>${fmt(row.close, money)} close</strong><span>${fmt(row.high, money)} high</span></div>
          </article>
          <article class="card activity-card">
            <span class="eyebrow">TRADING ACTIVITY</span>
            <div class="activity-row"><span>Volume</span><strong>${fmt(row.volume, compact)}</strong></div>
            <div class="activity-row"><span>Transactions</span><strong>${fmt(row.transactions, compact)}</strong></div>
            <div class="activity-row"><span>Raw volume</span><strong>${fmt(row.volume)}</strong></div>
          </article>
        </section>

        <footer>Updated ${esc(fetched)} · from the latest pipeline run · Market data by Polygon.io</footer>`;
    }

    reload.disabled = false;
    reload.textContent = "Reload";
    reload.addEventListener("click", async () => {
      reload.disabled = true;
      reload.textContent = "Reloading…";
      try { await ctx.reload(); }
      catch (error) {
        reload.disabled = false;
        reload.textContent = "Try again";
        ctx.reportError(error);
      }
    }, { signal: ctx.signal });
  } catch (error) {
    if (ctx.signal.aborted) return;
    ctx.content.querySelector(".loading-card").innerHTML = `
      <div class="eyebrow">DATA UNAVAILABLE</div>
      <h1>Hello, market 👋</h1>
      <p class="error-note">The stock snapshot could not be loaded. ${esc(error.message || String(error))}</p>`;
    reload.disabled = false;
    reload.textContent = "Try again";
    reload.addEventListener("click", () => ctx.reload(), { signal: ctx.signal });
  }
}
