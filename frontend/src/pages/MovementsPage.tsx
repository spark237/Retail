import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMovements } from '../api/services';
import { formatDateTime } from '../lib/format';

export default function MovementsPage() {
  const [page, setPage] = useState(1);
  const [productSearch, setProductSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['movements', page, productSearch, startDate, endDate],
    queryFn: () =>
      getMovements(page, 30, {
        productSearch: productSearch || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
  });

  const handleSearch = useCallback(() => {
    setPage(1);
    refetch();
  }, [refetch]);

  const getTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      purchase: 'bg-green-100 text-green-700',
      sale: 'bg-blue-100 text-blue-700',
      transfer: 'bg-amber-100 text-amber-700',
      adjustment: 'bg-purple-100 text-purple-700',
      damage: 'bg-red-100 text-red-700',
    };
    return styles[type] || 'bg-gray-100 text-gray-700';
  };

  // ---- Loading ----
  if (isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Stock Movements</h1>
        <div className="mb-4 space-y-3">
          <div className="h-12 w-full animate-pulse rounded-lg bg-gray-200" />
          <div className="flex gap-2">
            <div className="h-10 w-36 animate-pulse rounded-lg bg-gray-200" />
            <div className="h-10 w-36 animate-pulse rounded-lg bg-gray-200" />
          </div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
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
        <p className="mb-2 text-lg font-semibold text-gray-900">Failed to load movements</p>
        <p className="mb-4 text-sm text-gray-500">Unable to fetch movement records.</p>
        <button
          onClick={() => refetch()}
          className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 min-h-[44px]"
        >
          Retry
        </button>
      </div>
    );
  }

  const movements = data?.data || [];
  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <div className="p-4 sm:p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Stock Movements</h1>

      {/* Filters */}
      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 text-xs font-medium text-gray-500">Search Product</label>
            <input
              type="text"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Product name or SKU..."
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none text-sm min-h-[44px]"
            />
          </div>
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
          <div className="flex items-end">
            <button
              onClick={handleSearch}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 min-h-[44px]"
            >
              Search
            </button>
          </div>
        </div>
      </div>

      {/* Movements Table */}
      {movements.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
          <svg className="mb-4 h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <p className="text-lg font-medium text-gray-900">No movements recorded</p>
          <p className="mt-1 text-sm text-gray-500">
            {productSearch || startDate
              ? 'Try adjusting your search criteria'
              : 'Stock movements will appear here when products are sold, transferred, or adjusted'}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-4">Date</th>
                  <th className="px-5 py-4">Product</th>
                  <th className="px-5 py-4">Type</th>
                  <th className="px-5 py-4 text-right">Quantity</th>
                  <th className="px-5 py-4">Location</th>
                  <th className="px-5 py-4">User</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="whitespace-nowrap px-5 py-4 text-gray-500">
                      {formatDateTime(movement.date)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-gray-900">{movement.productName}</div>
                      <div className="text-xs text-gray-400 font-mono">{movement.productSku}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${getTypeBadge(movement.type)}`}>
                        {movement.type}
                      </span>
                    </td>
                    <td className={`px-5 py-4 text-right font-semibold ${
                      movement.type === 'purchase' || movement.type === 'transfer'
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}>
                      {movement.type === 'purchase' || movement.type === 'transfer' ? '+' : '-'}
                      {Math.abs(movement.quantity)}
                    </td>
                    <td className="px-5 py-4 text-gray-600">{movement.locationName}</td>
                    <td className="px-5 py-4 text-gray-600">{movement.userName}</td>
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
                Page {page} of {totalPages}
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