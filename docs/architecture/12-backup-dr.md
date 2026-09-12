# Backup & Disaster Recovery — RetailGuard

## 1. Design Principles

1. **Defense in depth** — Multiple backup layers (WAL archiving, full dumps, offsite copies) ensure no single failure causes permanent data loss.
2. **Offline data is critical** — POS terminal SQLite databases may contain the only copy of transactions for hours or days. Local backups are as important as server backups.
3. **Cameroon-specific constraints** — Power outages, unreliable internet, and limited local infrastructure are assumed. Backup processes must tolerate extended network interruptions and resume automatically.
4. **RTO < 4 hours, RPO < 15 minutes** — These targets drive all backup and recovery decisions.
5. **Encryption at rest and in transit** — All backup data is encrypted. Customer financial data and transaction records must be protected even in backup storage.

## 2. PostgreSQL Backup Strategy

### 2.1 WAL-Based Continuous Archiving (Recommended)

PostgreSQL runs in `archive_mode` with continuous WAL (Write-Ahead Log) archiving to MinIO (S3-compatible storage). This enables point-in-time recovery (PITR) to any second.

```sql
-- postgresql.conf (primary)
wal_level = replica
archive_mode = on
archive_command = 'pgbackrest --stanza=retailguard archive-push %p'
archive_timeout = 60          -- Force WAL switch every 60 seconds during idle
max_wal_senders = 5
wal_keep_size = 2048          -- 2GB local WAL retention for safety
```

```yaml
# pgbackrest.conf
[retailguard]
pg1-path=/var/lib/postgresql/data
pg1-port=5432

[global]
repo1-type=s3
repo1-s3-bucket=retailguard-backups
repo1-s3-region=auto
repo1-s3-endpoint=http://minio:9000
repo1-s3-key=<access-key>
repo1-s3-key-secret=<secret-key>
repo1-s3-uri-style=path
repo1-retention-full=30
repo1-retention-diff=14
repo1-cipher-type=aes-256-cbc
repo1-cipher-pass=<backup-encryption-passphrase>

# Offsite replication (AWS S3 South Africa)
repo2-type=s3
repo2-s3-bucket=retailguard-backups-offsite
repo2-s3-region=af-south-1
repo2-s3-endpoint=s3.af-south-1.amazonaws.com
repo2-s3-key=<aws-access-key>
repo2-s3-key-secret=<aws-secret-key>
repo2-retention-full=12
repo2-cipher-type=aes-256-cbc
repo2-cipher-pass=<backup-encryption-passphrase>

[global:archive-push]
compress-level=6
```

**Why pgBackRest over pg_dump:**
- Point-in-time recovery to any second (not just at dump time)
- Incremental and differential backups (faster, smaller)
- Parallel backup and restore (faster for large databases)
- Built-in S3 support, encryption, and retention management
- Automatic WAL archive management (purging old WAL segments)

### 2.2 Backup Schedule

| Backup Type | Frequency | Tool | Retention | Storage |
|-------------|-----------|------|-----------|---------|
| **WAL archive** | Continuous (every 60s max) | pgBackRest archive-push | 7 days on MinIO | MinIO (local) |
| **Full backup** | Daily at 02:00 AM | pgBackRest --type=full | 30 days on MinIO, 12 months offsite | MinIO + AWS S3 |
| **Differential backup** | Every 4 hours | pgBackRest --type=diff | 14 days | MinIO |
| **Incremental backup** | Every 1 hour | pgBackRest --type=incr | 7 days | MinIO |
| **Logical dump** | Weekly (Sunday 03:00 AM) | pg_dump with custom format | 12 weeks | MinIO + AWS S3 |

```bash
# crontab on backup-worker container
# Full backup daily at 2 AM
0 2 * * * pgbackrest --stanza=retailguard --type=full backup

# Differential every 4 hours
0 */4 * * * pgbackrest --stanza=retailguard --type=diff backup

# Incremental every hour
0 * * * * pgbackrest --stanza=retailguard --type=incr backup

# Logical dump weekly (for schema-level restore)
0 3 * * 0 pg_dump --format=custom --compress=9 --file=/tmp/retailguard-weekly.dump \
    --dbname=postgres://retailguard@localhost:5432/retailguard
    && gpg --encrypt --recipient backup-key /tmp/retailguard-weekly.dump \
    && aws s3 cp /tmp/retailguard-weekly.dump.gpg s3://retailguard-backups-offsite/logical/
```

### 2.3 Backup Verification

Backups are worthless if they cannot be restored. Automated verification runs weekly:

```bash
# Weekly restore test (Saturday 4 AM, on staging server)
0 4 * * 6 pgbackrest --stanza=retailguard --db-path=/tmp/pg-restore-test \
    --type=time --target="2026-07-18 12:00:00+01" restore \
    && pg_isready -d /tmp/pg-restore-test \
    && echo "RESTORE TEST PASSED" >> /var/log/backup-verify.log \
    && rm -rf /tmp/pg-restore-test \
    || echo "RESTORE TEST FAILED" >> /var/log/backup-verify.log
```

