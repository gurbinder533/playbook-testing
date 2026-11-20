# Signup Cohort Explorer — full builder instructions

Paste this whole file into a new Corvic room's **New App** builder chat (or hand it to the app's own agent) to regenerate the app and its pipeline. It records what was built, the exact pipeline code and SQL, the app behaviour, and the traps found along the way.

> Build order: **(1) pipeline → (2) run and verify the numbers → (3) app bundle → (4) browser check**. Never design pages before the pipeline has produced rows. Edit the app's own bundle files in place (`app.yaml`, `pages/home.js`, `lib/calc.js`, `lib/charts.js`, `styles.css`); never create a second bundle.

---

## 0. What the app is

An interactive dashboard, "Signup Cohort Explorer". The user picks a start and end date; the app shows everyone who signed up in that range (PostHog project **70607**, vault API id **54**, host `us.i.posthog.com`), analyses each person's journey, and shows who got value from Corvic, who got stuck, and where people dropped off. All times are UTC.

**Date-range design decision:** a *rolling store*. The pipeline keeps one analysed row per signup since 2026-09-16 and only processes people not seen before. The app filters the store by date in the browser. There is no per-range pipeline parameter.

**One control button, "Reload"** (there is no separate Refresh). It re-reads stored results, then starts the pipeline only if the selected range reaches past what PostHog was already read for (see §3.4).

---

## 1. PostHog facts and traps (learned the hard way)

- Query endpoint: `POST https://us.i.posthog.com/api/projects/70607/query/` with `{"query": {"kind": "HogQLQuery", "query": "..."}}`. The vault injects auth; send no header.
- `OFFSET` is rejected on personal API keys. Use `LIMIT` and keyset pagination (a `created_at`/`timestamp` high-water mark).
- `persons.created_at` is project-local time (**UTC−5**), returned with an offset like `2026-10-15T20:16:53-05:00`. Convert to UTC before bucketing by day. **Any cutoff you compare to `persons.created_at` must also be in that local clock** — the first build used `now() - INTERVAL 3 HOUR` and returned zero rows; computing the cutoff as `utcnow - settle_hours - 5h` and passing it as a literal fixed it.
- One person has several distinct ids (a numeric user id plus anonymous UUIDs). Pull ids from `person_distinct_ids`, then also merge events by `properties.$device_id`, but only when that device does not belong to another identified (numeric) person.
- Queries over many people time out (504). Pull **per person**, about 3 at a time, retry on 429/5xx.
- Some accounts have no browser events, only server-side events (`onboarding::user_create`, `onboarding::organization_create`). Keep them, tier "Unknown".
- Signup = the person's `created_at`. The server events `onboarding::user_create` and `onboarding::organization_create` mark completed onboarding.
- Business events: `subscription::organization_upgrade`, `billing::organization_topup`, `member::user_invite`, `member::user_remove`.
- React `#418` = hydration mismatch (first screen after signup). React `#441` = a server-components render error whose message is hidden in production (react.dev/errors/441); it was labelled "Plan page" in this app by the user's description but that link is unverified. `ResizeObserver` exceptions are benign: count, don't display as friction.
- The LLM router at `https://api.corvic.ai/openai/v1/chat/completions` **rejects the `temperature` parameter** (HTTP 400 "bad request"). Omit it. Model name `claude-sonnet-5-5` (with hyphens, not underscores). Send header `X-Corvic-Room-Id: 1`; no vault, no auth header.
- `execute_sql` (the chat tool) does not support `UNION ALL`; run separate queries.
- A `watch_remote_data` run publishes rows only when it returns; `transform_rows` resumes where it stopped and skips finished rows.
- A "successful last sync" status does not prove a step has rows. Always query row counts before building on a step.

---

## 2. Pipeline: "Signup Cohort Explorer (app)"

Create with `create_pipeline` named exactly `Signup Cohort Explorer (app)` (must end in `(app)`). Write each Python module as its own file table with `edit_text_files` (`source_table_id: -1`, a `create` entry with `path: __main__.py`) and name the returned `<id>:artifact` in `code_source`.

### Actions, in order

| # | Kind | Output name | Input | Notes |
|---|---|---|---|---|
| A | `watch_remote_data` | PostHog signups (rolling store) | none | module §2.1; `vault_api_ids: ["54"]`; args `start="2026-09-16"`, `settle_hours=3`, `page=500`, `max_pages=12` |
| B | `watch_remote_data` | PostHog business events | none | module §2.2; `vault_api_ids: ["54"]`; arg `start="2026-09-16"` |
| C | `execute_sql` | Signups (parsed, internal flagged) | A | SQL §2.3 |
| D | `execute_sql` | Business events (parsed) | B | SQL §2.4 |
| E | `execute_sql` | Signups to analyse (external only) | C | `SELECT person_id, created_at_raw, created_at_utc, email FROM C WHERE NOT is_internal` |
| F | `transform_rows` | Person journey metrics | E | module §2.5; `vault_api_ids: ["54"]`; `rows_in_flight: 3`; `rows_per_batch: 40` |
| G | `execute_sql` | Person profile (classified) | C, F, D | SQL §2.6 |
| H | `transform_rows` | Person narratives (LLM) | G | module §2.7; `rows_in_flight: 8`; `rows_per_batch: 40`; no vault |
| I | `execute_sql` | Signup cohort (app) | G, H | SQL §2.8 — **the app's main table** |
| J | `execute_sql` | Signup roster (counts only) | C | `SELECT person_id, created_at_utc, signup_day, is_internal FROM C` |
| K | `watch_remote_data` | PostHog read heartbeat | none | module §2.9; args `start`, `settle_hours=3` |
| L | `execute_sql` | PostHog read coverage (app) | K, I | SQL §2.10 |

Refer to tables inside SQL by their `<id>:<tag>` ref, quoted (e.g. `"430863:output"`); use the refs `add_pipeline_action` returns. Run the whole pipeline once (`run_pipeline`). Before running everything, test module F on 3–4 people and module H on 3 people with `execute_python` harnesses (exec the module source, call `transform_row`) and read the results.

### 2.1 Module A — signups watch

