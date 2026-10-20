import { M, GROUPS, f, statusOf, mean, dstr } from "./core.js";

// Everything here is computed from the records: no person's values, names or dates are built in.
const SEV = { High: 3, Moderate: 2, Low: 1, Resolved: 0 };
export const sevRank = (s) => SEV[s] || 0;
export const SEV_COLOR = { High: "#ff4d6d", Moderate: "#ffb020", Low: "#5cc8ff", Resolved: "#3ee0c4" };
const RK = { na: -1, ok: 0, watch: 1, flag: 2, crit: 3 };
export const worstOf = (a) => a.reduce((w, s) => (RK[s] > RK[w] ? s : w), "na");
const SL = { ok: "in range", watch: "watch", flag: "out of range", crit: "high concern", na: "no data" };
const mentions = (st, re) => st.events.some((e) => re.test((e.title || "") + " " + (e.detail || "")));

// Academic-health-centre reference articles (keys of AHC in refs.js) for each signal, cause and body-map region.
export const AHC_BY = {
  S1: ["mayoBp10", "mayoHomeBp", "hvBp", "jhDash", "ccApob", "ccLpa", "jhCalcium", "hvLdl"],
  S2: ["ccVisceral", "mayoDash", "hvChol"],
  S3: ["mayoStrength", "jhSarc", "ccVisceral", "ccBelly"],
  S4: ["ccBiotin", "mayoBiotinLab"],
  S9: ["mayoGlaucoma", "mayoGlaucomaDx", "ccGlaucoma"],
  RC1: ["ccVisceral", "ccBelly", "mayoBp10"],
  RC2: ["mayoStrength", "jhSarc"],
  RC3: ["ccApob", "ccLpa", "hvLdl", "hvChol"],
  RC4: ["ccVisceral", "mayoDash"],
  RC5: ["mayoDash", "jhHtn"],
  RC6: ["ccBiotin", "mayoBiotinLab"],
  heart: ["mayoBp10", "hvBp", "ccApob"],
  liver: ["mayoHemang", "ccHemang"],
  kidney: ["mayoKidneyCyst"],
  gut: ["ccGbPolyp"],
  eyes: ["mayoGlaucoma", "ccGlaucoma"],
  thyroid: ["ccBiotin"],
  muscle: ["jhSarc", "mayoStrength"],
  abdomen: ["ccVisceral", "ccBelly"],
  spine: ["mayoStrength"],
  prostate: ["ccBiotin"],
  legs: ["mayoStrength"]
};
export const ANNOT = {};

