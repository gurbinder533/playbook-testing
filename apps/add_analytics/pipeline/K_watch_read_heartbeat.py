"""watch: one heartbeat row per pipeline run, recording how far PostHog has been read.

The signups watch only reads people created at least `settle_hours` ago, so a run that starts at
time T has covered signups up to T - settle_hours. The app compares that with the end of the date
range the reader picks to decide whether PostHog has to be read again.
"""
import json
from datetime import datetime, timedelta, timezone


def watch(*, start="2026-09-16", settle_hours=3):
    now = datetime.now(timezone.utc)
    covered = now - timedelta(hours=float(settle_hours))
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    rec = {
        "pulled_at": now.strftime(fmt),
        "covered_until": covered.strftime(fmt),
        "history_start": f"{start}T00:00:00Z",
        "settle_hours": float(settle_hours),
    }
    return [{"content": json.dumps(rec, sort_keys=True), "logical_clock": now.strftime("%Y-%m-%dT%H:%M:%S.%fZ")}]
