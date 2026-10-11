import { lazy, Suspense, type ReactNode, type ComponentType } from 'react';
import { createBrowserRouter, Navigate, useRouteError } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

/**
 * Check if the current user has one of the allowed roles.
 * Returns true if no roles are specified (public route).
 */
function hasRole(allowedRoles?: string[]): boolean {
  const { user, isAuthenticated } = useAuthStore.getState();
  if (!allowedRoles || allowedRoles.length === 0) return true;
  if (!isAuthenticated || !user) return false;
  return user.role !== null && allowedRoles.includes(user.role);
}

interface ProtectedRouteProps {
  children: ReactNode;
  roles?: string[];
  fallback?: string;
}

export function ProtectedRoute({
  children,
  roles,
  fallback = '/login',
}: ProtectedRouteProps) {
  const { isAuthenticated } = useAuthStore.getState();

  if (!isAuthenticated) {
    return <Navigate to={fallback} replace />;
  }

  if (roles && !hasRole(roles)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function LazyLoad({ loader }: { loader: () => Promise<{ default: ComponentType<unknown> }> }) {
  const Component = lazy(loader);
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-500">Loading...</div>}>
      <Component />
    </Suspense>
  );
}

/**
 * Route-level error boundary. A page crash must render an error state,
 * never a blank/white screen.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const message =
    error instanceof Error ? error.message : 'An unexpected error occurred while rendering this page.';
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 p-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
        <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h1 className="text-xl font-semibold text-gray-900">Something went wrong</h1>
      <p className="max-w-md break-words text-center text-sm text-gray-600">{message}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 min-h-[44px]"
      >
        Reload page
      </button>
    </div>
  );
}

/**
 * Route definitions for the RetailGuard frontend.
 */
export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorBoundary />,
    children: [
  {
    path: '/login',
    element: <LazyLoad loader={() => import('../pages/LoginPage')} />,
  },
  {
    path: '/pos',
    element: (
      <ProtectedRoute roles={['cashier', 'admin', 'manager']}>
        <LazyLoad loader={() => import('../pages/PosPage')} />
      </ProtectedRoute>
    ),
  },
  {
    path: '/dashboard',
    element: (
      <ProtectedRoute roles={['admin', 'manager']}>
        <LazyLoad loader={() => import('../pages/DashboardPage')} />
      </ProtectedRoute>
    ),
  },
  {
    path: '/inventory',
    element: (
      <ProtectedRoute roles={['admin', 'manager', 'warehouse']}>
        <LazyLoad loader={() => import('../pages/InventoryPage')} />
      </ProtectedRoute>
    ),
  },
  {
    path: '/inventory/transfer',
    element: (
      <ProtectedRoute roles={['admin', 'manager', 'warehouse']}>
        <LazyLoad loader={() => import('../pages/TransferPage')} />
      </ProtectedRoute>
    ),
  },
  {
    path: '/inventory/damage',
    element: (
      <ProtectedRoute roles={['admin', 'manager', 'warehouse']}>
        <LazyLoad loader={() => import('../pages/DamagePage')} />
      </ProtectedRoute>
    ),
  },
  {
    path: '/inventory/movements',
    element: (
      <ProtectedRoute roles={['admin', 'manager', 'warehouse', 'auditor']}>
        <LazyLoad loader={() => import('../pages/MovementsPage')} />
      </ProtectedRoute>
    ),
  },
  {
    path: '/reports/sales',
    element: (
      <ProtectedRoute roles={['admin', 'manager', 'auditor']}>
        <LazyLoad loader={() => import('../pages/SalesReportPage')} />
      </ProtectedRoute>
    ),
  },
  {
    path: '/reports/cash',
    element: (
      <ProtectedRoute roles={['admin', 'manager', 'auditor']}>
        <LazyLoad loader={() => import('../pages/CashReportPage')} />
      </ProtectedRoute>
    ),
  },
  {
    path: '/reports/fraud',
    element: (
      <ProtectedRoute roles={['admin', 'auditor']}>
        <LazyLoad loader={() => import('../pages/FraudReportPage')} />
      </ProtectedRoute>
    ),
  },
  {
    path: '/',
    element: <Navigate to="/dashboard" replace />,
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
    ],
  },
]);