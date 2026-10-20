import { esc } from "@corvic/live";
import { setCiteContext } from "./refs.js";
export { esc };

export const PUBMED = "https://pubmed.ncbi.nlm.nih.gov/";
export const NAV = [
  ["home", "Overview"], ["body", "3D Body Map"], ["trends", "Trends"], ["composition", "Body Composition"],
  ["signals", "Signals"], ["rootcause", "Root Cause"], ["protocols", "Protocols"], ["records", "Records & Genetics"], ["references", "Literature References"]
];

export const STATUS_COLOR = { ok: "#3ee0c4", watch: "#ffb020", flag: "#ff7a59", crit: "#ff4d6d", na: "#5b6b8c" };
export const STATUS_LABEL = { ok: "In range", watch: "Watch", flag: "Out of range", crit: "High concern", na: "No data yet" };

// Reference ranges (lab ranges from the source reports where printed; guideline cut-offs otherwise).
export const M = {
  chol_total: { l: "Total cholesterol", u: "mmol/L", g: "Lipids", hi: 5.2, crit: 6.2, dp: 2, rng: "<5.2" },
  ldl: { l: "LDL cholesterol", u: "mmol/L", g: "Lipids", hi: 2.6, crit: 4.1, dp: 2, rng: "<2.6 (moderate-risk target)" },
  hdl: { l: "HDL cholesterol", u: "mmol/L", g: "Lipids", lo: 1.0, dp: 2, rng: ">1.0 (\u22651.6 optimal)" },
  tg: { l: "Triglycerides", u: "mmol/L", g: "Lipids", hi: 1.7, dp: 2, rng: "<1.7" },
  nonhdl: { l: "Non-HDL cholesterol", u: "mmol/L", g: "Lipids", hi: 3.4, dp: 2, rng: "<3.4" },
  hba1c: { l: "HbA1c", u: "%", g: "Glucose & insulin", hi: 5.6, crit: 6.4, dp: 1, rng: "<5.7 normal; 5.7\u20136.2 prediabetes" },
  glucose: { l: "Fasting glucose", u: "mmol/L", g: "Glucose & insulin", lo: 3.9, hi: 6.0, dp: 1, rng: "3.9\u20136.0" },
  insulin: { l: "Fasting insulin", u: "\u00b5IU/mL", g: "Glucose & insulin", lo: 2.6, hi: 24.9, dp: 1, rng: "2.6\u201324.9" },
  bp_sys: { l: "Systolic BP (clinic)", u: "mmHg", g: "Blood pressure & heart", hi: 129, crit: 139, dp: 0, rng: "<130 optimal; \u2265140 hypertension" },
  bp_dia: { l: "Diastolic BP (clinic)", u: "mmHg", g: "Blood pressure & heart", hi: 84, crit: 89, dp: 0, rng: "<85; \u226590 hypertension" },
  rhr: { l: "Resting heart rate", u: "bpm", g: "Blood pressure & heart", hi: 80, watch: 70, dp: 0, rng: "<70 good" },
  ascvd10: { l: "10-y ASCVD risk (retinal AI)", u: "%", g: "Blood pressure & heart", hi: 7.4, crit: 19.9, dp: 1, rng: "\u22657.5% = intermediate" },
  hscrp: { l: "hs-CRP", u: "mg/L", g: "Inflammation & vitamins", hi: 3, watch: 1, dp: 2, rng: "<1 low; 1\u20133 average; >3 high" },
  esr: { l: "ESR", u: "mm/hr", g: "Inflammation & vitamins", hi: 20, dp: 0, rng: "<21" },
  vitd: { l: "25-OH vitamin D", u: "nmol/L", g: "Inflammation & vitamins", lo: 75, hi: 150, crit: 250, dp: 0, rng: "75\u2013150 (toxicity risk >250)" },
  homocysteine: { l: "Homocysteine", u: "\u00b5mol/L", g: "Inflammation & vitamins", hi: 15, dp: 0, rng: "<15" },
  weight: { l: "Body weight (clinic log)", u: "kg", g: "Body composition", dp: 1 },
  bmi: { l: "BMI", u: "kg/m\u00b2", g: "Body composition", hi: 22.9, crit: 27.4, dp: 1, rng: "Asian: 18.5\u201322.9; \u226523 overweight" },
  waist: { l: "Waist circumference", u: "cm", g: "Body composition", hi: 90, dp: 0, rng: "<90 (Asia-Pacific, men)" },
  whr: { l: "Waist-hip ratio", u: "", g: "Body composition", hi: 0.89, dp: 2, rng: "<0.90" },
  dexa_weight: { l: "DEXA total mass", u: "kg", g: "Body composition", dp: 1 },
  dexa_fat_pct: { l: "Body fat (DEXA)", u: "%", g: "Body composition", hi: 25, crit: 30, dp: 1, rng: "target \u226425%" },
  dexa_fat_mass: { l: "Fat mass (DEXA)", u: "kg", g: "Body composition", dp: 1 },
  dexa_lean: { l: "Lean mass (DEXA)", u: "kg", g: "Body composition", dp: 1, rng: "target 60 kg" },
  dexa_vat: { l: "Visceral fat (DEXA)", u: "kg", g: "Body composition", hi: 0.5, dp: 2, rng: "optimal \u22640.5 kg; peer avg 1.1 kg" },
  dexa_tscore: { l: "Bone T-score (total body)", u: "", g: "Body composition", lo: -1, dp: 1, rng: "> -1" },
  almi: { l: "Appendicular lean mass index", u: "kg/m\u00b2", g: "Body composition", lo: 8.0, dp: 2, rng: "avg 8.5; target 9.3" },
  ffmi: { l: "Fat-free mass index", u: "kg/m\u00b2", g: "Body composition", lo: 19, dp: 1, rng: "avg 19\u201321.5" },
  android_gynoid: { l: "Android/gynoid fat ratio", u: "", g: "Body composition", hi: 1.0, dp: 2, rng: "<1.0 (apple shape above)" },
  trunk_fat_pct: { l: "Trunk fat", u: "%", g: "Body composition", hi: 29, dp: 1, rng: "peer avg 29%" },
  rer: { l: "Resting RER", u: "", g: "Body composition", hi: 0.9, dp: 2, rng: "~0.80\u20130.85 fasted" },
  testosterone: { l: "Testosterone (total)", u: "nmol/L", g: "Hormones & thyroid", lo: 6.6, hi: 25.7, watchLo: 10, dp: 1, rng: "6.6\u201325.7 lab range (low-normal <10 flagged as watch)" },
  oestradiol: { l: "Oestradiol", u: "pmol/L", g: "Hormones & thyroid", lo: 41, hi: 159, dp: 0, rng: "41\u2013159" },
  cortisol: { l: "Cortisol (am)", u: "nmol/L", g: "Hormones & thyroid", lo: 133, hi: 537, dp: 0, rng: "133\u2013537" },
  dheas: { l: "DHEA-S", u: "\u00b5mol/L", g: "Hormones & thyroid", lo: 1.2, hi: 8.98, dp: 2, rng: "1.2\u20139.0" },
  pth: { l: "Parathyroid hormone", u: "pmol/L", g: "Hormones & thyroid", lo: 1.6, hi: 6.9, dp: 1, rng: "1.6\u20136.9" },
  ft4: { l: "Free T4", u: "pmol/L", g: "Hormones & thyroid", lo: 9, hi: 25, dp: 1, rng: "9\u201325" },
  tsh: { l: "TSH", u: "mIU/L", g: "Hormones & thyroid", lo: 0.4, hi: 4.7, dp: 2, rng: "0.4\u20134.7" },
  ft3: { l: "Free T3", u: "pmol/L", g: "Hormones & thyroid", lo: 3.5, hi: 6.5, dp: 1, rng: "3.5\u20136.5" },
  hb: { l: "Haemoglobin", u: "g/dL", g: "Blood count & iron", lo: 13.5, hi: 17.5, dp: 1, rng: "13.5\u201317.5" },
  hct: { l: "Haematocrit", u: "%", g: "Blood count & iron", lo: 41, hi: 53, watch: 50, dp: 0, rng: "41\u201353" },
  wbc: { l: "White cells", u: "\u00d710\u2079/L", g: "Blood count & iron", lo: 4, hi: 11, dp: 1, rng: "4\u201311" },
  platelets: { l: "Platelets", u: "\u00d710\u2079/L", g: "Blood count & iron", lo: 150, hi: 450, dp: 0, rng: "150\u2013450" },
  eos: { l: "Eosinophils (abs)", u: "\u00d710\u2079/L", g: "Blood count & iron", hi: 0.5, dp: 2, rng: "<0.5" },
  ferritin: { l: "Ferritin", u: "\u00b5g/L", g: "Blood count & iron", lo: 20, hi: 300, dp: 0, rng: "20\u2013300" },
  iron: { l: "Serum iron", u: "\u00b5mol/L", g: "Blood count & iron", lo: 10, hi: 30, dp: 1, rng: "10\u201330" },
  creatinine: { l: "Creatinine", u: "\u00b5mol/L", g: "Kidney", lo: 50, hi: 116, dp: 0, rng: "50\u2013116" },
  egfr: { l: "eGFR", u: "mL/min/1.73m\u00b2", g: "Kidney", lo: 60, watchLo: 90, dp: 0, rng: "\u226590 normal" },
  urea: { l: "Urea", u: "mmol/L", g: "Kidney", lo: 2.5, hi: 8.5, dp: 1, rng: "2.5\u20138.5" },
  uric: { l: "Uric acid", u: "mmol/L", g: "Kidney", lo: 0.18, hi: 0.47, dp: 2, rng: "0.18\u20130.47" },
  potassium: { l: "Potassium", u: "mmol/L", g: "Kidney", lo: 3.5, hi: 5.3, dp: 1, rng: "3.5\u20135.3" },
  sodium: { l: "Sodium", u: "mmol/L", g: "Kidney", lo: 135, hi: 145, dp: 0, rng: "135\u2013145" },
  alt: { l: "ALT", u: "U/L", g: "Liver", hi: 50, dp: 0, rng: "<51" },
  ast: { l: "AST", u: "U/L", g: "Liver", hi: 50, dp: 0, rng: "<51" },
  ggt: { l: "GGT", u: "U/L", g: "Liver", hi: 60, dp: 0, rng: "<61" },
  alp: { l: "Alkaline phosphatase", u: "U/L", g: "Liver", lo: 30, hi: 150, dp: 0, rng: "30\u2013150" },
  albumin: { l: "Albumin", u: "g/L", g: "Liver", lo: 35, hi: 50, dp: 0, rng: "35\u201350" },
  bili: { l: "Bilirubin (total)", u: "\u00b5mol/L", g: "Liver", hi: 21, dp: 1, rng: "<21" },
  psa: { l: "PSA", u: "\u00b5g/L", g: "Tumour markers", hi: 3.5, dp: 2, rng: "<3.5 (age 50\u201359)" },
  cea: { l: "CEA", u: "\u00b5g/L", g: "Tumour markers", hi: 5, dp: 1, rng: "<5.0" },
  afp: { l: "AFP", u: "\u00b5g/L", g: "Tumour markers", hi: 7, dp: 1, rng: "<7" }
};
export const GROUPS = ["Lipids", "Glucose & insulin", "Blood pressure & heart", "Body composition", "Hormones & thyroid", "Inflammation & vitamins", "Blood count & iron", "Kidney", "Liver", "Tumour markers"];

