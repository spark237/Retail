import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getProducts } from '../api/services';
import { getBranches } from '../api/services';
import { createDamageReport, getDamageReports } from '../api/services';
import { formatDate, formatXAF } from '../lib/format';

const DAMAGE_REASONS = [
  { value: 'broken', label: 'Broken / Cracked' },
  { value: 'defective', label: 'Defective' },
  { value: 'expired', label: 'Expired' },
  { value: 'other', label: 'Other' },
];

export default function DamagePage() {
  const queryClient = useQueryClient();

  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [locationId, setLocationId] = useState('');
  const [locationType, setLocationType] = useState<'branch' | 'warehouse'>('branch');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: getProducts,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: getBranches,
  });

  const { data: reports = [], isLoading: reportsLoading } = useQuery({
    queryKey: ['damage-reports'],
    queryFn: getDamageReports,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!productId || !quantity || !locationId || !reason) {
        throw new Error('Please fill all required fields');
      }
      const qty = parseInt(quantity, 10);
      if (!qty || qty <= 0) throw new Error('Quantity must be positive');
      return createDamageReport({
        productId,
        quantity: qty,
        locationId,
        locationType,
        reason,
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Damage report submitted');
      setProductId('');
      setQuantity('1');
      setNotes('');
      queryClient.invalidateQueries({ queryKey: ['damage-reports'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to submit report');
    },
  });

  const filteredBranches = branches.filter((b) =>
    locationType === 'warehouse' ? b.isWarehouse : !b.isWarehouse,
  );

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Damage Report</h1>

      {/* Form */}
      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Report Damaged Stock</h2>

        <div className="space-y-4">
          {/* Product */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Product *</label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none text-base min-h-[48px]"
            >
              <option value="">Select product...</option>
              {products.map((p) => (
                <option key={p.serverId || p.id} value={p.serverId || p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </select>
          </div>

          {/* Quantity */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Quantity *</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              min="1"
              className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none text-base min-h-[48px]"
            />
          </div>

          {/* Location Type */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Location Type *</label>
            <div className="flex gap-2">
              {(['branch', 'warehouse'] as const).map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => {
                    setLocationType(loc);
                    setLocationId('');
                  }}
                  className={`flex-1 rounded-lg px-4 py-3 text-sm font-medium min-h-[44px] transition-colors ${
                    locationType === loc
                      ? 'bg-blue-600 text-white'
                      : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {loc === 'branch' ? 'Branch' : 'Warehouse'}
                </button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Location *</label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none text-base min-h-[48px]"
            >
              <option value="">Select location...</option>
              {filteredBranches.map((b) => (
                <option key={b.serverId || b.id} value={b.serverId || b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Reason */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Reason *</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none text-base min-h-[48px]"
            >
              <option value="">Select reason...</option>
              {DAMAGE_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none text-base"
              placeholder="Additional details..."
            />
          </div>

          {/* Submit */}
          <button
            onClick={() => mutation.mutate()}
            disabled={!productId || !quantity || !locationId || !reason || mutation.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-6 py-3 text-base font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[52px]"
          >
            {mutation.isPending ? (
              <>
                <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Submitting...
              </>
            ) : (
              'Submit Damage Report'
            )}
          </button>
        </div>
      </div>

      {/* Recent Damage Reports */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">Recent Reports</h2>
        </div>

        {reportsLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg className="mb-3 h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="text-base font-medium text-gray-600">No damage reports yet</p>
            <p className="mt-1 text-sm text-gray-400">Submitted reports will appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {reports.map((report) => (
              <div key={report.id} className="px-5 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{report.productName}</div>
                    <div className="mt-1 text-sm text-gray-500">
                      {report.quantity} units — {DAMAGE_REASONS.find((r) => r.value === report.reason)?.label || report.reason}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-400">
                      {formatDate(report.createdAt)} by {report.reportedByName}
                    </div>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    report.locationType === 'warehouse'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {report.locationType === 'warehouse' ? 'Warehouse' : 'Branch'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}