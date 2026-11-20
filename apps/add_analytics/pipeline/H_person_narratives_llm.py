"""transform_row: write the narrative fields for ONE person from their event digest.

Like the llm_columns kernel, but passes `person_id` through so the result joins back.
Calls the room's LLM router (no vault, no auth header). Same keys on every path.
"""
import json

import httpx2
import tenacity

ENDPOINT = "https://api.corvic.ai/openai/v1/chat/completions"
MODEL = "claude-sonnet-5-5"
RETRY = frozenset({408, 409, 429, 500, 502, 503, 504})

FIELDS = {
    "headline": "ONE plain line, at most 16 words, saying what this person did. Only what the events show.",
    "intent": "What they seemed to want, only as far as clicks and pages support. Say 'unclear' when the events do not show it. Max 25 words.",
    "outcome": "What they achieved, inferred from clicks and pages only. Max 25 words.",
    "drop_off": "Where the journey ended (last page or action), e.g. 'Home screen, about 1 min after signup'. Max 20 words.",
    "friction": "Short list of friction points separated by ' | ', e.g. 'Connector / Vault setup loop | Mobile dead taps | React #418 on first load'. Empty string if none.",
    "narrative": "3 to 6 plain factual sentences about their journey, with elapsed times from the digest. State that conclusions are inferred from clicks.",
    "worth_a_look": "One line ONLY if the events show a specific need or a real attempt (e.g. tried to connect a data source, ran something, hit an error repeatedly). Otherwise an empty string.",
}

DEFS = (
    "Definitions used by this report (apply them; do not contradict the tier given in the record):\n"
    "- Stage 1 'Reached home': finished onboarding and left from the home screen.\n"
    "- Stage 2 'Entered a room': opened or created a workspace, mostly skipped the tour.\n"
    "- Stage 3 'Used features': ACTIVELY engaged a feature: clicked Add / Add & connect / Upload / Choose Files, attached or added data, answered the agent's intake questions (Send answers), adopted a template, started a memory build, ran a playbook, or opened a builder chat. Merely opening or clicking into the Lens, Memory, Playbooks, Pipelines, Apps, Vault, Sources or MCP pages and leaving is browsing, NOT using features.\n"
    "- Stage 4 'Got an output': clicked Download, Run, Run anyway, Approve this schema, Approve & embed or Build lens, or opened agent-generated files; inferred from clicks, never confirmed.\n"
    "- Tiers: 'Got an output / finished a build' (stage 4); 'Stalled after real intent' (stage 3 that ended at a wall or went quiet); 'Browsed, no task' (stage 1-2, may have looked at feature pages but did not engage them); 'Bounced at home' (finished signup, left within about 2 minutes); 'Never got in' (did not finish onboarding or only viewed a shared app); 'Joined an existing org'; 'Unknown'.\n"
    "- If the tier is 'Browsed, no task' or lower, never say the person used, tried or engaged a feature; say they looked at or opened it. Only use words like 'used', 'worked with' or 'attempted' for stage 3 or 4 people, and name the specific click that supports it.\n"
)

SYSTEM = (
    DEFS +
    "You analyse one product-signup journey from a PostHog event digest. Rules: describe ONLY what the "
    "events show. Do not guess intent beyond what the clicks support. PostHog cannot see typed text, "
    "prompts or agent results, so never claim what someone typed, asked or received. Label conclusions "
    "as inferred. Plain, neutral language; no hype.\n"
    "Answer with ONE JSON object with exactly these keys:\n"
    + "\n".join(f"- {k}: {v}" for k, v in FIELDS.items())
    + '\nUse "" for a key the record does not support. Answer with the object alone.'
)

_client = None


class Refused(Exception):
    pass


def _session():
    global _client
    if _client is None:
        _client = httpx2.AsyncClient()
    return _client


def _transient(exc):
    if isinstance(exc, httpx2.TransportError):
        return True
    return isinstance(exc, httpx2.HTTPStatusError) and exc.response.status_code in RETRY


@tenacity.retry(
    retry=tenacity.retry_if_exception(_transient),
    wait=tenacity.wait_exponential_jitter(initial=1, max=10),
    stop=tenacity.stop_after_attempt(4),
    reraise=True,
)
async def _post(payload):
    r = await _session().post(ENDPOINT, json=payload, headers={"X-Corvic-Room-Id": "1"}, timeout=120)
    r.raise_for_status()
    return r


_state = {"answered": False, "refused": 0}


def _result(pid, values, err):
    out = {"person_id": pid}
    for k in FIELDS:
        v = values.get(k) if isinstance(values, dict) else ""
        if isinstance(v, list):
            v = " | ".join(str(x) for x in v)
        out[k] = str(v or "")
    out["model_error"] = err
    return out


async def transform_row(row):
    pid = str(row["person_id"])
    ctx = str(row["llm_context"] or "")[:14000]
    if not ctx.strip():
        return _result(pid, {}, "nothing to read")
    payload = {
        "model": MODEL,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": ctx}],
    }
    try:
        resp = await _post(payload)
    except httpx2.HTTPStatusError as exc:
        code = exc.response.status_code
        if not _state["answered"] and code not in RETRY:
            _state["refused"] += 1
            if _state["refused"] >= 3:
                raise Refused(f"http {code}: {exc.response.text[:200]}")
        return _result(pid, {}, f"http {code}")
    except httpx2.HTTPError as exc:
        return _result(pid, {}, type(exc).__name__)
    _state["answered"] = True
    try:
        said = resp.json()["choices"][0]["message"]["content"]
        said = said.strip()
        if said.startswith("```"):
            said = said.strip("`")
            said = said[4:] if said.lower().startswith("json") else said
        a, b = said.find("{"), said.rfind("}")
        return _result(pid, json.loads(said[a:b + 1]), "")
    except Exception:
        return _result(pid, {}, "unparsable answer")
