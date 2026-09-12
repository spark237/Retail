import { lazy, Suspense, type ReactNode, type ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

/**
 * Check if the current user has one of the allowed roles.
 * Returns true if no roles are specified (public route).
 */
function hasRole(allowedRoles?: string[]): boolean {
  const { user, isAuthenticated } = useAuthStore.getState();
  if (!allowedRoles || allowedRoles.length === 0) return true;
  if (!isAuthenticated || !user) return false;
  return allowedRoles.includes(user.role);
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
 * Route definitions for the RetailGuard frontend.
 */
export const router = createBrowserRouter([
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
]);