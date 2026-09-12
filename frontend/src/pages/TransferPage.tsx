import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getBranches } from '../api/services';
import { getProducts } from '../api/services';
import { createTransfer } from '../api/services';
import { useAuthStore } from '../stores/authStore';

interface TransferLineItem {
  productId: string;
  productName: string;
  quantity: number;
}

export default function TransferPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [sourceId, setSourceId] = useState('');
  const [destId, setDestId] = useState('');
  const [items, setItems] = useState<TransferLineItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');

  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: getBranches,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: getProducts,
  });

  // Find default warehouse branch
  const warehouses = useMemo(() => branches.filter((b) => b.isWarehouse), [branches]);
  const retailBranches = useMemo(() => branches.filter((b) => !b.isWarehouse), [branches]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!sourceId || !destId || items.length === 0) {
        throw new Error('Please fill in all required fields');
      }
      const sourceBranch = branches.find((b) => b.serverId === sourceId || String(b.id) === sourceId);
      const destBranch = branches.find((b) => b.serverId === destId || String(b.id) === destId);

      if (!sourceBranch || !destBranch) throw new Error('Invalid branch selection');

      return createTransfer({
        sourceLocationId: sourceId,
        sourceType: sourceBranch.isWarehouse ? 'warehouse' : 'branch',
        destinationLocationId: destId,
        destinationType: destBranch.isWarehouse ? 'warehouse' : 'branch',
        items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Transfer submitted successfully');
      setItems([]);
      setSelectedProductId('');
      setQuantity('1');
      setNotes('');
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to submit transfer');
    },
  });

  const availableProducts = useMemo(
    () => products.filter((p) => !items.find((i) => i.productId === (p.serverId || String(p.id)))),
    [products, items],
  );

  const addItem = () => {
    if (!selectedProductId) {
      toast.error('Please select a product');
      return;
    }
    const qty = parseInt(quantity, 10);
    if (!qty || qty <= 0) {
      toast.error('Quantity must be a positive number');
      return;
    }
    const product = products.find((p) => p.serverId === selectedProductId || String(p.id) === selectedProductId);
    if (!product) return;

    setItems((prev) => [
      ...prev,
      {
        productId: selectedProductId,
        productName: product.name,
        quantity: qty,
      },
    ]);
    setSelectedProductId('');
    setQuantity('1');
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((item) => item.productId !== productId));
  };

  const isFormValid = sourceId && destId && items.length > 0 && sourceId !== destId;

  if (branches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <svg className="mb-4 h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
        <p className="text-base font-medium text-gray-600">No branches configured</p>
        <p className="mt-1 text-sm text-gray-400">Please set up branches before making transfers</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Stock Transfer</h1>

      {/* Source / Destination */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Source</label>
          <select
            value={sourceId}
            onChange={(e) => {
              setSourceId(e.target.value);
              if (e.target.value === destId) setDestId('');
            }}
            className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none text-base min-h-[48px]"
          >
            <option value="">Select source...</option>
            {warehouses.map((b) => (
              <option key={b.serverId || b.id} value={b.serverId || b.id}>
                {b.name} (Warehouse)
              </option>
            ))}
            {retailBranches.map((b) => (
              <option key={b.serverId || b.id} value={b.serverId || b.id}>
                {b.name} (Branch)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Destination</label>
          <select
            value={destId}
            onChange={(e) => setDestId(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none text-base min-h-[48px]"
          >
            <option value="">Select destination...</option>
            {[...warehouses, ...retailBranches]
              .filter((b) => (b.serverId || String(b.id)) !== sourceId)
              .map((b) => (
                <option key={b.serverId || b.id} value={b.serverId || b.id}>
                  {b.name} {b.isWarehouse ? '(Warehouse)' : '(Branch)'}
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* Add Items */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Add Products</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 text-sm text-gray-600">Product</label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none text-sm min-h-[44px]"
            >
              <option value="">Select product...</option>
              {availableProducts.map((p) => (
                <option key={p.serverId || p.id} value={p.serverId || p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 text-sm text-gray-600">Quantity</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              min="1"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none text-sm min-h-[44px]"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={addItem}
              disabled={!selectedProductId}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              Add to Transfer
            </button>
          </div>
        </div>
      </div>

      {/* Items List */}
      {items.length > 0 && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-base font-semibold text-gray-900">Items ({items.length})</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {items.map((item) => (
              <div key={item.productId} className="flex items-center justify-between px-5 py-3">
                <div>
                  <span className="text-sm font-medium text-gray-900">{item.productName}</span>
                  <span className="ml-2 text-sm text-gray-500">× {item.quantity}</span>
                </div>
                <button
                  onClick={() => removeItem(item.productId)}
                  className="rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 min-h-[40px]"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="mb-6">
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none text-base"
          placeholder="Any additional notes..."
        />
      </div>

      {/* Submit */}
      <button
        onClick={() => mutation.mutate()}
        disabled={!isFormValid || mutation.isPending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[52px]"
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
          'Submit Transfer'
        )}
      </button>
    </div>
  );
}