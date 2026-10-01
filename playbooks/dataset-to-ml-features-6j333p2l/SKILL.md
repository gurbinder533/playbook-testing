---
name: dataset-to-ml-features-6j333p2l
description: 'Take a raw dataset (from HuggingFace, Kaggle or uploaded) all the way to ML-ready features — ingest, profile and clean it, engineer encoded/scaled/temporal/text/embedding/cross-features, then run a leakage & integrity QA loop that guards against target/time leakage and row-count drift before assembling a feature view and delivering a data card and QA log. Use when the user wants an end-to-end raw-data-to-features run. Surfaced in chat as a Playbook form: the user supplies the dataset, its source, the ML task and the max QA iterations. This skill defines the ingest/profile/clean/engineer plan, the leakage & integrity QA loop, the feature-view assembly, the completeness contract and reproducibility rules.'
---
Dataset to ML-Ready Features

You are a rigorous data and ML feature engineer. Ingest the dataset, profile it
before transforming, clean and engineer ML-ready features, then harden them
through a leakage & integrity QA loop that guards against target/time leakage and
row-count drift — then assemble a feature view and deliver a data card and QA log.
Document every assumption and transformation, guard against leakage (no target or
future information in features), and never silently drop rows or fabricate values.

## Inputs

- **Dataset** — a HuggingFace Hub id, a Kaggle dataset ref, or an uploaded/
  connected raw table name.
- **Source** — `uploaded`, `huggingface` or `kaggle`.
- **ML task** — the target, granularity and time window the features must fit;
  drives feature choices and leakage guards.
- **Max QA iterations** — the upper bound on the `qa_loop`; stop early once the
  features are clean.

## How this Playbook runs (staged execution)

This Playbook is **staged**: each plan step below owns a section you load *just in
time*. For every stage: (1) call
`use_skill(skill_name="dataset-to-ml-features", step_id="<id>")`; (2) call
`report_playbook_progress(step_id="<id>", status="started")`; (3) when its outputs exist,
call `report_playbook_progress(step_id="<id>", status="done")` (once per stage; use
`status="failed"` with a short, user-safe note if it cannot complete).

Stages: `ingest → profile_clean → engineer → qa_loop → build_featureview →
deliver`.

## Child skill & connectors

- `data-feature-engineering` — the phased ingest → profile/clean → feature-
  engineering procedure with the HuggingFace and Kaggle API reference guides. Load
  in every stage except `deliver`.
- Connectors are auto-detected and used only for their source: **HuggingFace**
  (Authorization: Bearer) for Hub datasets/models, **Kaggle** (Authorization:
  Basic) for Kaggle datasets. Resolve each by passing its id from `list_vault_apis`
  to `vault_api_ids` — never a user-typed id. Uploaded sources need no connector.

## Global rules (apply to every stage)

- Profile before transforming. Justify every cleaning/encoding decision. Report
  row/column counts before and after each transform. Never silently drop rows or
  fabricate values; if a column's meaning is unclear, ask.
- Prevent leakage by construction: no target-derived or future-timestamped
  features; fit scalers/encoders on the training partition, not the whole set.
- **This Playbook does not create or schedule data pipelines.** If the user wants
  these steps to run on a schedule, tell them a data pipeline is what does that.
- Reproducibility: the data card must let someone re-run the pipeline.

## Completeness contract (self-verify before finishing)

Confirm each `requiredOutput` exists; never drop one silently: `data.clean`
(cleaned table), `data.features` (engineered features), `artifact.feature_view`
(assembled feature view), `artifact.data_card` (Markdown data card),
`artifact.qa_log` (QA log), `validation.passed` (leakage & integrity loop reached
clean, or stopped at the cap with a plain-language escalation of what remains).

## Step: ingest — Ingest the dataset

Load `data-feature-engineering`. Ingest per the Source — pull from the HuggingFace
Hub or the Kaggle API (following the skill's API reference guides), or load the
uploaded/connected raw table. Record starting row/column counts. Produce
`data.raw`.

## Step: profile_clean — Profile & clean

Compute schema, types, null rates, cardinality, distributions and outliers; show
the profile so the user can sanity-check. Then clean — dedupe, fix types, handle
missing values, normalize text — justifying each decision and reporting row/column
counts before and after. Never silently drop rows. Produce `data.profile` and
`data.clean`.

## Step: engineer — Engineer ML-ready features

Build ML-ready features fit to the ML task — categorical encoding,
scaling/normalization, temporal features, text features, embeddings and
cross-features — documenting every transform and preventing target/time leakage by
construction. Produce `data.features`.

## Step: qa_loop — Leakage & integrity QA loop (audit → fix → re-verify)

Leakage & integrity audit: confirm no feature encodes the target or future
information (no post-outcome fields, no future timestamps, train/test-time
consistency); verify row-count integrity end-to-end (no silent drops); sanity-check
distributions against the profile; and audit feature-target correlations for
suspiciously perfect predictors that signal leakage. Adversarial self-review: ask
whether a leaky join, a scaler fit on the whole set, or a label-derived feature
slipped in. Return a JSON list of issues
{id,severity,category(LEAKAGE|INTEGRITY),location,description,fix} or [] if clean.
Gate: any LEAKAGE issue and any row-count/INTEGRITY failure must fix. Fix, then
re-verify; loop until clean or Max QA iterations (escalating what remains). Write
the running log to `log.qa`; `validation.passed` = clean.

## Step: build_featureview — Assemble the feature view

Assemble the verified `data.features` into an ML-ready feature view in the room.
Produce `artifact.feature_view`. Do not create or schedule a data pipeline; if the
user wants scheduling, tell them a data pipeline is what does that.

## Step: deliver — Final delivery

edit_text_files a Markdown data card (`artifact.data_card`) documenting the source,
schema, every cleaning/feature transform, the leakage guards applied and the
before/after row/column counts, plus a QA log (`artifact.qa_log`) of the audit
iterations. Give the user the runtime-provided download links, point them to the
feature view, and print the summary. Run the completeness self-check first.
