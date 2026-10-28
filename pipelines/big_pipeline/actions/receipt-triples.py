import io
import json
import os
import re
import sys
import unicodedata

import polars as pl
import requests

ONTOLOGY = {
    "entities": {
        "Merchant": {"name"},
        "Receipt": {"name", "date", "total"},
        "Item": {"name"},
    },
    "relationships": {
        "ISSUED": {"from": "Merchant", "to": "Receipt", "of": set()},
        "CONTAINS": {"from": "Receipt", "to": "Item", "of": set()},
    },
    "aliases": {},
    "strip_suffixes": {"inc", "llc", "ltd", "corp", "co"},
}

JSON_COLUMN = "extraction_json"
FENCE = "`" * 3

OUTPUT_SCHEMA = {
    "chunk_id": pl.String,
    "doc_key": pl.String,
    "start_id": pl.String,
    "start_type": pl.String,
    "start_name": pl.String,
    "start_of": pl.String,
    "edge_type": pl.String,
    "edge_of": pl.String,
    "end_id": pl.String,
    "end_type": pl.String,
    "end_name": pl.String,
    "end_of": pl.String,
}


def normalize_key(raw):
    text = unicodedata.normalize("NFKC", raw or "")
    text = text.casefold()
    text = re.sub(r"[^\w\s-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    tokens = [t for t in text.split(" ") if t]
    stripped = [t for t in tokens if t not in ONTOLOGY["strip_suffixes"]]
    return " ".join(stripped or tokens)


def canonicalize(raw):
    key = normalize_key(raw)
    canonical = ONTOLOGY["aliases"].get(key)
    if canonical is not None:
        return normalize_key(canonical), canonical
    return key, (raw or "").strip()


def stated(raw, declared):
    if not isinstance(raw, dict):
        return None
    said = {
        str(c): str(v).strip()
        for c, v in raw.items()
        if c in declared and v is not None and str(v).strip()
    }
    return json.dumps(said, sort_keys=True) if said else None


def parse_payload(raw):
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    text = re.sub(rf"^{FENCE}(?:json)?\s*|{FENCE}\s*$", "", text, flags=re.MULTILINE).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            return None
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            return None


def main():
    input_tables = json.loads(os.environ["CORVIC_INPUT_TABLES"])
    frame = pl.read_parquet(io.BytesIO(requests.get(input_tables[0]["url"], timeout=60).content))
    rows = []
    dropped = {"unparsed": 0, "entity_type": 0, "edge_type": 0, "endpoint": 0}

    for record in frame.iter_rows(named=True):
        payload = parse_payload(record.get(JSON_COLUMN))
        if not isinstance(payload, dict):
            dropped["unparsed"] += 1
            continue
        chunk_id = str(record.get("chunk_id") or "")
        doc_key = str(record.get("doc_key") or "")
        seen = {}
        for entity in payload.get("entities") or []:
            if not isinstance(entity, dict):
                continue
            entity_type = str(entity.get("type") or "").strip()
            name = str(entity.get("name") or "").strip()
            if not name:
                continue
            if entity_type not in ONTOLOGY["entities"]:
                dropped["entity_type"] += 1
                continue
            key, display = canonicalize(name)
            if not key:
                continue
            node_id = f"{entity_type}:{key}"
            seen[normalize_key(name)] = (node_id, entity_type, display)
            rows.append({
                "chunk_id": chunk_id, "doc_key": doc_key,
                "start_id": node_id, "start_type": entity_type, "start_name": display,
                "start_of": stated(entity.get("of"), ONTOLOGY["entities"][entity_type]),
                "edge_type": "", "edge_of": None,
                "end_id": None, "end_type": None, "end_name": None, "end_of": None,
            })

        def resolve(name, declared_type):
            text = str(name or "").strip()
            if not text:
                return None
            known = seen.get(normalize_key(text))
            if known is not None:
                return known
            entity_type = str(declared_type or "").strip()
            if entity_type not in ONTOLOGY["entities"]:
                return None
            key, display = canonicalize(text)
            return (f"{entity_type}:{key}", entity_type, display) if key else None

        for rel in payload.get("relationships") or []:
            if not isinstance(rel, dict):
                continue
            edge_type = str(rel.get("type") or "").strip()
            declared = ONTOLOGY["relationships"].get(edge_type)
            if declared is None:
                dropped["edge_type"] += 1
                continue
            start = resolve(rel.get("from"), rel.get("from_type"))
            end = resolve(rel.get("to"), rel.get("to_type"))
            if start is None or end is None:
                dropped["endpoint"] += 1
                continue
            if (start[1], end[1]) != (declared["from"], declared["to"]):
                dropped["endpoint"] += 1
                continue
            rows.append({
                "chunk_id": chunk_id, "doc_key": doc_key,
                "start_id": start[0], "start_type": start[1], "start_name": start[2],
                "start_of": None,
                "edge_type": edge_type, "edge_of": stated(rel.get("of"), declared["of"]),
                "end_id": end[0], "end_type": end[1], "end_name": end[2], "end_of": None,
            })

    print(f"emitted {len(rows)} rows; dropped {dropped}", file=sys.stderr)
    pl.DataFrame(rows, schema=OUTPUT_SCHEMA).write_parquet(sys.stdout.buffer)


main()