// ---- Findings from clinician notes, patient notes and imaging reports ----
// Every flagged line is assigned to a clinical TOPIC (liver, gallbladder, kidney cyst, tumour markers, EBV ...), the topic's reports are read in date order, and an
// earlier concern counts as CLOSED when a later report on the same topic is normal, benign or says no follow-up is needed. Only unresolved topics raise a signal.
const ACTION = /further (action|investigat|evaluat)|will require|repeat (the )?(test|tests|ultrasound|scan)|consider(ing)? (repeating|further|medication|supplement)|referr?al|refer\b|consult(ation| with| an?\b| the\b| ent\b)|follow[- ]?up (ultrasound|in |is |scan)|monitor|enlarg|higher than before|elevated|raised|slightly (high|low)|moderately high|insufficien|low vitamin|positive|newly detected|polyp|cyst|nodule|haemangioma|hemangioma|\bmass\b|lesion|stenosis|aneurysm/i;
const NEGATED = /\b(no|without|absence of)\b[^.;:,]{0,60}/gi;
const RESOLVED = /milk of calcium|\btiny\b|mucous retention|all[- ]clear|no (further )?(follow-?up|action)|benign|stable|likely hemangioma|likely haemangioma|unlikely (to be )?(of )?(clinical )?significan|bosniak (i|ii|1|2)\b/i;
const NORMAL = /no evidence|no suspicious|unremarkable|within normal|non-reactive|negative|\bnormal\b|absent|\bnil\b|immune/i;
const URGENT = /further action required|unexpected significant|will require further investigation|suspicious/i;
const CTXS = /^(history|technique|study reviewed|clinical history|reason for)\b/i;
const ECHO = (s) => s;
/** Topic lexicon (patient-independent). `sig` = attach the topic's findings to an existing marker signal instead of creating a new one. */
const TOPICS = [
  { id: "liver", title: "Liver findings (nodules, echotexture)", domain: "Liver imaging", organ: "liver", re: /\bliver\b|hepatic|haemangioma|hemangioma|hyperechoic|echotexture|segment (v|vi|vii|viii)\b/i, not: /hepatitis/i, keyRe: /^x_liver_/, cites: ["hemangMgmt", "hemangImg"], ahc: ["mayoHemang", "ccHemang"],
    why: "Small liver nodules found on ultrasound are usually characterised on MRI; what matters is the latest characterisation and whether any follow-up was recommended.", read: "Read the sequence of reports: an ultrasound finding that a later MRI calls a likely haemangioma is closed; one with no follow-up imaging is still open." },
  { id: "gallbladder", title: "Gallbladder polyps", domain: "Gallbladder imaging", organ: "gut", re: /gallbladder|gall bladder|gallstone|cholelith|polyp/i, keyRe: /^gb_polyp$/, cites: ["gbPolyp"], ahc: ["ccGbPolyp"],
    why: "Gallbladder polyps are usually benign cholesterol polyps; size and growth decide follow-up (guidelines give size thresholds).", read: "Compare the size across ultrasounds against the guideline thresholds cited, and what the reporting doctor recommended." },
  { id: "kidney", title: "Kidney cyst", domain: "Kidney imaging", organ: "kidney", re: /kidney|renal|bosniak/i, keyRe: /^kidney_cyst$|^x_left_kidney_cyst/, cites: ["bosniak"], ahc: ["mayoKidneyCyst"],
    why: "Simple and minimally complex kidney cysts are common and mostly benign; growth or new internal features are what change management.", read: "Compare the cyst size and wording (Bosniak class, septation, stable or not) between reports." },
  { id: "pancreas", title: "CA 19-9 elevation and pancreas / bile-duct work-up", domain: "Tumour markers", organ: "gut", re: /CA ?19|pancrea|MRCP|cholangio|bile duct/i, keyRe: /^ca199$/, cites: ["ca199Asym"], ahc: [],
    why: "A mildly raised CA 19-9 is often benign; imaging of the pancreas and bile ducts is the usual next step, and a later normal study is reassuring even when the marker stays raised.", read: "The imaging result is read against the marker: a normal MRI after a raised marker lowers, but does not remove, the need for follow-up." },
  { id: "cea", title: "CEA elevation and bowel evaluation", domain: "Tumour markers", organ: "gut", re: /\bCEA\b|carcinoembryonic|colonoscop|colorectal|large bowel|occult blood|faecal|stool/i, keyRe: /^cea$/, cites: ["ceaLiver"], ahc: [],
    why: "CEA can be mildly raised for benign reasons; clinicians then consider bowel evaluation or a repeat test. A negative stool test is reassuring but is not a bowel examination.", read: "Read the recommendation in the note against what has actually been done since (repeat CEA, bowel evaluation)." },
  { id: "ebv", title: "Rising EBV antibody titre and ENT follow-up", domain: "Serology / ENT", organ: "throat", re: /\bEBV\b|epstein|nasopharyn|nasoendoscop|\bENT\b|\bNPC\b/, keyRe: /^ebv_/, cites: ["ebvSg", "ebvNpcMeta", "ebvSg2"], ahc: [],
    why: "A rising anti-EBV IgA titre is a screening trigger for an ENT examination; the examination result is what closes the question.", read: "Check whether the examination recommended in the notes was done and what it found." },
  { id: "brain", title: "Brain imaging (headache work-up)", domain: "Neuro imaging", organ: "brain", re: /\bbrain\b|intracranial|migraine|cerebr|\bMRA\b/i, keyRe: null, cites: ["migraineMri"], ahc: [],
    why: "Imaging done for headache is mostly reassuring; incidental findings such as sinus retention cysts are usually benign.", read: "Read the conclusion of the radiology report; any follow-up it recommends is listed." },
  { id: "lipids", sig: "S1", re: /cholesterol|\bLDL\b|lipid/i },
  { id: "bp", sig: "S1", re: /blood pressure|hypertens/i },
  { id: "glucose", sig: "S2", re: /glucose|HbA1c|diabet/i },
  { id: "bodycomp", sig: "S3", re: /muscle mass|resistance exercise|frailty|body fat/i },
  { id: "thyroid", sig: "S4", re: /thyroid|\bTSH\b|thyroxine/i },
  { id: "vitd", sig: "S5", re: /vitamin d/i },
  { id: "renalfn", sig: "S6", re: /creatinine|egfr|haematuria|red blood cells in the urine|urine rbc/i },
  { id: "ecg", sig: "S14", re: /\bECG\b|electrocardiogram|PR interval/i }
];
const dayless = (e) => /exact day not given|day not given|day not specified|day not stated/i.test(e.detail || "");
const effT = (e) => { if (!dayless(e)) return e.t; const d = new Date(e.t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0); };
function topicText(e, re, headlineOnly) {
  const title = e.title || "", detail = e.detail || "";
  if (re.test(title)) return `${title}. ${detail}`;
  if (headlineOnly) return "";
  const ss = detail.split(/(?<=[.;])\s+/).filter((s) => !CTXS.test(s.trim()) && re.test(s));
  return ss.join(" ");
}
function evalText(txt) {
  const core = txt.replace(NEGATED, " ").replace(/non-reactive|negative|ref(erence)? negative|immune/gi, " ");
  const act = ACTION.test(core), res = RESOLVED.test(txt), urg = URGENT.test(core);
  const raw = act ? (res ? "ok" : urg ? "flag" : "watch") : "ok";
  return { raw, resolved: act && res, urgent: act && !res && urg, closing: raw === "ok" && (res || NORMAL.test(txt)) };
}
const REPORT_TYPES = ["imaging", "note", "procedure", "serology", "screening"];
/** Per-topic chronological state of the clinician / imaging / serology reports. Cached on the stats object. */
export function topicStates(st) {
  if (st._ts) return st._ts;
  const evs = st.events.filter((e) => REPORT_TYPES.includes(e.type)), TS = {}, matched = new Set();
  for (const T of TOPICS) {
    const list = [];
    for (const e of evs) {
      if (T.not && T.not.test(e.title || "")) continue;
      const tx = topicText(e, T.re, !!T.sig);
      if (!tx) continue;
      list.push({ e, t: effT(e), tx, ...evalText(tx) });
      matched.add(e);
    }
    list.sort((a, b) => a.t - b.t);
    list.forEach((x, i) => { x.eff = x.raw; if (x.raw !== "ok") { const c = list.slice(i + 1).find((y) => y.t > x.t && y.closing); if (c) { x.closedBy = c; x.eff = "ok"; } } });
    TS[T.id] = { T, list };
  }
  const un = evs.filter((e) => !matched.has(e) && !/^(hepatitis [abc]|hav\b|hbv\b|hbs|vdrl|blood group|doctor request|examining doctor|report |referral to ent)/i.test(e.title || "") && !(e.type === "serology" && /immun|antibod(y|ies) detected|igg/i.test(`${e.title} ${e.detail}`) && !/\bEBV\b/.test(e.title || ""))).map((e) => ({ e, t: effT(e), tx: `${e.title}. ${e.detail || ""}`, ...evalText(`${e.title}. ${e.detail || ""}`) })).filter((x) => x.raw !== "ok");
  st._ts = { TS, un };
  st.openTopics = new Set(Object.keys(TS).filter((id) => TS[id].list.some((x) => x.eff !== "ok")));
  return st._ts;
}
export function reportFindings(st) {
  const { TS, un } = topicStates(st), by = new Map();
  const put = (x) => { const o = by.get(x.e) || { e: x.e, status: "ok", resolved: false, urgent: false, closedBy: null }; if (RK[x.eff] > RK[o.status]) o.status = x.eff; if (x.eff !== "ok" && x.urgent) o.urgent = true; if (x.closedBy) { o.resolved = true; o.closedBy = x.closedBy.e; } by.set(x.e, o); };
  for (const id of Object.keys(TS)) TS[id].list.forEach(put);
  un.forEach((x) => put({ ...x, eff: x.raw }));
  return [...by.values()].sort((a, b) => b.e.t - a.e.t);
}
/** Personal follow-up plan: every item comes from this person's own reports and values. */
export function planItems(st) {
  const items = [], seen = new Set();
  for (const r of allStatus(st)) if (r.status !== "ok") items.push({ k: "marker", sev: r.status, date: r.date, t: `Recheck ${r.label}`, w: `Latest ${f(r.v, r.dp)} ${r.unit} on ${dstr(r.date)}; ${r.rng || "no printed range"}; ${r.n} reading${r.n > 1 ? "s" : ""}.` });
  for (const x of reportFindings(st)) {
    if (x.status === "ok") continue;
    const key = (x.e.title || "").toLowerCase().slice(0, 40) + x.e.start;
    if (seen.has(key)) continue; seen.add(key);
    items.push({ k: "report", sev: x.status, date: x.e.start, t: x.e.title, w: String(x.e.detail || "").slice(0, 260), src: x.e.src });
  }
  return items.sort((a, b) => (a.sev === b.sev ? 0 : a.sev === "flag" ? -1 : b.sev === "flag" ? 1 : 0) || String(b.date).localeCompare(String(a.date)));
}

const val = (st, k, d) => { const p = (st.series[k] || []).find((x) => x.d === d); return p ? p.v : null; };
const L = (st, k) => { const p = st.last(k); return p ? p.v : null; };

export function bpSummary(st) {
  const S = st.series.bp_sys || [], D = st.series.bp_dia || [];
  const byD = new Map(D.map((p) => [p.d, p.v]));
  const pairs = S.filter((p) => byD.has(p.d)).map((p) => ({ d: p.d, t: p.t, s: p.v, dd: byD.get(p.d) }));
  const yr = {};
  for (const p of pairs) (yr[p.d.slice(0, 4)] = yr[p.d.slice(0, 4)] || []).push(p);
  return {
    n: pairs.length, pairs,
    ms: mean(pairs.map((p) => p.s)), md: mean(pairs.map((p) => p.dd)),
    hiS: pairs.filter((p) => p.s >= 130).length, hiD: pairs.filter((p) => p.dd >= 90).length,
    byYear: Object.entries(yr).map(([y, a]) => ({ y, n: a.length, s: mean(a.map((x) => x.s)), d: mean(a.map((x) => x.dd)) }))
  };
}

