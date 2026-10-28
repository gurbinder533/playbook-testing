---
name: custom-pipeline-2s0i0z6d
description: A blank data pipeline scaffold to build FROM SCRATCH in the pipeline
  this bundle sits inside. Use when the user starts a new pipeline from nothing and
  describes the data to start from and what it should produce. Follow the data-pipeline-creation
  skill for HOW to build (actions, the tables between them, running and checking),
  but apply it to THIS pipeline rather than creating another one. This is the 'start
  from scratch' counterpart to adopting a pipeline template.
---

# New Data Pipeline (blank scaffold)

You are **this pipeline's own agent**, and the pipeline you are bound to is empty:
no actions, no tables, nothing run. The user's brief says which of the room's data
to start from and what should be sitting there when it finishes. Turn that into a
built pipeline, inferring whatever they left unanswered rather than interrogating
them for it.

The brief does not say *when* to run. Scheduling is chosen against a built
pipeline, so if a brief names a cadence ("every Monday"), take it as context for
the deliverable and never as an action that waits.

## When there is no brief at all

The form's one question is optional, so the message may be a single line with
nothing after it. That is a legitimate way to start — someone who wants a pipeline
but does not yet know what to ask for — and it is not a reason to stall.

Do the `inputs` stage first anyway: the room's own data is the brief in that case.
Then come back with **two or three concrete pipelines those tables would support**,
each said in one line as the deliverable it leaves behind ("a table of your support
tickets grouped by theme, with counts"), and ask which. Name the tables you read, so
the choice is visibly grounded in what is actually there rather than in a menu.

Do not design a pipeline and build it silently on a guess. Build once they pick —
and if they answer with something else entirely, that is the brief.

## Follow `data-pipeline-creation` for HOW to build

Do not restate the building rules here — they live in one place. Before you
build, load them and follow them:

- `use_skill(skill_name="data-pipeline-creation")` and apply its whole doctrine:
  what an action is and what it hands to the next one, the patterns under
  `patterns/` for the shape of work you have been given, how a run is checked,
  and why a run that succeeds with empty results has still failed.

## The ONE override: build in the pipeline you are already in

`data-pipeline-creation` is written for an agent that may need a pipeline to work
in. You do not — **you already have one**, and it is the pipeline this bundle
sits inside. So apply the doctrine, but:

- **Never create a second pipeline.** Asking for one when you are bound to one
  leaves the user's surface empty while you fill something they cannot see.
- **Use this bundle's own files as scratch space** for the working notes behind
  your decisions, so a later turn can see what this one worked out and why — a
  column that turned out dirty, a join that had to be approximate. Write them in a
  markdown file of your own; the plan is this bundle's stages, which you report
  progress against, and `pipeline.yaml` records only which pipeline you build in.

The stages below are the build loop, and they are `data-pipeline-creation`'s
checklist in this bundle's own terms — the plan the user watches, which is why
nothing here restates the doctrine behind it.

## Step: inputs — Read what the room already holds

Goal: knowing what you are working with. Produces `inputs.read`.

Inventory the room's tables and sources, then preview and profile the ones the
brief would start from — column types, row counts, whether the keys you intend to
join on actually line up. Nothing is designed over data that has not been looked
at, which is where wrong tools and joins that die on real data come from.

## Step: design — Design the chain, reusing what is already built

Goal: the steps and the tables between them, settled. Produces `design.settled`.

Settle the steps and the tables they hand along, and do two things before you
commit to any of them: check whether an existing pipeline output already holds the
result — reuse beats building — and read the pattern under `patterns/` for the
shape of work you were given rather than inventing a shape.

Infer whatever the brief left unanswered. Ask only when something essential is
genuinely ambiguous.

## Step: declare — Declare the graph without running it

Goal: the whole chain existing, unrun. Produces `pipeline.declared`.

Add the sources and one action per step, in order, so the whole chain exists
before anything executes. Nothing runs as you add it — that is what makes the
next stage free, and it is why this is a stage of its own rather than a build-and-
run loop.

Build in the pipeline you are already in — never create a second one.

## Step: verify — Check the graph before it costs anything

Goal: every ref and schema confirmed. Produces `pipeline.verified`.

Read the graph back and confirm each step reads the output it meant and the
schemas are what the next step expects. A wrong ref found here costs nothing;
found after a run it costs the run.

## Step: run — Run it, then say what it produced

Goal: the deliverable sitting in its table, and the user told. Produces `pipeline.ran`.

Run the pipeline and watch it through, fixing and re-running anything that fails.
A run that succeeds with empty results has still failed.

Then show the deliverable table and how it was reached, and invite refinements —
rebuilding the affected actions on each accepted change.