// Markers the baseline records never had but other records may bring, with guideline cut-offs (stated in each range text).
Object.assign(M, {
  apob: { l: "ApoB", u: "g/L", g: "Lipids", hi: 0.9, crit: 1.3, dp: 2, rng: "<0.9 (<0.7 for high risk)" },
  lpa: { l: "Lipoprotein(a)", u: "nmol/L", g: "Lipids", hi: 74.9, crit: 199, dp: 0, rng: "<75 nmol/L (about <30 mg/dL); once-in-a-lifetime test" },
  cac: { l: "Coronary calcium score", u: "Agatston", g: "Blood pressure & heart", watch: 0, hi: 99, crit: 399, dp: 0, rng: "0 = none; 1\u201399 mild; 100+ moderate; 400+ high" },
  vo2max: { l: "VO2 max", u: "mL/kg/min", g: "Body composition", lo: 35, dp: 1, rng: "men 50\u201359: about 35+ fair\u2013good (norm tables differ)" },
  grip: { l: "Grip strength", u: "kg", g: "Body composition", lo: 27, dp: 1, rng: ">27 kg (EWGSOP2 sarcopenia cut-off, men)" },
  rmr: { l: "Resting metabolic rate", u: "kcal/day", g: "Body composition", dp: 0 }
});
// Person-independent defaults: adult male reference ranges unless the records say female (population-specific cut-offs are named in each range text).
Object.assign(M.rhr, { rng: "<70 good" });
Object.assign(M.ascvd10, { l: "10-y ASCVD risk (estimate)" });
Object.assign(M.bp_sys, { l: "Systolic BP" });
Object.assign(M.bp_dia, { l: "Diastolic BP" });
Object.assign(M.weight, { l: "Body weight" });
Object.assign(M.bmi, { hi: 24.9, crit: 29.9, rng: "18.5–24.9 (WHO); ≥25 overweight, ≥30 obese; lower cut-offs apply in Asian populations" });
Object.assign(M.waist, { hi: 94, rng: "<94 men, <80 women (IDF; <90 men for South/East Asian)" });
Object.assign(M.whr, { hi: 0.89, rng: "<0.90 men, <0.85 women" });
Object.assign(M.dexa_lean, { rng: "" });
Object.assign(M.dexa_vat, { rng: "optimal ≤0.5 kg (DEXA); varies by scanner" });
Object.assign(M.almi, { lo: 7.0, rng: "<7.0 low in men, <5.5 in women (EWGSOP2)" });
Object.assign(M.ffmi, { lo: 18, rng: "men typically 18–22; women 15–18" });
Object.assign(M.testosterone, { rng: "6.6–25.7 typical adult male range (<10 flagged as watch)" });
Object.assign(M.psa, { hi: 4.0, rng: "<4.0 (age-dependent: lower under 50, higher over 70)" });
Object.assign(M.vo2max, { rng: "about 35+ for adult men (norms fall with age)" });
Object.assign(M.grip, { rng: ">27 kg men (EWGSOP2 cut-off)" });
// Markers the template baseline did not list: label, unit and group only. Reference ranges come from the ranges PRINTED on the patient's own reports (applied in applyPrinted below);
// the few guideline cut-offs here are used only when no report prints a range, and are labelled as guidelines.
const mk = (l, u, g, dp, extra = {}) => ({ l, u, g, dp, ...extra });
Object.assign(M, {
  chol_hdl_ratio: mk("Cholesterol / HDL ratio", "", "Lipids", 1),
  hba1c_ifcc: mk("HbA1c (IFCC)", "mmol/mol", "Glucose & insulin", 0),
  calcium: mk("Calcium", "mmol/L", "Kidney", 2), phosphate: mk("Phosphate", "mmol/L", "Kidney", 2), chloride: mk("Chloride", "mmol/L", "Kidney", 0),
  mcr: mk("Urine microalbumin / creatinine", "\u00b5g/mg Cr", "Kidney", 0),
  protein_total: mk("Total protein", "g/L", "Liver", 0), globulin: mk("Globulin", "g/L", "Liver", 0), ag_ratio: mk("Albumin / globulin ratio", "", "Liver", 1),
  rbc: mk("Red cell count", "\u00d710\u00b9\u00b2/L", "Blood count & iron", 2), mcv: mk("Mean cell volume", "fL", "Blood count & iron", 1), mch: mk("Mean cell haemoglobin", "pg", "Blood count & iron", 1),
  mchc: mk("Mean cell Hb concentration", "g/dL", "Blood count & iron", 1), rdw: mk("Red cell distribution width", "%", "Blood count & iron", 1), mpv: mk("Mean platelet volume", "fL", "Blood count & iron", 1),
  neut_pct: mk("Neutrophils %", "%", "Blood count & iron", 1), lymph_pct: mk("Lymphocytes %", "%", "Blood count & iron", 1), mono_pct: mk("Monocytes %", "%", "Blood count & iron", 1),
  eos_pct: mk("Eosinophils %", "%", "Blood count & iron", 1), baso_pct: mk("Basophils %", "%", "Blood count & iron", 1),
  neut_abs: mk("Neutrophils (abs)", "\u00d710\u2079/L", "Blood count & iron", 2), lymph_abs: mk("Lymphocytes (abs)", "\u00d710\u2079/L", "Blood count & iron", 2),
  mono_abs: mk("Monocytes (abs)", "\u00d710\u2079/L", "Blood count & iron", 2), baso_abs: mk("Basophils (abs)", "\u00d710\u2079/L", "Blood count & iron", 2),
  vitd2: mk("25-OH vitamin D2", "nmol/L", "Inflammation & vitamins", 0),
  ca199: mk("CA 19-9", "U/mL", "Tumour markers", 1),
  pr: mk("ECG PR interval", "ms", "Blood pressure & heart", 0, { hi: 200, rng: "guideline: 120\u2013200 ms (read by AI from the tracing; verify)" }),
  qrsd: mk("ECG QRS duration", "ms", "Blood pressure & heart", 0, { hi: 120, rng: "guideline: <120 ms" }),
  qt: mk("ECG QT interval", "ms", "Blood pressure & heart", 0),
  qtc: mk("ECG QTc", "ms", "Blood pressure & heart", 0, { hi: 450, crit: 500, rng: "guideline: <450 ms men, <460 women" }),
  vfa: mk("Visceral fat area", "cm\u00b2", "Body composition", 1, { hi: 100, rng: "guideline (InBody): <100 cm\u00b2" }),
  bf_form: mk("Body fat (screening form)", "%", "Body composition", 1), height: mk("Height", "cm", "Body composition", 1),
  hbs_ab: mk("Hepatitis B surface antibody", "mIU/mL", "Immunity & infection", 0, { lo: 10, rng: "guideline: >10 mIU/mL = immune" }),
  ebv_vca: mk("EBV capsid antigen IgA (titre)", "titre", "Immunity & infection", 0), ebv_ea: mk("EBV early antigen IgA (titre)", "titre", "Immunity & infection", 0),
  hpylori: mk("H. pylori IgG", "U/mL", "Immunity & infection", 1), ra_factor: mk("Rheumatoid factor", "IU/mL", "Immunity & infection", 0),
  gb_polyp: mk("Gallbladder polyp size (ultrasound)", "cm", "Imaging & eye measurements", 1), kidney_cyst: mk("Left kidney cyst size (ultrasound)", "cm", "Imaging & eye measurements", 1),
  iop_r: mk("Eye pressure, right", "mmHg", "Imaging & eye measurements", 1, { hi: 21, rng: "guideline: <21 mmHg" }), iop_l: mk("Eye pressure, left", "mmHg", "Imaging & eye measurements", 1, { hi: 21, rng: "guideline: <21 mmHg" })
});
Object.assign(M.trunk_fat_pct, { hi: undefined, rng: "" });
for (const k of ["ebv_vca", "ebv_ea", "gb_polyp", "kidney_cyst"]) M[k].trendWatch = true;
Object.assign(M.dexa_lean, { rng: "" });
Object.assign(M.dexa_tscore, { l: "Bone T-score (total body)" });
Object.assign(M.almi, { lo: 7.0, rng: "guideline: <7.0 kg/m\u00b2 low in men (AWGS/EWGSOP2 cut-offs differ by method)" });
Object.assign(M.esr, { hi: 20, rng: "guideline: <21 mm/hr" });
const SCAN_BASE = { dexa_weight: "Total mass", dexa_fat_pct: "Body fat", dexa_fat_mass: "Fat mass", dexa_lean: "Lean / fat-free mass", dexa_vat: "Visceral fat", vfa: "Visceral fat area", dexa_tscore: "Bone T-score", almi: "Muscle index (ALMI/SMI)", ffmi: "Fat-free mass index", trunk_fat_pct: "Trunk fat", android_gynoid: "Android/gynoid fat ratio" };
const F_OVR = {
  hdl: { lo: 1.3, rng: ">1.3 (≥1.6 optimal)" },
  waist: { hi: 80, rng: "<80 (IDF)" }, whr: { hi: 0.84, rng: "<0.85" },
  dexa_fat_pct: { hi: 32, crit: 38, rng: "target ≤32%" },
  testosterone: { lo: 0.3, hi: 2.4, watchLo: undefined, rng: "0.3–2.4 typical adult female range (assays differ)" },
  oestradiol: { lo: undefined, hi: undefined, rng: "varies with cycle and menopause: use the lab's own range" },
  hb: { lo: 12, hi: 15.5, rng: "12–15.5" }, hct: { lo: 36, hi: 46, watch: undefined, rng: "36–46" },
  ferritin: { lo: 15, hi: 200, rng: "15–200" }, creatinine: { lo: 45, hi: 90, rng: "45–90" },
  uric: { lo: 0.15, hi: 0.38, rng: "0.15–0.38" }, alt: { hi: 35, rng: "<36" }, ast: { hi: 35, rng: "<36" }, ggt: { hi: 40, rng: "<41" },
  almi: { lo: 5.5, rng: "<5.5 low (EWGSOP2)" }, ffmi: { lo: 15, rng: "women typically 15–18" },
  grip: { lo: 16, rng: ">16 kg women (EWGSOP2 cut-off)" }, vo2max: { lo: 28, rng: "about 28+ for adult women (norms fall with age)" },
  psa: { hi: undefined, rng: "not applicable" }
};
const M_BASE = JSON.parse(JSON.stringify(M));
export function applyProfile(p) {
  for (const k of Object.keys(F_OVR)) if (M_BASE[k]) M[k] = p && p.sex === "female" ? { ...M_BASE[k], ...F_OVR[k] } : { ...M_BASE[k] };
}
export const EXTRA = "Other markers";
export const groupsOf = (st) => GROUPS.filter((g) => Object.keys(M).some((k) => M[k].g === g && st.series[k] && st.series[k].length));
const ONE_SIDED = { hdl: "lo", tg: "hi", ldl: "hi", chol_total: "hi", nonhdl: "hi", apob: "hi", lpa: "hi", hscrp: "hi", alt: "hi", ast: "hi", ggt: "hi", cea: "hi", afp: "hi", ca199: "hi", psa: "hi", bili: "hi", esr: "hi", eos: "hi", eos_pct: "hi", baso_pct: "hi", baso_abs: "hi", mcr: "hi", hbs_ab: "lo", glucose: "both", ldh: "hi", uric: "hi" };
const tok = (d, k) => { const m = new RegExp("\\[" + k + "=([^\\]]*)\\]").exec(d || ""); return m ? m[1] : ""; };
/** Reads units, groups, scan type and the reference range PRINTED on the patient's own reports from the records, and applies them to the marker dictionary. Creates any marker (and group) the template does not know. */
function applyPrinted(rows) {
  const meta = {}, types = new Set();
  const ms = rows.filter((r) => r.kind === "metric").slice().sort((a, b) => String(a.obs_date).localeCompare(String(b.obs_date)));
  for (const r of ms) {
    const m = meta[r.key] || (meta[r.key] = {});
    const u = tok(r.detail, "u"), g = tok(r.detail, "g"), s = tok(r.detail, "s");
    if (u) m.u = u; if (g) m.g = g; if (s) types.add(s); if (r.title) m.title = r.title;
    const pm = /\[r=([^~\]]*)~([^|\]]*)\|([^\]]*)\]/.exec(r.detail || "");
    if (pm) m.pr = { lo: pm[1] === "" ? null : Number(pm[1]), hi: pm[2] === "" ? null : Number(pm[2]), text: pm[3], d: r.obs_date };
  }
  const label = types.size ? [...types].sort().join(" / ") : "body scan";
  for (const k of Object.keys(SCAN_BASE)) if (M[k]) M[k].l = SCAN_BASE[k] + " (" + label + ")";
  for (const [k, m] of Object.entries(meta)) {
    if (!M[k]) { const pretty = String(k).replace(/^x_/, "").replace(/_/g, " "); M[k] = { l: m.title || pretty.charAt(0).toUpperCase() + pretty.slice(1), u: m.u || "", g: m.g || EXTRA, dp: 2 }; }
    const c = M[k], pr = m.pr;
    if (!GROUPS.includes(c.g)) GROUPS.push(c.g);
    if (pr && (pr.lo != null || pr.hi != null)) {
      // Markers where only one side of a printed range is clinically a problem: the other side is shown in the range text but not flagged.
      const side = ONE_SIDED[k];
      const plo = side === "hi" ? null : pr.lo, phi = side === "lo" ? null : pr.hi;
      if (plo != null) c.lo = plo; else delete c.lo;
      if (phi != null) c.hi = phi; else delete c.hi;
      if (side && ((side === "hi" && pr.lo != null) || (side === "lo" && pr.hi != null))) pr.text += side === "hi" ? " \u2014 only values above the upper limit are flagged" : " \u2014 only values below the lower limit are flagged";
      if (plo == null && phi == null) { c.rng = `report prints: ${pr.text}`; continue; }
      delete c.watch; delete c.watchLo; delete c.critLo;
      if (c.crit != null && !(pr.hi != null && c.crit > pr.hi)) delete c.crit;
      c.rng = `${pr.text} (printed on the ${dstr(pr.d)} report)`; c.printed = true;
    } else if (pr && pr.text && !/report prints/.test(c.rng || "")) c.rng = `${c.rng ? c.rng + " \u00b7 " : ""}report prints: ${pr.text}`;
    else if ((c.lo != null || c.hi != null || c.watch != null) && !/guideline cut-off|printed/.test(c.rng || "")) c.rng = `${c.rng ? c.rng + " \u00b7 " : ""}guideline cut-off (no range printed on the reports)`;
  }
  return { types: [...types], label };
}
/** One plain-language sentence about the body-composition method(s) actually present in the records. */
export function scanBlurb(st) {
  const t = st.scanTypes || [];
  const d = t.includes("DEXA") ? "DEXA is a whole-body X-ray scan that separates fat, lean tissue and bone." : "", i = t.includes("InBody") ? "InBody is a bioelectrical-impedance scan: it estimates fat, muscle and body water from electrical resistance, so values are estimates and scan-to-scan noise of a few % is normal." : "";
  return [d, i].filter(Boolean).join(" ") || "Body-composition values come from the body-scan, weight and measurement reports found in the records.";
}

