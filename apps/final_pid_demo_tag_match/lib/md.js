import { esc } from "@corvic/live";

// A small, safe markdown renderer for the assistant's replies. Every piece of text is escaped first; only the
// tags built here reach the page, so a reply can never add markup, links, images or scripts of its own.
const inline = (t) => {
  let s = esc(String(t));
  const codes = [];
  s = s.replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?!\*)/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
};

const LI = /^(\s*)([-*\u2022]|\d+[.)])\s+(.*)$/;
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const HEAD = /^(#{1,6})\s+(.*)$/;
const FENCE = /^\s*```/;
const SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const starts = (l, next) => FENCE.test(l) || HEAD.test(l) || HR.test(l) || LI.test(l) || (l.includes("|") && next != null && SEP.test(next));

export function md(src) {
  const lines = String(src ?? "").replace(/\r/g, "").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (FENCE.test(l)) {
      const buf = []; i++;
      while (i < lines.length && !FENCE.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = HEAD.exec(l))) { const tag = m[1].length === 1 ? "h3" : "h4"; out.push(`<${tag}>${inline(m[2])}</${tag}>`); i++; continue; }
    if (HR.test(l)) { out.push("<hr>"); i++; continue; }
    if (l.includes("|") && i + 1 < lines.length && SEP.test(lines[i + 1])) {
      const head = cells(l); i += 2; const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(`<div class="mdt"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_, k) => `<td>${inline(r[k] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    if (LI.test(l)) {
      const items = [];
      while (i < lines.length && (m = LI.exec(lines[i]))) { items.push({ d: m[1].replace(/\t/g, "    ").length, ord: /\d/.test(m[2]), t: m[3] }); i++; }
      let html = ""; const st = [];
      for (const it of items) {
        const tag = it.ord ? "ol" : "ul";
        while (st.length && it.d < st[st.length - 1].d) html += `</li></${st.pop().tag}>`;
        if (!st.length || it.d > st[st.length - 1].d) { html += `<${tag}>`; st.push({ d: it.d, tag }); }
        else html += "</li>";
        html += `<li>${inline(it.t)}`;
      }
      while (st.length) html += `</li></${st.pop().tag}>`;
      out.push(html);
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !(buf.length && starts(lines[i], lines[i + 1]))) buf.push(inline(lines[i++]));
    out.push(`<p>${buf.join("<br>")}</p>`);
  }
  return out.join("");
}
