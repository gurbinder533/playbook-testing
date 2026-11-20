"""watch: PostHog persons (signups) not yet published.

Rolling store. Each run publishes every person created since the last run's high-water
mark (and older than `settle_hours`, so their first journey is mostly complete).
Newest rows first, so a long backfill processes the recent days first.
`persons.created_at` comes back with its project-local UTC offset; it is converted
to UTC here and the UTC value is what the app buckets by.
"""
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
                "person_id": pid,
                "created_at_raw": raw,
                "created_at_utc": _utc(raw),
                "email": (r[2] or ""),
                "name": (r[3] or ""),
                "role": (r[4] or ""),
                "plan": (r[5] or ""),
                "org_id": (r[6] or ""),
                "org_name": (r[7] or ""),
                "device": (r[8] or ""),
                "country": (r[9] or ""),
                "gclid": (r[10] or r[11] or ""),
                "initial_pathname": (r[12] or ""),
                "initial_url": (r[13] or "")[:300],
                "initial_referring_domain": (r[14] or ""),
                "initial_referrer": (r[15] or "")[:300],
                "utm_source": (r[16] or ""),
            }
            fresh.append({"content": json.dumps(rec, sort_keys=True), "logical_clock": pid})
        if len(rows) < int(page):
            break
        lo = hwm
    corvic_runner.set_watch_state({"hwm": hwm})
    fresh.reverse()  # newest signups first
    return fresh