// No person-specific exclusions ship with the app: every reading in the records is analysed.
// Exclusions are read from the records table (event_exclusion rows), never hard-coded.


/** Names that identify a wellness therapy or treatment session. A therapy row is shown only if its own title/detail matches one of these. */
export const WELLNESS = /pemf|pulsed electromagnetic|red.?light|near.?infrared|photobiomod|light therapy|laser therapy|acupunctur|acupressure|dry needling|moxibustion|cupping|\bnad\+?|\bnmn\b|iv (drip|infusion|therapy|vitamin)|infusion|vitamin c (drip|infusion)|myers|glutathione|chelation|hyperbaric|\bhbot\b|eecp|counterpulsation|ozone|sauna|infrared|cryo|cold (plunge|exposure|immersion)|ice bath|float(ation)? tank|massage|chiropract|osteopath|reiki|ayurved|\btcm\b|traditional chinese|herbal|homeopath|naturopath|detox|colon(ic| hydrotherapy)|hydrotherapy|enema|stem.?cell|\bnk\b|natural killer|plasma exchange|\bprp\b|platelet.rich|peptide|shockwave|microneedling|ketamine|breathwork|tirzepatide|semaglutide|liraglutide|mounjaro|ozempic|wegovy|testosterone (injection|replacement)|hormone (replacement|therapy)|physiotherap|physical therapy|hypnotherap|neurofeedback|tms\b|transcranial|ultrasound therapy|oxygen therapy|mesotherapy|lymphatic drainage/i;
export const f = (v, dp = 1) => (v == null || Number.isNaN(Number(v)) ? "\u2014" : Number(v).toFixed(dp));
export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
export const dstr = (d) => { const t = new Date(d + "T00:00:00Z"); return t.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); };
export const mstr = (d) => { const t = new Date(d + "T00:00:00Z"); return t.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }); };
// The subject's name, sex and age are read from the documents (the extractor writes "patient: … | dob: … | sex: … | age: …" on each document row).
function profileOf(rows) {
  const cnt = {}, sexes = { male: 0, female: 0 };
  let dob = "", ageAt = null;
  for (const r of rows) {
    if (r.kind !== "doc" || !r.detail) continue;
    const g = {};
    for (const part of String(r.detail).split("|")) { const i = part.indexOf(":"); if (i > 0) g[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim(); }
    if (g.patient) cnt[g.patient] = (cnt[g.patient] || 0) + 1;
    if (!dob && /^\d{4}-\d{2}-\d{2}$/.test(g.dob || "")) dob = g.dob;
    const s = (g.sex || "").toLowerCase();
    if (s === "m" || s === "male" || s === "man") sexes.male++; else if (s === "f" || s === "female" || s === "woman") sexes.female++;
    const a = Number(g.age);
    if (!ageAt && a > 0 && a < 120 && /^\d{4}-/.test(r.obs_date || "")) ageAt = { a, d: r.obs_date };
  }
  const names = Object.keys(cnt).sort((x, y) => cnt[y] - cnt[x]);
  const yrs = (d) => Math.floor((Date.now() - Date.parse(d + "T00:00:00Z")) / (365.25 * 864e5));
  const p = { name: names[0] || "", names, sex: sexes.male > sexes.female ? "male" : sexes.female > sexes.male ? "female" : "", dob, age: dob ? yrs(dob) : ageAt ? ageAt.a + yrs(ageAt.d) : null };
  return p;
}
export function subtitle(st) {
  const p = st.profile, n = (st.kinds.doc || []).length;
  return [p.name || "Name", p.age != null ? p.age + " y" : "Age", p.sex || "Gender"].join(" · ") + " · " + (n ? `built from ${n} health file${n > 1 ? "s" : ""}` : "no records yet");
}
/** Shown instead of a page's content while no records exist yet. Returns true when it rendered. */
export function gate(main, st, title, extra = "") {
  if (!st.empty) return false;
  main.innerHTML = `<h1>${esc(title)}</h1>${extra}<div class="card upnote"><b>No health records yet.</b> The records table bound to this app is empty. When health records are loaded into it, the person's name, age and sex are read from the documents, and every chart, flag, signal and protocol is computed from the data.</div>`;
  return true;
}

export function statusOf(k, v) {
  const c = M[k];
  if (!c || v == null) return "ok";
  if ((c.crit != null && v > c.crit) || (c.critLo != null && v < c.critLo)) return "crit";
  if ((c.hi != null && v > c.hi) || (c.lo != null && v < c.lo)) return "flag";
  if ((c.watch != null && v > c.watch) || (c.watchLo != null && v < c.watchLo)) return "watch";
  return "ok";
}
export const worst = (a, b) => { const o = ["ok", "watch", "flag", "crit"]; return o.indexOf(a) >= o.indexOf(b) ? a : b; };

export function makeStats(rows) {
  const okDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "");
  rows = (rows || []).filter((r) => r && r.kind && (r.kind !== "metric" || okDate(r.obs_date)) && (!String(r.kind).startsWith("event_") || okDate(r.obs_date)));
  const profile = profileOf(rows);
  applyProfile(profile);
  const scan = applyPrinted(rows);
  const EXCL = rows.filter((r) => r.kind === "event_exclusion").map((r) => ({ key: r.key, date: r.obs_date, why: [r.title, r.detail].filter(Boolean).join(" \u2014 ") }));
  const series = {}, excl = {}, events = [], kinds = {};
  for (const r of rows) {
    if (r.kind === "metric") {
      const pt = { d: r.obs_date, t: Date.parse(r.obs_date + "T00:00:00Z"), v: Number(r.value), src: r.source, up: false, note: /converted|approximate|date|lab note|detection/.test(r.detail || "") ? String(r.detail).replace(/\[[a-z]=[^\]]*\]/g, "").trim() : "" };
      const ex = EXCL.find((e) => e.key === r.key && e.date === r.obs_date);
      if (ex) { pt.why = ex.why; (excl[r.key] = excl[r.key] || []).push(pt); }
      else (series[r.key] = series[r.key] || []).push(pt);
    } else if (String(r.kind).startsWith("event_")) {
      // A therapy event counts only when it names a specific wellness therapy, treatment or treatment drug. Clinic visits, registrations and consultations are not therapy sessions.
      const ty = r.kind === "event_therapy" && !WELLNESS.test(`${r.title || ""} ${r.detail || ""}`) ? "visit" : r.kind.slice(6);
      events.push({ type: ty, key: r.key, start: r.obs_date, end: r.obs_end, n: Number(r.value), title: r.title, detail: r.detail, src: r.source,
        t: Date.parse(r.obs_date + "T00:00:00Z"), t2: r.obs_end ? Date.parse(r.obs_end + "T00:00:00Z") : null });
    } else (kinds[r.kind] = kinds[r.kind] || []).push(r);
  }
  for (const k in series) series[k].sort((a, b) => a.t - b.t);
  const vals = (k) => (series[k] || []).map((p) => p.v);
  const lastOf = (k) => (series[k] && series[k].length ? series[k][series[k].length - 1].v : null);
  const st = {
    series, excl, events, kinds, rows: rows.length, vals, profile, empty: rows.length === 0, scanTypes: scan.types, scanLabel: scan.label,
    last: (k) => { const s = series[k]; return s && s.length ? s[s.length - 1] : null; },
    first: (k) => { const s = series[k]; return s && s.length ? s[0] : null; },
    count: (k) => (series[k] || []).length,
    avg: (k) => mean(vals(k)),
    ev: (type) => events.filter((e) => e.type === type),
    delta: (k) => { const s = series[k]; return s && s.length > 1 ? s[s.length - 1].v - s[0].v : null; }
  };
  st.flagged = new Set(Object.keys(series).filter((k) => M[k] && series[k].length && statusOf(k, series[k][series[k].length - 1].v) !== "ok"));
  st.discordantThyroid = lastOf("ft4") != null && lastOf("tsh") != null && statusOf("ft4", lastOf("ft4")) !== "ok" && statusOf("tsh", lastOf("tsh")) === "ok";
  setCiteContext(st);
  return st;
}

