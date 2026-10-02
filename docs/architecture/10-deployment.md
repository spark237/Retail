# Deployment Architecture — RetailGuard

## 1. Infrastructure Overview

RetailGuard is deployed on a **single-region, multi-availability-zone** infrastructure suitable for Cameroon and similar West/Central African markets. The architecture prioritizes cost-efficiency, reliability under intermittent connectivity, and local hosting compliance.

```mermaid
graph TB
    subgraph "Internet"
        Users["POS Terminals<br/>(Electron)"]
        Admin["Admin Dashboard<br/>(Browser)"]
    end
    
    subgraph "CDN / DNS"
        CF["Cloudflare<br/>DNS + DDoS Protection"]
    end
    
    subgraph "VPS Cluster (Cameroon / West Africa)"
        subgraph "Load Balancer"
            LB["Nginx / HAProxy<br/>SSL Termination<br/>Rate Limiting"]
        end
        
        subgraph "Application Servers"
            API1["API Server 1<br/>(NestJS)"]
            API2["API Server 2<br/>(NestJS)"]
        end
        
        subgraph "Background Workers"
            SW["Sync Worker"]
            FW["Fraud Worker"]
            NW["Notification Worker"]
            BW["Backup Worker"]
        end
        
        subgraph "Data Layer"
            PG_PRI["PostgreSQL<br/>Primary"]
            PG_REP["PostgreSQL<br/>Read Replica"]
            REDIS["Redis<br/>Cache + Queue"]
            S3["MinIO / S3<br/>Object Storage"]
        end
    end
    
    subgraph "POS Terminal (Local)"
        SQLITE["SQLite<br/>(Local DB)"]
        IDB["IndexedDB<br/>(Blob Cache)"]
        SYNC["Sync Engine<br/>(Background)"]
    end
    
    Users --> CF
    Admin --> CF
    CF --> LB
    LB --> API1
    LB --> API2
    API1 --> PG_PRI
    API2 --> PG_PRI
    API2 --> PG_REP
    API1 --> REDIS
    API2 --> REDIS
    API1 --> S3
    API2 --> S3
    
    SW --> REDIS
    SW --> PG_PRI
    FW --> PG_PRI
    NW --> PG_PRI
    BW --> PG_PRI
    
    Users --> SQLITE
    SQLITE --> SYNC
    SYNC --> LB
```

### 1.1 Infrastructure Decisions for Cameroon

| Decision | Rationale |
|----------|-----------|
| **VPS over serverless (AWS Lambda)** | Serverless functions have cold starts and limited execution time (max 15 min). Sync workers and fraud scoring need long-running processes. VPS provides predictable cost and performance. |
| **West African hosting** | Cameroon's internet latency to European/American data centers is 150–400ms. Local hosting (Cameroon + nearby region) reduces this to 10–50ms. Options: Cameroon DC, Nigeria DC, or South Africa DC. |
| **Single region, multi-AZ** | Cross-region replication adds 2x cost. For a retail POS system in Cameroon, regional availability is sufficient. Multi-AZ within a region protects against datacenter failure. |
| **Bare metal or dedicated VPS** | Avoid noisy-neighbor problems from shared cloud hosting. Dedicated VPS with guaranteed CPU/RAM. |
| **MinIO over S3** | AWS S3 latency from Cameroon is high. MinIO (S3-compatible) runs on same VPS cluster. Backup sync to offsite S3 (AWS or Backblaze) for DR. |

### 1.2 Hosting Options (Ranked)

| Option | Pros | Cons | Monthly Cost (est.) |
|--------|------|------|---------------------|
| **OVHcloud South Africa** | Good Africa coverage, known provider | ~30ms additional latency to Cameroon | $150–$400/mo |
| **DigitalOcean Nigeria** | Local presence, good peering | Limited instance types | $200–$500/mo |
| **Local Cameroon DC** | Lowest latency (10–20ms), local compliance | Fewer options, potential power/reliability issues | $100–$300/mo |
| **AWS South Africa (Cape Town)** | Full service suite, reliable | Higher cost, ~40ms latency | $300–$800/mo |
| **Hybrid: Local VPS + AWS S3** | Best of both | More complex management | $150–$500/mo |

**Recommended:** Hybrid approach — primary stack on DigitalOcean or local Cameroon VPS, with backups to AWS South Africa S3 for DR.

## 2. Docker Container Architecture

### 2.1 Container Definitions

