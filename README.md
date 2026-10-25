# ConduitGuard

ConduitGuard is an open-source, offline tool for reviewing generic firewall policy changes. Supply a current policy, a proposed policy, and optional connection probes. The API validates both policies, produces an order-independent diff, runs explicit policy checks, evaluates each probe before and after, and returns a JSON report.

> **Simulation only.** ConduitGuard never connects to, scans, or applies changes to a firewall or network. Its generic model is not a vendor configuration parser and does not find every vulnerability.

## Features

- Strict JSON schema validation with required fields, types, address/CIDR checks, ID uniqueness, port bounds, rule and request size limits.
- Rule diff by rule ID. Reordering JSON arrays is not a change.
- Explainable checks for unrestricted allow rules, administrative ports, equal-priority conflicts, fully shadowed rules, and broadened/new access.
- Deterministic heuristic risk score with visible factors and weights; it prioritizes review and is not an incident probability.
- Offline connection evaluation against before and after configurations.
- Responsive Next.js interface with backend-loaded demo data, findings, diff, probe results, and downloadable JSON report.
- FastAPI endpoints with OpenAPI docs at `/docs`, consistent public validation errors, no public tracebacks, and request size limits.

## Architecture

```text
frontend (Next.js + TypeScript, :3000)
     | JSON REST calls; no policy decisions in the browser
backend (FastAPI + Pydantic, :8000)
     ├── app/models.py       schema and input validation
     ├── app/analysis.py     diff, policy engine, simulator, report data
     └── app/main.py         API, request size enforcement, error handling
```

The `POST /api/analyze` result includes changes, findings with evidence and mitigations, a deterministic heuristic risk summary, before/after probe decisions, recommendations, rules version, assumptions, and limitations. The browser adds a generation timestamp when downloading the report. Submitted configurations, probes, and finding evidence are not persisted. If `DATABASE_URL` is configured, PostgreSQL stores aggregate counts plus a redacted report detail (change IDs and changed field names, finding descriptions and mitigations, risk summary, and aggregate simulation decisions). The API exposes paginated summaries through `GET /api/history?page=1&page_size=10` and a single record through `GET /api/history/{id}`; the web interface is available at `/history`.

## Configuration schema

```json
{
  "default_policy": "deny",
  "rules": [
    {
      "id": "allow-https",
      "source": "10.20.0.0/16",
      "destination": "192.0.2.10",
      "protocol": "tcp",
      "port": 443,
      "action": "allow",
      "priority": 100,
      "description": "HTTPS from app subnet"
    }
  ]
}
```

`default_policy` is `allow` or `deny` (defaults to `deny`). `rules` is limited to 500 entries. Rule IDs are unique strings of up to 64 characters (`A-Z`, `a-z`, digits, `.`, `_`, `-`). `source` and `destination` are an IP address, CIDR network, or `*`. `protocol` is `tcp`, `udp`, `icmp`, or `any`. `port` is an integer from 1 through 65535 or `*`; ICMP uses `*` only. `action` is `allow` or `deny`. `priority` is an integer from 0 through 65535 and defaults to 100. Unknown fields are rejected.

### Evaluation semantics

Rules are evaluated by ascending numeric priority (lower number first), then ascending rule ID for ties. First match wins. `*` matches all values for its field; CIDR uses IP membership; `any` protocol matches TCP, UDP, or ICMP. A port number matches that exact TCP/UDP port. No match uses `default_policy`. Equal-priority overlapping rules with opposite actions produce a finding; the stable ID ordering still determines the simulated decision. Rule array position has no meaning.

The analyzer flags (1) an allow rule whose source and destination are both `*` or zero-prefix CIDRs, plus any `allow` default policy (high), (2) allow rules covering ports 22, 23, 3389, or 5900, including wildcard ports over TCP/UDP (high), (3) equal-priority opposite-action overlapping rules (medium), (4) new or broadened access, including a deny-to-allow action change or a default-policy change to allow (medium, except a default-policy change is critical), and (5) a rule fully shadowed by an earlier, broader rule (medium). Shadowing uses the documented evaluation order, so a shadowed rule cannot affect the simulator result.