export function allStatus(st) {
  const bp = bpSummary(st), out = [];
  for (const k of Object.keys(M)) {
    const s = st.series[k], c = M[k];
    if (!s || !s.length) continue;
    if (c.hi == null && c.lo == null && c.watch == null && c.watchLo == null) continue;
    let v = s[s.length - 1].v, label = c.l, date = s[s.length - 1].d;
    if (k === "bp_sys" && bp.n) { v = bp.ms; label = c.l + " \u00b7 mean of " + bp.n + " visit-days"; }
    if (k === "bp_dia" && bp.n) { v = bp.md; label = c.l + " \u00b7 mean of " + bp.n + " visit-days"; }
    const recent = s.slice(-3).map((p) => statusOf(k, p.v));
    out.push({ key: k, label, group: c.g, v, unit: c.u, status: statusOf(k, v), date, n: s.length, persist: recent.filter((x) => x !== "ok").length, rng: c.rng || "", dp: c.dp != null ? c.dp : 1 });
  }
  return out;
}

export function radarData(rows) {
  const used = GROUPS.filter((g) => rows.some((r) => r.group === g));
  return (used.length >= 3 ? used : GROUPS).map((g) => {
    const a = rows.filter((r) => r.group === g), ok = a.filter((r) => r.status === "ok").length;
    return { g, n: a.length, ok, share: a.length ? ok / a.length : 0, worst: a.reduce((w, r) => worstOf([w, r.status]), "na") };
  });
}

/** One evidence row for a marker: latest value (or first \u2192 last), status against its range, and context. */
function evRow(st, k, bp) {
  const c = M[k], s = st.series[k];
  if (!c || !s || !s.length) return null;
  const last = s[s.length - 1], first = s[0], dp = c.dp != null ? c.dp : 1;
  let v = last.v, value = s.length > 1 ? `${f(first.v, dp)} \u2192 ${f(v, dp)} ${c.u}` : `${f(v, dp)} ${c.u}`;
  if ((k === "bp_sys" || k === "bp_dia") && bp && bp.n) { v = k === "bp_sys" ? bp.ms : bp.md; value = `${f(v, 0)} ${c.u} (mean of ${bp.n} visit-days)`; }
  let status = statusOf(k, v);
  if (status === "ok" && c.trendWatch && s.length > 1 && c.hi == null && c.lo == null && last.v >= first.v * 1.25) status = "watch";
  const note = [c.rng ? "Reference " + c.rng : "", `${s.length} reading${s.length > 1 ? "s" : ""}, ${dstr(first.d)}${s.length > 1 ? " \u2013 " + dstr(last.d) : ""}`].filter(Boolean).join(" \u00b7 ");
  return { label: c.l, value: value.trim(), status, note: (status === "watch" && c.trendWatch && statusOf(k, v) === "ok" ? "Rising across reports (no range printed). " : "") + note, key: k };
}
const e = (label, value, status, note) => ({ label, value, status, note: note || "" });

