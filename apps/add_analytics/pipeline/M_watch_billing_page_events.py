"""watch: PostHog Plan / Credits / Billing page activity for ALL users (not only recent signups).

Publishes one row per event (page views, exceptions, dead/rage clicks, upgrade-type button clicks) with the
person's email / org / plan attached, so the app can analyse upgrade attempts that ran into errors.
Timestamps come back with the project's local UTC offset and are converted to UTC.
"""
import json
import re
import time
from datetime import datetime, timezone

import corvic_runner
import polars as pl
import requests

URL = "https://us.i.posthog.com/api/projects/70607/query/"
PATH = (
    "(properties.$pathname LIKE '/settings/plan%' OR properties.$pathname LIKE '/settings/credits%' "
    "OR properties.$pathname LIKE '/settings/billing%')"
)
LABELS = (
    "('Upgrade to Premium','Get Developer','Checkout','Upgrade','Subscribe','Add credits','Get Premium',"
    "'Contact sales','Custom','Get started','Contact us')"
)
SAFE = re.compile(r"^[0-9a-fA-F-]{36}$")


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
    return datetime.fromisoformat(raw).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")[:-4] + "Z"


def watch(*, start="2026-09-16", page=1500, max_pages=10):
    state = corvic_runner.watch_state() or {}
    lo = state.get("hwm") or f"{start} 00:00:00"
    published = corvic_runner.previous_output()
    seen = set()
    if published is not None and "logical_clock" in published.columns and published.height:
        seen = set(published["logical_clock"].drop_nulls().cast(pl.String).to_list())
    raw_rows = []
    hwm = lo
    for _ in range(max_pages):
        sql = (
            "SELECT toString(uuid), timestamp, event, toString(person_id), properties.$pathname, properties.$el_text, "
            "left(toString(properties.$exception_values), 90), properties.$device_type, properties.$session_id "
            f"FROM events WHERE timestamp >= toDateTime('{lo}') AND {PATH} AND ("
            "event IN ('$pageview','$exception','$dead_click','$rageclick','$dead_swipe') "
            f"OR (event='$autocapture' AND properties.$event_type='click' AND properties.$el_text IN {LABELS})) "
            f"ORDER BY timestamp ASC LIMIT {int(page)}"
        )
        rows = _hogql(sql)
        for r in rows:
            hwm = max(hwm, str(r[1])[:19].replace("T", " "))
            if str(r[0]) not in seen:
                seen.add(str(r[0]))
                raw_rows.append(r)
        if len(rows) < int(page):
            break
        lo = hwm
    # attach who each person is (persons table, in small chunks)
    pids = sorted({str(r[3]) for r in raw_rows if r[3] and SAFE.match(str(r[3]))})
    who = {}
    for i in range(0, len(pids), 60):
        chunk = pids[i : i + 60]
        inl = ", ".join("'" + p + "'" for p in chunk)
        for r in _hogql(
            "SELECT toString(id), properties.email, properties.org_name, properties.plan, properties.org_id, "
            f"properties.$geoip_country_name FROM persons WHERE id IN ({inl}) LIMIT 200"
        ):
            who[str(r[0])] = r
    fresh = []
    for r in raw_rows:
        w = who.get(str(r[3]), [None] * 6)
        rec = {
            "event_id": str(r[0]), "timestamp_utc": _utc(str(r[1])), "event": r[2], "person_id": str(r[3] or ""),
            "path": r[4] or "", "el_text": (r[5] or "")[:80], "exception": r[6] or "", "device": r[7] or "",
            "session_id": r[8] or "", "email": (w[1] or "").lower(), "org_name": w[2] or "", "plan": w[3] or "",
            "org_id": w[4] or "", "country": w[5] or "",
        }
        fresh.append({"content": json.dumps(rec, sort_keys=True), "logical_clock": rec["event_id"]})
    corvic_runner.set_watch_state({"hwm": hwm})
    return fresh
