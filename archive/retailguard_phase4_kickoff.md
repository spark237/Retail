# RetailGuard — Phase 4 Baseline Plan (Approved)

**Project status:**
```
Phase 0  ✓ Complete
Phase 1  ✓ Complete
Phase 2  ✓ Complete
Phase 3  ✓ Complete
Phase 4  ▶ In Progress (Sprint 0 — Project Readiness)
```

**Locked decisions:**
1. Mid-flush sync recovery — **fix now**, timeout-based reclaim, in Sprint 3
2. Backend test coverage — **build alongside sprints**, targets below
3. Timeline — **no fixed date, quality-first**, sequential, no compression

**Architectural stability rule, in effect from this point forward:** no architecture changes unless (1) a production bug exposes a design flaw, (2) a measurable performance bottleneck is identified, or (3) a business requirement can't be met with the current design. Otherwise: execution and verification, not redesign.

---

## Where we're picking up

Phase 3 gate is cleared: PWA hardened, 29/29 tests passing, one real production bug found and fixed (cart persistence `DataCloneError`), build is clean and reproducible. Backend (101 files, 13 apps) still has **zero automated tests** — only import/syntax validation. This plan is about testing, integration, operational readiness, deployment, documentation, and pilot validation — not new features.

---

## Sprint / Milestone Structure

| Sprint | Focus | Depends on |
|---|---|---|
| **Sprint 0 — Project Readiness** (1 wk) | CI pipeline, linting/formatting, coverage reporting, branch protection, `.env.example`, dev setup guide, data migration discovery | — |
| **Sprint 1** (2 wk) | Backend tests — models & services (sales/payment, inventory movements, fraud rules, shift lifecycle) + per-module contract-validation against `retailguard_api_contract_v1.md` | Sprint 0 |
| **Sprint 2** (2 wk) | Backend tests — views/API layer + full PWA↔Django integration suite (first time PWA runs against a live backend, not `fake-indexeddb`) | Sprint 1 |
| **Sprint 3** (2 wk) | Mid-flush sync recovery fix (timeout-based reclaim) + chaos testing suite | Sprint 2 |
| **Sprint 4** (2 wk) | Data migration tooling, built from Sprint 0 discovery findings | Sprint 0 discovery |
| **Sprint 5** (1–2 wk) | Staging deploy, single-branch pilot, UAT against measurable acceptance criteria | Sprints 1–4 |
| **Sprint 6 — Backup & Disaster Recovery** (1 wk) | Backup schedule, restore procedure, RTO/RPO, off-site storage, restore verification | Sprint 5 |
| **Sprint 7** (1 wk) | Hardening from UAT + restore-drill findings, launch prep, cutover plan | Sprint 6 |

**Total: ~12–14 weeks.** Every sprint transition below is gated — none of these are automatic.

---

## Sprint Gate (required at the end of every sprint)

No sprint N+1 starts until N passes this checklist, with an explicit **Go / No-Go** decision recorded:

- [ ] Definition of Done satisfied
- [ ] No Critical or High severity bugs open
- [ ] CI passing
- [ ] Coverage target met
- [ ] Documentation updated
- [ ] Architecture unchanged, or an ADR written for any approved change
- [ ] **Go / No-Go recorded**

This is what stops unfinished work from cascading into the next sprint.

## Definition of Done (baseline, per sprint)

- All targeted tests pass
- Coverage reaches that sprint's target
- No failing lint
- Build passes (backend + frontend)
- No known regressions
- Documentation updated

---

## CI Quality Gates

Green CI is a **merge prerequisite**, not a status indicator. CI fails automatically on:

**Backend:** test failures, coverage below target, lint failures, type-check failures (if introduced), migration conflicts.

**Frontend:** build failure, Vitest failures, ESLint failures, formatting violations (if enforced), PWA build failure.

---

## Coverage Targets

| Sprint | Minimum coverage |
|---|---|
| Sprint 1 | 50% |
| Sprint 2 | 70% |
| Sprint 3 | 80% overall, **≥90% on critical modules** |

Critical modules: sales, inventory, payments, fraud. Coverage percentage matters less than which code is covered — these four first, always.

---

## Sprint 3 — Chaos Testing Scope

Browser/tab crash mid-sale · laptop power loss · network flapping · duplicate reconnect · server restart during sync · PostgreSQL restart during sync · API timeout mid-request · partial batch acceptance.

