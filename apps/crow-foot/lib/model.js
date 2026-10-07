// Pull request model, section assembly, stacks and formatting.
import { holds } from "./query.js";

export const SNOOZED = { id: "snoozed", title: "Snoozed", query: "", limit: 0, collapsed: true, color: "#71718c", countsTowardBadge: false };

const NEEDS_YOUR_REVIEW = "is:open is:pr archived:false -is:draft (user-review-requested:@me or (review-requested:@me -user-review-requested:@me -reviewed-by:@me))";
const sec = (id, title, query, limit, collapsed, color) => ({ id, title, query, limit, collapsed, color, countsTowardBadge: false });

export const defaultConfig = () => ({
  refreshIntervalSeconds: 120,
  globalFilters: [],
  sections: [
    sec("needs-your-review", "Needs your review", NEEDS_YOUR_REVIEW, 50, false, "#f5c451"),
    sec("changes-requested", "Changes requested", "is:open is:pr author:@me review:changes-requested archived:false", 50, false, "#e5484d"),
    sec("ready-to-merge", "Ready to merge", "is:open is:pr author:@me review:approved -is:draft archived:false", 50, false, "#3dd68c"),
    sec("waiting-on-reviewers", "Waiting on reviewers", "is:open is:pr author:@me -review:approved -review:changes-requested -is:draft archived:false", 50, false, "#4f8cff"),
    sec("mentions-you", "Mentions you", "is:open is:pr mentions:@me -author:@me archived:false", 25, false, "#a78bfa"),
    sec("your-drafts", "Your drafts", "is:open is:pr author:@me is:draft archived:false", 25, true, "#9292ad"),
    sec("recently-merged", "Recently merged", "is:pr author:@me is:merged archived:false", 10, true, "#2dd4bf"),
  ],
});

export function normalizeConfig(raw) {
  const base = defaultConfig();
  if (!raw || !Array.isArray(raw.sections)) return base;
  return {
    connectedAt: raw.connectedAt || null,
    refreshIntervalSeconds: Math.min(3600, Math.max(15, Number(raw.refreshIntervalSeconds) || 120)),
    globalFilters: (raw.globalFilters || []).map((f, i) => ({ id: f.id || `global-${i}`, query: String(f.query || ""), enabled: f.enabled !== false })),
    sections: raw.sections.map((s, i) => ({
      id: s.id || `section-${i}`,
      title: String(s.title || "Untitled"),
      query: String(s.query || ""),
      limit: Math.min(100, Math.max(1, Number(s.limit) || 50)),
      collapsed: s.collapsed === true,
      color: /^#[0-9a-f]{6}$/i.test(s.color || "") ? s.color : "#9292ad",
      countsTowardBadge: s.countsTowardBadge === true,
    })),
  };
}

export function toPullRequest(n) {
  if (!n || !n.id || n.number == null) return null;
  const repo = n.repository || {};
  const def = repo.defaultBranchRef && repo.defaultBranchRef.name;
  const requested = ((n.reviewRequests || {}).nodes || [])
    .map((x) => x && x.requestedReviewer)
    .filter(Boolean)
    .map((r) => r.login || r.name)
    .filter(Boolean);
  const commit = ((n.commits || {}).nodes || [])[0];
  const rollup = commit && commit.commit && commit.commit.statusCheckRollup;
  return {
    id: n.id,
    number: n.number,
    title: n.title || "",
    url: n.url || "",
    repo: repo.nameWithOwner || "",
    isPrivate: !!repo.isPrivate,
    isDraft: !!n.isDraft,
    baseRef: n.baseRefName || "",
    headRef: n.headRefName || "",
    targetsNonDefault: !!def && def !== n.baseRefName,
    state: n.state || "OPEN",
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    additions: n.additions || 0,
    deletions: n.deletions || 0,
    changedFiles: n.changedFiles || 0,
    commentCount: n.totalCommentsCount || 0,
    isRead: n.isReadByViewer == null ? true : !!n.isReadByViewer,
    checkState: (rollup && rollup.state) || "NONE",
    reviewDecision: n.reviewDecision || "NONE",
    mergeable: n.mergeable || "UNKNOWN",
    author: n.author || null,
    labels: ((n.labels || {}).nodes || []).filter(Boolean),
    requestedReviewers: requested,
    latestReviews: ((n.latestReviews || {}).nodes || []).filter(Boolean),
  };
}