/** One signal per clinical topic found in the clinician notes and imaging reports, built from that topic's reports in date order. */
function findingSignals(st, bp) {
  const { TS, un } = topicStates(st), out = [];
  let n = 0;
  const snippet = (x) => { const d = String(x.e.detail || ""); const m = d.split(/(?<=[.;])\s+/).find((s) => /recommend|consider|repeat|follow|further|monitor|refer|consult|advice|require/i.test(s)); return (m || d).slice(0, 170); };
  for (const T of TOPICS) {
    if (T.sig) continue;
    const { list } = TS[T.id] || { list: [] };
    if (!list.some((x) => x.raw !== "ok")) continue;
    const open = list.filter((x) => x.eff !== "ok"), closed = list.filter((x) => x.raw !== "ok" && x.eff === "ok");
    const keys = T.keyRe ? Object.keys(st.series).filter((k) => T.keyRe.test(k)) : [];
    const mrows = keys.map((k) => evRow(st, k, bp)).filter(Boolean), mbad = mrows.filter((r) => r.status !== "ok");
    const urgentOpen = open.some((x) => x.urgent);
    let sev;
    if (open.length) sev = urgentOpen ? "High" : open.some((x) => x.eff === "flag") || mbad.some((r) => r.status === "flag" || r.status === "crit") ? "Moderate" : "Low";
    else sev = mbad.length ? "Low" : "Resolved";
    const lastClose = closed.length ? closed.map((x) => x.closedBy).sort((a, b) => b.t - a.t)[0] : null;
    const ev = [];
    for (const x of list.filter((y) => y.raw !== "ok" || y === lastClose || list.indexOf(y) >= list.length - 1)) {
      const note = (x.closedBy ? ` [followed up ${dstr(x.closedBy.e.start)}: ${String(x.closedBy.e.title).slice(0, 70)}]` : "") + (dayless(x.e) ? " [date approximate: day not stated]" : "");
      if (!ev.some((r) => r.label === x.e.title && r.value === dstr(x.e.start))) ev.push(e(x.e.title, dstr(x.e.start), x.eff, String(x.tx || x.e.detail || "").slice(0, 230) + note));
    }
    for (const r of mrows) ev.push(r);
    const headline = open.length
      ? `${open.length} finding${open.length > 1 ? "s" : ""} still open: ${String(open[open.length - 1].e.title).slice(0, 110)} (${dstr(open[open.length - 1].e.start)}).`
      : `Earlier concern${closed.length > 1 ? "s" : ""} (${closed.length}) closed by a later report: ${String(lastClose.e.title).slice(0, 100)} (${dstr(lastClose.e.start)})${mbad.length ? `; still on watch: ${mbad.map((r) => r.label).join(", ")}` : ""}.`;
    const id = "F" + ++n;
    AHC_BY[id] = T.ahc || [];
    out.push({ id, key: "F:" + T.id, topic: T.id, sev, title: T.title + (sev === "Resolved" ? " \u2014 followed up, no concern" : !open.length ? " \u2014 partly reassured" : ""), domains: [T.domain], organs: [T.organ], keys,
      headline, evidence: ev.sort((a, b) => RK[b.status] - RK[a.status]), why: T.why, read: T.read + " Wording-based: confirm in the original report.",
      next: open.length ? [...new Set(open.slice(-3).map((x) => `${x.e.title}: ${snippet(x)}`))] : ["No action beyond routine follow-up; keep the later report with your records"], cites: T.cites || [] });
  }
  // flagged entries that belong to no topic: one signal each, never lumped
  const seen = new Set();
  for (const x of un.sort((a, b) => b.t - a.t).slice(0, 8)) {
    const k = String(x.e.title).toLowerCase(); if (seen.has(k)) continue; seen.add(k);
    const id = "F" + ++n; AHC_BY[id] = [];
    out.push({ id, key: "F:other:" + String(x.e.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40), topic: "other", sev: x.urgent ? "High" : "Low", title: String(x.e.title).slice(0, 80), domains: ["Report finding"], organs: [], keys: [],
      headline: `${dstr(x.e.start)} \u00b7 ${x.e.src}: ${String(x.e.detail || "").slice(0, 160)}`, evidence: [e(x.e.title, dstr(x.e.start), x.raw, String(x.e.detail || "").slice(0, 230))],
      why: "A clinician or report entry asks for attention but does not fall under a measured marker group.", read: "Wording-based: confirm in the original report.", next: [snippet(x)], cites: [] });
  }
  return out;
}
const SIGDEFS = [
  { id: "S1", title: "Cardiovascular and lipid load", domains: ["Blood pressure", "Lipids", "Heart risk"], organs: ["heart"],
    keys: ["bp_sys", "bp_dia", "ldl", "apob", "lpa", "nonhdl", "chol_total", "hdl", "tg", "cac", "ascvd10", "rhr"],
    why: "Blood pressure, atherogenic lipids and an elevated risk estimate each add to lifetime vascular load, and they compound. Reading them together shows whether the pattern is isolated or part of a wider cardiometabolic picture.",
    read: "Confirm any blood-pressure finding with home or ambulatory readings, measure ApoB and Lp(a) once if they are missing, and discuss lipid targets with a clinician. Treatment decisions are theirs.",
    next: ["Home blood pressure: 7 days, morning and evening, seated", "ApoB and Lp(a) (once in a lifetime) if not yet measured; consider a coronary calcium score if the result would change the plan", "Repeat lipids fasting, at the same lab, to see the trend"],
    cites: ["escEsh", "homeBp", "ldlCausal", "escEas", "apob", "lpa", "cac", "obHtn", "retinaCvd"] },
  { id: "S2", title: "Glucose and insulin regulation", domains: ["Glucose", "Insulin", "Metabolic health"], organs: ["abdomen"],
    keys: ["hba1c", "hba1c_ifcc", "glucose", "insulin"],
    why: "HbA1c reflects the last three months, fasting glucose a single morning and insulin how hard the body works to hold glucose steady. Rising values in any of them can precede a diabetes diagnosis by years.",
    read: "Look at the direction of travel, not one value. Repeat fasting glucose and HbA1c at the same lab, and discuss the result with a clinician if more than one marker is out of range.",
    next: ["Repeat fasting glucose, insulin and HbA1c under the same conditions (fasted, same lab)", "Resistance training and Zone 2 exercise, which improve insulin sensitivity", "Early time-restricted eating can be tried alongside a clinician's advice"],
    cites: ["homa", "tgHdl", "dpp", "tre"] },
  { id: "S3", title: "Body composition, muscle and bone reserve", domains: ["Body fat", "Muscle", "Bone", "Fitness"], organs: ["abdomen", "muscle", "spine", "legs"],
    keys: ["dexa_fat_pct", "dexa_fat_mass", "dexa_lean", "dexa_vat", "vfa", "waist", "bmi", "whr", "android_gynoid", "trunk_fat_pct", "almi", "ffmi", "dexa_tscore", "grip", "vo2max", "x_skeletal_muscle_mass_smm", "x_phase_angle_50_khz"],
    why: "Fat distribution, muscle quantity and bone density together decide metabolic risk and how resilient someone is to ageing and illness. Weight alone cannot show any of this.",
    read: "Prioritise resistance training with enough protein, add aerobic base work, and track the same scan type at the same time of day so changes are real.",
    next: ["Resistance training 2\u20134 sessions a week with progressive overload", "Protein around 1.6 g/kg/day if kidney function is normal", "A simple strength and fitness check (for example a 30-second sit-to-stand) if not yet done", "Repeat the body scan in about 12 months on the same device, at the same time of day"],
    cites: ["vat", "ewgsop", "sarcOb", "boneRt", "protein", "proteinMeta", "crf", "strength", "biaDxa"] },
  { id: "S4", title: "Hormones and thyroid", domains: ["Hormones", "Thyroid", "Assay quality"], organs: ["thyroid", "prostate"],
    keys: ["testosterone", "oestradiol", "cortisol", "dheas", "pth", "ft4", "tsh", "ft3"],
    why: "Hormone results depend on time of day, fasting, supplements and the assay platform. A value that disagrees with its partners (for example free T4 out of range with a normal TSH) is as likely to be a measurement issue as a disease.",
    read: "Treat odd hormone results as a data-quality question first: repeat fasted, in the morning, at one lab, and tell the lab about any supplement you take.",
    next: ["Repeat the abnormal hormones fasted, around 8 am, at one lab", "Tell the lab and the clinician about every supplement you take"],
    cites: ["testoDiurnal", "biotinThy", "biotin", "testoWeight"] },
  { id: "S5", title: "Inflammation, vitamins and nutrients", domains: ["Inflammation", "Vitamins"], organs: [],
    keys: ["hscrp", "esr", "homocysteine", "vitd"],
    why: "Low-grade inflammation and vitamin status shape cardiovascular and metabolic risk, and both are modifiable. Vitamin D can be too low or, after high-dose supplementation, too high.",
    read: "Repeat once to exclude a recent infection or injury, then address the likely cause. Do not add or stop vitamin D without a recent level.",
    next: ["Repeat hs-CRP when well", "Agree vitamin D dosing with a clinician using a recent 25-OH level"],
    cites: ["vitD", "vitDtox"] },
  { id: "S6", title: "Kidney and liver function", domains: ["Kidney", "Liver"], organs: ["liver", "kidney"],
    keys: ["creatinine", "egfr", "urea", "uric", "potassium", "sodium", "chloride", "calcium", "phosphate", "mcr", "alt", "ast", "ggt", "alp", "albumin", "protein_total", "globulin", "ag_ratio", "bili"],
    why: "Kidney and liver results decide which treatments, supplements and protein intakes are safe, and they often change early with alcohol, medicines and metabolic disease.",
    read: "Look for a pattern rather than a single mildly abnormal value, and repeat before acting. A haemolysed sample can raise potassium falsely.",
    next: ["Repeat the abnormal tests, fasted and well hydrated", "Review medicines, supplements and alcohol with a clinician"],
    cites: ["escEsh", "creatMuscle"] },
  { id: "S7", title: "Blood count and iron", domains: ["Blood", "Iron"], organs: [],
    keys: ["hb", "hct", "rbc", "mcv", "mch", "mchc", "rdw", "wbc", "neut_pct", "lymph_pct", "mono_pct", "eos_pct", "baso_pct", "neut_abs", "lymph_abs", "mono_abs", "eos", "baso_abs", "platelets", "mpv", "ferritin", "iron"],
    why: "Haemoglobin, haematocrit and ferritin show oxygen-carrying capacity and iron stores. Both low and high values matter.",
    read: "Repeat to confirm; ferritin also rises with inflammation, so read it with hs-CRP.",
    next: ["Repeat the abnormal values", "Discuss iron studies with a clinician if ferritin or haemoglobin is outside range"],
    cites: [] },
  { id: "S8", title: "Cancer-screening markers", domains: ["Screening"], organs: ["prostate"],
    keys: ["psa", "cea", "afp", "ca199"],
    why: "Tumour markers are screening aids, not diagnoses: mild elevations are common and many have benign causes.",
    read: "Repeat once under the same conditions and discuss the result and the right screening interval with a clinician.",
    next: ["Repeat the marker at the same lab", "Agree an age-appropriate screening plan with a clinician"],
    cites: ["ca199Asym", "ceaLiver"] },
  { id: "S12", title: "Infection and immunity serology", domains: ["Immunity", "Serology"], organs: ["throat"],
    keys: ["ebv_vca", "ebv_ea", "hbs_ab", "hpylori", "ra_factor"],
    why: "Antibody titres matter by their direction as much as their level: a titre that keeps rising on repeat testing is handled differently from a stable one, and each assay has its own screening role.",
    read: "Read the trend across reports and what the clinician did with it (referral, endoscopy, repeat test); a rising titre is a reason for specialist review, not a diagnosis.",
    next: ["Keep the same assay and lab for repeat titres", "Follow the specialist's plan for any rising titre"],
    cites: ["ebvSg", "ebvNpcMeta", "ebvSg2"] },
  { id: "S13", title: "Eye pressure", domains: ["Eye"], organs: ["eyes"],
    keys: ["iop_r", "iop_l"],
    why: "Eye pressure above the usual range is a risk marker for glaucoma.",
    read: "A single reading is a screen; repeat and an eye examination decide.",
    next: ["Repeat eye-pressure measurement at the next health assessment"],
    cites: ["glaucBp"] },
  { id: "S14", title: "ECG intervals", domains: ["ECG"], organs: ["heart"],
    keys: ["pr", "qrsd", "qt", "qtc"],
    why: "Conduction intervals read from the tracing can be borderline from measurement alone, and a consistent drift across years matters more than one value.",
    read: "These intervals were read by AI from the printed tracings; compare with the clinician's printed ECG comment before drawing a conclusion.",
    next: ["Ask the clinician to confirm the PR interval on the original tracing", "Repeat the ECG at the next health assessment to confirm the trend"],
    cites: ["av1"] }
];