```
Container: retailguard-api
  Base: node:20-alpine
  Port: 3000 (internal)
  Replicas: 2 (minimum)
  Resources:
    CPU: 2 cores
    RAM: 4 GB
    Storage: 20 GB (logs)
  Health check: GET /health
  Dependencies: PostgreSQL, Redis

Container: retailguard-sync-worker
  Base: node:20-alpine
  Port: none (internal worker)
  Replicas: 2
  Resources:
    CPU: 1 core
    RAM: 2 GB
  Dependencies: Redis (queue), PostgreSQL

Container: retailguard-fraud-worker
  Base: node:20-alpine
  Port: none (internal worker)
  Replicas: 1 (scale with load)
  Resources:
    CPU: 2 cores
    RAM: 4 GB
  Dependencies: PostgreSQL

Container: retailguard-notification-worker
  Base: node:20-alpine
  Port: none (internal worker)
  Replicas: 1
  Resources:
    CPU: 0.5 cores
    RAM: 1 GB
  Dependencies: Redis, PostgreSQL

Container: retailguard-backup-worker
  Base: node:20-alpine
  Port: none (cron-based)
  Replicas: 1
  Resources:
    CPU: 0.5 cores
    RAM: 1 GB
  Dependencies: PostgreSQL, MinIO

Container: retailguard-redis
  Base: redis:7-alpine
  Port: 6379
  Resources:
    CPU: 2 cores
    RAM: 4 GB
  Persistence: AOF + RDB

Container: retailguard-minio
  Base: minio/minio
  Port: 9000 (API), 9001 (Console)
  Resources:
    CPU: 1 core
    RAM: 2 GB
  Storage: 100 GB (configurable)

Container: retailguard-postgres
  Base: postgres:16
  Port: 5432
  Resources:
    CPU: 4 cores
    RAM: 8 GB (primary)
    RAM: 4 GB (replica)
  Storage: 200 GB (primary), 200 GB (replica)
  Storage: 50 GB (WAL archive)
```

### 2.2 Docker Compose (Staging)

```yaml
# docker-compose.yml (development/staging)
version: '3.8'

services:
  postgres-primary:
    image: postgres:16
    environment:
      POSTGRES_DB: retailguard
      POSTGRES_USER: retailguard
      POSTGRES_PASSWORD: ${PG_PASSWORD}
    volumes:
      - pg-primary-data:/var/lib/postgresql/data
      - ./infrastructure/docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
      - ./infrastructure/docker/postgres/wal-archive:/wal-archive
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U retailguard"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G

  postgres-replica:
    image: postgres:16
    environment:
      POSTGRES_DB: retailguard
      POSTGRES_USER: retailguard
      POSTGRES_PASSWORD: ${PG_PASSWORD}
      PRIMARY_CONN: "host=postgres-primary port=5432 user=replicator password=${REPL_PASSWORD}"
    volumes:
      - pg-replica-data:/var/lib/postgresql/data
    depends_on:
      - postgres-primary
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis-data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G

  api:
    build:
      context: .
      dockerfile: ./infrastructure/docker/api/Dockerfile
    environment:
      NODE_ENV: ${NODE_ENV}
      DATABASE_URL: postgres://retailguard:${PG_PASSWORD}@postgres-primary:5432/retailguard
      DATABASE_URL_REPLICA: postgres://retailguard:${PG_PASSWORD}@postgres-replica:5432/retailguard
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      JWT_PRIVATE_KEY: ${JWT_PRIVATE_KEY}
      JWT_PUBLIC_KEY: ${JWT_PUBLIC_KEY}
    depends_on:
      - postgres-primary
      - redis
    ports:
      - "3000:3000"
    healthcheck:
      test: ["CMD", "wget", "--spider", "http://localhost:3000/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '2'
          memory: 4G

  sync-worker:
    build:
      context: .
      dockerfile: ./infrastructure/docker/worker/Dockerfile
    command: node services/sync-worker/dist/index.js
    environment:
      DATABASE_URL: postgres://retailguard:${PG_PASSWORD}@postgres-primary:5432/retailguard
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
    depends_on:
      - postgres-primary
      - redis
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '1'
          memory: 2G

  fraud-worker:
    build:
      context: .
      dockerfile: ./infrastructure/docker/worker/Dockerfile
    command: node services/fraud-worker/dist/index.js
    environment:
      DATABASE_URL: postgres://retailguard:${PG_PASSWORD}@postgres-primary:5432/retailguard
    depends_on:
      - postgres-primary
    deploy:
      replicas: 1
      resources:
        limits:
          cpus: '2'
          memory: 4G

  notification-worker:
    build:
      context: .
      dockerfile: ./infrastructure/docker/worker/Dockerfile
    command: node services/notification-worker/dist/index.js
    environment:
      DATABASE_URL: postgres://retailguard:${PG_PASSWORD}@postgres-primary:5432/retailguard
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      SMTP_HOST: ${SMTP_HOST}
      SMTP_PORT: ${SMTP_PORT}
      SMTP_USER: ${SMTP_USER}
      SMTP_PASS: ${SMTP_PASS}
      SMS_API_KEY: ${SMS_API_KEY}
    depends_on:
      - postgres-primary
      - redis
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 1G

  backup-worker:
    build:
      context: .
      dockerfile: ./infrastructure/docker/worker/Dockerfile
    command: node services/backup-worker/dist/index.js
    environment:
      DATABASE_URL: postgres://retailguard:${PG_PASSWORD}@postgres-primary:5432/retailguard
      S3_ENDPOINT: ${S3_ENDPOINT}
      S3_ACCESS_KEY: ${S3_ACCESS_KEY}
      S3_SECRET_KEY: ${S3_SECRET_KEY}
      S3_BUCKET: retailguard-backups
    depends_on:
      - postgres-primary
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 1G

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    volumes:
      - minio-data:/data
    ports:
      - "9000:9000"
      - "9001:9001"
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 2G

  nginx:
    image: nginx:alpine
    volumes:
      - ./infrastructure/docker/nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./infrastructure/docker/nginx/ssl:/etc/nginx/ssl
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - api
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M

volumes:
  pg-primary-data:
  pg-replica-data:
  redis-data:
  minio-data:
```

