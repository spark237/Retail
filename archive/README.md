# Archive — legacy pre-version-control artifacts

This directory preserves artifacts from the pre-git phases of the RetailGuard
project (phase 2 backend snapshot, phase 3 PWA sprint zips, phase 4 kickoff,
engineering standards, early frontend CI draft). They are kept for historical
reference only — the living source of truth is at the repository root:

- `backend/` — NestJS + Prisma API
- `frontend/` — Vite + React POS SPA
- `docs/architecture/` — the 13 Phase-1 design documents (authoritative record)
- `docker-compose.yml`, `package.json`, `tsconfig.json` — root scaffolding

Do not edit files here; if you need one of these documents, move it out of
`archive/` to where it belongs (e.g. `docs/` or `.github/workflows/`).

Files archived from the original repo root (commit 9c6d2da):

| File | Phase |
| --- | --- |
| ENGINEERING_STANDARDS-1.md | Standards doc |
| frontend-ci.yml.txt | Early CI workflow draft (not yet active) |
| retailguard_phase2_backend_sprint1-1.zip | Phase 2 backend snapshot |
| retailguard_phase4_kickoff.md | Phase 4 kickoff notes |
| retailguard_pwa_phase3_sprint0.zip | Phase 3 PWA sprint 0 snapshot |
| retailguard_pwa_phase3_sprint0-2.zip | Phase 3 PWA sprint 0 snapshot (duplicate) |