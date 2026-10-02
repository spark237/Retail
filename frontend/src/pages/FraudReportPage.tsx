import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getFraudAlerts, resolveFraudAlert } from '../api/services';
import { formatDateTime, getStatusColor } from '../lib/format';

const SEVERITIES = [
  { value: '', label: 'All Severities' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
];

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-100 text-red-800 ring-1 ring-red-300';
    case 'high':
      return 'bg-orange-100 text-orange-800 ring-1 ring-orange-300';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 ring-1 ring-yellow-300';
    case 'low':
      return 'bg-blue-100 text-blue-800 ring-1 ring-blue-300';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export default function FraudReportPage() {
  const queryClient = useQueryClient();
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['fraud-alerts', severity, status],
    queryFn: () =>
      getFraudAlerts({
        severity: severity || undefined,
        status: status || undefined,
      }),
  });

  const resolveMutation = useMutation({
    mutationFn: (alertId: string) => resolveFraudAlert(alertId),
    onSuccess: () => {
      toast.success('Alert resolved');
      queryClient.invalidateQueries({ queryKey: ['fraud-alerts'] });
    },
    onError: () => {
      toast.error('Failed to resolve alert');
    },
  });

  // ---- Loading ----
  if (isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Fraud Alerts</h1>
        <div className="mb-4 flex gap-2">
          <div className="h-10 w-36 animate-pulse rounded-lg bg-gray-200" />
          <div className="h-10 w-36 animate-pulse rounded-lg bg-gray-200" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-white" />
          ))}
        </div>
      </div>
    );
  }

  // ---- Error ----
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <svg className="mb-4 h-16 w-16 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <p className="mb-2 text-lg font-semibold text-gray-900">Failed to load fraud alerts</p>
        <p className="mb-4 text-sm text-gray-500">Unable to fetch alert data.</p>
        <button
          onClick={() => refetch()}
          className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 min-h-[44px]"
        >
          Retry
        </button>
      </div>
    );
  }

  const alerts = data || [];

  return (
    <div className="p-4 sm:p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Fraud Alerts</h1>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-3">
        <div>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="block rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none min-h-[44px]"
          >
            {SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="block rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none min-h-[44px]"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        {(severity || status) && (
          <button
            onClick={() => { setSeverity(''); setStatus(''); }}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 min-h-[44px]"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Alerts List */}
      {alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
          <svg className="mb-4 h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <p className="text-lg font-medium text-gray-900">No alerts found</p>
          <p className="mt-1 text-sm text-gray-500">
            {severity || status
              ? 'No alerts match the selected filters'
              : 'No fraud alerts. Everything looks good!'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${getSeverityColor(alert.severity)}`}>
                      {alert.severity}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(alert.status)}`}>
                      {alert.status === 'open' ? 'Open' : 'Resolved'}
                    </span>
                    <span className="text-xs text-gray-400 capitalize">{alert.type}</span>
                  </div>
                  <p className="text-sm text-gray-900 mb-1">{alert.description}</p>
                  <p className="text-xs text-gray-400">{formatDateTime(alert.date)}</p>
                  {alert.resolvedBy && (
                    <p className="text-xs text-gray-400 mt-1">
                      Resolved by {alert.resolvedBy}
                      {alert.resolvedAt && ` on ${formatDateTime(alert.resolvedAt)}`}
                    </p>
                  )}
                </div>
                {alert.status === 'open' && (
                  <button
                    onClick={() => resolveMutation.mutate(alert.id)}
                    disabled={resolveMutation.isPending}
                    className="ml-4 flex-shrink-0 rounded-lg bg-green-600 px-4 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 min-h-[36px]"
                  >
                    {resolveMutation.isPending ? '...' : 'Resolve'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}