import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSales, getSalesSummary, getBranches } from '../api/services';
import { formatXAF, formatDateTime } from '../lib/format';
import type { PaginatedResponse, SaleReportRow } from '../api/services';

const PAYMENT_METHODS = [
  { value: '', label: 'All Methods' },
  { value: 'cash', label: 'Cash' },
  { value: 'mtn', label: 'MTN MoMo' },
  { value: 'orange', label: 'Orange Money' },
  { value: 'bank', label: 'Bank Transfer' },
];

export default function SalesReportPage() {
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [branchId, setBranchId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [applied, setApplied] = useState(false);

  const filters = applied
    ? { startDate: startDate || undefined, endDate: endDate || undefined, branchId: branchId || undefined, paymentMethod: paymentMethod || undefined }
    : undefined;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['sales-report', page, filters],
    queryFn: () => getSales(page, 20, filters),
    enabled: applied,
  });

  const summaryQuery = useQuery({
    queryKey: ['sales-summary', filters],
    queryFn: () => getSalesSummary(filters),
    enabled: applied,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: getBranches,
  });

  const applyFilters = useCallback(() => {
    setPage(1);
    setApplied(true);
  }, []);

  const clearFilters = useCallback(() => {
    setStartDate('');
    setEndDate('');
    setBranchId('');
    setPaymentMethod('');
    setApplied(false);
    setPage(1);
  }, []);

  const sales = data?.data || [];
  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;
  const summary = summaryQuery.data;

  return (
    <div className="p-4 sm:p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Sales Report</h1>

      {/* Filters */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="mb-1 text-xs font-medium text-gray-500">From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none text-sm min-h-[44px]"
            />
          </div>
          <div>
            <label className="mb-1 text-xs font-medium text-gray-500">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none text-sm min-h-[44px]"
            />
          </div>
          <div>
            <label className="mb-1 text-xs font-medium text-gray-500">Branch</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none text-sm min-h-[44px]"
            >
              <option value="">All Branches</option>
              {branches.map((b) => (
                <option key={b.serverId || b.id} value={b.serverId || b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 text-xs font-medium text-gray-500">Payment</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none text-sm min-h-[44px]"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={applyFilters}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 min-h-[44px]"
            >
              Apply
            </button>
            {applied && (
              <button
                onClick={clearFilters}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 min-h-[44px]"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {applied && summary && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-1 text-sm font-medium text-gray-500">Total Sales</div>
            <div className="text-2xl font-bold text-gray-900">{formatXAF(summary.totalSales)}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-1 text-sm font-medium text-gray-500">Total Items Sold</div>
            <div className="text-2xl font-bold text-gray-900">{summary.totalItems}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-1 text-sm font-medium text-gray-500">Average Transaction</div>
            <div className="text-2xl font-bold text-gray-900">{formatXAF(summary.avgTransaction)}</div>
          </div>
        </div>
      )}

      {/* Sales Table */}
      {!applied ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
          <svg className="mb-4 h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-lg font-medium text-gray-900">Select filters and click Apply</p>
          <p className="mt-1 text-sm text-gray-500">Choose a date range to view sales data</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-white" />
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-white" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
          <svg className="mb-4 h-12 w-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-lg font-semibold text-gray-900">Failed to load sales data</p>
          <button
            onClick={() => refetch()}
            className="mt-4 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 min-h-[44px]"
          >
            Retry
          </button>
        </div>
      ) : sales.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
          <svg className="mb-4 h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-lg font-medium text-gray-900">No sales found</p>
          <p className="mt-1 text-sm text-gray-500">No sales match the selected filters</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-4">Invoice</th>
                  <th className="px-5 py-4">Date</th>
                  <th className="px-5 py-4 text-right">Total</th>
                  <th className="px-5 py-4 text-right">Items</th>
                  <th className="px-5 py-4">Payment</th>
                  <th className="px-5 py-4">Cashier</th>
                  <th className="px-5 py-4">Branch</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-5 py-4 font-medium text-gray-900">{sale.invoiceNumber}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-gray-500">{formatDateTime(sale.createdAt)}</td>
                    <td className="px-5 py-4 text-right font-semibold text-gray-900">{formatXAF(sale.total)}</td>
                    <td className="px-5 py-4 text-right text-gray-600">{sale.itemCount}</td>
                    <td className="px-5 py-4">
                      <span className="capitalize text-gray-600">{sale.paymentMethod}</span>
                    </td>
                    <td className="px-5 py-4 text-gray-600">{sale.cashierName}</td>
                    <td className="px-5 py-4 text-gray-600">{sale.branchName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages} ({data?.total || 0} total)
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}