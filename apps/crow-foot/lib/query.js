// Crow's Foot query language: GitHub issue search plus `or`, `not`, parentheses and
// qualifiers GitHub cannot answer (checked locally on the rows GitHub returns).
// A port of the desktop app's parser and planner.

export class QueryError extends Error {}
const fail = (m) => new QueryError(m);

const Q = (key, value) => ({ t: "term", key: key.toLowerCase(), value });
const T = (value) => ({ t: "term", key: null, value });
const not = (e) => ({ t: "not", e });
const every = (ops) => (ops.length === 1 ? ops[0] : { t: "every", ops });
const any = (ops) => (ops.length === 1 ? ops[0] : { t: "any", ops });
const quote = (v) => (v === "" || /\s/.test(v) ? `"${v}"` : v);
export const renderTerm = (t) => (t.key ? `${t.key}:${quote(t.value)}` : quote(t.value));

function word(src, start) {
  let i = start;
  let text = "";
  let keyEnds = null;
  let quoted = false;
  let inside = false;
  while (i < src.length) {
    const c = src[i];
    if (c === '"') {
      quoted = true;
      inside = !inside;
    } else if (!inside && (/\s/.test(c) || c === "(" || c === ")")) {
      break;
    } else if (c === ":" && !inside && keyEnds === null) {
      keyEnds = text.length;
      text += c;
    } else {
      text += c;
    }
    i++;
  }
  if (inside) throw fail("The query has a quote that is never closed.");
  const tokens = [];
  if (text.startsWith("-") && !quoted) {
    tokens.push({ k: "not" });
    text = text.slice(1);
    if (keyEnds !== null) keyEnds -= 1;
  }
  if (text === "" && !quoted) return { tokens, next: i };
  if (keyEnds !== null) tokens.push({ k: "term", term: Q(text.slice(0, keyEnds), text.slice(keyEnds + 1)) });
  else if (!quoted && /^or$/i.test(text)) tokens.push({ k: "or" });
  else if (!quoted && /^and$/i.test(text)) tokens.push({ k: "and" });
  else if (!quoted && /^not$/i.test(text)) tokens.push({ k: "not" });
  else tokens.push({ k: "term", term: T(text) });
  return { tokens, next: i };
}

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) i++;
    else if (c === "(") { tokens.push({ k: "open" }); i++; }
    else if (c === ")") { tokens.push({ k: "close" }); i++; }
    else {
      const r = word(src, i);
      tokens.push(...r.tokens);
      i = r.next;
    }
  }
  return tokens;
}

export function parse(source) {
  const toks = tokenize(source);
  let at = 0;
  const peek = () => toks[at];
  const take = (k) => {
    const hit = peek() && peek().k === k;
    if (hit) at++;
    return !!hit;
  };
  function disjunction() {
    const ops = [conjunction()];
    while (take("or")) ops.push(conjunction());
    return any(ops);
  }
  function conjunction() {
    const ops = [unary()];
    for (;;) {
      const explicit = take("and");
      const p = peek();
      if (!explicit && (!p || p.k === "close" || p.k === "or")) break;
      ops.push(unary());
    }
    return every(ops);
  }
  function unary() {
    const p = peek();
    if (!p) throw fail("The query ends where a term should be.");
    if (p.k === "not") { at++; return not(unary()); }
    if (p.k === "term") { at++; return p.term ? { ...p.term } : null; }
    if (p.k === "open") {
      at++;
      const inside = disjunction();
      if (!take("close")) throw fail("The query has a `(` that is never closed.");
      return inside;
    }
    if (p.k === "close") throw fail("The query has an empty `()`.");
    throw fail("The query has `and` or `or` with nothing before it.");
  }
  const e = disjunction();
  if (peek()) throw fail("Unbalanced `)` in the query.");
  return e;
}

// ---- local qualifiers ------------------------------------------------------

const FLAGS = new Set(["unread", "conflicts", "stacked"]);
const COUNTS = new Set(["size", "files", "reviewers", "approvals"]);

function flag(key, value) {
  if (value === "yes" || value === "true") return true;
  if (value === "no" || value === "false") return false;
  throw fail(`\`${key}:\` takes yes or no, not \`${value}\`.`);
}

function comparison(key, value) {
  let op = "=";
  let digits = value;
  if (value.startsWith(">=")) { op = ">="; digits = value.slice(2); }
  else if (value.startsWith("<=")) { op = "<="; digits = value.slice(2); }
  else if (value.startsWith(">")) { op = ">"; digits = value.slice(1); }
  else if (value.startsWith("<")) { op = "<"; digits = value.slice(1); }
  if (!/^\d+$/.test(digits)) {
    throw fail(`\`${key}:\` takes a number, optionally after >, >=, <, or <=, not \`${value}\`.`);
  }
  return { op, against: Number(digits) };
}

const compare = (c, n) =>
  c.op === ">" ? n > c.against : c.op === ">=" ? n >= c.against : c.op === "<" ? n < c.against : c.op === "<=" ? n <= c.against : n === c.against;

function readLocal(term, negated) {
  const key = term.key;
  if (!key) return null;
  let arg;
  if (FLAGS.has(key)) arg = flag(key, term.value);
  else if (COUNTS.has(key)) arg = comparison(key, term.value);
  else return null;
  return { negated, term, key, arg };
}

const approvals = (pr) => pr.latestReviews.filter((r) => r.state === "APPROVED").length;