```python
"""watch: PostHog persons (signups) not yet published. Rolling store."""
import json
import time
from datetime import datetime, timedelta, timezone

import corvic_runner
import polars as pl
import requests

URL = "https://us.i.posthog.com/api/projects/70607/query/"


def _hogql(sql, attempts=5):
    last = ""
    for i in range(attempts):
        try:
            r = requests.post(URL, json={"query": {"kind": "HogQLQuery", "query": sql}}, timeout=110)
        except requests.RequestException as exc:
            last = repr(exc)
            time.sleep(3 * (i + 1))
            continue
        if r.status_code == 200:
            return r.json().get("results") or []
        last = f"http {r.status_code}: {r.text[:300]}"
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(min(40, 4 * (i + 1)))
            continue
        break
    raise RuntimeError(last)


def _utc(raw):
    return datetime.fromisoformat(raw).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def watch(*, start="2026-09-16", settle_hours=3, page=500, max_pages=12):
    state = corvic_runner.watch_state() or {}
    lo = state.get("hwm") or f"{start} 00:00:00"
    published = corvic_runner.previous_output()
    seen = set()
    if published is not None and "logical_clock" in published.columns and published.height:
        seen = set(published["logical_clock"].drop_nulls().cast(pl.String).to_list())
    # persons.created_at is project-local (UTC-5): express the settle cutoff in that clock
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=float(settle_hours)) - timedelta(hours=5)).strftime("%Y-%m-%d %H:%M:%S")
    fresh = []
    hwm = lo
    for _ in range(max_pages):
        sql = (
            "SELECT id, created_at, properties.email, properties.name, properties.role, properties.plan, "
            "properties.org_id, properties.org_name, properties.$initial_device_type, "
            "properties.$geoip_country_name, properties.gclid, properties.$initial_gclid, "
            "properties.$initial_pathname, properties.$initial_current_url, "
            "properties.$initial_referring_domain, properties.$initial_referrer, properties.$initial_utm_source "
            f"FROM persons WHERE created_at >= toDateTime('{lo}') "
            f"AND created_at <= toDateTime('{cutoff}') "
            f"ORDER BY created_at ASC LIMIT {int(page)}"
        )
        rows = _hogql(sql)
        for r in rows:
            pid = str(r[0])
            raw = str(r[1])
            hwm = max(hwm, raw[:19].replace("T", " "))
            if pid in seen:
                continue
            seen.add(pid)
            rec = {
                "person_id": pid, "created_at_raw": raw, "created_at_utc": _utc(raw),
                "email": (r[2] or ""), "name": (r[3] or ""), "role": (r[4] or ""), "plan": (r[5] or ""),
                "org_id": (r[6] or ""), "org_name": (r[7] or ""), "device": (r[8] or ""),
                "country": (r[9] or ""), "gclid": (r[10] or r[11] or ""),
                "initial_pathname": (r[12] or ""), "initial_url": (r[13] or "")[:300],
                "initial_referring_domain": (r[14] or ""), "initial_referrer": (r[15] or "")[:300],
                "utm_source": (r[16] or ""),
            }
            fresh.append({"content": json.dumps(rec, sort_keys=True), "logical_clock": pid})
        if len(rows) < int(page):
            break
        lo = hwm
    corvic_runner.set_watch_state({"hwm": hwm})
    fresh.reverse()  # newest signups first
    return fresh
```

### 2.2 Module B — business events watch

```python
"""watch: PostHog business events (upgrades, top-ups, invites, removals)."""
import json
import time
from datetime import datetime, timezone

import corvic_runner
import polars as pl
import requests

URL = "https://us.i.posthog.com/api/projects/70607/query/"
EVENTS = ("subscription::organization_upgrade", "billing::organization_topup", "member::user_invite", "member::user_remove")


def _hogql(sql, attempts=5):
    last = ""
    for i in range(attempts):
        try:
            r = requests.post(URL, json={"query": {"kind": "HogQLQuery", "query": sql}}, timeout=110)
        except requests.RequestException as exc:
            last = repr(exc)
            time.sleep(3 * (i + 1))
            continue
        if r.status_code == 200:
            return r.json().get("results") or []
        last = f"http {r.status_code}: {r.text[:300]}"
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(min(40, 4 * (i + 1)))
            continue
        break
    raise RuntimeError(last)


def _utc(raw):
    return datetime.fromisoformat(raw).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def watch(*, start="2026-09-16", page=500, max_pages=12):
    state = corvic_runner.watch_state() or {}
    lo = state.get("hwm") or f"{start} 00:00:00"
    published = corvic_runner.previous_output()
    seen = set()
    if published is not None and "logical_clock" in published.columns and published.height:
        seen = set(published["logical_clock"].drop_nulls().cast(pl.String).to_list())
    names = ", ".join("'" + e + "'" for e in EVENTS)
    fresh = []
    hwm = lo
    for _ in range(max_pages):
        sql = (
            "SELECT toString(uuid), timestamp, event, distinct_id, toString(person_id), "
            "properties.organization_id, left(toString(properties), 1500) "
            f"FROM events WHERE event IN ({names}) AND timestamp >= toDateTime('{lo}') "
            f"ORDER BY timestamp ASC LIMIT {int(page)}"
        )
        rows = _hogql(sql)
        for r in rows:
            uid = str(r[0]); raw = str(r[1])
            hwm = max(hwm, raw[:19].replace("T", " "))
            if uid in seen:
                continue
            seen.add(uid)
            props = r[6] or ""
            rec = {"event_id": uid, "timestamp_utc": _utc(raw), "event": r[2], "distinct_id": str(r[3]),
                   "person_id": str(r[4] or ""), "organization_id": r[5] or "", "internal": "@corvic.ai" in props, "props": props}
            fresh.append({"content": json.dumps(rec, sort_keys=True), "logical_clock": uid})
        if len(rows) < int(page):
            break
        lo = hwm
    corvic_runner.set_watch_state({"hwm": hwm})
    return fresh
```

### 2.3 SQL C — parse signups, flag internal test accounts