### 2.4 Backup Worker Implementation

```typescript
// services/backup-worker/src/backup.service.ts
import { Cron, CronExpression } from '@nestjs/schedule';
import { Injectable, Logger } from '@nestjs/common';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async performFullBackup(): Promise<void> {
    this.logger.log('Starting daily full backup...');
    const startTime = Date.now();

    try {
      execSync(
        'pgbackrest --stanza=retailguard --type=full --no-compress-network backup',
        { timeout: 3600000, stdio: 'pipe' } // 1 hour timeout
      );

      const duration = Date.now() - startTime;
      this.logger.log(`Full backup completed in ${duration}ms`);

      // Log to monitoring
      await this.recordBackupMetric('full', 'success', duration);
    } catch (error) {
      this.logger.error('Full backup failed:', error);

      // Trigger alert
      await this.alertService.sendAlert({
        severity: 'critical',
        title: 'Database backup failed',
        description: `Daily full backup failed: ${error.message}`,
        component: 'backup-worker',
      });

      await this.recordBackupMetric('full', 'failed', Date.now() - startTime);
    }
  }

  @Cron(CronExpression.EVERY_4_HOURS)
  async performDifferentialBackup(): Promise<void> {
    // Similar to full backup but with --type=diff
  }

  @Cron(CronExpression.EVERY_HOUR)
  async performIncrementalBackup(): Promise<void> {
    // Similar to full backup but with --type=incr
    // Skip if last full/diff was less than 1 hour ago
  }

  @Cron('0 4 * * 6') // Saturday 4 AM
  async verifyRestore(): Promise<void> {
    this.logger.log('Starting restore verification...');

    const restorePath = '/tmp/pg-restore-verify';

    try {
      // Clean up any previous test
      if (fs.existsSync(restorePath)) {
        fs.rmSync(restorePath, { recursive: true, force: true });
      }

      // Restore to a point in time (24 hours ago)
      const targetTime = new Date(Date.now() - 86400000).toISOString();
      execSync(
        `pgbackrest --stanza=retailguard --db-path=${restorePath} ` +
        `--type=time --target="${targetTime}" restore`,
        { timeout: 3600000, stdio: 'pipe' }
      );

      // Verify database is valid
      execSync(`pg_isready -d ${restorePath}`, { timeout: 30000 });

      // Clean up
      fs.rmSync(restorePath, { recursive: true, force: true });

      this.logger.log('Restore verification PASSED');
    } catch (error) {
      this.logger.error('Restore verification FAILED:', error);
      await this.alertService.sendAlert({
        severity: 'critical',
        title: 'Backup restore verification failed',
        description: `Restore from latest backup failed: ${error.message}`,
        component: 'backup-worker',
      });
    }
  }

  private async recordBackupMetric(
    type: string,
    status: 'success' | 'failed',
    durationMs: number
  ): Promise<void> {
    // Push metric to Prometheus pushgateway or logging system
    this.logger.log(`Backup metric: type=${type}, status=${status}, duration=${durationMs}ms`);
  }
}
```

## 3. Offline POS Terminal Backup Strategy

### 3.1 SQLite Database Backup

POS terminal SQLite databases are backed up locally and, when online, to the cloud.

