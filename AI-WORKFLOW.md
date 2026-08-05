# AI Workflow

I used Copilot heavily for the first-pass scaffolding: file structure, seed data shape, the HTTP surface, and the initial UI skeleton. I wrote and corrected the localization logic, the simulator behavior, the storage format, and the docs myself after checking the assignment constraints.

## What I delegated

- Boilerplate HTML/CSS layout for the console
- The initial JSON server structure
- Draft text for the documentation files

## What I kept manual

- The fault-boundary algorithm
- Planned-outage suppression logic
- Ticket lifecycle behavior and auto-verification
- The final wording of the assumptions and decision log

## Where AI was wrong or misleading

1. Early UI drafts were too dashboard-heavy and hid the actual incident.
2. A first-pass localization idea tried to score every dark pole independently; that violated the assignment requirement to group one snapped wire into one incident.
3. An early deployment draft assumed a websocket stack, which was unnecessary for the demo and riskier behind a free host.

I caught these by rereading the brief and checking whether the behavior matched the scoring rubric and self-check list.

## Rough estimate

About 55-65% of the final code was AI-assisted in the first draft, but most of the logic and nearly all of the final judgment calls were rewritten or tightened by me.

## Best prompt shape

The most useful pattern was giving the model a very narrow task with the assignment constraint attached, then asking for one file at a time. That produced usable scaffolding without letting it wander into the wrong product.