let cache = null;
export const resetData = () => { cache = null; };
const J = (s, d) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch (_) { return d; } };
/** Rows of the generated `proto` table -> protocol objects. The app ships NO protocol text: every card is a row written by the protocol step after the analysis. */
export function parseProtocols(rows) {
  return (rows || []).map((r) => ({ ord: Number(r.ord) || 0, kind: r.kind || "protocol", title: r.title || "", fit: r.fit || "mid", fitT: r.fit_text || "", what: r.what || "", why: r.why_help || "", caution: r.caution || "", whoNote: r.who_note || "",
    how: J(r.how, []), targets: J(r.targets, []), refs: J(r.refs, []), week: J(r.week, []), basis: r.basis || "", generated: r.generated || "" })).sort((a, b) => a.ord - b.ord);
}
const COLS = "kind, key, obs_date, obs_end, value, title, detail, source";
export async function loadData(ctx) {
  if (!cache) {
    // rec = the normalised records table.
    let rows = [];
    try { rows = await ctx.db.rows(`SELECT ${COLS} FROM rec ORDER BY obs_date LIMIT 20000`, [], ctx.signal); } catch (e) { if (ctx.signal.aborted) throw e; rows = []; }
    cache = makeStats(rows);
    let prows = [];
    try { prows = await ctx.db.rows("SELECT ord, kind, title, fit, fit_text, what, how, why_help, caution, who_note, targets, refs, week, basis, generated FROM proto ORDER BY ord LIMIT 200", [], ctx.signal); } catch (e) { if (ctx.signal.aborted) throw e; prows = []; }
    cache.protocols = parseProtocols(prows);
    try { (await import("./analysis.js")).topicStates(cache); } catch (e) { /* topics are optional for references */ }
  }
  const sm = ctx.content.querySelector(".brand small");
  if (sm) sm.textContent = subtitle(cache);
  return cache;
}