```typescript
// apps/pos/src/main/database-backup.ts
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export class DatabaseBackupManager {
  private readonly dbPath: string;
  private readonly backupDir: string;
  private readonly encryptionKey: Buffer;

  constructor() {
    this.dbPath = path.join(app.getPath('userData'), 'data', 'retailguard.db');
    this.backupDir = path.join(app.getPath('userData'), 'backups');
    this.encryptionKey = this.deriveBackupKey();

    // Ensure backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Create a local backup of the SQLite database.
   * Called on:
   *   - Every shift close
   *   - Every 50 transactions
   *   - Every 2 hours (idle timer)
   *   - Before app update
   */
  async createLocalBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `retailguard-backup-${timestamp}.enc`;
    const backupPath = path.join(this.backupDir, backupFileName);

    // Use sql.js to create a consistent snapshot
    // (This avoids corruption from concurrent writes during copy)
    const snapshot = await this.createDatabaseSnapshot();

    // Encrypt the backup
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(snapshot, 'utf8'),
      cipher.final(),
    ]);

    // Write: IV + Auth Tag + Encrypted Data
    const authTag = cipher.getAuthTag();
    const backupBuffer = Buffer.concat([iv, authTag, encrypted]);

    fs.writeFileSync(backupPath, backupBuffer);

    // Prune old backups (keep last 10)
    this.pruneOldBackups(10);

    return backupPath;
  }

  /**
   * Restore from the most recent local backup.
   */
  async restoreFromLocalBackup(): Promise<void> {
    const backups = this.listBackups();

    if (backups.length === 0) {
      throw new Error('No local backups available for restore');
    }

    const latestBackup = backups[0]; // Most recent first

    try {
      const encrypted = fs.readFileSync(path.join(this.backupDir, latestBackup));

      // Parse: IV (12) + Auth Tag (16) + Encrypted Data (rest)
      const iv = encrypted.subarray(0, 12);
      const authTag = encrypted.subarray(12, 28);
      const encryptedData = encrypted.subarray(28);

      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      decipher.setAuthTag(authTag);

      const decrypted = decipher.update(encryptedData) + decipher.final('utf8');

      // Write decrypted data to database path
      fs.writeFileSync(this.dbPath, decrypted);

      this.logger.info('Database restored from local backup', {
        backupFile: latestBackup,
      });
    } catch (error) {
      throw new Error(`Failed to restore from backup ${latestBackup}: ${error.message}`);
    }
  }

  /**
   * Upload backup to cloud when online.
   */
  async uploadToCloud(backupPath: string): Promise<void> {
    if (!navigator.onLine) return;

    try {
      const backupData = fs.readFileSync(backupPath);
      const formData = new FormData();
      formData.append('backup', new Blob([backupData]), path.basename(backupPath));
      formData.append('device_id', this.deviceId);
      formData.append('tenant_id', this.tenantId);
      formData.append('branch_id', this.branchId);

      await fetch(`${API_BASE_URL}/backups/pos-database`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.authToken}`,
        },
        body: formData,
      });
    } catch (error) {
      // Non-fatal: queue for retry
      this.logger.warn('Failed to upload backup to cloud', { error: error.message });
    }
  }

  private listBackups(): string[] {
    return fs.readdirSync(this.backupDir)
      .filter(f => f.startsWith('retailguard-backup-') && f.endsWith('.enc'))
      .sort()
      .reverse();
  }

  private pruneOldBackups(maxBackups: number): void {
    const backups = this.listBackups();
    if (backups.length > maxBackups) {
      for (const oldBackup of backups.slice(maxBackups)) {
        fs.unlinkSync(path.join(this.backupDir, oldBackup));
      }
    }
  }

  private deriveBackupKey(): Buffer {
    // Key derived from device-specific secret (stored in OS keychain)
    // Combined with app-specific salt
    const deviceSecret = keychain.getPassword('retailguard-backup-key');
    const salt = 'retailguard-sqlite-backup-salt-v1';
    return crypto.pbkdf2Sync(deviceSecret, salt, 600000, 32, 'sha512');
  }

  private async createDatabaseSnapshot(): Promise<string> {
    // Use sql.js to export the database to a SQL dump
    const db = await this.getDatabase();
    return db.export(); // Returns Uint8Array of the full database
  }
}
```

### 3.2 Backup Triggers

| Trigger | Action | Priority |
|---------|--------|----------|
| Shift close | Create local backup + upload to cloud | High |
| Every 50 transactions | Create local backup (prune old) | Medium |
| Every 2 hours (idle) | Create local backup | Low |
| Before app update | Create local backup + force cloud upload | Critical |
| App crash detected on startup | Prompt user to restore from backup | Critical |
| Manual (user-initiated) | Create backup on demand | User choice |

### 3.3 Recovering a Crashed POS Terminal

```typescript
// apps/pos/src/main/crash-recovery.ts
export class CrashRecoveryService {
  async recoverTerminal(): Promise<RecoveryResult> {
    const logger = new Logger('CrashRecovery');

    logger.info('Starting POS terminal recovery...');

    // Step 1: Check database integrity
    const dbIntegrity = await this.checkDatabaseIntegrity();
    logger.info(`Database integrity: ${dbIntegrity.status}`);

    if (dbIntegrity.status === 'ok') {
      // Database is healthy, run post-crash cleanup
      await this.runPostCrashCleanup();
      return { success: true, method: 'integrity_check_passed', recovered: false };
    }

    // Step 2: Try WAL replay
    if (dbIntegrity.status === 'wal_recovery_needed') {
      logger.info('Attempting WAL replay...');
      const walRecovered = await this.replayWAL();
      if (walRecovered) {
        const recheck = await this.checkDatabaseIntegrity();
        if (recheck.status === 'ok') {
          await this.runPostCrashCleanup();
          return { success: true, method: 'wal_replay', recovered: true };
        }
      }
    }

    // Step 3: Restore from local backup
    logger.info('Attempting restore from local backup...');
    try {
      const backupManager = new DatabaseBackupManager();
      await backupManager.restoreFromLocalBackup();
      logger.info('Database restored from local backup');

      // Replay any operation logs that were committed after the backup
      const replayedOps = await this.replayOperationLog();
      return {
        success: true,
        method: 'local_backup_restore',
        recovered: true,
        replayedOperations: replayedOps,
        dataLoss: this.estimateDataLoss(replayedOps),
      };
    } catch (error) {
      logger.error('Local backup restore failed', error);
    }

    // Step 4: Full cloud restore (last resort)
    logger.info('Attempting full cloud restore...');
    const cloudRestore = await this.restoreFromCloud();
    if (cloudRestore.success) {
      return {
        success: true,
        method: 'cloud_restore',
        recovered: true,
        dataLoss: cloudRestore.dataLoss,
      };
    }

    // Step 5: Manual intervention required
    return {
      success: false,
      method: 'manual_intervention_required',
      recovered: false,
      error: 'All automatic recovery methods failed',
    };
  }

