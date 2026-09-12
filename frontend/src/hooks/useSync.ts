import { useState, useEffect, useCallback } from 'react';
import syncEngine from '../lib/sync';

interface UseSyncReturn {
  syncStatus: 'idle' | 'syncing' | 'error';
  pendingCount: number;
  triggerSync: () => Promise<void>;
}

export function useSync(): UseSyncReturn {
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await syncEngine.getPendingCount();
      setPendingCount(count);
    } catch {
      // Ignore errors when getting pending count
    }
  }, []);

  const triggerSync = useCallback(async () => {
    setSyncStatus('syncing');
    try {
      const result = await syncEngine.processSyncQueue();
      setSyncStatus(result.failed > 0 ? 'error' : 'idle');
      await refreshPendingCount();
    } catch {
      setSyncStatus('error');
    }
  }, [refreshPendingCount]);

  useEffect(() => {
    // Start the periodic sync engine
    syncEngine.startSync();
    refreshPendingCount();

    // Poll for pending count changes
    const countInterval = setInterval(refreshPendingCount, 10_000);

    return () => {
      syncEngine.stopSync();
      clearInterval(countInterval);
    };
  }, [refreshPendingCount]);

  return { syncStatus, pendingCount, triggerSync };
}