### 2.3 Dockerfile for API

```dockerfile
# infrastructure/docker/api/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/ ./apps/api/
COPY packages/ ./packages/
COPY tsconfig.json turbo.json ./

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile
RUN pnpm build --filter=@retailguard/api

FROM node:20-alpine AS runner

WORKDIR /app
RUN addgroup --system --gid 1001 retailguard && \
    adduser --system --uid 1001 retailguard

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages

USER retailguard
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --spider http://localhost:3000/api/v1/health || exit 1

CMD ["node", "dist/main.js"]
```

## 3. PostgreSQL Deployment

### 3.1 Primary-Replica Setup

```sql
-- On primary: create replication user
CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD '${REPL_PASSWORD}';

-- Configure primary (postgresql.conf)
wal_level = replica
max_wal_senders = 3
wal_keep_size = 1024    -- 1GB WAL retention
hot_standby = on

-- Configure replica (postgresql.conf)
primary_conninfo = 'host=postgres-primary port=5432 user=replicator password=${REPL_PASSWORD}'
hot_standby = on
```

### 3.2 Connection Pooling

```typescript
// Database connection configuration
const DB_CONFIG = {
  primary: {
    host: process.env.DATABASE_HOST,
    port: 5432,
    database: 'retailguard',
    user: 'retailguard',
    password: process.env.PG_PASSWORD,
    pool: {
      min: 5,
      max: 20,
      idleTimeoutMillis: 30000,
      acquireTimeoutMillis: 10000,
      createTimeoutMillis: 15000,
    },
  },
  replica: {
    host: process.env.DATABASE_REPLICA_HOST,
    port: 5432,
    database: 'retailguard',
    user: 'retailguard_readonly',
    password: process.env.PG_PASSWORD_REPLICA,
    pool: {
      min: 3,
      max: 10,
      idleTimeoutMillis: 30000,
    },
  },
};

// Read/write splitting
// Writes always go to primary
// Reads can go to replica (with tolerance for replication lag up to 2 seconds)
function getConnection(forWrite: boolean): DatabasePool {
  if (forWrite) return primaryPool;
  // Read from replica, fall back to primary if replica is down
  return replicaPool.isHealthy() ? replicaPool : primaryPool;
}
```

### 3.3 Connection Pool Sizing

| Component | Pool Min | Pool Max | Expected Connections |
|-----------|----------|----------|---------------------|
| API Server (x2) | 5 | 20 | 40 max (20 each) |
| Sync Worker (x2) | 3 | 10 | 20 max |
| Fraud Worker (x1) | 2 | 5 | 5 max |
| Notification Worker | 1 | 3 | 3 max |
| Backup Worker | 1 | 1 | 1 (scheduled) |
| **Total** | | | **69 max** |