```sql
WITH p AS (
  SELECT
    json_extract_string(content,'$.person_id') AS person_id,
    json_extract_string(content,'$.created_at_raw') AS created_at_raw,
    json_extract_string(content,'$.created_at_utc') AS created_at_utc,
    lower(json_extract_string(content,'$.email')) AS email,
    json_extract_string(content,'$.name') AS name,
    json_extract_string(content,'$.role') AS role,
    json_extract_string(content,'$.plan') AS plan,
    json_extract_string(content,'$.org_id') AS org_id,
    json_extract_string(content,'$.org_name') AS org_name,
    json_extract_string(content,'$.device') AS device,
    json_extract_string(content,'$.country') AS country,
    json_extract_string(content,'$.gclid') AS gclid,
    json_extract_string(content,'$.initial_pathname') AS initial_pathname,
    json_extract_string(content,'$.initial_url') AS initial_url,
    json_extract_string(content,'$.initial_referring_domain') AS initial_referring_domain,
    json_extract_string(content,'$.initial_referrer') AS initial_referrer,
    json_extract_string(content,'$.utm_source') AS utm_source,
    fetched_at
  FROM "<A:watch_remote_data>"
), d AS (
  SELECT *, row_number() OVER (PARTITION BY person_id ORDER BY fetched_at DESC) AS rn FROM p
)
SELECT person_id, created_at_raw, created_at_utc, left(created_at_utc,10) AS signup_day, email, name, role, plan, org_id, org_name, device, country, gclid, initial_pathname, initial_url, initial_referring_domain, initial_referrer, utm_source,
  (coalesce(email,'') LIKE '%@corvic.ai'
   OR coalesce(initial_referring_domain,'') LIKE '%melodic-line-16-staging.authkit.app%'
   OR coalesce(initial_referrer,'') LIKE '%melodic-line-16-staging.authkit.app%'
   OR coalesce(initial_url,'') LIKE '%corvic.dev%'
   OR coalesce(initial_url,'') LIKE '%corvic.live%') AS is_internal
FROM d WHERE rn = 1
```

Internal test accounts are excluded from every view and count; the app only shows how many were removed (from the roster table) and never lists them.

### 2.4 SQL D — parse business events

```sql
WITH p AS (
  SELECT json_extract_string(content,'$.event_id') AS event_id,
    json_extract_string(content,'$.timestamp_utc') AS timestamp_utc,
    json_extract_string(content,'$.event') AS event,
    json_extract_string(content,'$.distinct_id') AS distinct_id,
    json_extract_string(content,'$.person_id') AS person_id,
    json_extract_string(content,'$.organization_id') AS organization_id,
    json_extract_string(content,'$.props') AS props,
    fetched_at
  FROM "<B:watch_remote_data>"
), d AS (SELECT *, row_number() OVER (PARTITION BY event_id ORDER BY fetched_at DESC) AS rn FROM p)
SELECT event_id, timestamp_utc, left(timestamp_utc,10) AS day, event, distinct_id, person_id, organization_id,
  lower(regexp_extract(props, '"invited_email":"([^"]*)"', 1)) AS invited_email,
  lower(regexp_extract(props, '"invited_by_email":"([^"]*)"', 1)) AS invited_by_email,
  lower(regexp_extract(props, '"topped_up_by_email":"([^"]*)"', 1)) AS actor_email,
  (props LIKE '%@corvic.ai%') AS internal
FROM d WHERE rn = 1
```

### 2.5 Module F — per-person journey metrics (`transform_row`, sync)

Input row columns: `person_id, created_at_raw, created_at_utc, email`. One output row per input row with the **same keys on every path** (`_empty()` below). Pull per person: ids from `person_distinct_ids` (LIMIT 60), events `WHERE distinct_id IN (...) AND timestamp >= created-1day ORDER BY timestamp LIMIT 5000`, then devices (`$device_id`) merge (LIMIT 2000, skipping devices whose events belong to another numeric distinct id). Raise only on 401/403 (a failure every row shares); catch everything else into `fetch_error`.

Metric rules:
- **Active time**: sum of gaps ≤ 120 s between consecutive *meaningful* events (exclude `$web_vitals`, `$identify`, `$groupidentify`, `$set`).
- **Span** = first→last event; **sessions** = distinct `$session_id`.
- **Page views**, **clicks** (`$autocapture` with `$event_type = click`), **dead clicks / dead swipes / rage clicks**.
- **Exceptions**: `#418`, `#441`, `ResizeObserver` (benign, counted separately), other.
- **returned_1h**: any gap ≥ 3600 s between consecutive page views or clicks.
- **rooms_visited**: distinct `/room/<id>` ids in page views.
- **first_page**, **referring_domain** (first non-`$direct` page view referrer), **has_gclid** (any `$current_url` containing `gclid=`), **shared_app_views** (page views under `/view/app/`), **onboarding_done** (any `onboarding::*` server event), **onboarding_viewed**, **room_entered**.
- **feature_signals** (`;`-joined): lower-cased clicks in `{add, connector vault, adopt this template, send answers, run playbook, build a memory, memory, playbooks, data pipelines, live apps, lens, query builder, mcp playground, sources, + add folder}` as `click:<label>`; page views matching `^/room/\d+/(memory|lens|playbooks?|pipelines?|apps?|mcp)(/|$)|^/vault|^/settings/vault` as `page:<normalised path>`.
- **output_signals**: clicks labelled `download, run, run anyway, approve this schema, approve & embed, build lens, run again`, or a click whose label looks like a file name (`*.pdf|csv|xlsx|png|jpg|md|html|parquet|json|py|txt`).
- **connector_events**: clicks matching `connector|vault|sources?|connect|authori[sz]e|oauth|api key`, plus `/vault` and `/mcp` page views.
- **digest** (≤ ~90 lines, text): lines `+MM:SS <item>` / `+HhMMm` once ≥ 1 h, items: `PV <normalised path>` (UUIDs, room/chat/agent ids normalised), `click "<label ≤ 48 chars>"`, `submit form`, `DEAD CLICK`, `DEAD SWIPE`, `RAGE CLICK`, `EXC React #418 (hydration)`, `EXC React #441 (plan page)`, other exception text, `SERVER onboarding::…`. Collapse consecutive identical lines as `(xN)`; if > 90 lines keep first 55, a `... N lines omitted ...` marker, and last 30.
- Event cap 5,000 per person; set `truncated = true` at the cap and show that on the person's card.

Output keys: `person_id, n_events, truncated, has_browser_events, onboarding_done, onboarding_viewed, first_event_utc, last_event_utc, active_secs, span_secs, sessions, pageviews, clicks, exc_418, exc_441, exc_resize, exc_other, dead_clicks, dead_swipes, rage_clicks, returned_1h, rooms_visited, shared_app_views, first_page, referring_domain, has_gclid, room_entered, feature_signals, output_signals, connector_events, merged_devices, digest, fetch_error`.