The risk score is a transparent priority aid: critical, high, medium, and low findings contribute fixed weights of 40, 20, 8, and 3, capped at 100. The displayed level is the higher of the score band and the most severe finding, so a high finding cannot be presented as medium. It is a heuristic severity aggregate, not a probability of compromise or operational impact.

### Probe schema

Provide an array of up to 100 probe objects with `source` and `destination` IP addresses, protocol `tcp`, `udp`, or `icmp`, a required integer `port` for TCP/UDP, and no port for ICMP. Optional `label` is shown in results. Probes only evaluate the supplied model; they do not test real connectivity.

## Clean installation

Requirements: Python 3.15.x, Node.js 24.x, pnpm 11.25.0, and Git (only needed for repository operations). From the repository root:

Verify the interpreter before creating the virtual environment. ConduitGuard is tested against Python 3.15 and pins direct backend dependencies to known-compatible stable releases.

```powershell
py -3.15 --version
```

The command must report Python 3.15.x. If it is unavailable, install Python 3.15 and recreate the environment; do not reuse a virtual environment created with a different Python minor version.

### Backend

```powershell
py -3.15 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
python -m uvicorn app.main:app --app-dir backend --env-file backend/.env --reload --port 8000
```

### Local PostgreSQL database (pgAdmin)

PostgreSQL is installed locally with port `8080` on this machine. In pgAdmin, register a server with host `127.0.0.1`, port `8080`, maintenance database `postgres`, username `postgres`, and the password chosen during PostgreSQL installation. Then create a login role named `conduitguard_app` with a unique password, create database `conduitguard` with `conduitguard_app` as its owner, and connect to that database. Run `backend/sql/001_analysis_history.sql` in its Query Tool (the API also creates the table automatically on first use).

Keep the local connection string in the ignored `backend/.env` file; do not commit or share it. Start the backend with:

```powershell
python -m uvicorn app.main:app --app-dir backend --env-file backend/.env --reload --port 8000
```

The backend health response reports whether `DATABASE_URL` is configured. A successful demo analysis should return `history_status: "saved"`; `GET /api/history` should show the saved aggregate summary. In Render, use the same app role and database but set `DATABASE_URL` to the provider's PostgreSQL connection string in the service's secret environment settings.

### Frontend (second terminal)

```powershell
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://localhost:3000>. Interactive API documentation is at <http://localhost:8000/docs> and the health check is <http://localhost:8000/api/health>. For local development, the frontend and backend use localhost defaults. For a different frontend origin, configure `CORS_ALLOWED_ORIGINS` on the backend with exact comma-separated HTTP(S) origins.

## Deployment configuration

The approved hackathon architecture is Vercel for the Next.js frontend, a Render Docker Web Service for the FastAPI API, Render Key Value for shared rate limiting, and Neon PostgreSQL for aggregate audit history. No service is provisioned by this repository. Follow [the deployment runbook](docs/DEPLOYMENT.md) only after reviewing the provider terms and approving public deployment.

`NEXT_PUBLIC_API_URL` is a public **build-time** frontend value. Set it in Vercel to the exact HTTPS API origin, for example `https://conduitguard-api.onrender.com`, before each production build. It is intentionally embedded in the browser bundle and must never contain a database or Redis URL.

The Render API service requires an exact `CORS_ALLOWED_ORIGINS` value for the Vercel frontend, a secret Neon `DATABASE_URL`, and a Render Key Value `REDIS_URL`. Production enables a shared Redis-backed limit of 30 analysis or validation requests per client per 60 seconds. The limiter fails closed if Redis is unavailable, rather than falling back to an in-memory counter. See the runbook for the required internal-auth configuration on Render Key Value.

PostgreSQL stores timestamp, aggregate counts, rules-engine version, heuristic risk score, and redacted analysis details. Raw configurations, IP addresses, probe endpoints, and raw finding evidence are not persisted. Existing rows created before redacted details were added remain readable as summaries, but their detail cannot be reconstructed. The API creates or migrates the `analysis_history` table on first use. `GET /api/health` reports only whether a database is configured; it does not expose its URL. Without `DATABASE_URL`, analysis continues normally and history remains disabled.

## API

- `GET /api/health` — API status and rules version.
- `GET /api/examples/demo` — demo input loaded by the interface.
- `POST /api/validate` — validates one configuration JSON document.
- `POST /api/analyze` — body is `{ "before": <config>, "after": <config>, "probes": [] }`.