/** One section from the searches the pipeline ran for it. `results` maps sid -> {meta, prs}. */
export function assembleSection(config, plan, results) {
  const out = { config, prs: [], total: 0, partial: false, error: null, pending: false, authError: false };
  const pages = [];
  for (let i = 0; i < plan.searches.length; i++) {
    const r = results.get(`${config.id}#${i}`);
    if (!r) { out.pending = true; return out; }
    // GitHub answers a search with partial data plus an `errors` list when one optional field
    // (for example a team name, which needs read:org) is out of scope. That is not a failed
    // query: only treat the errors as fatal when the search itself returned nothing.
    const noResult = r.meta.issue_count == null;
    if (r.meta.call_error || (r.meta.gh_error && noResult) || (r.meta.http_status && r.meta.http_status !== 200)) {
      out.error = (r.meta.http_status === 401 ? "GitHub rejected the token. It may be wrong, expired or revoked." : null) ||
        r.meta.gh_error || r.meta.call_error || `GitHub responded ${r.meta.http_status}.`;
      out.authError = r.meta.http_status === 401 || /token|credential|scope|unauthor|bad credentials/i.test(out.error);
      return out;
    }
    pages.push(r);
  }
  const alone = plan.githubCountsAlone;
  const capped = pages.some((p) => (p.meta.issue_count || 0) > p.prs.length);
  const counted = pages.reduce((s, p) => s + (p.meta.issue_count || 0), 0);
  const seen = new Set();
  let kept = [];
  plan.searches.forEach((search, i) => {
    for (const pr of pages[i].prs) {
      if (search.kept.every((l) => holds(l, pr)) && !seen.has(pr.id)) {
        seen.add(pr.id);
        kept.push(pr);
      }
    }
  });
  if (plan.searches.length > 1) kept.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  out.total = alone ? counted : kept.length;
  out.partial = capped && !alone;
  out.prs = kept.slice(0, config.limit);
  return out;
}

// ---- stacks ----------------------------------------------------------------

const branchKey = (repo, branch) => `${repo}\u0000${branch}`;

function parentsOf(prs) {
  const byBranch = new Map(prs.map((p) => [branchKey(p.repo, p.headRef), p]));
  const parents = new Map();
  for (const p of prs) {
    const parent = byBranch.get(branchKey(p.repo, p.baseRef));
    if (parent && parent.id !== p.id) parents.set(p.id, parent);
  }
  return parents;
}

function childrenOf(prs, parents) {
  const children = new Map();
  for (const p of prs) {
    const parent = parents.get(p.id);
    if (parent) children.set(parent.id, [...(children.get(parent.id) || []), p]);
  }
  return children;
}

export function groupIntoStacks(prs, elsewhere = []) {
  const parents = parentsOf(prs);
  const knownParents = parentsOf([...elsewhere, ...prs]);
  const children = childrenOf(prs, parents);
  const knownChildren = childrenOf([...prs, ...elsewhere], knownParents);
  const placed = new Set();
  const collect = (cur, rows) => {
    if (placed.has(cur.id)) return;
    placed.add(cur.id);
    const parent = knownParents.get(cur.id) || null;
    rows.push({ pr: cur, parent, detached: !parent && cur.targetsNonDefault });
    for (const c of children.get(cur.id) || []) collect(c, rows);
  };
  const groups = [];
  const groupFrom = (p) => {
    const rows = [];
    collect(p, rows);
    if (!rows.length) return;
    const members = new Set(rows.map((r) => r.pr.id));
    const top = knownParents.get(rows[0].pr.id);
    groups.push({
      id: rows[0].pr.id,
      rows,
      parentElsewhere: !!top && !members.has(top.id),
      childElsewhere: rows.some((r) => (knownChildren.get(r.pr.id) || []).some((c) => !members.has(c.id))),
    });
  };
  for (const p of prs) if (!parents.has(p.id)) groupFrom(p);
  for (const p of prs) if (!placed.has(p.id)) groupFrom(p);
  return groups;
}

const PALETTE = ["#a78bfa", "#2dd4bf", "#f5c451", "#4f8cff", "#f472b6", "#3dd68c", "#f2792b", "#a3e635"];

export function stackColors(prs) {
  const parents = parentsOf(prs);
  const bottom = (p) => {
    const seen = new Set([p.id]);
    let cur = p;
    for (;;) {
      const parent = parents.get(cur.id);
      if (!parent || seen.has(parent.id)) return cur;
      seen.add(parent.id);
      cur = parent;
    }
  };
  return (p) => PALETTE[bottom(p).number % PALETTE.length];
}

// ---- formatting ------------------------------------------------------------

export function relativeAge(iso, now = Date.now()) {
  const MIN = 60000;
  const e = now - new Date(iso).getTime();
  if (!(e >= 0)) return "now";
  if (e < MIN) return "now";
  if (e < 60 * MIN) return `${Math.floor(e / MIN)}m`;
  if (e < 24 * 60 * MIN) return `${Math.floor(e / (60 * MIN))}h`;
  if (e < 7 * 24 * 60 * MIN) return `${Math.floor(e / (24 * 60 * MIN))}d`;
  if (e < 365 * 24 * 60 * MIN) return `${Math.floor(e / (7 * 24 * 60 * MIN))}w`;
  return `${Math.floor(e / (365 * 24 * 60 * MIN))}y`;
}

export const absoluteTime = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function readableText(hex) {
  const v = hex.replace("#", "");
  const r = parseInt(v.slice(0, 2), 16), g = parseInt(v.slice(2, 4), 16), b = parseInt(v.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#0f172a" : "#ffffff";
}

export const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