export function loadScript(src) {
  const existing = document.head.querySelector(`script[src="${src}"]`);
  if (existing) return existing.corvicLoaded;
  const script = document.createElement("script");
  script.src = src;
  script.corvicLoaded = new Promise((resolve, reject) => {
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error(`could not load ${src}`)));
  });
  document.head.append(script);
  return script.corvicLoaded;
}

// Header logo: the same wireframe figure as the 3D body map (front view), drawn from the same body parts.
function logoSvg() {
  const S = 100, X = (x) => (x * S).toFixed(1), Y = (y) => (184 - y * S).toFixed(1), o = [];
  const ell = (x, y, rx, ry, mesh = true) => {
    const cx = X(x), cy = Y(y), a = rx * S, b = ry * S;
    o.push(`<ellipse cx="${cx}" cy="${cy}" rx="${a.toFixed(1)}" ry="${b.toFixed(1)}"/>`);
    if (mesh) o.push(`<ellipse class="i" cx="${cx}" cy="${cy}" rx="${(a * 0.5).toFixed(1)}" ry="${b.toFixed(1)}"/><line class="i" x1="${(cx - a).toFixed(1)}" y1="${cy}" x2="${(+cx + a).toFixed(1)}" y2="${cy}"/>`);
  };
  const limb = (a, b, r1, r2) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L, P = (p, r, k) => `${X(p[0] + nx * r * k)},${Y(p[1] + ny * r * k)}`;
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], rm = (r1 + r2) / 2;
    o.push(`<polygon points="${P(a, r1, 1)} ${P(b, r2, 1)} ${P(b, r2, -1)} ${P(a, r1, -1)}"/><line class="i" x1="${P(m, rm, 1).split(",")[0]}" y1="${P(m, rm, 1).split(",")[1]}" x2="${P(m, rm, -1).split(",")[0]}" y2="${P(m, rm, -1).split(",")[1]}"/>`);
    ell(a[0], a[1], r1, r1, false); ell(b[0], b[1], r2, r2, false);
  };
  ell(0, 1.68, 0.095, 0.12); limb([0, 1.6], [0, 1.5], 0.045, 0.05);
  ell(0, 1.34, 0.19, 0.2); ell(0, 1.1, 0.165, 0.17); ell(0, 0.9, 0.17, 0.1);
  for (const s of [-1, 1]) {
    ell(s * 0.21, 1.44, 0.065, 0.06, false);
    limb([s * 0.255, 1.4], [s * 0.29, 1.15], 0.048, 0.04); limb([s * 0.29, 1.15], [s * 0.33, 0.9], 0.04, 0.03); ell(s * 0.335, 0.85, 0.03, 0.05, false);
    limb([s * 0.09, 0.88], [s * 0.1, 0.5], 0.088, 0.06); limb([s * 0.1, 0.5], [s * 0.1, 0.1], 0.058, 0.04); ell(s * 0.1, 0.04, 0.045, 0.03, false);
  }
  return `<svg viewBox="-40 0 80 192" aria-hidden="true" focusable="false"><ellipse class="ring" cx="0" cy="186" rx="38" ry="4.5"/><g class="wf">${o.join("")}</g></svg>`;
}

