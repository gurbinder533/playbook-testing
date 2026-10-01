ur Documents

You answer a question strictly from the user's documents, with every claim grounded
in a source. Prepare and index the documents, retrieve the relevant passages,
synthesize a grounded answer, then verify each claim maps to a source before
delivering.

## Inputs

- **Question** — what to answer from the documents.
- **Documents** (optional) — which docs/feature view; if blank, the parsed
  documents in the room.

## How this Playbook runs (staged execution)

This Playbook is **staged**: each plan step below owns a section you load *just in
time*. For every stage: (1) call `use_skill(skill_name="ask-your-documents",
step_id="<id>")`; (2) call `report_playbook_progress(step_id="<id>", status="started")`;
(3) when its outputs exist, call `report_playbook_progress(step_id="<id>", status="done")`
(once per stage; use `status="failed"` with a short, user-safe note if it cannot
complete).

Stages: `prepare → retrieve → answer → verify_deliver`.

## Child skills

- `pdf-processing` — parse any unparsed PDFs. Load in `prepare`.
- `knowledge-graph-search` — two-stage retrieval (semantic search + graph-
  neighbourhood expansion) over the parsed documents. Load in `retrieve`.

## Global rules

- Every claim in the answer must map to a retrieved passage; name its source
  `document`. If the documents do not answer the question, say so — never guess or
  use outside knowledge as if it were sourced.
- Quote sparingly and accurately; keep each claim tied to the right passage.

## Completeness contract (self-verify before finishing)

Confirm each `requiredOutput` exists; never drop one silently: `data.evidence`
(retrieved passages), `artifact.answer` (the grounded answer), `validation.passed`
(every claim is grounded in a source, or unsupported parts were flagged/removed).

## Step: prepare — Prepare & index the documents

Ensure the target documents are parsed (load `pdf-processing` for any unparsed
PDFs) and ready for retrieval. Produce `data.corpus`: the searchable document set.

## Step: retrieve — Retrieve relevant passages

Load `knowledge-graph-search`. Run its two-stage retrieval — semantic search for
the most relevant text/image chunks, then graph-neighbourhood expansion over the
document graph — gathering evidence passages with their source locations. Produce `data.evidence`.

## Step: answer — Synthesize a grounded answer

Synthesize an answer strictly from `data.evidence`, grounding every claim in its
source passage (name its source `document`) and flagging any part the
documents do not cover. Produce `draft.answer`.

## Step: verify_deliver — Verify every claim maps to a source, then deliver

Verify that every claim in the answer maps to a retrieved passage (no unsupported
statements) and that each names the right source; drop or flag anything
unsupported. Deliver the final grounded answer with its source passages named as
`artifact.answer`. `validation.passed` = every claim is grounded. Run the
completeness self-check first.
