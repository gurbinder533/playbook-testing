// Citations used directly by pages (not through the signal / cause / protocol builders). Both the pages and lib/cited.js read THIS file, so the
// References tab and the tabs it summarises cannot drift apart.
const has = (st, ...k) => k.some((x) => (st.series[x] || []).length > 0);
export const pageCites = {
  homeBp: (st) => (has(st, "bp_sys", "bp_dia") ? ["escEsh", "homeBp"] : []),
  homeLdl: (st) => (has(st, "ldl", "hdl") ? ["ldlCausal", "escEas"] : []),
  homeVat: (st) => (has(st, "dexa_fat_mass", "dexa_lean") ? ["vat"] : []),
  compFat: ["vat"],
  compLean: ["ewgsop", "sarcOb"],
  compBmd: ["boneRt", "glp1Bone"],
  recGene: ["gliomaGwas", "bccGwas", "skinPrs", "alcoholCancer", "aldh2"],
  recRetina: ["retinaCvd", "retinalAge", "glaucBp"]
};
