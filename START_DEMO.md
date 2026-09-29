# Run RivalPulse with Sectors v2

The old replay website instructions are retired. Synthetic replay is for automated tests only; there is no public-data fallback for live investigations.

1. Set a valid private `SECTORS_API_KEY` in ignored `backend/.env` (copy `backend/.env.example` first if it does not exist). Do not put this key in `frontend/.env.local` or Git.
2. Start Docker Desktop and Ollama with `qwen3.8:27b` installed.
3. From the repository root run `./START_SECTORS.ps1` in PowerShell.
4. Open `http://localhost:8080/login`; use the private `DEMO_ACCESS_TOKEN` from `backend/.env` to enter.
5. Stop with `./STOP_SECTORS.ps1`. Database and Redis volumes are retained.

The script confirms key **presence**, not Sectors authorization. The newly configured local key succeeded on one direct overview-only request (documented cost: 1 credit); a complete RivalPulse investigation has not yet been run with it. Live tool planning is deterministic by default (`LLM_PLAN_ENABLED=false`); Qwen can still provide guarded interpretation.

See [README.md](README.md) and [backend/README.md](backend/README.md) for details.
