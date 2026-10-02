import db, { type SyncQueueItem } from './db';
import apiClient from '../api/client';

class SyncEngine {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;

  /**
   * Add a pending change to the sync queue.
   */
  async addToSyncQueue(
    table: string,
    action: 'create' | 'update' | 'delete',
    data: Record<string, unknown>,
  ): Promise<number> {
    const id = await db.syncQueue.add({
      table,
      action,
      data: JSON.stringify(data),
      serverId: (data.serverId as string) || null,
      createdAt: Date.now(),
      retryCount: 0,
      lastError: null,
    });
    return id;
  }

  /**
   * Process all queued sync items, sending them to the server.
   */
  async processSyncQueue(): Promise<{ success: number; failed: number }> {
    if (this.isSyncing) {
      return { success: 0, failed: 0 };
    }

    this.isSyncing = true;
    let success = 0;
    let failed = 0;

    try {
      const items = await db.syncQueue
        .orderBy('createdAt')
        .limit(50)
        .toArray();

      for (const item of items) {
        try {
          await this.sendItem(item);
          await db.syncQueue.delete(item.id!);
          success++;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          await db.syncQueue.update(item.id!, {
            retryCount: item.retryCount + 1,
            lastError: errorMessage,
          });
          failed++;
        }
      }
    } finally {
      this.isSyncing = false;
    }

    return { success, failed };
  }

  private async sendItem(item: SyncQueueItem): Promise<void> {
    const data = JSON.parse(item.data);

    switch (item.action) {
      case 'create':
        await apiClient.post(`/${item.table}`, data);
        break;
      case 'update':
        await apiClient.put(`/${item.table}/${item.serverId}`, data);
        break;
      case 'delete':
        await apiClient.delete(`/${item.table}/${item.serverId}`);
        break;
    }
  }

  /**
   * Start periodic sync (every 30s when online).
   */
  startSync(): void {
    if (this.intervalId) return;

    // Run immediately if online
    if (navigator.onLine) {
      this.processSyncQueue();
    }

    this.intervalId = setInterval(() => {
      if (navigator.onLine) {
        this.processSyncQueue();
      }
    }, 30_000);

    // Listen for online/offline events
    window.addEventListener('online', this.handleOnline);
  }

  /**
   * Stop periodic sync.
   */
  stopSync(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    window.removeEventListener('online', this.handleOnline);
  }

  /**
   * Get count of pending sync items.
   */
  async getPendingCount(): Promise<number> {
    return db.syncQueue.count();
  }

  private handleOnline = (): void => {
    this.processSyncQueue();
  };
}

export const syncEngine = new SyncEngine();
export default syncEngine;