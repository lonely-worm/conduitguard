# Dependency audit and Python 3.15 upgrade

Audit date: 2026-10-24.

## Scope and baseline

The workspace did not contain a `.git` directory, so there was no Git status or commit baseline to inspect. The baseline below is taken from the manifests that were present before this upgrade. No container configuration was present.

The upgrade kept the existing FastAPI API, PostgreSQL audit-history persistence, policy analysis, CG-POL-005 shadow-rule detection, risk scoring, report export, dashboard, and synthetic IT/OT scenarios intact. Dependency versions are exact pins or lockfile resolutions to keep installations reproducible.

## Direct dependency matrix

| Area | Package | Before | After | Python 3.15 status and decision |
| --- | --- | ---: | ---: | --- |
| Backend | FastAPI | 0.156.4 | 0.161.1 | Confirmed in a clean 3.15 environment through API tests and server startup. Reviewed FastAPI release notes; no removed deprecated API was used. |
| Backend | Pydantic | 2.14.1 | 2.14.1 | Current stable direct pin; installed and exercised on Python 3.15. |
| Backend | Uvicorn | 0.37.0 | 0.54.0 | Confirmed by application startup on Python 3.15. |
| Backend | Psycopg binary | 3.3.6 | 3.3.6 | Psycopg 3.3.6 explicitly added Python 3.15 support; local PostgreSQL history query succeeded. |
| Backend | pytest | 9.1.1 | 9.1.1 | pytest 9.1 officially supports Python 3.15; all repository backend tests passed. |
| Backend | HTTPX | 0.28.1 | 0.28.1 | Current stable direct pin; async ASGI tests pass on Python 3.15. |
| Backend | Ruff | 0.14.2 | 0.17.2 | Configured with `target-version = "py315"`; lint and format checks pass. |
| Browser tests | Playwright | `>=1.50,<2` | 1.64.1 | Exact stable pin; Chromium workflow and accessibility checks pass. |
| Frontend | Next.js | 16.4.2 | 16.4.3 | Current 16.x Active LTS patch; production build and browser workflow pass on Node 24. |
| Frontend | React / React DOM | 19.3.1 | 19.3.1 | Current stable direct pins compatible with Next 16.4.3; production build passes. |
| Frontend | TypeScript | 5.9.3 | 6.0.3 | Highest stable version supported by the installed `typescript-eslint` chain; type check and production build pass. |
| Frontend | ESLint | 9.39.1 | 9.39.5 | Highest version compatible with the current Next ESLint plugin peer ranges; lint and peer checks pass. |
| Frontend | eslint-config-next | 16.4.2 | 16.4.3 | Kept aligned with Next.js. |
| Frontend | Node / React type packages | 22.19.0 / 19.2.x | 24.19.2 / 19.3.0 | Aligned with the Node 24 CI runtime and React 19.3.1. |

`pnpm@11.25.0` remains the declared package manager. `frontend/pnpm-lock.yaml` was regenerated and passes a frozen-lockfile installation.

## Upgrade order and compatibility checks

1. Created a clean Python 3.15 virtual environment and installed the pinned backend and browser-test requirements.
2. Updated backend framework, server, linter, and browser-test versions, then replaced deprecated synchronous FastAPI test-client use with HTTPX's async ASGI transport.
3. Upgraded Next.js and its matching lint configuration, then moved TypeScript and ESLint only as far as their installed peer dependency chain supports.
4. Aligned Python metadata, Ruff target version, `.python-version`, README, and CI runtimes to Python 3.15 and Node 24.
5. Regenerated the pnpm lockfile, ran peer and security checks, then tested a production frontend plus API browser workflow.

## Validation performed

The following commands were run successfully in this workspace:

```powershell
py -3.15 -m venv .venv315
.\.venv315\Scripts\python.exe -m pip install -r backend\requirements.txt -r scripts\e2e-requirements.txt
.\.venv315\Scripts\python.exe -m pip check
.\.venv315\Scripts\python.exe -m pytest backend\tests -q
.\.venv315\Scripts\ruff.exe check backend scripts
.\.venv315\Scripts\ruff.exe format --check backend scripts
.\.venv315\Scripts\python.exe -m pip install pip-audit
.\.venv315\Scripts\pip-audit.exe -r backend\requirements.txt

cd frontend
pnpm install --frozen-lockfile
pnpm peers check
pnpm lint
pnpm exec tsc --noEmit
pnpm build
pnpm audit --audit-level=high
```

Results: 29 backend tests passed; Ruff lint and format checks passed; `pip check` found no broken requirements; `pip-audit` and pnpm audit found no known vulnerabilities; pnpm reported no peer dependency issues; frontend lint, type check, and production build passed. The browser suite passed its policy-edit, invalid-input, loading, unavailable-API, keyboard, mobile, desktop, and axe accessibility checks. The API production smoke test passed. A configured local PostgreSQL connection was also queried successfully for aggregate analysis history without exposing connection details.

## Remaining compatibility risks

- ESLint 10 was not adopted because `eslint-config-next` 16.4.3 resolves plugins whose peer ranges do not accept ESLint 10. ESLint 9.39.5 is the highest compatible release, but ESLint 9 is end-of-life. Reassess when the Next ESLint plugin chain supports ESLint 10.
- TypeScript 7 was not adopted because the resolved `typescript-eslint` tooling rejects it. TypeScript 6.0.3 is the highest compatible stable release; reassess after that tooling supports TypeScript 7.
- Python 3.15 validation used the stable 3.15.0 interpreter and the tested dependency set. Future minor package upgrades still require the same clean-install and full validation cycle.

## Reproducible installation

Use Python 3.15.x, Node.js 24.x, and pnpm 11.25.0. Follow the clean-install commands in `README.md`, retain `frontend/pnpm-lock.yaml`, and do not replace exact backend pins with unbounded ranges.

## Sources consulted

- [FastAPI release notes](https://fastapi.tiangolo.com/release-notes/)
- [pytest changelog](https://docs.pytest.org/en/stable/changelog.html)
- [Psycopg release notes](https://www.psycopg.org/psycopg3/docs/news.html)
- [Ruff settings](https://docs.astral.sh/ruff/settings/)
- [Next.js support policy](https://nextjs.org/support-policy)
- [ESLint v10 release notes](https://eslint.org/blog/2025/11/eslint-v10.0.0-released/)
