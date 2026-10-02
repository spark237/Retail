import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCashReports } from '../api/services';
import { formatXAF, formatDate, getStatusColor } from '../lib/format';

export default function CashReportPage() {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['cash-reports', date],
    queryFn: () => getCashReports(date),
  });

  const totalExpected = data?.reduce((sum, r) => sum + r.expectedCash, 0) || 0;
  const totalDeclared = data?.reduce((sum, r) => sum + r.declaredCash, 0) || 0;
  const totalDifference = data?.reduce((sum, r) => sum + r.difference, 0) || 0;
  const mismatchCount = data?.filter((r) => r.status === 'mismatch').length || 0;

  // ---- Loading ----
  if (isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Cash Reconciliation</h1>
        <div className="mb-6 h-12 w-48 animate-pulse rounded-lg bg-gray-200" />
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-white" />
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-white" />
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
        <p className="mb-2 text-lg font-semibold text-gray-900">Failed to load cash reports</p>
        <p className="mb-4 text-sm text-gray-500">Unable to fetch reconciliation data.</p>
        <button
          onClick={() => refetch()}
          className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 min-h-[44px]"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Cash Reconciliation</h1>

      {/* Date Filter */}
      <div className="mb-6">
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Date</label>
        <div className="flex gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="block w-full max-w-xs rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none text-base min-h-[48px]"
          />
          <button
            onClick={() => setDate(today)}
            className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 min-h-[48px]"
          >
            Today
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {data && data.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-1 text-sm font-medium text-gray-500">Expected Cash</div>
            <div className="text-2xl font-bold text-gray-900">{formatXAF(totalExpected)}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-1 text-sm font-medium text-gray-500">Declared Cash</div>
            <div className="text-2xl font-bold text-gray-900">{formatXAF(totalDeclared)}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-1 text-sm font-medium text-gray-500">Difference</div>
            <div className={`text-2xl font-bold ${totalDifference === 0 ? 'text-gray-900' : 'text-red-600'}`}>
              {formatXAF(totalDifference)}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-1 text-sm font-medium text-gray-500">Mismatches</div>
            <div className={`text-2xl font-bold ${mismatchCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {mismatchCount}
            </div>
            <div className="mt-1 text-xs text-gray-400">out of {data.length} shift(s)</div>
          </div>
        </div>
      )}

      {/* Table */}
      {!data || data.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
          <svg className="mb-4 h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.078.879 4.249 0C16.5 14.939 16.5 12 16.5 12s0-2.939-1.372-3.537c-1.171-.879-3.078-.879-4.249 0L12 10.182m3.75-6.268A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <p className="text-lg font-medium text-gray-900">No data for this date</p>
          <p className="mt-1 text-sm text-gray-500">
            {date === today
              ? 'No shifts have been reconciled today yet'
              : `No reconciliation data for ${formatDate(date)}`}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-5 py-4">Date</th>
                <th className="px-5 py-4">Cashier</th>
                <th className="px-5 py-4">Branch</th>
                <th className="px-5 py-4 text-right">Expected</th>
                <th className="px-5 py-4 text-right">Declared</th>
                <th className="px-5 py-4 text-right">Difference</th>
                <th className="px-5 py-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="whitespace-nowrap px-5 py-4 text-gray-500">{formatDate(row.date)}</td>
                  <td className="px-5 py-4 font-medium text-gray-900">{row.cashierName}</td>
                  <td className="px-5 py-4 text-gray-600">{row.branchName}</td>
                  <td className="px-5 py-4 text-right font-semibold text-gray-900">{formatXAF(row.expectedCash)}</td>
                  <td className="px-5 py-4 text-right font-semibold text-gray-900">{formatXAF(row.declaredCash)}</td>
                  <td className={`px-5 py-4 text-right font-semibold ${
                    row.difference === 0 ? 'text-gray-500' : row.difference > 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {row.difference > 0 ? '+' : ''}{formatXAF(row.difference)}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(row.status)}`}>
                      {row.status === 'match' ? 'Match' : 'Mismatch'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}