PostgreSQL `max_connections` should be set to at least **100** (with headroom).

## 4. Environment Strategy

### 4.1 Environment Definitions

| Environment | Purpose | Infrastructure | Data | Access |
|-------------|---------|----------------|------|--------|
| **Development** | Local development | Docker Compose on dev machine | Anonymized seed data | Developers |
| **Staging** | Integration testing, QA | Single VPS (same spec as prod but smaller) | Synthetic data + anonymized prod copy | Dev team, testers |
| **Production** | Live customer use | Multi-VPS cluster (see above) | Real customer data | Operations team |

### 4.2 Environment Configuration

```typescript
// config/database.config.ts
const environmentConfigs = {
  development: {
    databaseUrl: 'postgres://retailguard:retailguard@localhost:5432/retailguard_dev',
    redisUrl: 'redis://localhost:6379',
    s3Endpoint: 'http://localhost:9000',
    logLevel: 'debug',
    syncInterval: 5000,       // Fast sync for testing
    fraudCheckInterval: 10000,
  },
  staging: {
    databaseUrl: process.env.DATABASE_URL,        // From env
    redisUrl: process.env.REDIS_URL,              // From env
    s3Endpoint: process.env.S3_ENDPOINT,          // From env
    logLevel: 'debug',
    syncInterval: 15000,      // 15 seconds
    fraudCheckInterval: 30000,
  },
  production: {
    databaseUrl: process.env.DATABASE_URL,
    databaseUrlReplica: process.env.DATABASE_URL_REPLICA,
    redisUrl: process.env.REDIS_URL,
    s3Endpoint: process.env.S3_ENDPOINT,
    logLevel: 'info',          // Less verbose in production
    syncInterval: 30000,       // 30 seconds (matches sync spec)
    fraudCheckInterval: 60000, // 1 minute
    rateLimiting: {
      enabled: true,
      endpoints: {
        login: { ttl: 60000, limit: 5 },
        sales: { ttl: 60000, limit: 60 },
        sync: { ttl: 60000, limit: 30 },
      },
    },
    backup: {
      enabled: true,
      schedule: '0 2 * * *',   // Daily at 2 AM
      retention: 30,            // 30 days
    },
  },
};
```

### 4.3 CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: retailguard_test
          POSTGRES_USER: retailguard
          POSTGRES_PASSWORD: testpassword
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm test -- --coverage
      - run: pnpm build

# .github/workflows/cd-staging.yml
name: Deploy to Staging
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          docker build -t retailguard-api:staging -f infrastructure/docker/api/Dockerfile .
          docker push $REGISTRY/retailguard-api:staging
      - run: |
          ssh staging-server 'cd /opt/retailguard && docker-compose pull && docker-compose up -d'

# .github/workflows/cd-production.yml
name: Deploy to Production
on:
  release:
    types: [published]
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - run: |
          docker build -t retailguard-api:${{ github.ref_name }} ...
          docker push $REGISTRY/retailguard-api:${{ github.ref_name }}
      - run: |
          # Blue-green deployment
          ssh prod-server 'cd /opt/retailguard && \
            docker-compose pull && \
            docker-compose up -d --scale api=3 --no-deps api && \
            sleep 30 && \
            docker-compose up -d --scale api=2 --no-deps api'
```

## 5. Network Architecture

### 5.1 Port Map

| Port | Service | Protocol | Access | Notes |
|------|---------|----------|--------|-------|
| 22 | SSH | TCP | Admin VPN only | Key-based auth, no passwords |
| 80 | HTTP → HTTPS redirect | TCP | Public | Nginx redirects to 443 |
| 443 | HTTPS (API) | TCP | Public | TLS 1.3, API endpoints |
| 5432 | PostgreSQL | TCP | Private subnet only | Not exposed publicly |
| 6379 | Redis | TCP | Private subnet only | Password-protected |
| 9000 | MinIO S3 API | TCP | Private + VPN | Object storage |
| 9001 | MinIO Console | TCP | Admin VPN only | Management UI |
| 9090 | Prometheus metrics | TCP | Monitoring server | Scraped by Prometheus |
| 3000 | API (internal) | TCP | Nginx/Docker network | Named port, not exposed |

### 5.2 Firewall Rules

```bash
# UFW configuration (production server)
ufw default deny incoming
ufw default allow outgoing

# SSH from VPN only
ufw allow from 10.0.0.0/8 to any port 22

# HTTP/HTTPS from anywhere
ufw allow 80/tcp
ufw allow 443/tcp