export function buildSignals(st) {
  const bp = bpSummary(st), out = [];
  const fs = findingSignals(st, bp), claimed = new Set(fs.flatMap((s) => s.keys));
  out.push(...fs);
  const TSX = topicStates(st).TS;
  for (const d of SIGDEFS) {
    const rows = d.keys.filter((k) => !claimed.has(k)).map((k) => evRow(st, k, bp)).filter(Boolean);
    if (!rows.length) continue;
    const extra = [];
    // Clinician / imaging findings on the topics attached to this signal: open ones as evidence, closed ones shown as followed up.
    for (const T of TOPICS.filter((t) => t.sig === d.id)) for (const x of (TSX[T.id] ? TSX[T.id].list : []).filter((y) => y.raw !== "ok")) extra.push(e(x.e.title, dstr(x.e.start), x.eff, String(x.tx || x.e.detail || "").slice(0, 200) + (x.closedBy ? ` [followed up ${dstr(x.closedBy.e.start)}: ${String(x.closedBy.e.title).slice(0, 70)}]` : "")));
    if (d.id === "S1") {
      const hdl = L(st, "hdl"), tg = L(st, "tg");
      if (hdl && tg != null) { const r = tg / hdl; extra.push(e("Triglyceride / HDL ratio", f(r, 2), r >= 1.3 ? "watch" : "ok", "Screening heuristic for insulin resistance (about 1.3 or more in mmol/L); not a diagnosis")); }
      const crit = [];
      const w = L(st, "waist"), g = L(st, "glucose");
      if (w != null && M.waist.hi != null) crit.push(w > M.waist.hi);
      if (tg != null) crit.push(tg >= 1.7);
      if (hdl != null && M.hdl.lo != null) crit.push(hdl < M.hdl.lo);
      if (bp.n) crit.push(bp.ms >= 130 || bp.md >= 85);
      if (g != null) crit.push(g >= 5.6);
      const met = crit.filter(Boolean).length;
      if (crit.length >= 3 && met >= 2) extra.push(e("Metabolic-syndrome criteria", `${met} of ${crit.length} assessable criteria met`, met >= 3 ? "flag" : "watch", "Three of five criteria define the metabolic syndrome; criteria with no data are not counted"));
    }
    if (d.id === "S2") {
      const ins = st.series.insulin || [], glu = st.series.glucose || [];
      const pairs = ins.map((p) => ({ d: p.d, v: val(st, "glucose", p.d) != null ? (p.v * val(st, "glucose", p.d)) / 22.5 : null })).filter((p) => p.v != null);
      if (pairs.length) { const h = pairs[pairs.length - 1]; extra.push(e("HOMA-IR (same-day insulin and glucose)", f(h.v, 2), h.v >= 2.5 ? "watch" : "ok", "About 2.5 or more suggests insulin resistance; computed from fasting insulin \u00d7 glucose / 22.5")); }
    }
    if (d.id === "S3") {
      const fm = st.series.dexa_fat_mass || [], lm = st.series.dexa_lean || [];
      if (fm.length > 1 && lm.length > 1) {
        const df = fm[fm.length - 1].v - fm[0].v, dl = lm[lm.length - 1].v - lm[0].v;
        extra.push(e("Fat vs lean mass change (" + (st.scanLabel || "body scan") + ")", `fat ${df >= 0 ? "+" : ""}${f(df, 1)} kg \u00b7 lean ${dl >= 0 ? "+" : ""}${f(dl, 1)} kg`, df > 1 && dl < 0.5 ? "watch" : "ok", `${dstr(fm[0].d)} \u2192 ${dstr(fm[fm.length - 1].d)}`));
      }
      if (mentions(st, /tirzepatide|semaglutide|mounjaro|ozempic|wegovy|liraglutide/i)) extra.push(e("Weight-loss drug in the records", "Yes", "watch", "These drugs reduce lean mass and can affect bone along with fat; pair with resistance training and protein"));
    }
    if (d.id === "S4") {
      const f4 = st.series.ft4, ts = st.series.tsh;
      if (f4 && ts && statusOf("ft4", L(st, "ft4")) !== "ok" && statusOf("tsh", L(st, "tsh")) === "ok") extra.push(e("Discordant thyroid pattern", "FT4 out of range, TSH normal", "watch", "Can reflect assay interference or a lab-platform difference rather than thyroid disease; confirm by repeating at one lab"));
      if (mentions(st, /biotin/i)) extra.push(e("Biotin mentioned in the records", "Yes", "flag", "Biotin can distort immunoassays (sandwich assays read low, competitive assays read high)"));
    }
    const all = [...rows, ...extra], bad = all.filter((r) => r.status !== "ok");
    if (!bad.length) continue;
    const score = bad.reduce((a, r) => a + (r.status === "crit" ? 3 : r.status === "flag" ? 2 : 1), 0);
    const sev = bad.some((r) => r.status === "crit") || score >= 6 ? "High" : score >= 3 ? "Moderate" : "Low";
    out.push({
      id: d.id, sev, title: d.title, domains: d.domains, organs: d.organs, keys: rows.map((r) => r.key),
      headline: (() => { const mk = rows.filter((r) => r.status !== "ok"), nm = rows.length, rp = extra.filter((x) => x.status !== "ok" && x.note !== undefined && /\d{4}/.test(x.value) && !/ \u00b7 | kg|ratio|Yes|criteria/.test(x.value)).length; const parts = []; if (mk.length) parts.push(`${mk.length} of ${nm} measured marker${nm > 1 ? "s" : ""} outside the reference range or on watch: ${mk.slice(0, 4).map((r) => r.label).join(", ")}${mk.length > 4 ? "\u2026" : ""}`); if (rp) parts.push(`${rp} clinician-note finding${rp > 1 ? "s" : ""} on this topic`); const o = extra.filter((x) => x.status !== "ok").length - rp; if (o > 0) parts.push(`${o} derived check${o > 1 ? "s" : ""} flagged`); return (parts.join("; ") || `${bad.length} item(s) flagged`) + "."; })(),
      evidence: all.sort((a, b) => RK[b.status] - RK[a.status]),
      why: d.why, read: d.read, next: d.next, cites: d.cites.filter((c) => c !== "biaDxa" || (st.scanTypes || []).includes("InBody"))
    });
  }
  const ret = st.ev("retina");
  if (ret.length) {
    const rows = ret.map((x) => e(x.title || "Eye screening", dstr(x.start), /flag|elevat|defect|refer|suspect|abnormal|risk|glaucom|retinopath|drusen|cataract|disc/i.test(x.detail || "") ? "watch" : "ok", String(x.detail || "").slice(0, 240)));
    if (rows.some((r) => r.status !== "ok")) out.push({ id: "S9", sev: "Moderate", title: "Eye screening findings", domains: ["Eye / retina"], organs: ["eyes"], keys: [],
      headline: "An eye or retinal report in the records contains findings worth a specialist's review.",
      evidence: rows,
      why: "An AI or screening report is not a diagnosis. Findings such as optic-nerve or vessel changes are more meaningful when blood pressure or lipids are also high, and glaucoma is silent until late.",
      read: "Ask an ophthalmologist to review the original report; an eye examination with OCT, eye pressure and visual fields is quick and non-invasive.",
      next: ["Book an eye review and bring the original report", "Treat blood pressure and lipids as eye-protective as well as heart-protective"],
      cites: ["glaucBp", "glaucLipid", "retinalAge", "retinaCvd"] });
  }
  const gen = st.ev("genetic");
  if (gen.length) out.push({ id: "S10", sev: "Low", title: "Genetic screening results", domains: ["Genetics"], organs: [], keys: [],
    headline: `${gen.length} genetic finding${gen.length > 1 ? "s" : ""} recorded in the records.`,
    evidence: gen.map((x) => e(x.title, dstr(x.start), "watch", String(x.detail || "").slice(0, 240))),
    why: "Common-variant (GWAS) results shift risk slightly and are not diagnoses. Their value is in aiming the modifiable factors you already control, such as alcohol, body fat, sun exposure and screening.",
    read: "No alarm unless a pathogenic variant is reported. Confirm uncertain items against the original report with a genetic counsellor.",
    next: ["Go through the full report with a genetic counsellor or clinician", "Keep age-appropriate screening up to date"],
    cites: ["skinPrs", "alcoholCancer"] });
  out.forEach((s) => { s.key = s.key || s.id; }); // stable key: protocols point at this, never at the position-based label
  return out;
}