export function holds(local, pr) {
  const { key, arg } = local;
  let ok;
  if (key === "unread") ok = pr.isRead !== arg;
  else if (key === "conflicts") ok = (pr.mergeable === "CONFLICTING") === arg;
  else if (key === "stacked") ok = pr.targetsNonDefault === arg;
  else if (key === "size") ok = compare(arg, pr.additions + pr.deletions);
  else if (key === "files") ok = compare(arg, pr.changedFiles);
  else if (key === "reviewers") ok = compare(arg, pr.requestedReviewers.length);
  else ok = compare(arg, approvals(pr));
  return ok !== local.negated;
}

const renderLocal = (l) => `${l.negated ? "-" : ""}${renderTerm(l.term)}`;

// ---- planning --------------------------------------------------------------

const MOST_SEARCHES = 8;
const ANCHORS = new Set(["assignee", "author", "commenter", "involves", "mentions", "org", "repo", "review-requested", "reviewed-by", "team", "team-review-requested", "user", "user-review-requested"]);

function untouchedSince(value, today) {
  const complaint = () => fail(`\`idle:\` takes a span of days or weeks after > or <, like idle:>7d, not \`${value}\`.`);
  let longer;
  let span;
  if (value.startsWith(">")) { longer = true; span = value.slice(1); }
  else if (value.startsWith("<")) { longer = false; span = value.slice(1); }
  else throw complaint();
  let count;
  let per;
  if (span.endsWith("d")) { count = span.slice(0, -1); per = 1; }
  else if (span.endsWith("w")) { count = span.slice(0, -1); per = 7; }
  else throw complaint();
  if (!/^\d+$/.test(count)) throw complaint();
  const d = new Date(today.getTime() - Number(count) * per * 86400000);
  const edge = d.toISOString().slice(0, 10);
  return Q("updated", `${longer ? "<" : ">"}${edge}`);
}

function shorthand(term, today) {
  const key = term.key;
  if (!key) return null;
  if (key === "review" && term.value === "re-requested") {
    return { t: "every", ops: [Q("review-requested", "@me"), Q("reviewed-by", "@me")] };
  }
  if (key === "checks") {
    const m = { failing: "failure", passing: "success", pending: "pending" }[term.value];
    if (!m) throw fail(`\`checks:\` takes failing, passing, or pending, not \`${term.value}\`.`);
    return Q("status", m);
  }
  if (key === "idle") return untouchedSince(term.value, today);
  return null;
}

function expand(e, today) {
  if (e.t === "term") return shorthand(e, today) || e;
  if (e.t === "not") return not(expand(e.e, today));
  return { t: e.t, ops: e.ops.map((o) => expand(o, today)) };
}

const within = (b) => {
  if (b.length > MOST_SEARCHES) throw fail(`This query spreads into more than ${MOST_SEARCHES} searches. Narrow it, or split it across sections.`);
  return b;
};

function spread(e, negated) {
  if (e.t === "term") return [[{ negated, term: e }]];
  if (e.t === "not") return spread(e.e, !negated);
  const union = () => within(e.ops.flatMap((o) => spread(o, negated)));
  const product = () => {
    let combined = [[]];
    for (const o of e.ops) {
      const branches = spread(o, negated);
      const widened = [];
      for (const s of combined) for (const b of branches) widened.push([...s, ...b]);
      combined = within(widened);
    }
    return combined;
  };
  if (e.t === "every") return negated ? union() : product();
  return negated ? product() : union();
}

function compile(disjunct) {
  const query = [];
  const kept = [];
  const push = (arr, item, render) => {
    if (!arr.some((h) => render(h) === render(item))) arr.push(item);
  };
  for (const lit of disjunct) {
    const local = readLocal(lit.term, lit.negated);
    if (local) push(kept, local, renderLocal);
    else push(query, `${lit.negated ? "-" : ""}${renderTerm(lit.term)}`, (s) => s);
  }
  if (!query.length) {
    const shown = disjunct.map((l) => `${l.negated ? "-" : ""}${renderTerm(l.term)}`).join(" ");
    throw fail(`\`${shown}\` gives GitHub nothing to search for. Every branch of an \`or\` needs a qualifier GitHub understands.`);
  }
  return { query: query.join(" "), kept };
}

const anchored = (d) => d.some((l) => !l.negated && l.term.key && ANCHORS.has(l.term.key));

/** Compile a section's query, narrowed by the enabled global filters. */
export function plan(sectionQuery, globalFilters = [], today = new Date()) {
  const operands = [parse(sectionQuery)];
  for (const f of globalFilters.filter((g) => g.enabled && g.query.trim())) {
    try {
      operands.push(parse(f.query));
    } catch (e) {
      throw fail(`Global filter \`${f.query}\`: ${e.message}`);
    }
  }
  const expanded = expand(every(operands), today);
  const searches = [];
  const warnings = [];
  for (const d of spread(expanded, false)) {
    const s = compile(d);
    if (!anchored(d)) warnings.push(`\`${s.query}\` is not held to a person, org, or repo, so GitHub searches all of it.`);
    searches.push(s);
  }
  return {
    searches: searches.map((s) => ({ query: s.query, kept: s.kept, keptText: s.kept.map(renderLocal) })),
    warnings,
    githubCountsAlone: searches.length === 1 && searches[0].kept.length === 0,
  };
}