# Monitoring
ufw allow from <monitoring-server-ip> to any port 9090

# Internal services (Docker bridge network)
# These are allowed by default on the docker bridge
```

### 5.3 VPN for Branch-to-HQ Connections

For branches that need direct server access (e.g., for local management or high-volume data transfer):

```yaml
# WireGuard configuration
# Server (HQ) side:
[Interface]
Address = 10.0.1.1/24
ListenPort = 51820
PrivateKey = <server-private-key>

[Peer]
# Branch 1 - Douala Main
PublicKey = <branch1-public-key>
AllowedIPs = 10.0.1.2/32

[Peer]
# Branch 2 - Yaoundé
PublicKey = <branch2-public-key>
AllowedIPs = 10.0.1.3/32
```

**Why WireGuard over OpenVPN:**
- Lower latency (crucial for sync operations)
- Simpler configuration
- Better performance on unreliable networks
- Built into Linux kernel since 5.6

**When VPN is needed:**
- Branch has a static IP and needs dedicated access
- Branch handles high-volume transfers (warehouse sync)
- Security compliance requires encrypted tunnel (though HTTPS already provides this)

**When VPN is NOT needed:**
- Typical POS terminals → HTTPS is sufficient
- Admin dashboard → HTTPS + JWT is sufficient
- Mobile app → HTTPS is sufficient

### 5.4 Nginx Configuration

```nginx
# infrastructure/docker/nginx/nginx.conf
upstream api_servers {
    least_conn;                              # Distribute to least busy server
    server api:3000 max_fails=3 fail_timeout=30s;
    server api:3000 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;
    server_name api.retailguard.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.retailguard.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.3;
    ssl_ciphers TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Referrer-Policy strict-origin-when-cross-origin;

    # Rate limiting zones
    limit_req_zone $binary_remote_addr zone=api:10m rate=100r/s;
    limit_req_zone $binary_remote_addr zone=sync:10m rate=30r/s;
    limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;

    location /api/v1/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://api_servers;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Increase timeout for sync operations
        proxy_read_timeout 120s;
        proxy_send_timeout 60s;
        
        # Max body size for sync batches
        client_max_body_size 10M;
    }

    location /api/v1/sync/ {
        limit_req zone=sync burst=10 nodelay;
        proxy_pass http://api_servers;
        proxy_read_timeout 300s;  # 5 min for large sync batches
        client_max_body_size 50M;  # Larger body for sync batches
    }

    location /api/v1/auth/ {
        limit_req zone=auth burst=3 nodelay;
        proxy_pass http://api_servers;
    }

    location /health {
        access_log off;
        return 200 "OK";
    }

    # Deny access to internal paths
    location ~ /\.(git|env|ssh) {
        deny all;
    }
}
```

## 6. Offline-First Deployment Considerations

### 6.1 POS Terminal Deployment

**Electron app distribution:**
1. Build with `electron-builder` → produces Windows installer (`.exe`)
2. Host installer on S3/CDN (signed for Windows SmartScreen)
3. Auto-update via `electron-updater` (checks for updates on sync, downloads in background)

**Initial data seed:**
```bash
# On first install, the POS app:
# 1. Loads the app shell from the bundled resources
# 2. Connects to API for initial data download (if online)
# 3. If offline, shows "Connect to internet for first-time setup"
# 4. Downloads product catalog, prices, users, permissions, fraud rules

# Initial seed can also be deployed via USB:
# Copy pre-seeded SQLite database to:
# Windows: %APPDATA%/RetailGuard/data/retailguard.db
```

**Update strategy:**
```typescript
// Auto-update configuration (electron-builder.yml)
publish:
  provider: s3
  bucket: retailguard-updates
  region: eu-west-1  # Or S3-compatible storage
  path: /pos/${os}/

// Update lifecycle:
// 1. App checks for update on sync (every 30 min if online)
// 2. Download starts in background (no user disruption)
// 3. On next app restart, update is installed
// 4. Rollback supported: previous version binaries kept for 7 days
```

### 6.2 SQLite on POS Terminals

```sql
-- SQLite file location:
-- Windows: %APPDATA%/RetailGuard/data/retailguard.db
-- macOS: ~/Library/Application Support/RetailGuard/data/retailguard.db
-- Linux: ~/.config/RetailGuard/data/retailguard.db