Bodies larger than 256 KiB are rejected with HTTP 413. Invalid JSON sent to `/api/validate` returns 400. Schema errors return 422. Error bodies use `{ "error": { "code", "message", "details" } }`; unexpected errors are logged server-side and return a generic 500 response. The API schema is generated at `/openapi.json`.

## Testing and checks

From the repository root:

```powershell
python -m pytest
ruff check backend
ruff format --check backend
python -m pip install pip-audit
pip-audit -r backend/requirements.txt
cd frontend
pnpm install --frozen-lockfile
pnpm lint
pnpm exec tsc --noEmit
pnpm build
pnpm audit --audit-level=high
```

Tests cover malformed/empty/oversized payloads, missing and mistyped fields, duplicate IDs, identity and order-only diffs, added/removed/changed rules, policy checks, wildcard/protocol/port/priorities, allow/deny decisions, API errors, OpenAPI, and JSON-serializable reports. Simulator expectations are asserted directly against small fixtures. CI also runs `pip-audit -r backend/requirements.txt` and GitHub dependency review on pull requests.

Run backend checks with the same supported interpreter that created `.venv`:

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests -q
.\.venv\Scripts\python.exe -m ruff check backend scripts
.\.venv\Scripts\python.exe -m ruff format --check backend scripts
```

For a black-box smoke test, start the backend as described above. In a second terminal, build and start the production frontend:

```powershell
cd frontend
pnpm install --frozen-lockfile
pnpm build
pnpm start --hostname 127.0.0.1 --port 3000
```

With both servers running, return to the repository root in another terminal and run `python scripts/smoke.py`. It checks the served production page, demo API, normal analysis and simulation, policy finding, and invalid-input response.

For browser-level workflow and accessibility checks, install the test dependency and Chromium once:

```powershell
python -m pip install -r scripts\e2e-requirements.txt
python -m playwright install chromium
```

With both servers running, execute `python scripts/browser_e2e.py`. The suite covers loading the demo, editing and analyzing policies, result navigation, validation/API errors, report export, keyboard focus, loading and empty states, and a 390 px mobile viewport. It runs axe-core 4.10.3 against WCAG 2.1 A/AA rules in desktop and mobile result views and writes `artifacts/accessibility-report.md` plus a machine-readable JSON report. The report includes automated findings, implemented fixes, and keyboard/label/mobile checks. Physical screen-reader testing remains a manual verification step.

## Examples

Use `examples/before.json`, `examples/after.json`, and `examples/probes.json` in the dashboard (or use **Load demo**, which fetches equivalent data from the API).

## Competition materials

- [Competition proposal](docs/COMPETITION_PROPOSAL.md) maps implemented capabilities to the judging criteria and states the product limits.
- [Live demo script](docs/DEMO_SCRIPT.md) provides a repeatable synthetic IT/OT scenario with expected results and a database fallback.
- [Baseline audit](docs/AUDIT_BASELINE.md) records the capability baseline, resolved findings, and verification limits.

## Limitations

- This is a generic schema, not a parser for any vendor syntax.
- No routing, NAT, interfaces, statefulness, identity, zones, or actual network topology is modeled.
- Only the listed generic policy heuristics run; no claim of exhaustive vulnerability detection is made.
- Conflicting rules remain deterministic by rule ID but should be resolved by the operator.
- Inputs are not persisted by the API, but users should still avoid entering secrets or sensitive production details.
- See [SECURITY.md](SECURITY.md) for the public-demo security boundary and reporting guidance.

## Troubleshooting

- **Dashboard says API unavailable:** start the backend on port 8000 and check `/api/health`; confirm `NEXT_PUBLIC_API_URL` was set before the frontend build and `CORS_ALLOWED_ORIGINS` contains the frontend origin.
- **422 validation response:** inspect `error.details`; remove unsupported fields and confirm the schema and probe requirements above.
- **413 response:** reduce the combined request body to 256 KiB or less (500 rules per config; 100 probes).
- **Build tool not found:** install the documented Python, Node.js, and pnpm versions, then recreate the virtual environment and run `pnpm install --frozen-lockfile`.

## License

MIT. See [LICENSE](LICENSE).