  private async checkDatabaseIntegrity(): Promise<{ status: string; details?: string }> {
    try {
      const result = await localDb.get('PRAGMA integrity_check');
      if (result['integrity_check'] === 'ok') {
        return { status: 'ok' };
      }
      return { status: 'corrupt', details: result['integrity_check'] };
    } catch (error) {
      return { status: 'wal_recovery_needed', details: error.message };
    }
  }

  private async replayWAL(): Promise<boolean> {
    try {
      // WAL replay is automatic when opening with journal_mode=WAL
      // Force a checkpoint to verify
      await localDb.run('PRAGMA wal_checkpoint(TRUNCATE)');
      return true;
    } catch {
      return false;
    }
  }

  private async replayOperationLog(): Promise<number> {
    // Find operations that started but weren't completed
    const incompleteOps = await localDb.all(
      `SELECT * FROM operation_log WHERE status IN ('started', 'failed')
       ORDER BY created_at ASC`
    );

    let replayed = 0;
    for (const op of incompleteOps) {
      try {
        // Replay only completed operations from backup's perspective
        await this.replaySingleOperation(op);
        replayed++;
      } catch {
        // Skip operations that can't be replayed
        logger.warn(`Could not replay operation ${op.id}: ${op.operation_name}`);
      }
    }

    return replayed;
  }

  private async restoreFromCloud(): Promise<{ success: boolean; dataLoss?: { records: number; since: string } }> {
    // Download the last known good backup from the server
    // This is a full database replacement, so all local-only data since last sync is lost
    try {
      const response = await api.get(`/backups/pos-database/latest`, {
        params: { device_id: this.deviceId, branch_id: this.branchId },
      });

      // Download and restore
      const backupData = await response.data;
      await fs.promises.writeFile(this.dbPath, backupData);

      // Estimate data loss
      const latestSync = await localDb.get(
        'SELECT MAX(created_at) as last_sync FROM sync_logs WHERE status = ?',
        ['completed']
      );

      return {
        success: true,
        dataLoss: {
          records: 0, // Would need to compare counts
          since: latestSync?.last_sync || 'unknown',
        },
      };
    } catch {
      return { success: false };
    }
  }

  private async runPostCrashCleanup(): Promise<void> {
    // 1. Clean up stale sync locks
    await localDb.run(
      "UPDATE sync_queue SET status = 'pending' WHERE status = 'syncing' AND updated_at < datetime('now', '-1 hour')"
    );

    // 2. Mark any incomplete operations as failed
    await localDb.run(
      `UPDATE operation_log SET status = 'failed', error_message = 'Crash recovery cleanup',
       completed_at = datetime('now')
       WHERE status = 'started'`
    );

    // 3. Vacuum if needed
    await localDb.run('PRAGMA incremental_vacuum(10)');
  }
}
```

### 3.4 Force Re-sync from Server

When a POS terminal's data is irretrievably corrupt or the operator wants a clean slate:

```typescript
// apps/pos/src/main/force-resync.ts
export class ForceResyncService {
  /**
   * Clear all local data and force a full re-sync from the server.
   * This is a destructive operation — ALL local data is replaced.
   * 
   * Use cases:
   *   - Database corruption that cannot be recovered
   *   - Terminal replacement (old terminal decommissioned)
   *   - User requests "start fresh"
   *   - After resolving persistent sync conflicts
   */
  async forceFullResync(reason: string, userId: string): Promise<void> {
    const logger = new Logger('ForceResync');

    // Step 1: Warn user
    // (This is triggered from the UI with confirmation dialogs)

    // Step 2: Take one final backup (just in case)
    const backupManager = new DatabaseBackupManager();
    const lastBackup = await backupManager.createLocalBackup();
    await backupManager.uploadToCloud(lastBackup);

    // Step 3: Clear local data
    await this.clearLocalData();

    // Step 4: Download fresh data from server
    await this.downloadFullData();

    // Step 5: Remove backup if successful (opt-in)
    logger.info(`Force re-sync completed. Reason: ${reason}, User: ${userId}`);
  }