const CAUSE_DEFS = [
  { id: "RC7", name: "Viral exposure (EBV) driving a rising antibody titre", color: "#5cc8ff", keys: ["ebv_vca"], explainFn: (sigs) => sigs.filter((s) => s.id === "S12" || s.topic === "ebv").map((s) => s.id),
    when: (st) => (st.series.ebv_vca || []).length > 1 && st.series.ebv_vca[st.series.ebv_vca.length - 1].v > st.series.ebv_vca[0].v,
    forWhen: (st) => { const s = st.series.ebv_vca; return [`EBV capsid antigen IgA titre ${s[0].v} \u2192 ${s[s.length - 1].v} between ${dstr(s[0].d)} and ${dstr(s[s.length - 1].d)}`]; },
    conf: () => "Possible \u2014 confirm with the specialist's work-up",
    mech: ["Past or persistent Epstein-Barr infection", "Assay variability between runs"],
    summary: "A rising anti-EBV IgA titre is most often reactivation or persistence of a common virus, but the same marker is used in nasopharyngeal screening, so it is reviewed by a specialist.",
    test: "The specialist's endoscopic examination and, if offered, EBV DNA testing, as already arranged in the reports.",
    cites: ["ebvSg", "ebvNpcMeta", "ebvSg2"],
    extra: (st) => { const ev = st.events.filter((x) => /EBV|nasopharyn|nasoendoscop|NPC|ENT/i.test((x.title || "") + " " + (x.detail || ""))); return { for: [], against: ev.filter((x) => /all[- ]clear|no follow/i.test(x.detail || "")).map((x) => `${dstr(x.start)}: ${x.title} \u2014 ${String(x.detail).slice(0, 140)}`) }; } },
  { id: "RC1", name: "Central (visceral) adiposity", color: "#ff7a59", keys: ["dexa_vat", "vfa", "waist", "android_gynoid", "trunk_fat_pct", "dexa_fat_pct", "bmi", "whr"], needBad: true,
    mech: ["Sympathetic and renin\u2013angiotensin activation", "Adipokine and low-grade inflammatory signalling"],
    summary: "Fat concentrated around the trunk is the best-studied common driver of raised blood pressure, atherogenic lipids and insulin resistance.",
    test: (st) => `Track waist and visceral fat (${st.scanLabel || "body scan"}) over 12 weeks against home blood pressure: if blood pressure and glucose fall as visceral fat falls, the link is supported.`,
    cites: ["vat", "obHtn", "vatEx"],
    extra: (st) => { const fm = st.series.dexa_fat_mass || [], lm = st.series.dexa_lean || []; if (fm.length > 1 && lm.length > 1) { const df = fm[fm.length - 1].v - fm[0].v, dl = lm[lm.length - 1].v - lm[0].v; if (df > 1) return { for: [`Fat mass ${df >= 0 ? "+" : ""}${f(df, 1)} kg vs lean ${dl >= 0 ? "+" : ""}${f(dl, 1)} kg between the first and latest ${st.scanLabel || "body"} scans`], against: [] }; } return null; } },
  { id: "RC2", name: "Low aerobic and muscular capacity", color: "#a78bfa", keys: ["rhr", "vo2max", "almi", "ffmi", "grip", "dexa_tscore", "rer"],
    mech: ["Low mitochondrial and oxidative capacity", "Sympathetic dominance (high resting heart rate)"],
    summary: "Low fitness and thin muscle or bone are among the strongest predictors of mortality and frailty, and respond well to training.",
    test: "A rested fitness test. Twelve weeks of Zone 2 plus strength training should lower resting heart rate and blood pressure if this is a driver.",
    cites: ["rhr", "crf", "ewgsop", "hiit", "strength"] },
  { id: "RC3", name: "Atherogenic lipid burden (diet and/or genetics)", color: "#5cc8ff", keys: ["ldl", "apob", "lpa", "nonhdl", "chol_total"],
    mech: ["Hepatic LDL-receptor activity and dietary lipid flux", "Inherited lipoprotein(a) level"],
    summary: "LDL and ApoB particle count are causal for atherosclerosis; a high value with good HDL and triglycerides points to diet or genetics rather than fat metabolism.",
    test: "ApoB and Lp(a) if missing; a 3-day food diary focused on saturated fat; repeat lipids at one lab.",
    cites: ["ldlCausal", "apob", "lpa", "dietFat", "medDiet"] },
  { id: "RC4", name: "Impaired glucose regulation / insulin resistance", color: "#ffb020", keys: ["hba1c", "glucose", "insulin", "tg"],
    mech: ["Reduced insulin sensitivity", "Excess energy intake with low muscle use"],
    summary: "Rising glucose, HbA1c or insulin with high triglycerides signals insulin resistance, which also drives blood pressure and fatty liver.",
    test: "Repeat fasting glucose, insulin and HbA1c; a 14-day continuous glucose monitor or post-meal glucose checks can show the pattern.",
    cites: ["homa", "tgHdl", "dpp"] },
  { id: "RC5", name: "Unmeasured lifestyle load (alcohol, salt, sleep, stress)", color: "#3ee0c4", keys: ["bp_sys", "bp_dia"], when: (st) => (st.series.bp_sys || []).length || (st.series.bp_dia || []).length,
    conf: () => "Possible \u2014 not documented in the files",
    mech: ["Alcohol-linked blood-pressure rise", "Sympathetic and stress load", "Sodium and potassium balance"],
    summary: "Raised blood pressure is often driven by factors the lab files do not capture. None of them is documented in the records.",
    test: "Log alcohol units, salt intake, sleep duration and evening eating times for two weeks alongside home blood pressure.",
    cites: ["alcoholCut", "alcoholHtn", "sleepBp", "sodiumBmj"],
    gaps: ["Alcohol, sleep, diet and stress are not recorded in the records"] },
  { id: "RC6", name: "Measurement artefact (supplements, assay interference)", color: "#8ea0c4", keys: [], explain: ["S4"],
    when: (st) => mentions(st, /biotin/i),
    conf: () => "Possible \u2014 verify by retest",
    mech: ["Streptavidin\u2013biotin immunoassay cross-reactivity", "Different labs and platforms"],
    summary: "A supplement or a lab-platform difference can make results look abnormal without any disease.",
    test: "Repeat after stopping the supplement for the washout period the lab advises, at one lab, fasted in the morning.",
    cites: ["biotin", "biotinThy", "biotinEta"],
    extra: (st) => { const fo = [], ag = ["The supplement dose and start date are rarely recorded"]; if (mentions(st, /biotin/i)) fo.push("Biotin is mentioned in the records"); if ((st.series.ft4 || []).length && (st.series.tsh || []).length && statusOf("ft4", L(st, "ft4")) !== "ok" && statusOf("tsh", L(st, "tsh")) === "ok") fo.push("Free T4 is out of range while TSH is normal (discordant)"); return { for: fo, against: ag }; } }
];

