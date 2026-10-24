# Baseline Audit — ConduitGuard

Date: 23 October 2026

## Implemented and verified in code

- The backend enforces strict configuration and probe schemas, a 256 KiB request limit, deterministic rule ordering, and stable rule-ID diffs.
- The simulator is offline: it does not contact a firewall, scan a target, or apply a change.
- PostgreSQL persistence is intentionally aggregate-only. It stores no configuration, address, probe, or finding-evidence data.
- The frontend supports configuration entry, server-loaded demo data, analysis, findings, before/after probe decisions, report export, and session-scoped result continuity across routes.
- CI provisions Python 3.15 and runs backend tests, linting, TypeScript, production build, smoke testing, browser E2E, and dependency checks.

## Findings addressed in this iteration

| Priority | Finding | Impact | Action |
| --- | --- | --- | --- |
| High | The engine did not explain rules made ineffective by an earlier broad rule. | Operators could believe a later rule changes behaviour when it never executes. | Added deterministic `CG-POL-005` shadow-rule detection and test coverage. |
| High | Findings lacked one comparable, documented review-priority signal. | Reviewers had to manually infer the aggregate urgency. | Added heuristic risk summary with fixed weights, factors, limitation text, UI, export, and database aggregate. The displayed level is never lower than the highest-severity finding. |
| High | PostgreSQL history was not visible in the user workflow. | Persistence could not be demonstrated from the product. | Added an overview history panel with explicit privacy boundary and unavailable state. |
| High | Browser E2E selectors described a retired tabbed English UI. | CI could stop validating the actual Indonesian route-based UI. | Updated test selectors and navigation model. |
| Medium | Configuration editor subtitle handling was inconsistent. | The current configuration could be labelled as the proposed state. | Render the supplied subtitle directly. |

## Current limits

- The engine remains a generic policy model. It does not parse vendor syntax or model routing, NAT, zones, identity, interfaces, statefulness, or physical reachability.
- The score is not a probability and does not quantify mission impact.
- A configured local PostgreSQL connection could not be socket-tested from this sandbox; the application must be tested on its intended host. Database error states and aggregate-only handling are covered by API tests.
- Runtime support, direct dependency pins, lockfiles, and CI are aligned to Python 3.15. See `docs/DEPENDENCY_AUDIT.md` for the verified upgrade record.
- Physical screen-reader testing and a live deployment test remain manual verification work.
