import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { formatXAF, getOrCreateDeviceId } from '../lib/format';
import { useAuthStore } from '../stores/authStore';
import {
  getProducts,
  getProductCategories,
  getBranches,
  getCurrentShift,
  openShift,
  createSale,
} from '../api/services';
import type { Product } from '../lib/db';

// ============================================================
// Types
// ============================================================

interface CartItem {
  productId: string;
  name: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  total: number;
}

type PaymentMethod = 'cash' | 'mtn' | 'orange' | 'bank';

interface PaymentState {
  method: PaymentMethod;
  cashReceived: string;
  momoPhone: string;
  bankReference: string;
}

// ============================================================
// Key constant for categories
// ============================================================
const CATEGORY_ALL = '__all__';

// ============================================================
// Component
// ============================================================

export default function PosPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const branchId = user?.branchId || '';
  const cashierId = user?.id || '';

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(CATEGORY_ALL);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSale, setLastSale] = useState<{
    invoiceNumber: string;
    items: CartItem[];
    subtotal: number;
    total: number;
    paymentMethod: string;
    changeAmount: number;
    cashReceived: number;
  } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [payment, setPayment] = useState<PaymentState>({
    method: 'cash',
    cashReceived: '',
    momoPhone: '',
    bankReference: '',
  });

  // ---- Data fetching ----
  const {
    data: products = [],
    isLoading: productsLoading,
    isError: productsError,
    refetch: refetchProducts,
  } = useQuery({
    queryKey: ['products'],
    queryFn: getProducts,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['product-categories'],
    queryFn: getProductCategories,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: getBranches,
  });

  const {
    data: currentShift,
    isLoading: shiftLoading,
    refetch: refetchShift,
  } = useQuery({
    queryKey: ['current-shift', branchId, cashierId],
    queryFn: () => getCurrentShift(branchId, cashierId),
    enabled: !!branchId && !!cashierId,
  });

  const [openingBalance, setOpeningBalance] = useState('0');
  const [showOpenShift, setShowOpenShift] = useState(false);

  const openShiftMutation = useMutation({
    mutationFn: () => openShift(branchId, Number(openingBalance) || 0),
    onSuccess: () => {
      toast.success('Shift opened successfully');
      setShowOpenShift(false);
      refetchShift();
    },
    onError: () => {
      toast.error('Failed to open shift');
    },
  });

  const saleMutation = useMutation({
    mutationFn: () => {
      const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
      return createSale({
        items: cart,
        subtotal,
        discount: 0,
        total: subtotal,
        paymentMethod: payment.method,
        cashReceived: Number(payment.cashReceived) || 0,
        changeAmount: payment.method === 'cash' ? Math.max(0, Number(payment.cashReceived) - subtotal) : 0,
        momoPhone: payment.momoPhone || undefined,
        bankReference: payment.bankReference || undefined,
        branchId,
        shiftId: currentShift?.id || null,
      });
    },
    onSuccess: (data) => {
      const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
      setLastSale({
        invoiceNumber: data.invoiceNumber || `SALE-${Date.now()}`,
        items: [...cart],
        subtotal,
        total: subtotal,
        paymentMethod: payment.method,
        changeAmount: payment.method === 'cash' ? Math.max(0, Number(payment.cashReceived) - subtotal) : 0,
        cashReceived: Number(payment.cashReceived) || 0,
      });
      setShowReceipt(true);
      setCart([]);
      setPayment({ method: 'cash', cashReceived: '', momoPhone: '', bankReference: '' });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Sale completed!');
    },
    onError: () => {
      toast.error('Failed to complete sale. Please try again.');
    },
  });

  // ---- Derived data ----
  const filteredProducts = useMemo(() => {
    let result = products;
    if (activeCategory !== CATEGORY_ALL) {
      result = result.filter((p) => p.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
      );
    }
    return result;
  }, [products, activeCategory, search]);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.total, 0), [cart]);
  const changeDue = useMemo(() => {
    if (payment.method !== 'cash') return 0;
    return Math.max(0, Number(payment.cashReceived) - subtotal);
  }, [payment.method, payment.cashReceived, subtotal]);

  // ---- Handlers ----
  const addToCart = useCallback(
    (product: Product) => {
      setCart((prev) => {
        const existing = prev.find((item) => item.productId === (product.serverId || String(product.id)));
        if (existing) {
          return prev.map((item) =>
            item.productId === (product.serverId || String(product.id))
              ? {
                  ...item,
                  quantity: item.quantity + 1,
                  total: (item.quantity + 1) * item.unitPrice,
                }
              : item,
          );
        }
        return [
          ...prev,
          {
            productId: product.serverId || String(product.id),
            name: product.name,
            unit: product.unit,
            unitPrice: product.price,
            quantity: 1,
            total: product.price,
          },
        ];
      });
    },
    [],
  );

  const updateQuantity = useCallback((productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.productId === productId
            ? { ...item, quantity: Math.max(0, item.quantity + delta), total: Math.max(0, item.quantity + delta) * item.unitPrice }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setPayment({ method: 'cash', cashReceived: '', momoPhone: '', bankReference: '' });
  }, []);

  const isSaleValid = useMemo(() => {
    if (cart.length === 0) return false;
    if (!currentShift || currentShift.status !== 'open') return false;
    if (payment.method === 'cash' && (!payment.cashReceived || Number(payment.cashReceived) < subtotal)) return false;
    if (payment.method === 'mtn' && !payment.momoPhone) return false;
    if (payment.method === 'orange' && !payment.momoPhone) return false;
    if (payment.method === 'bank' && !payment.bankReference) return false;
    return true;
  }, [cart, currentShift, payment, subtotal]);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // F1-F4 for categories
      if (e.key === 'F1') { e.preventDefault(); setActiveCategory(CATEGORY_ALL); }
      if (e.key === 'F2' && categories.length > 0) { e.preventDefault(); setActiveCategory(categories[0]); }
      if (e.key === 'F3' && categories.length > 1) { e.preventDefault(); setActiveCategory(categories[1]); }
      if (e.key === 'F4' && categories.length > 2) { e.preventDefault(); setActiveCategory(categories[2]); }
      // Escape to clear search / close receipt
      if (e.key === 'Escape') {
        if (showReceipt) setShowReceipt(false);
        else if (search) setSearch('');
        else searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [categories, search, showReceipt]);

  // ---- Render helpers ----
  const renderSkeletonGrid = () => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 h-4 w-3/4 rounded bg-gray-200" />
          <div className="mb-2 h-6 w-1/2 rounded bg-gray-200" />
          <div className="h-4 w-1/3 rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );

  const renderOpenShiftModal = () => {
    if (!showOpenShift) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
          <h2 className="mb-4 text-lg font-bold text-gray-900">Open New Shift</h2>
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Opening Balance (XAF)</label>
            <input
              type="number"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
              placeholder="0"
              min="0"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowOpenShift(false)}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={() => openShiftMutation.mutate()}
              disabled={openShiftMutation.isPending}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
            >
              {openShiftMutation.isPending ? 'Opening...' : 'Open Shift'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderReceiptModal = () => {
    if (!showReceipt || !lastSale) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
          <div className="mb-4 text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900">Sale Complete</h2>
            <p className="text-sm text-gray-500">{lastSale.invoiceNumber}</p>
          </div>
          <div className="mb-4 border-t border-b border-gray-100 py-3">
            {lastSale.items.map((item, i) => (
              <div key={i} className="flex justify-between py-1 text-sm">
                <span className="text-gray-700">
                  {item.name} × {item.quantity}
                </span>
                <span className="font-medium text-gray-900">{formatXAF(item.total)}</span>
              </div>
            ))}
          </div>
          <div className="mb-4 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="text-gray-900">{formatXAF(lastSale.subtotal)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold">
              <span className="text-gray-900">Total</span>
              <span className="text-blue-600">{formatXAF(lastSale.total)}</span>
            </div>
            {lastSale.paymentMethod === 'cash' && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Cash</span>
                  <span className="text-gray-900">{formatXAF(lastSale.cashReceived)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Change</span>
                  <span className="text-green-600">{formatXAF(lastSale.changeAmount)}</span>
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => setShowReceipt(false)}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 min-h-[44px]"
          >
            New Sale
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Shift Banner */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2 sm:px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-900">POS</h1>
          {shiftLoading ? (
            <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
          ) : currentShift && currentShift.status === 'open' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-0.5 text-xs font-medium text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Shift Open
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-0.5 text-xs font-medium text-red-700">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              No Active Shift
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(!currentShift || currentShift.status !== 'open') && (
            <button
              onClick={() => setShowOpenShift(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 min-h-[40px]"
            >
              Open Shift
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Left: Products */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Search & Categories */}
          <div className="border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
            {/* Search */}
            <div className="relative mb-3">
              <svg className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products by name or SKU..."
                className="block w-full rounded-lg border border-gray-300 bg-gray-50 pl-10 pr-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none text-base"
              />
            </div>

            {/* Category chips */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              <button
                onClick={() => setActiveCategory(CATEGORY_ALL)}
                className={`flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors min-h-[40px] ${
                  activeCategory === CATEGORY_ALL
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors min-h-[40px] ${
                    activeCategory === cat
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {productsLoading ? (
              renderSkeletonGrid()
            ) : productsError ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <svg className="mb-4 h-12 w-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <p className="mb-2 text-lg font-medium text-gray-900">Failed to load products</p>
                <p className="mb-4 text-sm text-gray-500">Check your connection and try again</p>
                <button
                  onClick={() => refetchProducts()}
                  className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 min-h-[44px]"
                >
                  Retry
                </button>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <svg className="mb-4 h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <p className="text-lg font-medium text-gray-900">No products found</p>
                <p className="text-sm text-gray-500">
                  {search ? 'Try a different search term' : 'No products in this category'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {filteredProducts.map((product) => (
                  <button
                    key={product.serverId || product.id}
                    onClick={() => addToCart(product)}
                    disabled={!currentShift || currentShift.status !== 'open'}
                    className="group rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed min-h-[120px]"
                  >
                    <div className="mb-1 text-xs font-medium text-blue-600 uppercase tracking-wider">
                      {product.category}
                    </div>
                    <div className="mb-1 font-semibold text-gray-900 group-hover:text-blue-700">
                      {product.name}
                    </div>
                    <div className="text-lg font-bold text-gray-900">
                      {formatXAF(product.price)}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {product.unit}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Cart Panel */}
        <div className="flex w-full flex-col border-t border-gray-200 bg-white lg:w-96 lg:border-t-0 lg:border-l">
          {/* Cart Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h2 className="text-lg font-bold text-gray-900">
              Cart ({cart.length})
            </h2>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 min-h-[40px]"
              >
                Clear
              </button>
            )}
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto px-4 py-2">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <svg className="mb-3 h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                </svg>
                <p className="text-sm text-gray-500">Cart is empty</p>
                <p className="text-xs text-gray-400">Tap a product to add it</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((item) => (
                  <div key={item.productId} className="flex items-center gap-2 rounded-lg border border-gray-100 p-3">
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium text-gray-900">{item.name}</div>
                      <div className="text-xs text-gray-500">{formatXAF(item.unitPrice)} per {item.unit}</div>
                      <div className="mt-1 font-semibold text-gray-900">{formatXAF(item.total)}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateQuantity(item.productId, -1)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                        </svg>
                      </button>
                      <span className="w-8 text-center text-base font-semibold text-gray-900">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.productId, 1)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                      <button
                        onClick={() => removeFromCart(item.productId)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payment & Totals */}
          {cart.length > 0 && (
            <div className="border-t border-gray-200 px-4 py-3">
              {/* Totals */}
              <div className="mb-3 space-y-1">
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Subtotal</span>
                  <span>{formatXAF(subtotal)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold text-gray-900">
                  <span>Total</span>
                  <span className="text-blue-600">{formatXAF(subtotal)}</span>
                </div>
              </div>

              {/* Payment Method Tabs */}
              <div className="mb-3 grid grid-cols-2 gap-2">
                {(['cash', 'mtn', 'orange', 'bank'] as const).map((method) => (
                  <button
                    key={method}
                    onClick={() => setPayment((prev) => ({ ...prev, method }))}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-[44px] ${
                      payment.method === method
                        ? 'bg-blue-600 text-white'
                        : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {method === 'cash' ? 'Cash' : method === 'mtn' ? 'MTN MoMo' : method === 'orange' ? 'Orange Money' : 'Bank Transfer'}
                  </button>
                ))}
              </div>

              {/* Payment Inputs */}
              {payment.method === 'cash' && (
                <div className="mb-3">
                  <label className="mb-1 text-sm font-medium text-gray-700">Amount Tendered</label>
                  <input
                    type="number"
                    value={payment.cashReceived}
                    onChange={(e) => setPayment((prev) => ({ ...prev, cashReceived: e.target.value }))}
                    placeholder="Enter cash amount"
                    className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none text-base"
                  />
                  {Number(payment.cashReceived) >= subtotal && (
                    <p className="mt-1 text-sm text-green-600 font-medium">
                      Change due: {formatXAF(changeDue)}
                    </p>
                  )}
                </div>
              )}

              {(payment.method === 'mtn' || payment.method === 'orange') && (
                <div className="mb-3">
                  <label className="mb-1 text-sm font-medium text-gray-700">
                    {payment.method === 'mtn' ? 'MTN MoMo' : 'Orange Money'} Phone Number
                  </label>
                  <input
                    type="tel"
                    value={payment.momoPhone}
                    onChange={(e) => setPayment((prev) => ({ ...prev, momoPhone: e.target.value }))}
                    placeholder="6XXXXXXXX"
                    maxLength={9}
                    className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none text-base"
                  />
                </div>
              )}

              {payment.method === 'bank' && (
                <div className="mb-3">
                  <label className="mb-1 text-sm font-medium text-gray-700">Bank Reference</label>
                  <input
                    type="text"
                    value={payment.bankReference}
                    onChange={(e) => setPayment((prev) => ({ ...prev, bankReference: e.target.value }))}
                    placeholder="Transaction reference number"
                    className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none text-base"
                  />
                </div>
              )}

              {/* Complete Sale Button */}
              <button
                onClick={() => saleMutation.mutate()}
                disabled={!isSaleValid || saleMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[52px]"
              >
                {saleMutation.isPending ? (
                  <>
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Processing...
                  </>
                ) : (
                  `Complete Sale (${formatXAF(subtotal)})`
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {renderOpenShiftModal()}
      {renderReceiptModal()}
    </div>
  );
}