  private async clearLocalData(): Promise<void> {
    const tables = [
      'sales', 'sale_items', 'payments', 'shifts', 'expenses',
      'inventory_movements', 'products', 'product_prices', 'product_categories',
      'damage_reports', 'warehouse_transfers', 'transfer_items',
      'fraud_alerts_local', 'sync_queue', 'sync_cursors', 'operation_log',
    ];

    await localDb.run('BEGIN TRANSACTION');
    try {
      for (const table of tables) {
        await localDb.run(`DELETE FROM ${table}`);
      }

      // Reset sync cursors (will trigger full re-pull)
      await localDb.run('DELETE FROM sync_cursors');
      await localDb.run('DELETE FROM local_settings');

      await localDb.run('COMMIT');
    } catch (error) {
      await localDb.run('ROLLBACK');
      throw error;
    }

    // Vacuum to reclaim space
    await localDb.run('PRAGMA incremental_vacuum(50)');
  }

  private async downloadFullData(): Promise<void> {
    // Trigger a full sync pull (no cursor = pull everything)
    const syncEngine = getSyncEngine();
    await syncEngine.resetSyncCursors();
    await syncEngine.start();

    // Wait for initial pull to complete
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Initial data download timed out')), 300000);

      syncEngine.on('sync_completed', () => {
        clearTimeout(timeout);
        resolve();
      });

      syncEngine.on('sync_failed', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }
}
```

### 3.5 POS Terminal Backup Verification

```bash
# Automated backup integrity check (runs daily on idle terminal)
# Check SQLite database integrity
sqlite3 %APPDATA%/RetailGuard/data/retailguard.db "PRAGMA integrity_check;"

# Verify encryption of backup files
openssl enc -d -aes-256-gcm -iv <iv-from-file> -in retailguard-backup-*.enc -out /dev/null

# Check backup file age
for %%f in (%APPDATA%\RetailGuard\backups\*.enc) do (
    echo %%f - last modified: %%~tf
)

# Alert if no backup exists older than 24 hours
if not exist "%APPDATA%\RetailGuard\backups\*" (
    echo "CRITICAL: No local backup found" >> backup_check.log
)
```

## 4. Disaster Recovery Plan

### 4.1 Recovery Time Objectives

| Scenario | RTO Target | RPO Target | Priority |
|----------|-----------|------------|----------|
| Single API server failure | < 5 minutes | No data loss (stateless) | P1 |
| Complete server outage (VPS failure) | < 2 hours | < 15 minutes | P1 |
| Database corruption (software bug) | < 1 hour | < 15 minutes | P1 |
| Database hardware failure (disk crash) | < 4 hours | < 15 minutes (WAL) | P1 |
| POS terminal failure (hardware) | < 1 hour (swap terminal) | < 1 hour (last backup) | P1 |
| POS terminal database corruption | < 30 minutes | < 5 minutes (local backup) | P1 |
| Entire datacenter failure (region outage) | < 12 hours | < 1 hour | P2 |
| Accidental data deletion (by admin) | < 1 hour | < 15 minutes (PITR) | P2 |
| Security breach / ransomware | < 24 hours (after containment) | < 1 hour | P2 |

### 4.2 Disaster Recovery Runbooks

#### Runbook DR-01: Database Corruption

**Symptoms:**
- API returns 500 errors on database queries
- `pg_isready` shows the database is in recovery or corrupt
- Monitoring alerts: "Database connection failures", "Replication lag critical"

**Step-by-step recovery:**

```bash
# 1. Verify the problem
pg_isready -h localhost -p 5432
psql -c "SELECT pg_is_in_recovery();"

# 2. Check PostgreSQL logs
tail -100 /var/log/postgresql/postgresql-16-main.log

# 3. If database is corrupt:
#    a. Stop the application servers (prevent further writes)
docker-compose stop api sync-worker fraud-worker

#    b. Take the primary offline
docker-compose stop postgres-primary

#    c. Promote replica to primary (if replica is healthy)
#    On replica server:
psql -c "SELECT pg_promote();"

#    d. Point application to new primary
#    Update DATABASE_URL in docker-compose.yml to point to replica

#    e. Restart application
docker-compose up -d api sync-worker fraud-worker

#    f. From the new primary, restore the corrupt primary using PITR
pgbackrest --stanza=retailguard --db-path=/var/lib/postgresql/data \
    --type=time --target="2026-07-18 12:30:00+01" restore

#    g. Set up replication from new primary to restored old primary
#    (Follow standard PostgreSQL replication setup)

# 4. If both primary and replica are corrupt:
#    a. Stop all application services
docker-compose stop

#    b. Find the latest good backup
pgbackrest --stanza=retailguard info

#    c. Restore to point in time (before corruption)
pgbackrest --stanza=retailguard --db-path=/var/lib/postgresql/data \
    --type=time --target="2026-07-18 12:30:00+01" restore

#    d. Start database
docker-compose start postgres-primary

#    e. Verify data integrity
psql -c "SELECT count(*) FROM sales;"
psql -c "SELECT count(*) FROM inventory_movements;"

#    f. Start application services
docker-compose up -d api sync-worker fraud-worker notification-worker

#    g. Notify all branches to perform a full re-sync
#    (Trigger force_resync on each POS terminal)
```

#### Runbook DR-02: Complete Server Failure

**Symptoms:**
- All API requests time out
- Health checks fail
- No SSH access to server
- Monitoring shows server unreachable

**Step-by-step recovery:**

```bash
# 1. Confirm server failure
ping <server-ip>
# If no response, proceed to DR

# 2. Activate standby server (pre-configured warm standby)
#    - Standby server has PostgreSQL streaming replication
#    - Application code is deployed but not running
ssh standby-server

# 3. Promote standby database
docker-compose -f /opt/retailguard/docker-compose.yml stop
docker-compose -f /opt/retailguard/docker-compose.yml start postgres-primary

# 4. Verify database health
pg_isready -h localhost -p 5432
psql -c "SELECT count(*) FROM tenants;"

# 5. Start application services
docker-compose -f /opt/retailguard/docker-compose.yml up -d

# 6. Update DNS to point to standby server IP
#    (Cloudflare API or manual DNS change)
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/<zone-id>/dns_records/<record-id>" \
    -H "Authorization: Bearer <token>" \
    -H "Content-Type: application/json" \
    --data '{"content":"<standby-server-ip>"}'

# 7. Verify application is accessible
curl -I https://api.retailguard.com/api/v1/health

# 8. Notify all branches
#    - POS terminals will auto-reconnect on next sync cycle
#    - No action needed for offline terminals

# 9. Rebuild primary server
#    - Provision new VPS from snapshot or image
#    - Set up PostgreSQL with replication from standby
#    - When ready, reverse the roles
```

#### Runbook DR-03: POS Terminal Database Corruption

**Steps for the branch manager / IT support:**

```bash
# 1. On the affected POS terminal, check the database
# Open the app settings → Database → Integrity Check
# Or check logs:
type "%APPDATA%\RetailGuard\logs\error.log" | findstr "database"

# 2. If corruption is confirmed, attempt automatic recovery:
#    - Restart the POS application
#    - On restart, CrashRecoveryService runs automatically

# 3. If automatic recovery fails:
#    a. Go to Settings → Data Management → Restore from Backup
#    b. Select the most recent backup (ordered by date)
#    c. Confirm restore (app will restart)

# 4. If all local backups fail:
#    a. Go to Settings → Data Management → Force Full Re-sync
#    b. WARNING: This will delete ALL local data
#    c. Confirm the action
#    d. App will re-download all data from server
#    e. Loss: Any transactions not yet synced will be lost

# 5. Last resort: Reinstall the application
#    a. Uninstall RetailGuard POS
#    b. Delete %APPDATA%\RetailGuard\ folder
#    c. Install fresh copy from installer
#    d. Login and trigger initial sync
```

### 4.3 Handling Corrupt Sync State

When the sync state (sync cursors, queue, or conflict records) becomes corrupt or inconsistent:

```typescript
// apps/pos/src/main/sync-state-recovery.ts
export class SyncStateRecovery {
  /**
   * Reset sync state without deleting transaction data.
   * This is less destructive than force re-sync.
   */
  async resetSyncState(): Promise<void> {
    const logger = new Logger('SyncStateRecovery');

    // Step 1: Check current sync state
    const syncHealth = await this.getSyncHealth();
    logger.info(`Current sync health: pending=${syncHealth.pendingPushCount},
      conflicts=${syncHealth.conflictsCount}, failed=${syncHealth.failedCount}`);

    // Step 2: Handle stuck 'syncing' items (stale locks)
    const stuckItems = await localDb.all(
      `SELECT * FROM sync_queue WHERE status = 'syncing'
       AND updated_at < datetime('now', '-1 hour')`
    );

    if (stuckItems.length > 0) {
      logger.warn(`Found ${stuckItems.length} stuck sync items, resetting to pending`);
      await localDb.run(
        `UPDATE sync_queue SET status = 'pending', retry_count = 0
         WHERE status = 'syncing' AND updated_at < datetime('now', '-1 hour')`
      );
    }

    // Step 3: Reset sync cursors (forces re-pull of all data)
    // but does NOT delete local transaction records
    const tables = await localDb.all(
      "SELECT table_name FROM sync_cursors"
    );

    for (const { table_name } of tables) {
      // Keep the cursor but set it back 24 hours
      // This will trigger a re-pull of everything from that point
      const twentyFourHoursAgo = new Date(Date.now() - 86400000).toISOString();
      await localDb.run(
        `UPDATE sync_cursors SET last_synced_at = ?, last_server_version = 0
         WHERE table_name = ?`,
        [twentyFourHoursAgo, table_name]
      );
    }

    logger.info('Sync state reset completed');
  }

