import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useSync } from './hooks/useSync';
import { useAuth } from './hooks/useAuth';
import { router } from './routes';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

function SyncIndicator() {
  const { syncStatus, pendingCount } = useSync();

  if (pendingCount === 0 && syncStatus === 'idle') return null;

  const statusColor =
    syncStatus === 'syncing'
      ? 'bg-blue-500'
      : syncStatus === 'error'
        ? 'bg-red-500'
        : 'bg-green-500';

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-white px-3 py-1.5 shadow-lg text-sm">
      <span className={`h-2 w-2 rounded-full ${statusColor} ${syncStatus === 'syncing' ? 'animate-pulse' : ''}`} />
      <span className="text-gray-600">
        {syncStatus === 'syncing'
          ? 'Syncing...'
          : syncStatus === 'error'
            ? 'Sync error'
            : `${pendingCount} pending`}
      </span>
    </div>
  );
}

function OfflineBanner() {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-white">
      You are offline — changes will sync when connection is restored
    </div>
  );
}

function AppShell() {
  return (
    <>
      <OfflineBanner />
      <RouterProvider router={router} />
      <SyncIndicator />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            borderRadius: '8px',
            background: '#333',
            color: '#fff',
          },
        }}
      />
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}