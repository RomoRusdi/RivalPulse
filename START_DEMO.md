# Start and demo RivalPulse

This guide runs the backend in explicit replay mode, so the demo uses synthetic evidence and does not require or consume Sectors credentials.

## Prerequisites

- Docker Desktop running Linux containers.
- Node.js and npm.
- PowerShell.

Check them from PowerShell:

```powershell
docker --version
docker compose version
node --version
npm --version
```

## 1. Configure the backend

Open PowerShell in the repository:

```powershell
cd D:\RivalPulse\RivalPulse\backend
Copy-Item .env.example .env -ErrorAction SilentlyContinue
notepad .env
```

Generate a private demo token:

```powershell
[guid]::NewGuid().ToString("N")
```

Put that generated value in `.env` and use these demo settings:

```dotenv
DEMO_ACCESS_TOKEN=PASTE_THE_GENERATED_TOKEN_HERE
MODE=replay
REPLAY_SCENARIO=baseline
SECTORS_API_KEY=
LLM_ENABLED=false
```

Leave the container database URL unchanged. PostgreSQL is exposed to Windows on port `15432`, while containers still connect to `postgres:5432`.

## 2. Start the backend

From `D:\RivalPulse\RivalPulse\backend`:

```powershell
docker compose up --build -d
docker compose ps -a
```

Expected state:

- `postgres`, `redis`, `api`, `worker`, and `reconciler` are running.
- `migrate` and `seed` exited with code `0`; this is expected.

Verify readiness:

```powershell
Invoke-RestMethod http://localhost:8000/api/v1/health/ready
```

The response should contain `status: ready` and `mode: replay`.

If startup fails, inspect the logs:

```powershell
docker compose logs --tail=100 migrate seed api worker reconciler
```

## 3. Configure the frontend

Open a second PowerShell window:

```powershell
cd D:\RivalPulse\RivalPulse\frontend
Copy-Item .env.example .env.local -ErrorAction SilentlyContinue
notepad .env.local
```

Set:

```dotenv
NEXT_PUBLIC_USE_MOCKS=false
NEXT_PUBLIC_API_BASE=http://localhost:8080/backend
```

## 4. Start the frontend

Keep the second PowerShell window open while using the app:

```powershell
cd D:\RivalPulse\RivalPulse\frontend
npm.cmd install
npm.cmd run dev -- --hostname 0.0.0.0 --port 3000
```

Wait for Next.js to show `Ready`. Confirm that it responds:

```powershell
Invoke-WebRequest http://localhost:3000 -UseBasicParsing
```

## 5. Start the same-origin proxy

Return to the backend PowerShell window:

```powershell
cd D:\RivalPulse\RivalPulse\backend
docker compose --profile frontend up -d frontend-proxy
```

The proxy exposes the website at port `8080`, forwards `/backend/` requests to the API, and forwards other paths to the frontend on port `3000`.

## 6. Log in and open the app

Open the private login page:

<http://localhost:8080/backend/demo/login>

Enter the value of `DEMO_ACCESS_TOKEN` from `backend/.env`. After it reports success, open:

<http://localhost:8080>

Use `localhost` consistently. Do not switch between `localhost` and `127.0.0.1`, because the login cookie is scoped to the hostname.

## 7. Demo the investigation workflow

1. Click **Investigate**.
2. Enter: `Compare product, pricing, and partnership developments across the watchlist.`
3. Click **Start run**.
4. Watch the progress card complete.
5. Refresh the page to load the saved signal feed.
6. Open a signal to inspect facts, observations, hypotheses, financial context, and evidence.
7. Start the same investigation again. Identical evidence should create no duplicate alert.

Replay data is visibly marked `[REPLAY]` and uses fictional `XTS` values. It must not be presented as real company financial data.

## 8. Demo a changed finding

Edit `backend/.env`:

```dotenv
REPLAY_SCENARIO=changed
```

Restart the processes that read backend configuration:

```powershell
cd D:\RivalPulse\RivalPulse\backend
docker compose up -d --force-recreate api worker reconciler
```

Start another investigation from the website and refresh after completion. This scenario should produce one updated ISAT finding. Repeating the same changed scenario should not create another revision.

Other replay scenarios are `missing_financial`, `failure`, and `conflict`. Restart the API, worker, and reconciler after each change and submit a new investigation.

## 9. Inspect the API directly

Open:

<http://localhost:8000/docs>

Select **Authorize** and enter the demo token. Useful endpoints:

- `GET /api/v1/watchlists`
- `POST /api/v1/research-runs`
- `GET /api/v1/research-runs/{run_id}`
- `GET /api/v1/signals`
- `GET /api/v1/signals/{signal_id}`

Research submission should return HTTP `202`. Poll the returned `status_url` until the run is `completed`, `partial`, or `failed`.

## 10. Troubleshooting

If `http://localhost:8080` shows **502 Bad Gateway**, the frontend is not reachable from Nginx. Keep this command running in the frontend PowerShell window:

```powershell
npm.cmd run dev -- --hostname 0.0.0.0 --port 3000
```

If port `15432` is unavailable, choose another unused Windows host port in `backend/compose.yaml`. Change only the left side, for example `127.0.0.1:25432:5432`. Container services must continue using port `5432`.

Check all services and logs:

```powershell
cd D:\RivalPulse\RivalPulse\backend
docker compose --profile frontend ps -a
docker compose logs --tail=100 api worker reconciler frontend-proxy
```

## 11. Stop the demo

Press `Ctrl+C` in the frontend PowerShell window, then run:

```powershell
cd D:\RivalPulse\RivalPulse\backend
docker compose --profile frontend down
```

This preserves PostgreSQL and Redis data in Docker volumes. Running `docker compose down --volumes` also deletes that local demo data.