  /**
   * Clear all pending sync items for tables that support it.
   * Used when sync items are permanently stuck and manual re-entry is preferred.
   */
  async clearPendingSyncItems(tables?: string[]): Promise<number> {
    if (tables && tables.length > 0) {
      const placeholders = tables.map(() => '?').join(',');
      const result = await localDb.run(
        `DELETE FROM sync_queue WHERE status IN ('pending', 'failed')
         AND table_name IN (${placeholders})`,
        tables
      );
      return result.changes;
    } else {
      const result = await localDb.run(
        `DELETE FROM sync_queue WHERE status IN ('pending', 'failed')`
      );
      return result.changes;
    }
  }

  /**
   * Server-side: Reset sync state for a specific device.
   * Called by admin to force a device to re-sync.
   */
  async resetDeviceSyncState(deviceId: string): Promise<void> {
    await db.query(
      `UPDATE sync_logs SET status = 'reset'
       WHERE device_id = $1 AND created_at > NOW() - INTERVAL '7 days'`,
      [deviceId]
    );

    await db.query(
      `DELETE FROM sync_conflicts
       WHERE id IN (
         SELECT id FROM sync_conflicts WHERE device_id = $1
         ORDER BY created_at DESC
         OFFSET 100
       )`,
      [deviceId]
    );

    // Log the reset
    await db.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details)
       VALUES ((SELECT tenant_id FROM devices WHERE id = $1), $2, 'sync.state_reset', 'device', $1, $3)`,
      [deviceId, adminUserId, JSON.stringify({ reason: 'Admin-initiated sync reset' })]
    );
  }
}
```

## 5. Backup Encryption

### 5.1 Encryption at Rest

| Backup Type | Encryption | Algorithm | Key Management |
|-------------|-----------|-----------|----------------|
| PostgreSQL backups (pgBackRest) | Built-in pgBackRest cipher | AES-256-CBC | Passphrase in environment variable (not checked into git) |
| Logical dumps (pg_dump) | GPG symmetric encryption | AES-256 | GPG key file with strong passphrase |
| POS terminal local backups | Custom AES-256-GCM | AES-256-GCM | Key derived from device secret + app salt (OS keychain) |
| POS terminal cloud backups | Transport: TLS 1.3 | Already encrypted at rest (AES-256-GCM local) | Device-specific key |
| Sync log/cursor snapshots | Server-side S3 SSE | AES-256-S3 | Managed by MinIO/AWS |

### 5.2 Encryption in Transit

| Data Movement | Encryption | Protocol |
|---------------|-----------|----------|
| WAL archive (PostgreSQL → MinIO) | TLS 1.3 + pgBackRest cipher | HTTPS |
| Backups (MinIO → AWS S3 offsite) | TLS 1.3 + server-side encryption | HTTPS |
| POS backup upload (Terminal → API) | TLS 1.3 + encrypted payload | HTTPS |
| Backup restore (MinIO → PostgreSQL) | TLS 1.3 (within private network) | HTTPS |

### 5.3 Key Rotation

```bash
# pgBackRest passphrase rotation (quarterly)
# 1. Create new backup stanza with new passphrase
pgbackrest --stanza=retailguard --repo1-cipher-pass=<new-passphrase> backup

# 2. Keep old passphrase until all backups using it have expired
# (30 days for full backups)

# 3. Update environment variable on all servers
# Update BACKUP_ENCRYPTION_PASS in docker-compose.yml

# 4. Verify new backups work with new passphrase
pgbackrest --stanza=retailguard --repo1-cipher-pass=<new-passphrase> info

# 5. Remove old passphrase from all systems after 35 days
# (30 days retention + 5 day buffer)
```

## 6. Backup Retention Policy

### 6.1 Database Backups

| Backup Type | Frequency | Retention (MinIO) | Retention (Offsite S3) | Purpose |
|-------------|-----------|-------------------|----------------------|---------|
| WAL segments | Every 60s | 7 days | Not stored offsite | Point-in-time recovery |
| Incremental | Every hour | 7 days | Not stored offsite | Recent changes |
| Differential | Every 4 hours | 14 days | Not stored offsite | Faster restore |
| Full | Daily | 30 days | 12 months | Primary recovery point |
| Weekly full | Weekly | 12 weeks | 12 months | Long-term retention |
| Monthly full | Monthly | Not stored locally | 12 months | Compliance / archival |
| Yearly full | Yearly | Not stored locally | 7 years | Legal/regulatory compliance |

### 6.2 POS Terminal Backups

| Backup Type | Local Retention | Cloud Retention |
|-------------|----------------|-----------------|
| Shift-close backups | Last 10 backups | 30 days |
| Hourly/transaction-based | Last 5 backups | 7 days |
| Pre-update backups | Last 3 backups | 90 days |

### 6.3 Sync State Snapshots

| Data | Retention | Purpose |
|------|-----------|---------|
| Sync log entries | 90 days | Troubleshooting, audit |
| Sync conflict records | 180 days | Fraud investigation |
| Sync cursors (server-side history) | 30 days | Device recovery |

### 6.4 Cleanup Automation

```bash
# crontab — backup retention cleanup
# Daily: Clean up old local pgBackRest backups
0 3 * * * pgbackrest --stanza=retailguard repo1-retention-full=30 repo1-retention-diff=14 expire

# Daily: Clean old sync logs
0 4 * * * psql -c "DELETE FROM sync_logs WHERE created_at < NOW() - INTERVAL '90 days';"

# Monthly: Clean POS terminal cloud backups
0 5 1 * * aws s3 rm s3://retailguard-backups/pos-backups/ --recursive --older-than 30

# Monthly: Archive old audit logs
0 5 2 * * pg_dump --table=audit_logs --where="created_at < NOW() - INTERVAL '12 months'" \
    --format=custom --compress=9 -f /mnt/archive/audit-logs-$(date +%Y%m).dump \
    && psql -c "DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '12 months';"
```

## 7. Backup Monitoring

### 7.1 What to Monitor

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Last successful full backup | > 25 hours ago | > 48 hours ago | Alert operations team |
| Last successful WAL archive | > 5 minutes ago | > 15 minutes ago | Check archive process |
| Backup size change | > 20% deviation | > 50% deviation | Investigate data growth |
| Backup duration | > 2x baseline | > 4x baseline | Optimize or scale |
| Offsite sync status | Failed > 2 hours | Failed > 6 hours | Check network/storage |
| POS terminal last backup | > 24 hours | > 48 hours | Notify branch manager |
| Restore test success | Last test failed | 2 consecutive failures | Investigate backup integrity |

### 7.2 Alerting

```typescript
// services/backup-worker/src/backup-monitor.ts
@Injectable()
export class BackupMonitor {
  async checkBackupHealth(): Promise<BackupHealthReport> {
    const report = new BackupHealthReport();

    // Check PostgreSQL backup
    const pgBackupInfo = await this.getPgBackupInfo();
    report.pgFullBackup = {
      lastSuccess: pgBackupInfo.lastFull,
      age: Date.now() - pgBackupInfo.lastFull.getTime(),
      status: pgBackupInfo.lastFull > Date.now() - 86400000 ? 'ok' : 'warning',
    };

    // Check WAL archive
    const walAge = await this.getWALArchiveAge();
    report.walArchive = {
      lastSuccess: walAge.lastArchive,
      age: Date.now() - walAge.lastArchive.getTime(),
      status: walAge.lastArchive > Date.now() - 300000 ? 'ok' : 'critical',
    };

    // Check offsite replication
    const offsiteStatus = await this.checkOffsiteReplication();
    report.offsiteReplication = {
      lastSync: offsiteStatus.lastSync,
      status: offsiteStatus.healthy ? 'ok' : 'warning',
    };

    // Aggregate status
    report.overallStatus = this.aggregateStatus(report);

    return report;
  }
}
```

## 8. Backup Testing Schedule

| Test | Frequency | Description | Success Criteria |
|------|-----------|-------------|-----------------|
| Automated restore test | Weekly | Restore to temporary directory, verify data | Database accepts connections, row counts match |
| PITR test | Monthly | Restore to specific time (1 hour ago), compare | Exact match to production at that time |
| Full DR drill | Quarterly | Simulate complete failure, recover on standby | RTO < 4 hours, RPO < 15 minutes |
| Offsite restore test | Monthly | Download and restore from offsite S3 | Full database operational |
| POS terminal recovery drill | Quarterly | Simulate corrupted terminal, restore from local backup | All transactions preserved within RPO |
| Encryption key rotation | Quarterly | Rotate all backup encryption keys | Old backups still readable, new keys work |
| Retention policy audit | Monthly | Verify old backups are properly deleted | No backups older than retention policy |

## 9. Limitations

1. **RPO of < 15 minutes depends on network connectivity** — During extended network outages, the WAL archive may not reach the offsite S3 bucket. Once connectivity is restored, the WAL backlog is archived. In the worst case, up to the WAL_ KEEP_SIZE (2GB) of data may be lost if the primary and replica fail simultaneously during a network outage.
2. **POS terminal local backups are not verified automatically** — The integrity of local backups is only checked during restore. A corrupted backup may go undetected until it's needed. Mitigation: backup integrity checks run as a background task on idle terminals.
3. **No cross-region failover** — The disaster recovery plan assumes a single-region deployment. A region-wide catastrophe (unlikely but possible) would require provisioning infrastructure in a new region from scratch, with RTO up to 24 hours.
4. **Encryption keys are stored as environment variables** — For pgBackRest and GPG. Future enhancement: integrate with a secrets manager (HashiCorp Vault or AWS Secrets Manager).
5. **POS terminal cloud backups are best-effort** — The upload to cloud happens asynchronously. If a terminal is destroyed before the cloud upload completes, the backup is lost. This is mitigated by frequent local backups (shift + every 50 transactions).
6. **Backup storage costs grow with data** — At 30-day retention, backup storage is approximately 2-3x the database size. Monthly and yearly archives add additional cost. Monitor backup storage costs and adjust retention if needed.