export function buildCauses(st) {
  const bp = bpSummary(st), sigs = buildSignals(st), out = [];
  for (const d of CAUSE_DEFS) {
    if (d.when && !d.when(st)) continue;
    const rows = d.keys.map((k) => evRow(st, k, bp)).filter(Boolean);
    const bad = rows.filter((r) => r.status !== "ok"), good = rows.filter((r) => r.status === "ok");
    // A cause needs evidence from this person's own markers; supporting detail from `extra` alone is never enough (rule: no cause from template wording or a single weak trend).
    if (d.needBad && !bad.length) continue;
    const ex = d.extra ? d.extra(st) : null;
    const forL = [...bad.map((r) => `${r.label}: ${r.value} (${SL[r.status]})`), ...(ex ? ex.for : []), ...(d.forWhen ? d.forWhen(st) : [])];
    if (!forL.length) continue;
    const miss = d.keys.filter((k) => M[k] && !(st.series[k] && st.series[k].length)).map((k) => M[k].l);
    const against = [...good.map((r) => `${r.label}: ${r.value} is within range`), ...(ex ? ex.against : []), ...(d.gaps || []), ...(miss.length ? [`No data yet for: ${miss.join(", ")}`] : [])];
    const explains = d.explainFn ? d.explainFn(sigs) : d.explain ? d.explain.filter((id) => sigs.some((s) => s.id === id)) : sigs.filter((s) => s.keys.some((k) => d.keys.includes(k))).map((s) => s.id);
    out.push({ key: d.id, id: d.id, name: d.name, color: d.color, conf: d.conf ? d.conf(forL.length) : forL.length >= 3 ? "Probable contributor" : forL.length === 2 ? "Possible contributor" : "Weak signal \u2014 one marker",
      summary: `${d.summary}${rows.length ? ` ${bad.length} of ${rows.length} related markers are outside range.` : ""}`, mech: d.mech, explains, for: forL, against: against.length ? against : ["Nothing in the records argues against it, but several related tests may be missing"], test: typeof d.test === "function" ? d.test(st) : d.test, cites: d.cites, n: forL.length });
  }
  // `key` is the catalogue id (RC1..RC7) that links to articles and protocols; `id` is the label shown, numbered RC1, RC2 ... in ranked order over the causes that apply to this person.
  return out.sort((a, b) => b.n - a.n).map((c, i) => ({ ...c, id: "RC" + (i + 1) }));
}

export function buildRuledOut(st) {
  const out = [], A = (k) => { const r = evRow(st, k, bpSummary(st)); return r; }, okAll = (ks) => ks.every((k) => { const r = A(k); return !r || r.status === "ok"; }) && ks.some((k) => A(k));
  const list = (ks) => ks.map(A).filter(Boolean).map((r) => `${r.label} ${r.value}`).join("; ");
  if (okAll(["hba1c", "glucose", "insulin"])) out.push({ t: "Impaired glucose regulation as a common driver", w: `Within range: ${list(["hba1c", "glucose", "insulin"])}.`, c: ["homa", "tgHdl"] });
  if (okAll(["tsh"])) out.push({ t: "Thyroid disease driving weight, lipids or blood pressure", w: `${list(["tsh"])} is within range${A("ft4") && A("ft4").status !== "ok" ? "; the abnormal free T4 is discordant and may be an artefact (see signal S4)" : ""}.`, c: ["biotinThy"] });
  if (okAll(["egfr", "creatinine"])) out.push({ t: "Kidney disease driving blood pressure", w: `Within range: ${list(["egfr", "creatinine"])}.`, c: ["escEsh"] });
  if (okAll(["alt", "ast", "ggt"])) out.push({ t: "Liver disease or heavy alcohol effect", w: `Within range: ${list(["alt", "ast", "ggt"])}.`, c: ["alcoholCancer"] });
  if (okAll(["hb", "hct", "ferritin"])) out.push({ t: "Anaemia or polycythaemia", w: `Within range: ${list(["hb", "hct", "ferritin"])}.`, c: [] });
  return out;
}

export function buildWorking(st) {
  const rows = allStatus(st), out = [];
  for (const g of GROUPS) {
    const a = rows.filter((r) => r.group === g);
    if (!a.length) continue;
    const ok = a.filter((r) => r.status === "ok");
    const desc = (x) => x.slice(0, 4).map((r) => `${r.label} ${f(r.v, r.dp)} ${r.unit}`.trim()).join(", ") + (x.length > 4 ? ", \u2026" : "");
    if (ok.length === a.length) out.push(`${g}: all ${a.length} tracked marker${a.length > 1 ? "s are" : " is"} within range (${desc(ok)})`);
    else if (ok.length >= 2) out.push(`${g}: ${ok.length} of ${a.length} in range (${desc(ok)})`);
  }
  for (const k of Object.keys(st.series)) {
    const s = st.series[k];
    if (!M[k] || s.length < 3) continue;
    if (statusOf(k, s[0].v) !== "ok" && statusOf(k, s[s.length - 1].v) === "ok") out.push(`${M[k].l} moved back into range: ${f(s[0].v, M[k].dp)} \u2192 ${f(s[s.length - 1].v, M[k].dp)} ${M[k].u} (${dstr(s[0].d)} \u2192 ${dstr(s[s.length - 1].d)})`);
  }
  return out;
}

