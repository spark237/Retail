import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getInventory } from '../api/services';
import type { ProductInventory } from '../api/services';

type LocationFilter = 'all' | 'branch' | 'warehouse';

export default function InventoryPage() {
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState<LocationFilter>('all');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['inventory'],
    queryFn: getInventory,
  });

  const filteredData = useMemo(() => {
    if (!data) return [];
    let result = data;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (item) =>
          item.productName.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q),
      );
    }

    if (locationFilter === 'branch') {
      result = result.filter((item) => item.branchStock > 0);
    } else if (locationFilter === 'warehouse') {
      result = result.filter((item) => item.warehouseStock > 0);
    }

    return result;
  }, [data, search, locationFilter]);

  // ---- Loading ----
  if (isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Inventory</h1>
        <div className="mb-4 space-y-3">
          <div className="h-12 w-full animate-pulse rounded-lg bg-gray-200" />
          <div className="flex gap-2">
            <div className="h-10 w-20 animate-pulse rounded-full bg-gray-200" />
            <div className="h-10 w-24 animate-pulse rounded-full bg-gray-200" />
            <div className="h-10 w-28 animate-pulse rounded-full bg-gray-200" />
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
        <p className="mb-2 text-lg font-semibold text-gray-900">Failed to load inventory</p>
        <p className="mb-4 text-sm text-gray-500">Unable to fetch stock data.</p>
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
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Inventory</h1>

      {/* Search and Filters */}
      <div className="mb-4 space-y-3">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product name or SKU..."
            className="block w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none text-base"
          />
        </div>

        <div className="flex gap-2">
          {(['all', 'branch', 'warehouse'] as const).map((loc) => (
            <button
              key={loc}
              onClick={() => setLocationFilter(loc)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors min-h-[40px] ${
                locationFilter === loc
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {loc === 'all' ? 'All' : loc === 'branch' ? 'Branch Stock' : 'Warehouse Stock'}
            </button>
          ))}
        </div>
      </div>

      {/* Data Table */}
      {filteredData.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center">
          <svg className="mb-4 h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <p className="text-lg font-medium text-gray-900">No stock at this location</p>
          <p className="mt-1 text-sm text-gray-500">
            {search ? 'Try a different search term' : 'No inventory records found'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-5 py-4">Product</th>
                <th className="px-5 py-4">SKU</th>
                <th className="px-5 py-4">Unit</th>
                <th className="px-5 py-4 text-right">Branch Stock</th>
                <th className="px-5 py-4 text-right">Warehouse Stock</th>
                <th className="px-5 py-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((item) => (
                <tr key={item.productId} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-4 font-medium text-gray-900">{item.productName}</td>
                  <td className="px-5 py-4 font-mono text-xs text-gray-500">{item.sku}</td>
                  <td className="px-5 py-4 text-gray-600">{item.unit}</td>
                  <td className={`px-5 py-4 text-right font-semibold ${item.branchStock <= 0 ? 'text-gray-400' : 'text-gray-900'}`}>
                    {item.branchStock}
                  </td>
                  <td className={`px-5 py-4 text-right font-semibold ${item.warehouseStock <= 0 ? 'text-gray-400' : 'text-gray-900'}`}>
                    {item.warehouseStock}
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-gray-900">{item.totalStock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}