**The exact, working modules are attached to this bundle under `pipeline/`:** `A_watch_signups.py`, `B_watch_business_events.py`, `F_person_journey_metrics.py`, `H_person_narratives_llm.py` and `K_watch_read_heartbeat.py`. Use them verbatim as each module's `__main__.py` and prefer them over the inline copies in this document if the two differ. In a new room, copy each file's text into its own file table (`edit_text_files`, `source_table_id: -1`, `path: __main__.py`) and name that table in the action's `code_source`.

In module F, SQL strings stay parameter-safe by only interpolating ids that match `^[\w\-.@:]+$`.

### 2.6 SQL G — classification (stage, source, device, tier, LLM context)

```sql
WITH inv AS (
  SELECT DISTINCT invited_email AS email FROM "<D:output>" WHERE event = 'member::user_invite' AND invited_email <> ''
), base AS (
  SELECT s.person_id, s.created_at_utc, s.signup_day, s.email, s.name, s.role, s.plan, s.org_id, s.org_name,
    coalesce(nullif(s.device,''),'Unknown') AS device_raw, coalesce(nullif(s.country,''),'Unknown') AS country,
    s.initial_pathname, s.initial_referring_domain, s.initial_referrer, s.gclid AS person_gclid,
    m.n_events, m.truncated, m.has_browser_events, m.onboarding_done, m.onboarding_viewed, m.first_event_utc, m.last_event_utc,
    m.active_secs, m.span_secs, m.sessions, m.pageviews, m.clicks, m.exc_418, m.exc_441, m.exc_resize, m.exc_other,
    m.dead_clicks, m.dead_swipes, m.rage_clicks, m.returned_1h, m.rooms_visited, m.shared_app_views, m.first_page,
    m.referring_domain, m.has_gclid, m.room_entered, m.feature_signals, m.output_signals, m.connector_events, m.merged_devices,
    m.digest, m.fetch_error,
    (s.role = 'member' AND NOT coalesce(m.onboarding_done,false) AND s.email IN (SELECT email FROM inv)) AS is_invited
  FROM "<C:output>" s JOIN "<F:transform_rows>" m ON m.person_id = s.person_id
  WHERE NOT s.is_internal
), st AS (
  SELECT *,
    CASE WHEN coalesce(output_signals,'') <> '' THEN 4
         -- stage 3 = ACTIVELY ENGAGED a feature: attached/added data or a source, answered the agent's questions,
         -- adopted a template, started a build/run, or talked to a feature's builder agent. Merely opening the
         -- Lens / Memory / Playbooks / Pipelines / Apps / Vault / MCP pages or nav items does NOT count.
         WHEN regexp_matches(coalesce(feature_signals,''), 'click:(add|send answers|adopt this template|build a memory|\+ add folder|run playbook)(;|$)')
           OR regexp_matches(coalesce(feature_signals,''), 'page:/room/<id>/(apps|playbooks?|pipelines?|memory|lens)/[^;]*/chat/')
           OR regexp_matches(coalesce(digest,''), 'click "(Add|Add & connect|Choose Files|Upload|\+ Add folder|Send answers|Adopt this template|Build a memory|Run playbook)"') THEN 3
         WHEN room_entered THEN 2
         WHEN onboarding_done THEN 1
         ELSE 0 END AS stage,
    CASE WHEN coalesce(person_gclid,'') <> '' OR has_gclid THEN 'Google Ads'
         WHEN is_invited THEN 'Invite flow'
         WHEN first_page LIKE '/view/app/%' OR initial_pathname LIKE '/view/app/%' THEN 'Shared app link'
         WHEN coalesce(referring_domain,'') || coalesce(initial_referring_domain,'') LIKE '%authkit%' THEN 'Auth redirect'
         WHEN coalesce(referring_domain,'') || coalesce(initial_referring_domain,'') LIKE '%corvic.ai%' THEN 'Corvic link'
         ELSE 'Direct' END AS source,
    CASE WHEN lower(device_raw) LIKE 'desktop%' THEN 'Desktop' WHEN lower(device_raw) IN ('mobile','tablet') THEN 'Mobile or tablet' ELSE 'Unknown' END AS device
  FROM base
), tt AS (
  SELECT *,
    CASE WHEN is_invited THEN 'Joined an existing org'
         WHEN NOT coalesce(has_browser_events,false) THEN 'Unknown'
         WHEN stage = 4 THEN 'Got an output / finished a build'
         WHEN stage = 3 THEN 'Stalled after real intent'
         WHEN stage = 0 THEN 'Never got in'
         WHEN stage = 1 AND span_secs <= 150 THEN 'Bounced at home'
         ELSE 'Browsed, no task' END AS tier
  FROM st
)
SELECT *,
  (CASE WHEN fetch_error <> '' THEN '' ELSE
    'Signup (UTC): ' || created_at_utc || chr(10) ||
    'Tier (inferred, use this): ' || tier || '; furthest stage by rule: ' || stage || ' of 4' || chr(10) ||
    'Feature-engagement clicks found (stage 3 needs one of these): ' || CASE WHEN stage >= 3 THEN 'yes' ELSE 'none — any feature pages were only viewed' END || chr(10) ||
    'Source: ' || source || '; device: ' || device || '; country: ' || country || chr(10) ||
    'Onboarding finished: ' || onboarding_done || '; active secs: ' || active_secs || '; span secs: ' || span_secs || '; sessions: ' || sessions || chr(10) ||
    'Rooms visited: ' || rooms_visited || '; dead clicks: ' || dead_clicks || '; rage clicks: ' || rage_clicks || '; React #418: ' || exc_418 || '; React #441: ' || exc_441 || chr(10) ||
    'Returned after 1h+: ' || returned_1h || '; invited into existing org: ' || is_invited || chr(10) ||
    'Event digest (elapsed since first event):' || chr(10) || digest END) AS llm_context
FROM tt
```

