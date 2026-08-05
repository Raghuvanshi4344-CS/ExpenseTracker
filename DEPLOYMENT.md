# Deployment

## Prerequisites

- Docker 24+ with Docker Compose
- Node 20+ if you want to run outside Docker

## One-command start

```bash
docker compose up --build
```

Open `http://localhost:3000`.

## Environment variables

Commit [`.env.example`](.env.example) and fill only what you need.

| Name | Purpose | Required | Safe default |
|---|---|---:|---|
| `PORT` | HTTP port for the app | No | `3000` |
| `OPENAI_API_KEY` | Optional key for the ticket brief feature | No | unset, fallback summary used |
| `OPENAI_MODEL` | Model name for the brief feature | No | `gpt-4.1-mini` |

## Verify it worked

1. Open the root URL.
2. You should see a seeded incident console, a map-like network view, and simulator controls.
3. Click `Inject fault` and a localized ticket should appear.
4. Click `Repair latest` and the ticket should auto-verify after telemetry returns.

## Reset to clean state

- Use the `Reset store` button in the UI, or
- Delete the generated JSON files under `data/` and restart the stack.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `docker compose up` fails on port 3000 | Another app is using the port | Stop the other process or change `PORT` |
| Console loads but state is empty | The generated JSON was deleted mid-run | Click `Reset store` or restart the stack |
| Tickets do not move after repair | The selected fault was not the latest active one | Inject a new fault and repair that fault |
| Public deployment shows a blank page | Static assets were not copied or the host rewrote routes | Check the host build logs and ensure `/app.js` and `/styles.css` are served |
| `OPENAI_API_KEY` missing | The optional brief feature falls back | This is expected; the rest of the app still works |