---

## Sprint 5 — Measurable UAT Acceptance Criteria

100 consecutive successful sales · zero inventory corruption · zero duplicated sales · no unrecoverable sync queue entries · average sale completion < 3 seconds · shift close succeeds after offline operation · cash reconciliation variance = 0 during pilot.

---

## Sprint 6 — Backup & Disaster Recovery

PostgreSQL backup schedule · documented restore procedure · RTO defined · RPO defined · off-site backup storage · **restore verification** (a backup only counts once a restore from it has actually been tested).

---

## Risk Register (living document)

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Internet outage | High | High | Offline-first architecture |
| Fake MoMo/Orange Money proof | High | High | Payment confirmation before `completed` |
| Device loss | Medium | Medium | Terminal takeover audit trail |
| Power failure mid-sale | High | High | IndexedDB persistence, optimistic commit |
| Sync corruption | High | Low | Idempotency (UUID) + Sprint 3 reclaim fix |
| Database failure | Critical | Low | Sprint 6 backups + verified restore |
| Backend regression (untested code) | High | Medium | Sprints 1–2 coverage build-out |

---

## Production Readiness Checklist (final launch gate — build over remaining sprints)

- [ ] Security review completed
- [ ] Penetration test completed
- [ ] Performance benchmark completed
- [ ] Backup restore verified
- [ ] Monitoring configured
- [ ] Alerts configured
- [ ] Pilot completed
- [ ] UAT signed off
- [ ] Deployment runbook written
- [ ] Rollback procedure tested

---

## Remaining Open Item: Data Migration Scope

Sprint 0's first task. Discovery pass collects: number of branches, number of active products, number of historical customers (if any), number of suppliers, current notebook format, duplicate products, missing prices, missing units, damaged/unreadable records, historical data retention requirement. Sprint 4 is only estimated for real once this comes back.

---

## Sprint 0 Status (updated as work lands)

| Task | Status |
|---|---|
| Frontend CI | ✅ Complete — verified against real `npm ci`/test/build run, not the compilation doc's claims |
| Frontend README | ✅ Complete |
| Frontend coverage tooling | ✅ Complete — baseline 28.15%, concentrated in `src/db`/`src/sync` (highest-risk modules, by design of the failure-mode suite) |
| Branch protection documentation | ✅ Complete (`docs/BRANCH_PROTECTION.md`) |
| `.gitignore` improvements | ✅ Complete — `coverage/` was missing, now excluded |
| Lint assessment | ✅ Complete — 24 warnings, 0 errors, informational-only in CI for now |
| CI dependency caching | ✅ Complete — npm cache + Vite build cache |
| Backend CI | ⏳ Waiting on `retailguard_phase2_backend.zip` |
| Backend coverage | ⏳ Waiting on backend repo |
| `.env.example` (backend) | ⏳ Waiting on backend repo |
| Backend dev setup guide | ⏳ Waiting on backend repo |
| Data migration discovery | ⏳ Pending |
| Risk-ranked backend test plan | ⏳ Waiting on backend repo |

**Backlog item — Sprint 1.5, Lint Cleanup:** reduce the 24 existing oxlint warnings to 0, then flip frontend CI from "fail on errors only" to "fail on warnings too." Prevents the informational-only gate from becoming a permanent loophole for new debt.



1. **CI pipeline** — backend (pytest + coverage) and frontend (`npm test` + `npm run build`), quality gates above enforced from day one.
2. **Linting/formatting** — enforced in CI.
3. **Coverage reporting** — wired into CI, visible per-PR.
4. **Branch protection** — no direct pushes to main; PR + CI-pass required.
5. **Environment configuration** — `.env.example` covering all required backend/frontend env vars.
6. **Development setup guide** — target: new developer contributing in under 30 minutes.
7. **Data migration discovery pass** — findings doc, ≥2 branches.
8. **Sprint 3 reclaim spec** — timeout/reclaim logic spec written before Sprint 3 starts.
9. **Test coverage priority map** — 13 Django apps ranked by risk, money-handling and fraud-rule apps first.
10. **Production Readiness Checklist doc** — created now, checked off incrementally through Sprints 1–7.

## What happens next

Sprint 0 execution starts on go-ahead. First Sprint Gate review happens at the end of Sprint 0, before Sprint 1 is allowed to start.
