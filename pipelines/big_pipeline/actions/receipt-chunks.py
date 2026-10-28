import hashlib
import io
import json
import os
import re
import sys

import polars as pl
import requests

CHUNK_CHARS = 1800
OVERLAP_CHARS = 200
MIN_CHARS = 20

TEXT_COLUMNS = ("content", "text", "chunk_text", "body", "value")
DOC_COLUMNS = ("document", "path", "file_path", "source_path", "document_id", "id")
SURROGATE_ID = "__corvic_surrogate_id"

OUTPUT_SCHEMA = {
    SURROGATE_ID: pl.String,
    "chunk_id": pl.String,
    "doc_key": pl.String,
    "chunk_index": pl.Int64,
    "chunk_text": pl.String,
}


def pick_column(frame, candidates):
    for name in candidates:
        if name in frame.columns:
            return name
    return None


def pick_text_column(frame):
    named = pick_column(frame, TEXT_COLUMNS)
    if named is not None:
        return named
    string_columns = [n for n, d in frame.schema.items() if d == pl.String]
    if not string_columns:
        raise ValueError(f"no text column found; columns are {frame.columns}")
    return max(string_columns, key=lambda n: frame[n].str.len_chars().max() or 0)


def split_paragraphs(text):
    return [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]


def pack(paragraphs):
    chunks = []
    buffer = ""
    for paragraph in paragraphs:
        if len(paragraph) > CHUNK_CHARS:
            if buffer:
                chunks.append(buffer)
                buffer = ""
            stride = CHUNK_CHARS - OVERLAP_CHARS
            for start in range(0, len(paragraph), stride):
                piece = paragraph[start : start + CHUNK_CHARS].strip()
                if piece and (len(piece) >= MIN_CHARS or not chunks):
                    chunks.append(piece)
            continue
        if not buffer:
            buffer = paragraph
        elif len(buffer) + 2 + len(paragraph) <= CHUNK_CHARS:
            buffer = f"{buffer}\n\n{paragraph}"
        else:
            chunks.append(buffer)
            buffer = paragraph
    if buffer:
        chunks.append(buffer)
    return chunks


def chunk_id_for(doc_key, index, text):
    digest = hashlib.sha256(f"{doc_key}|{index}|{text}".encode()).hexdigest()[:16]
    return f"c_{digest}"


def main():
    input_tables = json.loads(os.environ["CORVIC_INPUT_TABLES"])
    frame = pl.read_parquet(io.BytesIO(requests.get(input_tables[0]["url"], timeout=60).content))
    rows = []
    if frame.height:
        text_column = pick_text_column(frame)
        doc_column = pick_column(frame, DOC_COLUMNS)
        for position, record in enumerate(frame.iter_rows(named=True)):
            raw = record.get(text_column)
            if raw is None or not str(raw).strip():
                continue
            doc_key = str(record.get(doc_column) or position) if doc_column else str(position)
            for index, chunk in enumerate(pack(split_paragraphs(str(raw)))):
                identity = chunk_id_for(doc_key, index, chunk)
                rows.append({
                    SURROGATE_ID: identity,
                    "chunk_id": identity,
                    "doc_key": doc_key,
                    "chunk_index": index,
                    "chunk_text": chunk,
                })
        print(f"chunked {frame.height} rows into {len(rows)} chunks", file=sys.stderr)
    pl.DataFrame(rows, schema=OUTPUT_SCHEMA).write_parquet(sys.stdout.buffer)


main()
