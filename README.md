# Propel Fault Localizer

This repo is my submission for the Propel AI Product Engineer assignment.

It is a seeded synthetic outage console for a radial low-tension network. The app ingests telemetry, localizes span/DT/feeder faults, suppresses planned outages, tracks a ticket lifecycle, and lets a reviewer inject faults from the UI.

## Run

```bash
docker compose up --build
```

Then open `http://localhost:3000`.

## What to read

- [ARCHITECTURE.md](ARCHITECTURE.md) for the data model, localization logic, AI feature, and API surface.
- [DEPLOYMENT.md](DEPLOYMENT.md) for environment variables, reset steps, and troubleshooting.
- [DECISIONS.md](DECISIONS.md) for the design trade-offs and assumptions.
- [AI-WORKFLOW.md](AI-WORKFLOW.md) for how AI was used while building this.

## Public submission fields

- GitHub repo URL: fill in before submission.
- Live URL: fill in after deployment.
- Demo video link: fill in after recording the walkthrough.

## Notes

- The app seeds its own synthetic network and state on first start.
- No assignment files were modified.
- The UI is intentionally simple enough to defend in an interview: one incident list, one detail pane, one simulator.
