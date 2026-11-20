"""transform_row: analyse ONE signup's full PostHog journey.

Input row: one person from the rolling signup store (person_id, created_at_utc, email, ...).
Pulls the person's events per person (never one big query), merges anonymous ids via
person_distinct_ids and shared $device_id (only when that device is not another identified
person's), computes the metrics + a compact event digest. One row out per row in, always the
same keys.
"""
import re
import sys
import time
from datetime import datetime, timedelta, timezone

import requests

URL = "https://us.i.posthog.com/api/projects/70607/query/"
CAP = 5000
IGNORE = {"$web_vitals", "$identify", "$groupidentify", "$set"}
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)
SAFE_ID = re.compile(r"^[\w\-.@:]+$")
ROOM_RE = re.compile(r"^/room/(\d+)")
FEATURE_PATH = re.compile(
    r"^/room/\d+/(memory|lens|playbooks?|pipelines?|apps?|mcp)(/|$)|^/vault|^/settings/vault"
)
FEATURE_CLICKS = {
    "add", "connector vault", "adopt this template", "send answers", "run playbook",
    "build a memory", "memory", "playbooks", "data pipelines", "live apps", "lens",
    "query builder", "mcp playground", "sources", "+ add folder",
}
OUTPUT_CLICKS = {
    "download", "run", "run anyway", "approve this schema", "approve & embed", "build lens", "run again",
}
FILE_CLICK = re.compile(r"^[\w\-. ]{1,60}\.(pdf|csv|xlsx|png|jpg|md|html|parquet|json|py|txt)$", re.I)
CONNECTOR_CLICK = re.compile(r"connector|vault|sources?\b|connect\b|authori[sz]e|oauth|api key", re.I)


class SharedFailure(Exception):
    pass


def _hogql(sql, attempts=6):
    last = ""
    for i in range(attempts):
        try:
            r = requests.post(URL, json={"query": {"kind": "HogQLQuery", "query": sql}}, timeout=100)
        except requests.RequestException as exc:
            last = repr(exc)
            time.sleep(min(30, 3 * (i + 1)))
            continue
        if r.status_code == 200:
            return r.json().get("results") or []
        last = f"http {r.status_code}: {r.text[:200]}"
        if r.status_code in (401, 403):
            raise SharedFailure(last)
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(min(60, 5 * (i + 1)))
            continue
        break
    raise RuntimeError(last)


def _ts(raw):
    return datetime.fromisoformat(str(raw)).astimezone(timezone.utc)


def _norm_path(p):
    p = (p or "").split("?")[0]
    p = UUID.sub("<uuid>", p)
    p = re.sub(r"/(room|chat|agent|pipeline|playbook|memory|lens)/(\d+)", lambda m: f"/{m.group(1)}/<id>", p)
    p = re.sub(r"/\d+", "/<n>", p)
    return p or "/"


def _stamp(sec):
    sec = int(max(0, sec))
    if sec >= 3600:
        return f"+{sec // 3600}h{(sec % 3600) // 60:02d}m"
    return f"+{sec // 60:02d}:{sec % 60:02d}"


def _empty():
    return {
        "person_id": "", "n_events": 0, "truncated": False, "has_browser_events": False,
        "onboarding_done": False, "onboarding_viewed": False,
        "first_event_utc": "", "last_event_utc": "",
        "active_secs": 0, "span_secs": 0, "sessions": 0, "pageviews": 0, "clicks": 0,
        "exc_418": 0, "exc_441": 0, "exc_resize": 0, "exc_other": 0,
        "dead_clicks": 0, "dead_swipes": 0, "rage_clicks": 0,
        "returned_1h": False, "rooms_visited": 0, "shared_app_views": 0,
        "first_page": "", "referring_domain": "", "has_gclid": False,
        "room_entered": False, "feature_signals": "", "output_signals": "", "connector_events": 0,
        "merged_devices": 0, "digest": "", "fetch_error": "",
    }


