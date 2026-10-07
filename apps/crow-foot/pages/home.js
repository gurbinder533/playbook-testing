// Crow's Foot is switched off. Every table, pipeline step and token that held people's GitHub
// connections or pull requests was removed, so this page reads and writes nothing.
import * as I from "../lib/icons.js";

export default async function render(ctx) {
  ctx.content.innerHTML = `<div class="cf dark"><div class="body"><div class="card connect">
    <div class="brand">${I.logo("logo")}<p class="wordmark">Crow&rsquo;s Foot</p></div>
    <h1>GitHub connections are switched off</h1>
    <p>This app no longer stores GitHub tokens or pull request data. Nothing you entered here is kept, and no GitHub account is connected.</p>
    <p>If you connected a token earlier, revoke it at <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">github.com/settings/tokens</a>.</p>
  </div></div></div>`;
  return undefined;
}
