// Works out which literature the other tabs actually cite, for the records.
// Every key comes from the same builders and the same pagecites.js the pages render with, and is then passed through the same relevance gate (citeOk)
// that cite()/ahc()/src() apply when drawing a chip. Nothing is added here that a page does not draw.
import { buildSignals, buildCauses, buildRuledOut, buildCallouts, AHC_BY } from "./analysis.js";
import { protocolCites } from "../pages/protocols.js";
import { citeOk, ruleOk } from "./refs.js";
import { pageCites } from "./pagecites.js";

export function citedKeys(st) {
  const c = new Set(), s = new Set(), a = new Set();
  const add = (set, arr) => (arr || []).forEach((k) => set.add(k));
  if (!st || st.empty) return { c, s, a };
  for (const g of buildSignals(st)) { add(c, g.cites); add(a, AHC_BY[g.id]); }
  for (const g of buildCauses(st)) { add(c, g.cites); add(a, AHC_BY[g.key]); }
  for (const r of buildRuledOut(st)) add(c, r.c);
  for (const g of buildCallouts(st)) if (g.status !== "na") { add(c, g.cites); add(a, AHC_BY[g.id]); }
  const p = protocolCites(st);
  add(c, [...p.c]); add(s, [...p.s]); add(a, [...p.a]);
  add(c, pageCites.homeBp(st)); add(c, pageCites.homeLdl(st)); add(c, pageCites.homeVat(st)); // gated by citeOk below, exactly as the Overview draws them
  if ((st.kinds.regional || []).some((r) => String(r.key).startsWith("fat|"))) add(c, pageCites.compFat);
  if ((st.kinds.regional || []).some((r) => String(r.key).startsWith("lean|"))) add(c, pageCites.compLean);
  if ((st.kinds.bmd || []).length) add(c, pageCites.compBmd);
  if ((st.kinds.gene_grid || []).length) add(c, pageCites.recGene);
  if (st.ev("retina").length) add(c, pageCites.recRetina);
  const pg = new Set([...pageCites.compFat, ...pageCites.compLean, ...pageCites.compBmd, ...pageCites.recGene, ...pageCites.recRetina]);
  for (const set of [c, s, a]) for (const k of [...set]) if (!(pg.has(k) ? ruleOk(k) : citeOk(k))) set.delete(k);
  return { c, s, a, x: p.x };
}