const REGIONS = [
  { id: "brain", name: "Brain", side: "L", pos: [0, 1.79, 0], keys: [], ev: /MRI Brain|MRA Intracranial|migraine/i, cites: ["migraineMri"] },
  { id: "throat", name: "Nose & throat (ENT)", side: "R", pos: [0, 1.45, 0.05], keys: ["ebv_vca"], ev: /nasoendoscop|\bENT\b|nasopharyn|\bEBV\b|NPC/, cites: ["ebvSg", "ebvNpcMeta", "ebvSg2"] },
  { id: "gut", name: "Gut, gallbladder & tumour markers", side: "R", pos: [0.06, 0.96, 0.1], keys: ["cea", "ca199", "afp", "gb_polyp", "hpylori"], ev: /gallbladder|polyp|occult blood|pancrea|faecal|stool|Pancreas/i, cites: ["ca199Asym", "ceaLiver", "gbPolyp"] },
  { id: "heart", name: "Heart & arteries", side: "R", pos: [0.05, 1.33, 0.085], ev: /ECG|electrocardiogram|chest x-ray/i, cites: ["escEsh", "ldlCausal", "av1"], keys: ["bp_sys", "bp_dia", "ldl", "chol_hdl_ratio", "pr", "qtc", "apob", "lpa", "cac", "ascvd10", "rhr", "hscrp"], cites: ["escEsh", "ldlCausal", "retinaCvd"] },
  { id: "thyroid", name: "Thyroid", side: "L", pos: [0, 1.52, 0.058], keys: ["ft4", "tsh", "ft3"], cites: ["biotin", "biotinThy"] },
  { id: "muscle", name: "Muscle", side: "L", pos: [0.34, 1.2, 0.0], keys: ["almi", "ffmi", "dexa_lean", "grip"], cites: ["ewgsop", "sarcOb", "glp1Lean"] },
  { id: "liver", name: "Liver", side: "L", pos: [-0.075, 1.2, 0.04], keys: ["alt", "ast", "ggt", "alp", "albumin", "bili"], ev: /liver|hepat|haemangioma|hemangioma/i, cites: ["hemangMgmt", "hemangImg"] },
  { id: "abdomen", name: "Abdomen \u00b7 visceral fat & glucose", side: "R", pos: [0, 1.04, 0.1], keys: ["dexa_vat", "dexa_fat_pct", "trunk_fat_pct", "android_gynoid", "waist", "bmi", "hba1c", "glucose", "insulin"], cites: ["vat", "vatEx"] },
  { id: "kidney", name: "Kidneys", side: "L", pos: [-0.07, 1.12, -0.06], keys: ["egfr", "creatinine", "urea", "uric", "kidney_cyst"], ev: /kidney|renal|urine/i, cites: ["bosniak", "creatMuscle"] },
  { id: "spine", name: "Bone", side: "L", pos: [0, 1.3, -0.085], keys: ["dexa_tscore", "pth", "vitd"], cites: ["glp1Bone", "boneRt"] },
  { id: "prostate", name: "Hormones & reproductive", side: "R", pos: [0, 0.88, 0.04], keys: ["testosterone", "oestradiol", "psa", "dheas", "cortisol"], cites: ["biotin", "testoWeight", "testoDiurnal"] },
  { id: "legs", name: "Legs \u00b7 fitness", side: "L", pos: [0.11, 0.55, 0.02], keys: ["vo2max", "grip", "dexa_lean"], cites: ["boneRt", "strength", "crf"] }
];

export function buildCallouts(st) {
  const bp = bpSummary(st), sigs = buildSignals(st), out = [];
  for (const r of REGIONS) {
    const rows = r.keys.map((k) => evRow(st, k, bp)).filter(Boolean);
    const rated = rows.filter((x) => M[x.key] && (M[x.key].hi != null || M[x.key].lo != null || M[x.key].watch != null || M[x.key].watchLo != null || M[x.key].trendWatch));
    const rf = reportFindings(st);
    const evs = r.ev ? st.events.filter((e) => (e.type === "imaging" || e.type === "procedure" || e.type === "serology" || e.type === "screening" || e.type === "note") && r.ev.test((e.title || "") + " " + (e.detail || ""))).sort((a, b) => b.t - a.t) : [];
    const evW = evs.filter((e) => rf.some((x) => x.e === e && x.status !== "ok"));
    let status = rated.length ? worstOf(rated.map((x) => x.status)) : rows.length || evs.length ? "ok" : "na";
    if (evW.length && (status === "ok" || status === "na")) status = "watch";
    const bad = rated.filter((x) => x.status !== "ok");
    out.push({ id: r.id, name: r.name, side: r.side, pos: r.pos, status,
      head: status === "na" ? "No data yet for this region" : bad.length ? `${bad.slice(0, 3).map((x) => x.label).join(", ")}${bad.length > 3 ? " and more" : ""} outside range or on watch` : evW.length ? `Imaging/report finding to follow: ${String(evW[0].title).slice(0, 90)}` : rows.length ? "All tracked markers in range" : "Reports found; no flagged measurements",
      lines: status === "na" ? ["No report in the records contains these measurements."] : [...rows.map((x) => `${x.label}: ${x.value}${x.status !== "ok" ? " (" + SL[x.status] + ")" : ""}`), ...evs.slice(0, 4).map((e) => `${dstr(e.start)} \u00b7 ${String(e.title).slice(0, 80)}: ${String(e.detail || "").slice(0, 200)}`)],
      sig: sigs.filter((s) => s.keys.some((k) => r.keys.includes(k))).map((s) => s.id), metrics: rows.map((x) => x.key), cites: status === "na" ? [] : (r.cites || []) });
  }
  const ret = st.ev("retina");
  out.push({ id: "eyes", name: "Eyes \u00b7 retinal screening", side: "L", pos: [0, 1.69, 0.1], status: ret.length ? (sigs.some((s) => s.id === "S9") ? "watch" : "ok") : "na",
    head: ret.length ? String(ret[ret.length - 1].title || "Eye screening") : "No data yet for this region",
    lines: ret.length ? ret.map((x) => `${dstr(x.start)}: ${String(x.detail || x.title).slice(0, 240)}`) : ["No eye or retinal report in the records."],
    sig: sigs.some((s) => s.id === "S9") ? ["S9"] : [], metrics: [], cites: ret.length ? ["glaucBp", "retinalAge"] : [] });
  return out;
}

/** Everything the protocol step is built from, as one JSON-friendly object. The Protocols page also writes it into the page as #analysis-snapshot so the build step can read the exact analysis the app computed.
 *  `key` values are stable (signal topic or S-id, root-cause catalogue key, marker key); `id` values are the labels the other tabs show. `fingerprint` changes whenever a signal, its severity, a root cause or a flagged trend changes. */
export function analysisSnapshot(st) {
  const bp = bpSummary(st);
  const signals = buildSignals(st).map((s) => ({ key: s.key, id: s.id, title: s.title, sev: s.sev, headline: s.headline, domains: s.domains, markers: s.keys, evidence: s.evidence.slice(0, 10).map((e) => ({ label: e.label, value: e.value, status: e.status, note: String(e.note || "").slice(0, 200) })), next: s.next }));
  const causes = buildCauses(st).map((c) => ({ key: c.key, id: c.id, name: c.name, conf: c.conf, explains: c.explains, for: c.for, against: c.against.slice(0, 4), test: c.test }));
  const trends = Object.keys(st.series).map((k) => evRow(st, k, bp)).filter((r) => r && r.status !== "ok").map((r) => ({ key: r.key, label: r.label, group: M[r.key].g, status: r.status, value: r.value, note: r.note }));
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16); };
  const basis = [...signals.map((s) => `s:${s.key}:${s.sev}`), ...causes.map((c) => `c:${c.key}`), ...trends.map((t) => `t:${t.key}:${t.status}`)].sort().join("|");
  const p = st.profile || {};
  return { patient: { age: p.age, sex: p.sex }, signals, causes, trends, fingerprint: hash(basis), generated: new Date().toISOString().slice(0, 10) };
}