COLS = (
    "toString(timestamp), event, distinct_id, properties.$session_id, properties.$device_id, "
    "properties.$pathname, properties.$el_text, properties.$event_type, "
    "left(toString(properties.$exception_values), 220), properties.$referring_domain, "
    "properties.$current_url"
)


def _analyse(row, out):
    pid = str(row["person_id"])
    created = _ts(row["created_at_raw"]) if row.get("created_at_raw") else datetime.now(timezone.utc)
    since = (created - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")

    id_rows = _hogql(f"SELECT distinct_id FROM person_distinct_ids WHERE person_id = '{pid}' LIMIT 60")
    ids = [str(r[0]) for r in id_rows if r[0] and SAFE_ID.match(str(r[0]))]
    if not ids:
        return []
    idlist = ", ".join("'" + i + "'" for i in ids)
    events = _hogql(
        f"SELECT {COLS} FROM events WHERE distinct_id IN ({idlist}) "
        f"AND timestamp >= toDateTime('{since}', 'UTC') ORDER BY timestamp LIMIT {CAP}"
    )
    own_count = len(events)
    devices = sorted({str(e[4]) for e in events if e[4] and SAFE_ID.match(str(e[4]))})[:25]
    merged = 0
    if devices and own_count < CAP:
        try:
            devlist = ", ".join("'" + d + "'" for d in devices)
            extra = _hogql(
                f"SELECT {COLS} FROM events WHERE properties.$device_id IN ({devlist}) "
                f"AND distinct_id NOT IN ({idlist}) AND timestamp >= toDateTime('{since}', 'UTC') "
                f"ORDER BY timestamp LIMIT 2000"
            )
            if extra:
                # only merge a device that is not another identified person's
                bad_devices = set()
                xids = sorted({str(e[2]) for e in extra if SAFE_ID.match(str(e[2]))})[:80]
                if xids:
                    xl = ", ".join("'" + i + "'" for i in xids)
                    owners = _hogql(
                        f"SELECT distinct_id, toString(person_id) FROM person_distinct_ids WHERE distinct_id IN ({xl})"
                    )
                    other_numeric = {str(o[0]) for o in owners if str(o[1]) != pid and re.fullmatch(r"\d+", str(o[0]))}
                    for e in extra:
                        if str(e[2]) in other_numeric:
                            bad_devices.add(str(e[4]))
                keep = [e for e in extra if str(e[4]) not in bad_devices]
                merged = len({str(e[4]) for e in keep})
                events = sorted(events + keep, key=lambda e: e[0])
        except SharedFailure:
            raise
        except Exception as exc:  # merge is best-effort
            print(f"merge skipped {pid}: {exc!r}", file=sys.stderr)
    out["merged_devices"] = merged
    out["n_events"] = len(events)
    out["truncated"] = own_count >= CAP
    if not events:
        return []

    ev = []
    for e in events:
        try:
            ev.append((_ts(e[0]), e))
        except Exception:
            continue
    ev.sort(key=lambda x: x[0])
    if not ev:
        return []
    t0 = ev[0][0]
    out["first_event_utc"] = ev[0][0].strftime("%Y-%m-%dT%H:%M:%SZ")
    out["last_event_utc"] = ev[-1][0].strftime("%Y-%m-%dT%H:%M:%SZ")
    out["span_secs"] = int((ev[-1][0] - t0).total_seconds())

    meaningful = [t for t, e in ev if e[1] not in IGNORE]
    active = 0.0
    for a, b in zip(meaningful, meaningful[1:]):
        g = (b - a).total_seconds()
        if g <= 120:
            active += g
    out["active_secs"] = int(active)

    sessions, rooms = set(), set()
    activity = []  # pageviews + clicks, for the 1h+ return check
    feats, outs = set(), set()
    lines = []
    last_txt, last_n = None, 0
    lines_raw = []
    first_page_set = False
    for t, e in ev:
        name = e[1]
        if e[3]:
            sessions.add(str(e[3]))
        path = (e[5] or "")
        if not out["referring_domain"] and e[9] and str(e[9]) != "$direct" and name == "$pageview":
            out["referring_domain"] = str(e[9])
        cur = str(e[10] or "")
        if "gclid=" in cur:
            out["has_gclid"] = True
        txt = None
        if name == "$pageview":
            out["pageviews"] += 1
            activity.append(t)
            if not first_page_set and path:
                out["first_page"] = _norm_path(path)
                first_page_set = True
                if not out["referring_domain"] and e[9]:
                    out["referring_domain"] = str(e[9])
            m = ROOM_RE.match(path)
            if m:
                rooms.add(m.group(1))
                out["room_entered"] = True
            if path.startswith("/view/app/"):
                out["shared_app_views"] += 1
            if path.startswith("/onboarding"):
                out["onboarding_viewed"] = True
            if FEATURE_PATH.search(path):
                feats.add("page:" + _norm_path(path))
            if re.match(r"^/(settings/)?vault", path) or "/mcp" in path:
                out["connector_events"] += 1
            txt = "PV " + _norm_path(path)
        elif name == "$autocapture":
            et = e[7]
            label = (str(e[6]).strip() if e[6] else "")
            if et == "click":
                out["clicks"] += 1
                activity.append(t)
                low = label.lower()
                if label:
                    txt = f'click "{label[:48]}"'
                    if low in FEATURE_CLICKS:
                        feats.add("click:" + low)
                    if low in OUTPUT_CLICKS or FILE_CLICK.match(label):
                        outs.add("click:" + low[:40])
                    if CONNECTOR_CLICK.search(label):
                        out["connector_events"] += 1
            elif et == "submit":
                txt = "submit form"
        elif name == "$dead_click":
            out["dead_clicks"] += 1
            txt = "DEAD CLICK"
        elif name == "$dead_swipe":
            out["dead_swipes"] += 1
            txt = "DEAD SWIPE"
        elif name == "$rageclick":
            out["rage_clicks"] += 1
            txt = "RAGE CLICK"
        elif name == "$exception":
            vals = str(e[8] or "")
            if "#418" in vals:
                out["exc_418"] += 1
                txt = "EXC React #418 (hydration)"
            elif "#441" in vals:
                out["exc_441"] += 1
                txt = "EXC React #441 (plan page)"
            elif "ResizeObserver" in vals:
                out["exc_resize"] += 1
                txt = None
            else:
                out["exc_other"] += 1
                txt = "EXC " + re.sub(r"\s+", " ", vals)[:70]
        elif name.startswith("onboarding::"):
            out["onboarding_done"] = True
            txt = "SERVER " + name
        elif "::" in name:
            txt = "SERVER " + name
        if txt is None:
            continue
        if txt == last_txt:
            last_n += 1
            lines[-1][1] = last_n
            continue
        last_txt, last_n = txt, 1
        lines.append([_stamp((t - t0).total_seconds()), 1, txt])

    out["sessions"] = len(sessions)
    out["rooms_visited"] = len(rooms)
    out["feature_signals"] = ";".join(sorted(feats))[:400]
    out["output_signals"] = ";".join(sorted(outs))[:200]
    out["has_browser_events"] = any(e[1].startswith("$") for _, e in ev)
    activity.sort()
    out["returned_1h"] = any((b - a).total_seconds() >= 3600 for a, b in zip(activity, activity[1:]))

    rendered = [f"{s} {txt}" + (f" (x{n})" if n > 1 else "") for s, n, txt in lines]
    if len(rendered) > 90:
        omitted = len(rendered) - 85
        rendered = rendered[:55] + [f"... {omitted} lines omitted ..."] + rendered[-30:]
    out["digest"] = "\n".join(rendered)
    return ev


def transform_row(row):
    out = _empty()
    out["person_id"] = str(row["person_id"])
    try:
        _analyse(row, out)
    except SharedFailure:
        raise
    except Exception as exc:
        out["fetch_error"] = repr(exc)[:300]
    return out
