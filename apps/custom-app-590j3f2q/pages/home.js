// Hello World page: self-contained, reads no room data.
import { esc } from "@corvic/live";

const GREETINGS = ["Hello", "Hola", "Bonjour", "Ciao", "Hallo", "こんにちは"];

export default async function render(ctx) {
  ctx.content.innerHTML = `
<main class="hello">
  <section class="hello-card">
    <div class="hello-badge">Hello World</div>
    <h1 id="greeting">Hello, World!</h1>
    <p>Your first app is up and running.</p>
    <form id="name-form" class="hello-form">
      <input id="name" type="text" placeholder="Your name" autocomplete="off" />
      <button type="submit">Say hello</button>
    </form>
    <button id="shuffle" type="button" class="secondary">Another language</button>
  </section>
</main>`;

  const root = ctx.content;
  const title = root.querySelector("#greeting");
  const input = root.querySelector("#name");
  let idx = 0;
  let who = "World";

  const paint = () => {
    title.innerHTML = `${esc(GREETINGS[idx])}, ${esc(who)}!`;
  };

  root.querySelector("#name-form").addEventListener("submit", (e) => {
    e.preventDefault();
    who = input.value.trim() || "World";
    paint();
  }, { signal: ctx.signal });

  root.querySelector("#shuffle").addEventListener("click", () => {
    idx = (idx + 1) % GREETINGS.length;
    paint();
  }, { signal: ctx.signal });
}