**Stage definitions** (all *inferred from clicks, never confirmed*): 0 did not finish signup; 1 reached home; 2 entered a room; 3 **actively used features** (Add / Add & connect / Choose Files / Upload / + Add folder / Send answers / Adopt this template / Build a memory / Run playbook, or a builder-agent chat) — merely viewing the Lens, Memory, Playbooks, Pipelines, Apps, Vault or MCP pages does **not** count (this was tightened at the user's request); 4 got an output / finished a build (Download, Run, Run anyway, Approve this schema, Approve & embed, Build lens, file-name clicks).

**Invited** users (role `member`, no onboarding event, email appears as `invited_email` in a `member::user_invite` event) are shown but kept out of the funnel; everyone else is the self-serve base for all percentages.

### 2.7 Module H — narrative fields (`async transform_row`)

One call per person to `https://api.corvic.ai/openai/v1/chat/completions` with `httpx2` + `tenacity` retries (statuses 408, 409, 429, 500, 502, 503, 504), `model: claude-sonnet-5-5`, `response_format: {"type": "json_object"}`, **no `temperature`**, header `X-Corvic-Room-Id: 1`. Input column read: `llm_context` (≤ 14,000 chars). Return the same keys on every path: `person_id, headline, intent, outcome, drop_off, friction, narrative, worth_a_look, model_error`. Raise a shared-failure error only after 3 identical non-retryable refusals with no success (so a bad endpoint fails the batch instead of silently writing blanks). Tolerate ```` ```json ```` fences when parsing (strip, find first `{` and last `}`).

System prompt = the definitions block below + the rules + the key list.

```text
Definitions used by this report (apply them; do not contradict the tier given in the record):
- Stage 1 'Reached home': finished onboarding and left from the home screen.
- Stage 2 'Entered a room': opened or created a workspace, mostly skipped the tour.
- Stage 3 'Used features': ACTIVELY engaged a feature: clicked Add / Add & connect / Upload / Choose Files, attached or added data, answered the agent's intake questions (Send answers), adopted a template, started a memory build, ran a playbook, or opened a builder chat. Merely opening or clicking into the Lens, Memory, Playbooks, Pipelines, Apps, Vault, Sources or MCP pages and leaving is browsing, NOT using features.
- Stage 4 'Got an output': clicked Download, Run, Run anyway, Approve this schema, Approve & embed or Build lens, or opened agent-generated files; inferred from clicks, never confirmed.
- Tiers: 'Got an output / finished a build' (stage 4); 'Stalled after real intent' (stage 3 that ended at a wall or went quiet); 'Browsed, no task' (stage 1-2, may have looked at feature pages but did not engage them); 'Bounced at home' (finished signup, left within about 2 minutes); 'Never got in' (did not finish onboarding or only viewed a shared app); 'Joined an existing org'; 'Unknown'.
- If the tier is 'Browsed, no task' or lower, never say the person used, tried or engaged a feature; say they looked at or opened it. Only use words like 'used', 'worked with' or 'attempted' for stage 3 or 4 people, and name the specific click that supports it.
You analyse one product-signup journey from a PostHog event digest. Rules: describe ONLY what the events show. Do not guess intent beyond what the clicks support. PostHog cannot see typed text, prompts or agent results, so never claim what someone typed, asked or received. Label conclusions as inferred. Plain, neutral language; no hype.
Answer with ONE JSON object with exactly these keys:
- headline: ONE plain line, at most 16 words, saying what this person did. Only what the events show.
- intent: What they seemed to want, only as far as clicks and pages support. Say 'unclear' when the events do not show it. Max 25 words.
- outcome: What they achieved, inferred from clicks and pages only. Max 25 words.
- drop_off: Where the journey ended (last page or action), e.g. 'Home screen, about 1 min after signup'. Max 20 words.
- friction: Short list of friction points separated by ' | ', e.g. 'Connector / Vault setup loop | Mobile dead taps | React #418 on first load'. Empty string if none.
- narrative: 3 to 6 plain factual sentences about their journey, with elapsed times from the digest. State that conclusions are inferred from clicks.
- worth_a_look: One line ONLY if the events show a specific need or a real attempt (e.g. tried to connect a data source, ran something, hit an error repeatedly). Otherwise an empty string.
Use "" for a key the record does not support. Answer with the object alone.
```

If the stage/tier definitions change, **edit this prompt and re-point the action to the edited module** (`edit_pipeline_action` with the same `code_source`) so all narratives regenerate, otherwise old wording stays.

### 2.8 SQL I — the app's main table

```sql
SELECT p.* EXCLUDE (llm_context),
  coalesce(n.headline,'') AS headline, coalesce(n.intent,'') AS intent, coalesce(n.outcome,'') AS outcome,
  coalesce(n.drop_off,'') AS drop_off, coalesce(n.friction,'') AS friction, coalesce(n.narrative,'') AS narrative,
  coalesce(n.worth_a_look,'') AS worth_a_look, coalesce(n.model_error,'not written') AS model_error
FROM "<G:output>" p LEFT JOIN "<H:transform_rows>" n ON n.person_id = p.person_id
```

### 2.9 Module K — read heartbeat watch

```python
import json
from datetime import datetime, timedelta, timezone

def watch(*, start="2026-09-16", settle_hours=3):
    now = datetime.now(timezone.utc)
    covered = now - timedelta(hours=float(settle_hours))
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    rec = {"pulled_at": now.strftime(fmt), "covered_until": covered.strftime(fmt),
           "history_start": f"{start}T00:00:00Z", "settle_hours": float(settle_hours)}
    return [{"content": json.dumps(rec, sort_keys=True), "logical_clock": now.strftime("%Y-%m-%dT%H:%M:%S.%fZ")}]
```

### 2.10 SQL L — coverage table

```sql
SELECT json_extract_string(h.content,'$.pulled_at') AS pulled_at,
  json_extract_string(h.content,'$.covered_until') AS covered_until,
  json_extract_string(h.content,'$.history_start') AS history_start,
  (SELECT count(*) FROM "<I:output>") AS people_analysed,
  (SELECT max(created_at_utc) FROM "<I:output>") AS newest_signup
FROM "<K:watch_remote_data>" h
```

The app takes `max(covered_until)` / `max(pulled_at)` from this table. Because L reads I, it only updates after the whole chain has finished, which is what the app uses to detect that a run completed.

### 2.10b Billing page errors section (added later)

Add two more pipeline actions, then a `billing` data source in `app.yaml` and a "Billing page errors" card placed just above the people table.

| # | Kind | Output name | Input | Notes |
|---|---|---|---|---|
| M | `watch_remote_data` | PostHog billing page events | none | module `pipeline/M_watch_billing_page_events.py`; `vault_api_ids: ["54"]`; arg `start="2026-09-16"`. Reads page views, exceptions, dead clicks, rage clicks, dead swipes and clicks labelled Upgrade to Premium / Get Developer / Checkout / Upgrade / Subscribe / Add credits / Get Premium / Contact sales / Custom / Get started / Contact us, on paths starting `/settings/plan`, `/settings/credits`, `/settings/billing`, for ALL users (not only new signups), and attaches email, org, plan and country from `persons`. |
| N | `execute_sql` | Billing page events (app) | M | Parse the JSON `content` into columns `event_id, ts, day, event, person_id, path, el_text, exception, device, session_id, email, org_name, plan, org_id, country`, plus `exc_kind` (`441`, `418` or `other`, from the exception text). Keep the latest version per `event_id`. **Exclude** `email LIKE '%@corvic.ai'` and `org_name = 'corvic.ai'`. |

App side (`lib/billing.js`: `analyseBilling(events, biz)` and `billingHtml(B, cohortIds)`):
- Per person, count Plan-page views, React #441 error bursts (the five events a page load fires within the same second count as one burst), dead clicks after the first error, and upgrade-type clicks.
- Classify each person as **error, no paid action** (a #441 on the Plan page and no `subscription::organization_upgrade` or `billing::organization_topup` for that person afterwards), **error, paid anyway**, or **upgrade click, no paid action** (no error).
- Show 6 tiles: opened Plan/Credits/Billing; hit #441; hit it with no paid action; hit it and paid anyway; Plan-page loads with the error; paid actions in range. Add computed takeaways and a "People to follow up" table whose names open the person drawer when the person is in the signup cohort.
- State plainly: #441 is a server-components render error whose message is hidden in production; "no paid action" does not prove the error stopped them; PostHog cannot see typed card details or Stripe's own checkout page.
- Load the `billing` query separately and tolerate failure (show "not produced yet — press Reload") so it cannot break the rest of the page: `SELECT event_id, ts, event, person_id, path, el_text, exc_kind, email, org_name, plan, country FROM billing WHERE day >= ? AND day <= ? LIMIT 5000`. The `biz` query must also return `timestamp_utc`.
- Reference result for Oct 6–16 2026, test accounts excluded: 20 people opened Plan/Credits/Billing; 6 hit #441 (30 events in the table, about 5 per page load).

### 2.11 Verify before building the app
### 2.11 Verify before building the app

Query table I for a range (e.g. 2026-10-06 to 2026-10-16) and check: row count; self-serve vs invited; stage counts; no `@corvic.ai`; zero `model_error`; zero empty narratives. Reference figures from the user's hand-built report for Oct 6–16 2026: about **118 self-serve**, **25 used features beyond the tour**, **9 got an output**. The build as delivered gave 121 / 25 / 8 (21 role-`member` accounts with no matching invite event stay in self-serve; that likely explains the +3). Report any gap honestly.

---

## 3. The app bundle

Files: `app.yaml`, `pages/home.js` (single route), `lib/calc.js`, `lib/charts.js`, `styles.css`. No `.html` files. Plain JS ES modules; `import { esc } from "@corvic/live"`. Escape every data value with `esc`. Read with `ctx.db.rows(sql, params, ctx.signal)`; check `ctx.signal.aborted` after awaits; attach listeners with `{ signal: ctx.signal }`; no `alert/confirm`; every button `type="button"`.

### 3.1 `app.yaml`

```yaml
schema_version: 1
title: "Signup Cohort Explorer"
description: "Pick a signup date range and see who got value from Corvic, who got stuck and where people dropped off — built from each person's PostHog journey."
icon: analytics-up
accent_color: "#1f7a4d"
routes:
  - path: home
    module: pages/home.js
    title: "Signup Cohort Explorer"
    home: true
styles:
  - styles.css
data:
  - id: cohort            # table I
    label: "Signup cohort (one row per person)"
    source: /table/<I id>:output
    produced_by: { kind: pipeline, pipeline: "Signup Cohort Explorer (app)", pipeline_id: "<pipeline id>" }
  - id: biz               # table D
    label: "Business events (upgrades, top-ups, invites)"
    source: /table/<D id>:output
    produced_by: { kind: pipeline, pipeline: "Signup Cohort Explorer (app)", pipeline_id: "<pipeline id>" }
  - id: roster            # table J
    label: "All signups seen (counts only)"
    source: /table/<J id>:output
    produced_by: { kind: pipeline, pipeline: "Signup Cohort Explorer (app)", pipeline_id: "<pipeline id>" }
  - id: coverage          # table L
    label: "How far PostHog has been read"
    source: /table/<L id>:output
    produced_by: { kind: pipeline, pipeline: "Signup Cohort Explorer (app)", pipeline_id: "<pipeline id>" }
refresh:
  mode: feature_view
  seconds: 0
pipelines:
  - id: process_signups
    label: "Process new signups"
    target: <pipeline id>     # bare id; storage rewrites to /pipeline/<id>
```

The page POSTs to `/pipeline/<pipeline id>`.

### 3.2 Layout and design

Editorial and calm. Background `#f6f1e7`, cards `#fbf8f1` with `#ded6c4` borders, ink `#1c2430`, serif headings (Georgia / Iowan Old Style), sans for tables (system-ui). Full width at about **1320px** with one consistent content width. Slim styled scrollbars (`scrollbar-width: thin` + 8px WebKit thumb). Sticky table header. Subtle load animations on charts (fade-up, grow-x/grow-y; respect `prefers-reduced-motion`). A visible **"inferred"** pill wherever a stage, tier or narrative appears (funnel, tier bar, table headers, drawer, "worth a conversation").

Tier colours: output `#1f7a4d`, stalled `#c2750a`, invited `#1b6f8a`, browsed `#5b6b8c`, bounced `#b4442f`, never `#8a8478`, unknown `#b8b2a4`. Tier order and short labels: Got an output / Stalled after intent / Joined an existing org / Browsed, no task / Bounced at home / Never got in / Unknown (no browser events).

Sections top to bottom: header; controls card; 7 KPI tiles; "What the data says" takeaways; funnel + tier stacked bar (two columns); signups per day; signup timeline; by-source and by-device tables (two columns); ad-click comparison + friction chart (two columns); "Worth a conversation"; people table with filters; method-and-limits footer; right-hand person drawer.

### 3.3 Data loading (browser DuckDB)

On range change run three queries in parallel, parameterised by `[start, end]`:
- `SELECT * FROM cohort WHERE signup_day >= ? AND signup_day <= ? ORDER BY created_at_utc DESC LIMIT 3000`
- `SELECT event, day, person_id, organization_id, internal FROM biz WHERE day >= ? AND day <= ? LIMIT 3000`
- `SELECT count(*) FILTER (WHERE is_internal) AS internal, count(*) FILTER (WHERE NOT is_internal) AS ext FROM roster WHERE signup_day >= ? AND signup_day <= ?`
- coverage (failure tolerated, `.catch(() => [])`): `SELECT max(covered_until) AS covered_until, max(pulled_at) AS pulled_at, min(history_start) AS history_start FROM coverage`

If a query fails with `not_run`/`not found in FROM`/`does not exist`, show "No results yet — press Reload to read PostHog." in the status bar and do not report it as an error; otherwise `ctx.reportError` and show a short message. Default range: last 10 days ending today (UTC). Presets: **Last 72 hours** (end−2 days), **Last 10 days** (end−9), **Last 30 days** (end−29). Presets and date edits only read stored data; they never start a pipeline run. Changing the range clears the status note.

### 3.4 The single Reload button (important behaviour)

State kept at module level (survives `ctx.reload()`): range, tier filter, search, source filter, sort, open person, run state `{state, at, before, msg}`, `pendingCheck`, `note`.

On click: set `pendingCheck`, clear `note`, call `ctx.reload()`. After the data has reloaded and painted:
1. If a run is already running, just repaint.
2. Compute **required** = `min(end-of-selected-end-date-UTC, now − 3h)` (the end date counts to the *end of that day*; the pipeline only reads signups ≥ 3 h old). Compute **covered** = `coverage.covered_until`.
3. If there is no coverage row, or `covered < required − 20 min` → start the pipeline: `POST /pipeline/<id>`, set run state `running` with `before = coverage.pulled_at`. Handle `SIGN_IN_REQUIRED` header ("Login to use the app."), 401/403 (not allowed), 429 (run too often), other non-OK, and network errors; 200 = started, 202 = already running (joined). Disable the button and show "Reading PostHog…" while running.
4. Otherwise start nothing and set the note: "Results reloaded — PostHog was already read through <covered> UTC, which covers <start> to <end>. Nothing new to pull."

While running: re-read results every 45 s (`ctx.reload()` on a timer, cleared by the cleanup function) so partial results show up. A run is finished when `coverage.pulled_at > before`; then set the note "PostHog read finished — data now covers signups through <covered> UTC." Give up waiting after 30 minutes with a note.

**Status bar** (below the buttons; `role="status"`, `aria-live="polite"`): while running, a highlighted line with a spinner: "Reading PostHog — pulling signups through <required> UTC and analysing each new person (<msg>). Results appear here as batches finish." Otherwise: load error text; or "PostHog was last read through …; the selected range runs to the end of <end>. Press Reload to read PostHog for the missing time." when coverage is short; or "Up to date — PostHog was last read at … and covers signups through …"; plus a note if the selected start predates the pipeline's history start. Beneath it a progress bar: "<analysed> of <seen> signups in range analysed" (seen = roster external count).

### 3.4a Controls card

Start and end `<input type="date">`, three preset pills (highlight the active one), "Timezone: UTC" label, the Reload button, the status bar, the progress bar.

### 3.5 Calculations (`lib/calc.js`) — every number computed, nothing hardcoded

- Self-serve = all rows with tier ≠ `Joined an existing org`. Invited rows are shown in the table and counted in one KPI but are **not** in the funnel or percentages.
- **KPI tiles** (self-serve base): self-serve signups; got past signup (stage ≥ 1); used features beyond the tour (stage ≥ 3); got an output, inferred (stage ≥ 4); bounced or never got in (tier Bounced or Never); came back after 1h+ (`returned_1h`); invited into an existing org. Each tile shows its percentage of self-serve.
- **Funnel**: self-serve signups → got past signup → entered a room (stage ≥ 2) → used features beyond the tour → got an output (inferred from clicks), each with % of base and % of previous step.
- **Tier stacked bar**: counts over all people; clicking a segment or legend item toggles the table filter and scrolls to the table.
- **Signups per day**: stacked bars per UTC day (Google Ads vs other sources, self-serve only) with total above each bar and the engaged count (stage ≥ 3) under each day label. Left margin 46 units; the "engaged" axis label is 8px so it is fully visible.
- **Signup timeline**: one SVG lane per tier, one dot per person at signup time, deterministic vertical jitter from a hash of `person_id`, click opens the drawer. Min width 900px in a horizontal scroller.
- **Segment tables** by source (Google Ads, Direct, Auth redirect, Corvic link, Shared app link) and by device (Desktop, Mobile or tablet, Unknown): people, used features, got an output, bounced/never in, median active time (only people with browser events).
- **Ad click vs everything else**: people, used features %, output %, bounced/never %, mobile or tablet %, median active time.
- **Friction chart** (people affected, with % of its own denominator): left onboarding without finishing (of self-serve); React #418 on first screen (of those who finished onboarding); any dead click; five or more dead clicks; connector/Vault/Sources friction among engaged users (`connector_events >= 2` and stage ≥ 3, of engaged); rage clicks; React #441 (Plan page).
- **Issues string** per person: `418×N 441×N <n>d <n>s <n>r` (dead clicks, dead swipes, rage clicks).
- **Takeaways** (HTML strings with `<b>`; escape names): share who used features and share who got an output (name them, max 8 then "and N more"); share bounced/never and how many came back after 1h+; Google Ads share of signups, their engagement vs everyone else and median active time for each; first half vs second half of the selected range (ad share and engaged share); connector/Vault/Sources friction among engaged users (name them); React #418 rate among those who finished onboarding, split engaged vs left-early; mobile vs desktop engagement and the share of mobile users from ads with a note that the two overlap; number of shared-app-link signups and how many opened the link 3+ times; paid actions (upgrades + top-ups, internal excluded) in the range and how many came from this cohort (match by `person_id` or `organization_id`). Handle empty ranges ("No self-serve signups were analysed…") and zero denominators (`—`).

### 3.6 People table

Columns: # · Account (email, org) · Signed up (UTC) · Country and device · Source · Tier (badge, "inferred") · Furthest stage (4 dots, "inferred") · Active time · Span · Sessions · Back after 1h+ · Issues · Headline and where it ended · Worth a look. Sortable headers (signup, source, tier, stage, active, span, sessions, back), sticky header, tier filter buttons (All + 7 tiers), text search over email, country, org and name, a source dropdown, a count line ("Showing X of Y people (N self-serve + M invited into an existing org)"), capped at 600 rows. Click a row to open the drawer.

### 3.7 Person drawer

Fixed right panel (≤ 560px wide), slides in; closes with × or Escape. Contents: tier badge + "inferred" pill; headline; meta (email, org, signup time UTC, country, device, source, plan); 4-step progress track (finished signup / entered a room / used features / got an output) and the stage name with "inferred from clicks and pages, not confirmed"; narrative; "What they seemed to want"; "Outcome"; "Where it ended"; friction chips (split `friction` on `|`); a "Worth a look" box when present; stat boxes (active time, first→last event, sessions, page views, clicks, errors `418× 441× other`, dead clicks/swipes, rage clicks, rooms visited, last event); a warning when `truncated` ("capped at 5,000 events"); a note when devices were merged; a collapsible `<details>` event digest in a dark monospace block.

### 3.8 "Worth a conversation"

People with non-empty `worth_a_look`, ordered by stage desc then active time desc, max 40, two columns, each linking to the drawer and showing stage dots, active time and the line.

### 3.8b "Possible intent — no attempt seen" (added later)

A second list directly below "Worth a conversation", because the model-written `worth_a_look` only fires on a real attempt and misses people with a clear pattern of interest but no engagement click (example: a user who chose Research + Cloud storage, opened Billing, Sources, Vault and Access Tokens, then went quiet).

Computed in the browser from fields the cohort table already holds (`lib/calc.js`: `intentSignals(r)`, `INTENT_SIGNALS`; result `A.intent`). Eligible: stage < 3, tier not Joined an existing org / Unknown / Never got in, and `worth_a_look` empty (people already listed above are not repeated). Seven signals:

| Signal | Strong | Rule |
|---|---|---|
| Opened Sources / Vault / MCP | yes | `connector_events >= 1` or `feature_signals` contains `page:/vault`, `page:/settings/vault`, `click:sources`, `click:connector vault`, `page:/room/<id>/mcp`, `click:mcp playground` |
| Looked at Plan / Credits / Billing | yes | digest contains `PV /settings/(plan\|credits\|billing)` |
| Clicked "Add card" | yes | digest contains `click "Add card` |
| Opened Access Tokens | yes | digest contains `PV /settings/accessTokens` or click "Create token" / "Access Tokens" |
| Said where their data lives | no | digest contains click "Cloud storage" / "Database" / "Data warehouse" / "Local files" / "Spreadsheets" |
| Dead or rage clicks while exploring | no | `dead_clicks + rage_clicks > 0` and (`connector_events >= 1` or any `feature_signals`) |
| Came back after 1h+ | no | `returned_1h` and `active_secs >= 120` |

A person is listed with **at least 2 signals, at least one strong**, ordered by signal count then active time, max 40, each name opening the drawer, with the matched signals shown as small chips. Label the section "inferred" and say it is a pattern of interest, not proof of an attempt. Reference result for Oct 6–16 2026: 10 people (6 at a threshold of 3), including stablefoldai@gmail.com with all 7 signals.

### 3.9 Footer — method and limits
### 3.9 Footer — method and limits

Source (PostHog project 70607) and the date range used; signup = `created_at` converted from UTC−5 to UTC; each person pulled once and cached; tiers and stages are judgments, not system labels; narratives are model-written from a compact digest and inferred; number of test accounts removed (from roster) — **never listed**; invited members shown but outside the funnel; how many signups in range are not yet analysed. Limits list: PostHog masks typed text and does not capture chat prompts or agent results, so "Got an output" is inferred from clicks such as Download, Run and Approve; samples are small and percentages directional (one person can move a rate by several points); active time under-counts reading and typing, treat as a floor; some accounts have no PostHog profile / no browser events (tier Unknown); mobile and Google Ads traffic overlap so their effects can't be separated.

---

## 4. Acceptance checks

1. Oct 6–16 2026 gives about 118 self-serve, about 25 used features beyond the tour, about 9 got an output (delivered: 121 / 25 / 8 — state any gap, don't hide it).
2. No account ending `@corvic.ai` appears anywhere (table, drawer, takeaways, search "corvic.ai" returns 0 rows).
3. Every percentage in the takeaways changes when the date range changes.
4. Funnel, KPI tiles and table counts agree (funnel base = KPI "Self-serve signups" = table self-serve count).
5. Reload on a past range already covered starts **no** pipeline run; a range that reaches today starts one.
6. No `NaN`, `undefined` or `[object Object]` in visible text.

## 5. Verify in a browser

Hand a Grackle agent (`delegate_to_agent`) a short, step-by-step task: load the app URL, wait up to 90 s for `#kpis` to fill, record console errors and failed requests, read KPIs/takeaways/funnel/footer, click presets (selectors must be quoted: `[data-preset="72h"]`), set the date inputs, click a tier segment and a table row and a timeline dot, search `corvic.ai`, scan for `NaN`/`undefined`/`[object Object]`/`@corvic.ai`, click Reload at most once and only on a fully past range, and write `delegate-reply.md` progressively so a crash leaves a partial report. Keep the task small; an over-long first attempt ended without a report.

## 6. Hand-off notes to state to the user

- Reload on a range reaching today runs the pipeline (PostHog pulls + one model call per new person). The first run over a long range is slow.
- Whoever presses Reload needs permission to run the pipeline in that room (the app's developer in the preview; organization members when the share allows it; signed-in visitors on a public link when allowed).
- Say that tiers, stages and narratives are inferred from clicks and pages.
