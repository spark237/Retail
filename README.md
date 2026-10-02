# RetailGuard

Offline-first POS and operations platform for multi-branch tile and building
material retailers in unreliable-network environments. Transactions, inventory,
and cash reconciliation all work fully offline; background sync handles
conflicts automatically; built-in fraud detection flags cash shortages,
inventory mismatches, and suspicious offline behavior.

## Repository layout

| Path | Contents |
| --- | --- |
| `backend/` | NestJS + Prisma API (16 modules: auth, users, tenants, branches, warehouses, products, inventory, sales, shifts, expenses, damages, sync, fraud, analytics, reports). Runs on `PORT=3100`. |
| `frontend/` | Vite + React + TypeScript POS SPA (login, POS, dashboard, inventory, transfers, damages, movements, reports). Built with `VITE_API_URL=/api/v1`. |
| `docs/architecture/` | The 13 Phase-1 design documents (system architecture, DB schema, API spec, auth, offline sync, security, fraud, UI/UX, deployment, testing, backup/DR, monitoring). Authoritative design record. |
| `archive/` | Legacy pre-git artifacts (phase zips, standards, kickoff notes) kept for reference only. |
| `docker-compose.yml` | Local Postgres 16 + Redis 7. |
| `package.json` / `tsconfig.json` | Root workspace scaffolding. |

## Local development

```bash
# 1. Infrastructure
docker compose up -d            # Postgres 16 on :5432, Redis 7 on :6379

# 2. Backend (port 3100 — the public surface is port 3000, proxied by the SPA host)
cd backend
cp .env.example .env            # local dev defaults; edit as needed
npm ci
npx prisma migrate dev          # applies migrations/ (26 tables)
npx prisma db seed              # demo tenant, 5 roles, 6 products, initial stock
npm run start:dev

# 3. Frontend
cd ../frontend
cp .env.example .env            # VITE_API_URL=/api/v1
npm ci
npm run dev
```

Seed credentials (demo only): `admin@retailguard.cm` / `admin123` and
`manager`, `supervisor`, `cashier`, `warehouse` variants of the same domain,
all with password suffix `123`.

> The deployment wiring: the built SPA is served on port 3000 by the site host;
> any `/api/*` path is proxied to the NestJS API on `localhost:3100`. The API
> must always start with `PORT=3100` (the shell may export `PORT=80`).