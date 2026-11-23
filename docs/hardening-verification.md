# Hardening verification

## Implemented

- Downloads use a shared contained-files-only resolver; directory deletion is disallowed. Tests exercise actual HTTP routes against temporary data.
- Local-only API Host/Origin checks, internal webhook token, and loopback-only Compose published ports. This is a single-user local deployment, **not authenticated multi-user hosting**. Do not expose the API publicly.
- Multipart CSV/JSON uploads replace base64 JSON; validation, duplicate-file rejection and temporary-file cleanup are tested. Excel uploads are explicitly unsupported.
- Async statistics caching and a lightweight `/healthz` endpoint.
- Polling waits for dependent requests, pauses/aborts in hidden tabs, and preserves displayed data during refresh.
- Atomic JSON writes; backend and Python respect `DATA_DIR`.
- Compose shares `backend_data` at `/app/data`; application containers run as UID 1000. Existing root-owned volumes may require an ownership migration before startup.
- CI executes tests and lint without swallowed failures. Publishing depends on lint/test and security jobs. Bandit currently gates HIGH findings; lower-severity findings remain for review.
- Updated npm dependency lockfiles; audits returned zero vulnerabilities.

## Verification performed locally

- Backend: 13 tests passing, including HTTP integration tests.
- Frontend: 8 tests passing; ESLint passing; production build passing.
- Python state helper: 1 unittest passing; selected fatal flake8 checks passing.
- npm audits: zero known vulnerabilities in backend and frontend.
- pip-audit: no known vulnerabilities in requirements.
- Bandit: no HIGH findings; 1 medium and 5 low findings remain.
- `docker compose config --quiet`: passes; Compose and CI files parse as YAML.

## Not verified / remaining work

- Docker daemon is unavailable locally. Images were not built or started, and nginx config was not validated by nginx. CI has not run remotely.
- Existing JSON state is **not automatically migrated** from project-root files or old bind mounts into `/app/data`. Back up state and volumes, migrate explicitly, and check permissions before deployment. Do not remove old volumes.
- Do not run standalone scraper and dashboard scraper concurrently against the same JSON state; atomic writes prevent partial files, not cross-process lost updates.
- Frontend main bundle remains ~867 kB minified (~257 kB gzip). Route splitting, context separation, pagination/SSE, and full browser regression testing remain future work.
- The frontend test harness runs provider logic with a small hook host, not a full React DOM environment.
- Existing `JoyDivisionVisualizer.tsx` user changes were not edited. No production downloads or private music datasets were used by tests.
