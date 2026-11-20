"""watch: PostHog business events (upgrades, top-ups, invites, removals)."""
import json
import time
from datetime import datetime, timezone

import corvic_runner
import polars as pl
import requests

URL = "https://us.i.posthog.com/api/projects/70607/query/"
EVENTS = (
    "subscription::organization_upgrade",
    "billing::organization_topup",
    "member::user_invite",
    "member::user_remove",
)


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
            uid = str(r[0])
            raw = str(r[1])
            hwm = max(hwm, raw[:19].replace("T", " "))
            if uid in seen:
                continue
            seen.add(uid)
            props = r[6] or ""
            rec = {
                "event_id": uid,
                "timestamp_utc": _utc(raw),
                "event": r[2],
                "distinct_id": str(r[3]),
                "person_id": str(r[4] or ""),
                "organization_id": r[5] or "",
                "internal": "@corvic.ai" in props,
                "props": props,
            }
            fresh.append({"content": json.dumps(rec, sort_keys=True), "logical_clock": uid})
        if len(rows) < int(page):
            break
        lo = hwm
    corvic_runner.set_watch_state({"hwm": hwm})
    return fresh
