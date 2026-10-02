# RetailGuard — Engineering Standards

This is the coding contract for the project. It reduces ambiguity as the
codebase grows and as more people touch it.

**Status note:** Frontend rules below are confirmed against the actual
`retailguard-pwa` codebase (verified during Sprint 0 — real `npm ci`/test/build
runs, not assumption). Backend rules were originally written as a target
before the backend repo existed; Sprint 0 has since verified the codebase
directly (real `migrate`/`check`/`pytest`/`ruff` runs against live Postgres +
Redis, clean-room tested in a fresh venv) and found genuine bugs, not just
style gaps — see "Backend verification findings" below. "Verified" below
means specific, named checks were actually run — not a general assurance
that the whole backend is correct.

| Area | Status |
|---|---|
| Frontend standards | ✅ Verified |
| Backend architecture (migrations, boot, DB constraints) | ✅ Partially verified — migration integrity, dependency versions, system checks, and the partial-index constraint are confirmed live; service-class/thin-view conventions not yet checked file-by-file |
| Backend service separation ("logic in services, not views") | ⏳ Continue verification during Sprint 1 — not checked yet |
| Security assumptions (auth, permissions, terminal takeover) | ⏳ Continue verification — one real bug found and fixed (terminal takeover `NameError`), but this was a lint-driven find, not a systematic security review |
| Audit implementation | ⚠️ Session linkage incomplete — `AuditLog.session` never populated, tracked as Sprint 1 High Priority (see Phase 4 Baseline Plan backlog) |

## Backend verification findings (Sprint 0)

Real issues found by running the code, not reading about it:

- `requirements/base.txt` pinned `Django==4.2.13`, but the code used
  `CheckConstraint(condition=...)`, which requires Django 5.1+ and is
  mandatory from 6.0 on. App didn't boot. Fixed: `Django==6.0.7` +
  `django-filter==25.2` (23.5 breaks under 6.0).
- Only 1 of 14 apps (`shifts`) had any migrations, and it referenced
  dependencies (`branches`, `users`) that didn't exist.
- `branches` and `users` have a genuine circular model dependency
  (`Branch.manager`/`deleted_by` → `users`, `User.business` → `branches`).
  Fixed via the standard Django split: `branches/0001_initial` creates
  tables without the user-referencing fields, `branches/0002` adds them
  back once `users` exists.
- Restored the critical partial-unique-index migration (one active POS
  terminal per branch) as raw SQL, verified live in Postgres via `\d shifts`.
- No pytest config existed despite `pytest-django`/`pytest-cov` being
  installed. Now wired up (`pytest.ini`, `.coveragerc`), migrations left ON
  in test runs deliberately, given the migration bugs above.
- No lint/formatting tooling existed at all. Added `ruff`. Initial run: 230
  findings; 116 auto-fixed safely (import sorting, unused imports); 10 more
  fixed by hand after checking each wasn't masking a missing feature (one,
  `apps/authentication/views.py`, was a genuine `NameError`-in-waiting —
  `request` referenced but not in scope — fixed to `self.request`, which
  DRF guarantees is set on `APIView` instances after dispatch).
- `DJ001` (49, nullable string fields) and `B904` (43, raise-without-from)
  remain as informational-only in CI — real findings, not blocking, same
  treatment as the frontend's pre-existing warnings.
- `AuditLog.session` (FK field) is never populated by `AuditService.log()`
  — every audit log currently has `session=NULL`. Found, not fixed (needs
  real design for extracting session from the auth token, not a patch).
- No `.gitignore` existed in the backend repo at all (`__pycache__` was
  committed into the zip). Added.

---

## Backend (target — pending verification against actual code)

- Business logic belongs in service classes, not views.
- Views stay thin — request/response handling and validation dispatch only.
- No direct inventory mutation outside the movement ledger (`inventory_movements`
  is the only path to changing `inventory_stock`; matches the DB-level
  design rationale in the schema doc).
- Every monetary operation is atomic (matches the sale-commit transaction
  spec in the schema doc — all-or-nothing, not best-effort).
- Every model change requires tests.

## Frontend (confirmed against actual code)

- IndexedDB is the source of truth for business data.
- TanStack Query (React Query) never stores business state — server cache only.
- Components stay presentational where possible; business logic in
  stores/services.
- All offline writes receive a `crypto.randomUUID()` before being queued —
  this is what makes retry after network failure idempotent.

## Git

- Conventional commit messages.
- Feature branches only — no direct commits to `main`.
- No force-push to protected branches.
- Squash merge policy.

## Testing

- New features require tests.
- Bug fixes require a regression test that reproduces the issue *before* the
  fix lands — the cart-persistence `DataCloneError` found during Phase 3
  failure-mode testing is the model case for this.
- Critical modules maintain ≥90% coverage (sales, inventory, payments, fraud
  — same four called out in the Phase 4 Baseline Plan's coverage targets).

---

## Backend testing priority (business-risk order)

Effort/coverage priority once backend tests start:

1. sales
2. inventory
3. fraud
4. payments
5. shifts
6. authentication
7. transfers
8. reconciliation
9. expenses
10. audit
11. analytics
12. products
13. users

**Distinction that matters in practice:** this is priority for *coverage
effort*, not build order. Minimal authentication and user-factory test
scaffolding will exist before sales/inventory/fraud tests can run at all,
since those need an authenticated request context — that's infrastructure,
not a ranking override. Also worth checking once the real code is visible:
`products` sits low on business-risk priority here, but sales/inventory
tests will need product fixtures regardless, so some product-model test
coverage (especially the `min_selling_price` and `sqm_consistency`
constraints) may land earlier than #12 as a side effect of building those
fixtures — not a contradiction, just how dependencies fall.

This list also assumes Django app names roughly match these domain names.
To be confirmed once the actual app folder structure is visible.
