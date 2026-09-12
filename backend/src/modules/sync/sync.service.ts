import { Injectable, Logger, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SyncPushDto, SyncPullDto } from './dto/sync.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(private prisma: PrismaService) {}

  async push(tenantId: string, dto: SyncPushDto, userId: string) {
    const startTime = Date.now();
    let recordsSynced = 0;
    let recordsFailed = 0;
    let conflictsDetected = 0;
    let conflictsResolved = 0;

    // Check idempotency
    if (dto.idempotencyKey) {
      const existingLog = await this.prisma.syncLog.findFirst({
        where: { idempotencyKey: dto.idempotencyKey, tenantId },
      });
      if (existingLog) {
        this.logger.log(`Idempotent sync push: ${dto.idempotencyKey}`);
        return {
          status: 'idempotent',
          synced: existingLog.recordsSynced,
          failed: existingLog.recordsFailed,
          conflicts: existingLog.conflictsDetected,
        };
      }
    }

    const results: {
      entityType: string;
      entityId: string;
      status: 'synced' | 'conflict' | 'error';
      error?: string;
    }[] = [];

    try {
      // Process entities in order: shifts first, then expenses, then sales (with items and payments), then damages, then inventory
      if (dto.shifts) {
        for (const shift of dto.shifts) {
          try {
            const result = await this.processSyncRecord(tenantId, 'shift', shift, userId);
            results.push(result);
            if (result.status === 'synced') recordsSynced++;
            else if (result.status === 'conflict') { conflictsDetected++; conflictsResolved++; }
            else recordsFailed++;
          } catch (e) {
            recordsFailed++;
            results.push({ entityType: 'shift', entityId: shift?.id || 'unknown', status: 'error', error: e.message });
          }
        }
      }

      if (dto.sales) {
        for (const sale of dto.sales) {
          try {
            const result = await this.processSyncRecord(tenantId, 'sale', sale, userId);
            results.push(result);
            if (result.status === 'synced') recordsSynced++;
            else if (result.status === 'conflict') { conflictsDetected++; conflictsResolved++; }
            else recordsFailed++;
          } catch (e) {
            recordsFailed++;
            results.push({ entityType: 'sale', entityId: sale?.id || 'unknown', status: 'error', error: e.message });
          }
        }
      }

      if (dto.expenses) {
        for (const expense of dto.expenses) {
          try {
            const result = await this.processSyncRecord(tenantId, 'expense', expense, userId);
            results.push(result);
            if (result.status === 'synced') recordsSynced++;
            else if (result.status === 'conflict') { conflictsDetected++; conflictsResolved++; }
            else recordsFailed++;
          } catch (e) {
            recordsFailed++;
            results.push({ entityType: 'expense', entityId: expense?.id || 'unknown', status: 'error', error: e.message });
          }
        }
      }

      if (dto.damageReports) {
        for (const report of dto.damageReports) {
          try {
            const result = await this.processSyncRecord(tenantId, 'damage_report', report, userId);
            results.push(result);
            if (result.status === 'synced') recordsSynced++;
            else if (result.status === 'conflict') { conflictsDetected++; conflictsResolved++; }
            else recordsFailed++;
          } catch (e) {
            recordsFailed++;
            results.push({ entityType: 'damage_report', entityId: report?.id || 'unknown', status: 'error', error: e.message });
          }
        }
      }

      if (dto.inventoryMovements) {
        for (const movement of dto.inventoryMovements) {
          try {
            const result = await this.processSyncRecord(tenantId, 'inventory_movement', movement, userId);
            results.push(result);
            if (result.status === 'synced') recordsSynced++;
            else if (result.status === 'conflict') { conflictsDetected++; conflictsResolved++; }
            else recordsFailed++;
          } catch (e) {
            recordsFailed++;
            results.push({ entityType: 'inventory_movement', entityId: movement?.id || 'unknown', status: 'error', error: e.message });
          }
        }
      }
    } catch (e) {
      this.logger.error(`Sync push error: ${e.message}`);
    }

    // Log sync
    const durationMs = Date.now() - startTime;
    await this.prisma.syncLog.create({
      data: {
        tenantId,
        deviceId: dto.deviceId,
        syncType: 'push',
        status: recordsFailed > 0 ? 'partial' : 'success',
        recordsSynced,
        recordsFailed,
        conflictsDetected,
        conflictsResolved,
        errorMessage: recordsFailed > 0 ? `${recordsFailed} record(s) failed` : null,
        durationMs,
        clientVersion: dto.clientVersion || null,
        idempotencyKey: dto.idempotencyKey || null,
        startedAt: new Date(startTime),
        completedAt: new Date(),
      },
    });

    this.logger.log(`Sync push completed: ${recordsSynced} synced, ${recordsFailed} failed, ${conflictsDetected} conflicts`);

    return {
      status: recordsFailed > 0 ? 'partial' : 'success',
      synced: recordsSynced,
      failed: recordsFailed,
      conflicts: conflictsDetected,
      results,
      durationMs,
    };
  }

  async pull(tenantId: string, dto: SyncPullDto) {
    const startTime = Date.now();
    const lastSyncAt = dto.lastSyncAt ? new Date(dto.lastSyncAt) : new Date(0);
    const entityTypes = dto.entityTypes || ['sale', 'shift', 'expense', 'damage_report', 'inventory_movement'];

    const data: Record<string, any[]> = {};

    for (const entityType of entityTypes) {
      switch (entityType) {
        case 'sale':
          data.sales = await this.prisma.sale.findMany({
            where: {
              tenantId,
              OR: [
                { updatedAt: { gt: lastSyncAt } },
                { syncStatus: 'pending' },
              ],
              deletedAt: null,
            },
            include: {
              saleItems: true,
              payments: true,
            },
            take: 500,
            orderBy: { updatedAt: 'asc' },
          });
          break;

        case 'shift':
          data.shifts = await this.prisma.shift.findMany({
            where: {
              tenantId,
              OR: [
                { updatedAt: { gt: lastSyncAt } },
                { syncStatus: 'pending' },
              ],
              deletedAt: null,
            },
            take: 100,
            orderBy: { updatedAt: 'asc' },
          });
          break;

        case 'expense':
          data.expenses = await this.prisma.expense.findMany({
            where: {
              tenantId,
              OR: [
                { updatedAt: { gt: lastSyncAt } },
                { syncStatus: 'pending' },
              ],
              deletedAt: null,
            },
            take: 200,
            orderBy: { updatedAt: 'asc' },
          });
          break;

        case 'damage_report':
          data.damageReports = await this.prisma.damageReport.findMany({
            where: {
              tenantId,
              OR: [
                { updatedAt: { gt: lastSyncAt } },
                { syncStatus: 'pending' },
              ],
              deletedAt: null,
            },
            take: 200,
            orderBy: { updatedAt: 'asc' },
          });
          break;

        case 'inventory_movement':
          data.inventoryMovements = await this.prisma.inventoryMovement.findMany({
            where: {
              tenantId,
              OR: [
                { createdAt: { gt: lastSyncAt } },
                { syncStatus: 'pending' },
              ],
            },
            take: 500,
            orderBy: { createdAt: 'asc' },
            include: { product: { select: { id: true, sku: true, name: true } } },
          });
          break;
      }
    }

    // Log sync
    const durationMs = Date.now() - startTime;
    const totalRecords = Object.values(data).reduce((sum, arr) => sum + arr.length, 0);

    await this.prisma.syncLog.create({
      data: {
        tenantId,
        deviceId: dto.deviceId,
        branchId: null,
        syncType: 'pull',
        status: 'success',
        recordsSynced: totalRecords,
        recordsFailed: 0,
        conflictsDetected: 0,
        conflictsResolved: 0,
        durationMs,
        clientVersion: null,
        startedAt: new Date(startTime),
        completedAt: new Date(),
      },
    });

    return {
      status: 'success',
      data,
      totalRecords,
      serverTime: new Date().toISOString(),
      durationMs,
    };
  }

  // ─── Conflict Detection ───────────────────────────────────────────────

  private async processSyncRecord(
    tenantId: string,
    entityType: string,
    record: any,
    userId: string,
  ): Promise<{ entityType: string; entityId: string; status: 'synced' | 'conflict' | 'error'; error?: string }> {
    if (!record.id) {
      // New record - create it
      return this.createEntity(tenantId, entityType, record, userId);
    }

    // Check if record exists on server
    const existing = await this.findEntityById(entityType, record.id, tenantId);

    if (!existing) {
      // Record doesn't exist on server - create it
      return this.createEntity(tenantId, entityType, record, userId);
    }

    // Conflict detection: compare server_version
    const clientVersion = record.serverVersion || 0;
    const serverVersion = existing.serverVersion || 0;

    if (clientVersion < serverVersion) {
      // Server has newer version - conflict
      this.logger.warn(`Sync conflict detected: ${entityType} ${record.id} (client: ${clientVersion}, server: ${serverVersion})`);

      // Update sync status to pending_conflict
      await this.updateEntitySyncStatus(entityType, record.id, 'pending_conflict');

      return {
        entityType,
        entityId: record.id,
        status: 'conflict',
        error: 'Server has newer version. Pull latest data first.',
      };
    }

    // No conflict - update the record
    return this.updateEntity(tenantId, entityType, record, userId);
  }

  private async findEntityById(entityType: string, id: string, tenantId: string): Promise<any> {
    switch (entityType) {
      case 'sale':
        return this.prisma.sale.findFirst({ where: { id, tenantId } });
      case 'shift':
        return this.prisma.shift.findFirst({ where: { id, tenantId } });
      case 'expense':
        return this.prisma.expense.findFirst({ where: { id, tenantId } });
      case 'damage_report':
        return this.prisma.damageReport.findFirst({ where: { id, tenantId } });
      case 'inventory_movement':
        return this.prisma.inventoryMovement.findFirst({ where: { id, tenantId } });
      default:
        return null;
    }
  }

  private async createEntity(
    tenantId: string,
    entityType: string,
    record: any,
    userId: string,
  ): Promise<{ entityType: string; entityId: string; status: 'synced' | 'error'; error?: string }> {
    try {
      switch (entityType) {
        case 'sale':
          // Sales need special handling with items and payments
          // For simplicity, we create the sale record and sync status
          await this.prisma.sale.create({
            data: {
              id: record.id,
              tenantId,
              branchId: record.branchId,
              shiftId: record.shiftId,
              receiptNumber: record.receiptNumber || `SYNC-${Date.now()}`,
              subtotal: record.subtotal || 0,
              discountAmount: record.discountAmount || 0,
              discountReason: record.discountReason,
              vatAmount: record.vatAmount || 0,
              totalAmount: record.totalAmount || 0,
              paymentStatus: record.paymentStatus || 'pending',
              saleStatus: record.saleStatus || 'completed',
              syncStatus: 'synced',
              serverVersion: 1,
              createdBy: record.createdBy || userId,
              updatedBy: userId,
            },
          });
          break;

        case 'shift':
          await this.prisma.shift.create({
            data: {
              id: record.id,
              tenantId,
              branchId: record.branchId,
              cashierId: record.cashierId || userId,
              openingBalance: record.openingBalance || 0,
              status: record.status || 'open',
              syncStatus: 'synced',
              serverVersion: 1,
              createdBy: userId,
              updatedBy: userId,
            },
          });
          break;

        case 'expense':
          await this.prisma.expense.create({
            data: {
              id: record.id,
              tenantId,
              branchId: record.branchId,
              shiftId: record.shiftId || null,
              expenseCategory: record.expenseCategory || 'general',
              amount: record.amount || 0,
              description: record.description || 'Synced expense',
              syncStatus: 'synced',
              serverVersion: 1,
              createdBy: userId,
              updatedBy: userId,
            },
          });
          break;

        case 'damage_report':
          await this.prisma.damageReport.create({
            data: {
              id: record.id,
              tenantId,
              branchId: record.branchId || null,
              warehouseId: record.warehouseId || null,
              productId: record.productId,
              quantity: record.quantity || 0,
              unit: record.unit || 'UNIT',
              damageType: record.damageType || 'damaged',
              description: record.description || 'Synced damage report',
              status: 'pending_review',
              syncStatus: 'synced',
              serverVersion: 1,
              createdBy: userId,
              updatedBy: userId,
            },
          });
          break;

        case 'inventory_movement':
          await this.prisma.inventoryMovement.create({
            data: {
              id: record.id,
              tenantId,
              productId: record.productId,
              locationType: record.locationType || 'warehouse',
              locationId: record.locationId,
              movementType: record.movementType || 'adjustment',
              quantity: record.quantity || 0,
              unit: record.unit || 'UNIT',
              reason: record.reason || 'Synced movement',
              recordedBy: record.recordedBy || userId,
              syncStatus: 'synced',
              serverVersion: 1,
            },
          });
          break;

        default:
          return { entityType, entityId: record.id, status: 'error', error: `Unknown entity type: ${entityType}` };
      }

      return { entityType, entityId: record.id, status: 'synced' };
    } catch (e) {
      this.logger.error(`Failed to create ${entityType} ${record.id}: ${e.message}`);
      return { entityType, entityId: record.id, status: 'error', error: e.message };
    }
  }

  private async updateEntity(
    tenantId: string,
    entityType: string,
    record: any,
    userId: string,
  ): Promise<{ entityType: string; entityId: string; status: 'synced' | 'error'; error?: string }> {
    try {
      const updateData: any = { ...record };
      delete updateData.id;
      delete updateData.tenantId;
      delete updateData.createdAt;
      delete updateData.createdBy;
      delete updateData.serverVersion;

      // Increment server version
      updateData.serverVersion = { increment: 1 };
      updateData.syncStatus = 'synced';

      switch (entityType) {
        case 'sale':
          await this.prisma.sale.update({ where: { id: record.id }, data: { ...updateData, updatedBy: userId } });
          break;
        case 'shift':
          await this.prisma.shift.update({ where: { id: record.id }, data: { ...updateData, updatedBy: userId } });
          break;
        case 'expense':
          await this.prisma.expense.update({ where: { id: record.id }, data: { ...updateData, updatedBy: userId } });
          break;
        case 'damage_report':
          await this.prisma.damageReport.update({ where: { id: record.id }, data: { ...updateData, updatedBy: userId } });
          break;
        case 'inventory_movement':
          // Inventory movements are immutable - only update sync status
          await this.prisma.inventoryMovement.update({
            where: { id: record.id },
            data: { syncStatus: 'synced', serverVersion: { increment: 1 } },
          });
          break;
        default:
          return { entityType, entityId: record.id, status: 'error', error: `Unknown entity type: ${entityType}` };
      }

      return { entityType, entityId: record.id, status: 'synced' };
    } catch (e) {
      this.logger.error(`Failed to update ${entityType} ${record.id}: ${e.message}`);
      return { entityType, entityId: record.id, status: 'error', error: e.message };
    }
  }

  private async updateEntitySyncStatus(entityType: string, id: string, syncStatus: string) {
    try {
      switch (entityType) {
        case 'sale':
          await this.prisma.sale.update({ where: { id }, data: { syncStatus } });
          break;
        case 'shift':
          await this.prisma.shift.update({ where: { id }, data: { syncStatus } });
          break;
        case 'expense':
          await this.prisma.expense.update({ where: { id }, data: { syncStatus } });
          break;
        case 'damage_report':
          await this.prisma.damageReport.update({ where: { id }, data: { syncStatus } });
          break;
        case 'inventory_movement':
          await this.prisma.inventoryMovement.update({ where: { id }, data: { syncStatus } });
          break;
      }
    } catch (e) {
      this.logger.warn(`Failed to update sync status for ${entityType} ${id}: ${e.message}`);
    }
  }
}