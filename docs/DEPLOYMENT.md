# Deployment runbook: Vercel, Render, and Neon

This runbook prepares a public HTTPS hackathon demo. It does not authorize creation of accounts, acceptance of provider terms, billing, or public deployment. Use only synthetic demo data. ConduitGuard must remain an offline policy-model simulator and must never connect to, scan, or modify a firewall or network.

## Architecture

| Component | Provider | Configuration |
| --- | --- | --- |
| Frontend | Vercel | `frontend/` root directory; Next.js build |
| API | Render Web Service | Root `Dockerfile`; `/api/health` health check |
| Rate-limit state | Render Key Value | Private, Redis-compatible store shared by all API instances |
| Audit summaries | Neon PostgreSQL | `DATABASE_URL` secret; aggregate-only history |

Render Web Services terminate HTTPS and require the application to bind `0.0.0.0:$PORT`. The supplied Dockerfile uses `python:3.15-slim` and the existing pinned requirements. Render's free plan can sleep after idle time and its Key Value free tier is in-memory; this is appropriate for a demo but not an availability or durable-audit guarantee. Neon remains the durable source for the intentionally limited audit summaries.

## Required production variables

### Render API service

| Variable | Value | Secret |
| --- | --- | --- |
| `CONDUITGUARD_ENV` | `production` | No |
| `CORS_ALLOWED_ORIGINS` | Exact Vercel HTTPS origin, such as `https://conduitguard.vercel.app` | No |
| `DATABASE_URL` | Neon restricted application-role PostgreSQL URL with `sslmode=require` | Yes |
| `REDIS_URL` | Authenticated internal Render Key Value URL | Yes |
| `RATE_LIMIT_ENABLED` | `true` | No |
| `RATE_LIMIT_REQUESTS` | `30` | No |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | No |
| `TRUST_PROXY_HEADERS` | `true` | No |
| `PORT` | Provided by Render; do not set unless overriding platform defaults | No |

### Vercel frontend

| Variable | Value | Secret |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Exact Render API HTTPS origin, without a trailing slash | No, public build-time value |

Never set `DATABASE_URL`, `REDIS_URL`, or any credential as a `NEXT_PUBLIC_*` Vercel variable.

## Provisioning sequence after deployment approval

1. Create a Neon project in the chosen region. Create a restricted application role that has access only to the ConduitGuard database and `analysis_history` table. Copy its TLS connection string into Render as the `DATABASE_URL` secret; never put it in a file or browser variable.
2. Create the Render resources from `render.yaml`, selecting the same region for the Web Service and Key Value instance. Keep the Key Value `ipAllowList` empty to prohibit external access.
3. In Render Key Value, enable internal authentication. Replace the automatically wired value with its authenticated internal URL in the API service's secret `REDIS_URL`. This keeps limiter state private to the Render network.
4. Set `CORS_ALLOWED_ORIGINS` to the final Vercel origin. Do not use `*`, paths, credentials, or comma-separated preview URLs unless each is intentionally required.
5. Create a Vercel project with `frontend` as its root directory. Add `NEXT_PUBLIC_API_URL` in the Production environment **before** building. `frontend/vercel.json` uses frozen pnpm installation; `frontend/next.config.ts` supplies the security headers.
6. Deploy the Render API first. Confirm `https://<api>/api/health` returns HTTP 200, then set the exact API origin in Vercel and deploy the frontend.
7. Use the post-deploy checklist below from an external browser. Do not treat a successful build as a successful deployment.

## Public-demo controls

- The API accepts only explicit CORS origins, limits request bodies to 256 KiB, and returns generic public 500 errors.
- `/api/analyze` and `/api/validate` are rate limited through Redis shared by every Render instance. Redis failure in production returns HTTP 503; it never falls back to per-process memory.
- The frontend sends CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and restrictive `Permissions-Policy` headers. The CSP allows the configured API origin and the axe-core CDN used by the test suite.
- Render provides TLS and edge DDoS protection. Review service traffic and Render logs during the demo. For targeted Layer 7 abuse, the shared limiter is the application-level control; do not bypass it by setting `RATE_LIMIT_ENABLED=false` in production.
- Submitted policies, probes, addresses, and finding evidence are not inserted into PostgreSQL. The Redis limiter holds only a short-lived hash of client identity and counters.
- Never log request bodies, database URLs, Redis URLs, or provider credentials. The current application logs only unexpected server errors and database status failures.

## Local and production validation

```powershell
# Repository root, Python 3.15 virtual environment activated or addressed explicitly
.\.venv\Scripts\python.exe -m pytest backend\tests -q
.\.venv\Scripts\python.exe -m ruff check backend scripts
.\.venv\Scripts\python.exe -m ruff format --check backend scripts
.\.venv\Scripts\python.exe -m pip install pip-audit
.\.venv\Scripts\pip-audit.exe --path .\.venv\Lib\site-packages --progress-spinner off

cd frontend
pnpm install --frozen-lockfile
pnpm lint
pnpm exec tsc --noEmit
pnpm build
pnpm audit --audit-level=high
```

To exercise local production mode, run a Redis-compatible service, then set `CONDUITGUARD_ENV=production`, `REDIS_URL`, `RATE_LIMIT_ENABLED=true`, and local exact CORS origins before starting Uvicorn. Production is intentionally unavailable with HTTP 503 if `REDIS_URL` is absent.

## External verification checklist

- [ ] `GET /api/health` returns 200 and no credentials.
- [ ] `GET /api/examples/demo` returns the synthetic example.
- [ ] A normal analysis returns findings and synthetic simulation decisions.
- [ ] The demo reports `CG-POL-005` for a deliberately shadowed rule.
- [ ] Invalid JSON and schema failures return documented 400/422 responses.
- [ ] The 31st analysis/validation request in one minute receives 429 and a `Retry-After` header.
- [ ] JSON report export downloads in the browser.
- [ ] PostgreSQL history contains aggregate-only records and no submitted policy data.
- [ ] Browser E2E and accessibility checks pass against the public HTTPS frontend.
- [ ] Response headers include CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`.

## Cost and limits to review

- Vercel Hobby is for personal non-commercial use and has feature/usage limits. Confirm that the planned hackathon use is eligible; otherwise choose the appropriate paid plan.
- Render free Web Services can sleep after idle time, so the first judge request can be slow. Render free Key Value has no durable persistence, which is acceptable because limiter counters are short lived.
- Neon free plan limits can change. Check current storage and compute allowances before provisioning. Upgrade or set spending controls only after explicit approval.

## Approval boundary

Before any account creation, terms acceptance, billing action, or public URL publication, obtain explicit approval for the provider accounts and selected service plans. After deployment, record the actual public frontend and API URLs only after the external checklist has passed.
