# Decisions

## Latest first

### 2026-08-01 - Keep localization deterministic

Chose a graph-based boundary detector instead of any LLM-assisted localization.

Rejected:

- pure heuristic alerting on every dark pole
- an LLM deciding the fault span

Why: the assignment explicitly values explainable localization, and the physical boundary is a deterministic graph problem.

### 2026-08-01 - Use inferred geometry only for incomplete topology

Chose to preserve recorded pole order where it exists and infer ordering from coordinates only where it does not.

Rejected:

- pretending the topology is complete
- forcing a manual survey step before the demo works

Why: the missing topology is the central difficulty, so the app needs a live answer for the incomplete case, not a placeholder.

### 2026-08-01 - Ship a schematic operator screen

Chose a compact operations console with incident list, detail pane, and a map sketch.

Rejected:

- a dense analytics dashboard
- a full GIS implementation

Why: the reviewer needs to understand the product in seconds, and a 2 a.m. operator needs the same.

### Assumptions

- A synthetic seeded subdivision is acceptable if it matches the scale and topology shape from the brief.
- Polling the app state every 10 seconds is enough for the demo and easier to defend than a websocket stack behind a free host.
- The optional AI feature can degrade gracefully to a deterministic summary when no model key is present.

## What I would do with two more weeks

- Replace the geometry inference with a learned topology cache from repeated outage history.
- Add a more faithful map layer and highlight the exact live/dark boundary on the line.
- Replace file-backed JSON state with PostgreSQL if the deployed host needed concurrency.

## What is still fragile

- Inferred topology can be wrong on dense branch layouts.
- The simulator is intentionally simplified and does not model every radio failure mode.
- The AI brief feature is optional and only becomes real when a model key is configured.