-- WAL mode for crash resilience
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- Auto-vacuum (check threshold)
PRAGMA auto_vacuum = INCREMENTAL;
-- Run incremental vacuum when free pages > 25%
-- Scheduled: every 7 days during idle time

-- Database size management:
-- Expected size: 50-200 MB for a typical branch
-- With images (cached): up to 500 MB
-- Pruning: remove sales older than 90 days, product images older than 30 days
```

## 7. Backup Infrastructure

See `12-backup-dr.md` for full backup and disaster recovery plan. This section covers the deployment aspects.

### 7.1 Automated Backup Flow

```mermaid
graph TD
    A[Backup Worker starts] --> B{Schedule trigger?}
    B -->|2 AM daily| C[WAL Archive to MinIO]
    B -->|Hourly| D[Snapshot sync cursors]
    B -->|Weekly| E[Full DB dump]
    
    C --> F[Compress WAL segment]
    F --> G[Upload to MinIO]
    G --> H[Retention check]
    H --> I[Delete old backups > 30 days]
    
    D --> J[Store in sync_cursors table]
    
    E --> K[pg_dump with compression]
    K --> L[Upload to MinIO]
    L --> M[Also copy to offsite S3]
```

### 7.2 Backup Retention Policy

| Backup Type | Frequency | Retention | Storage |
|-------------|-----------|-----------|---------|
| WAL archive | Continuous | 7 days | MinIO (local) |
| Hourly cursor snapshots | Every hour | 48 hours | MinIO |
| Daily full backup | Daily | 30 days | MinIO + Offsite S3 |
| Weekly full backup | Weekly | 12 weeks | MinIO + Offsite S3 |
| Monthly archive | Monthly | 12 months | Offsite S3 only |

## 8. Scaling Strategy

### 8.1 Initial Scale (Target: 10–50 branches)

| Component | Initial Scale | Peak Scale |
|-----------|--------------|------------|
| API Servers | 2 | 4 |
| Sync Workers | 2 | 4 |
| Fraud Worker | 1 | 2 |
| PostgreSQL | 1 primary + 1 replica | 1 primary + 2 replicas |
| Redis | 1 instance | 1 instance (cluster mode optional) |
| MinIO | 1 instance | 2 instances (with replication) |

### 8.2 Future Scaling (50+ branches)

1. **Horizontal API scaling:** Add more API server containers behind load balancer
2. **Read replicas:** Add PostgreSQL read replicas for analytics queries
3. **Redis cluster:** Enable Redis cluster mode for caching sync cursors and session data
4. **MinIO distributed mode:** Deploy MinIO in distributed mode for object storage HA
5. **Separate analytics DB:** Move long-running analytics queries to a separate reporting database
6. **CDN for static assets:** Use Cloudflare or similar CDN for admin dashboard assets and product images

### 8.3 Cost Breakdown (Monthly, 10-branch deployment)

| Component | Specification | Monthly Cost (USD) |
|-----------|--------------|-------------------|
| VPS (application) | 2 x 4GB RAM, 2 CPU | $60–$100 |
| VPS (database) | 1 x 8GB RAM, 4 CPU | $80–$120 |
| VPS (replica) | 1 x 4GB RAM, 2 CPU | $40–$60 |
| Storage (block) | 200GB + 200GB replication | $20–$40 |
| Object storage (MinIO) | 100GB | $10–$20 |
| Offsite backup (S3) | 50GB | $5–$10 |
| SMS (notifications) | 1000 SMS/month | $10–$20 |
| Email (SendGrid/Mailgun) | 5000 emails/month | $15–$30 |
| CDN (Cloudflare) | Free tier | $0 |
| Monitoring (Grafana Cloud) | Free tier | $0 |
| **Total** | | **$240–$400** |

## 9. Limitations

1. **Single-region deployment** — No cross-region failover. A regional outage takes the system offline for all branches. Acceptable for Cameroon retail given cost constraints.
2. **No Kubernetes in initial release** — Docker Compose is simpler for a 10–50 branch deployment. Kubernetes adds operational complexity that isn't justified at this scale. Migration path to K8s exists when needed.
3. **Manual scaling** — No auto-scaling. Resource adjustments require config changes and redeployment. Auto-scaling can be added when traffic patterns justify it.
4. **POS terminal updates require user restart** — Electron auto-update downloads in background but requires app restart to apply. Critical updates can force a restart with 5-minute warning.
5. **Database writes go through primary** — Read/write splitting handles reads but all writes route to the primary. Under very high write load, the primary may become a bottleneck. Mitigation: connection pooling and query optimization.