export function chrome(ctx, current) {
  ctx.content.innerHTML = `<div class="shell">
<header class="top"><div class="brand"><span class="logo" role="img" aria-label="Wireframe human figure logo">${logoSvg()}</span><div><b>no.other - Longevity AI</b><small>Loading\u2026</small></div></div>
<button type="button" class="burger" id="burger" aria-label="Open menu" aria-expanded="false" aria-controls="nav"><span class="burger-l">${(NAV.find(([p]) => p === current) || ["", "Menu"])[1]}</span><span class="bars"><i></i><i></i><i></i></span></button>
<nav class="tabs" id="nav" aria-label="Sections">${NAV.map(([p, l]) => `<a class="tab" href="${p}"${p === current ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav></header>
<main id="main"></main>
<footer>Educational analysis of the health records in this room \u2014 not medical advice. AI-extracted values should be verified against the source documents; discuss any change with your clinician.</footer></div>`;
  const hdr = ctx.content.querySelector(".top"), btn = ctx.content.querySelector("#burger");
  const setOpen = (o) => { hdr.classList.toggle("open", o); btn.setAttribute("aria-expanded", String(o)); btn.setAttribute("aria-label", o ? "Close menu" : "Open menu"); };
  btn.addEventListener("click", (e) => { e.stopPropagation(); setOpen(!hdr.classList.contains("open")); }, { signal: ctx.signal });
  hdr.querySelectorAll("a.tab").forEach((a) => a.addEventListener("click", () => setOpen(false), { signal: ctx.signal }));
  ctx.content.addEventListener("click", (e) => { if (hdr.classList.contains("open") && !hdr.contains(e.target)) setOpen(false); }, { signal: ctx.signal });
  ctx.content.ownerDocument.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); }, { signal: ctx.signal });
  return ctx.content.querySelector("#main");
}

export function showError(ctx, main, err) {
  main.innerHTML = `<div class="load-note">Couldn't load data: ${esc(err && err.message ? err.message : String(err))}</div>`;
  ctx.reportError(err);
}

export function therapyMarks(st, onlyKey) {
  const out = [];
  for (const e of st.ev("therapy")) {
    const tirz = /tirzepatide|semaglutide|mounjaro|ozempic|wegovy|liraglutide/i.test(e.title);
    if (onlyKey && !tirz) continue;
    out.push({ t: e.t, label: tirz ? "Weight-loss drug start" : e.title.split("(")[0].trim(), color: tirz ? "#a78bfa" : "#5cc8ff", bold: tirz });
  }
  return out;
}
