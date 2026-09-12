import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { formatXAF, formatDate } from '../lib/format';
import {
  getDashboardKpis,
  getSalesTrend,
  getPaymentBreakdown,
  getRecentSales,
} from '../api/services';

const PIE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6'];

export default function DashboardPage() {
  const kpisQuery = useQuery({
    queryKey: ['dashboard-kpis'],
    queryFn: getDashboardKpis,
  });

  const salesTrendQuery = useQuery({
    queryKey: ['dashboard-sales-trend'],
    queryFn: getSalesTrend,
  });

  const paymentBreakdownQuery = useQuery({
    queryKey: ['dashboard-payment-breakdown'],
    queryFn: getPaymentBreakdown,
  });

  const recentSalesQuery = useQuery({
    queryKey: ['dashboard-recent-sales'],
    queryFn: getRecentSales,
  });

  const isLoading = kpisQuery.isLoading || salesTrendQuery.isLoading;
  const isError = kpisQuery.isError || salesTrendQuery.isError;

  const refetchAll = () => {
    kpisQuery.refetch();
    salesTrendQuery.refetch();
    paymentBreakdownQuery.refetch();
    recentSalesQuery.refetch();
  };

  // ---- Loading skeleton ----
  if (isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-5">
              <div className="mb-2 h-4 w-20 rounded bg-gray-200" />
              <div className="h-8 w-28 rounded bg-gray-200" />
            </div>
          ))}
        </div>
        <div className="mb-6 h-72 animate-pulse rounded-xl bg-white" />
        <div className="h-64 animate-pulse rounded-xl bg-white" />
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
        <p className="mb-2 text-lg font-semibold text-gray-900">Failed to load dashboard</p>
        <p className="mb-4 text-sm text-gray-500">Unable to fetch data. Please check your connection.</p>
        <button
          onClick={refetchAll}
          className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 min-h-[44px]"
        >
          Retry
        </button>
      </div>
    );
  }

  const kpis = kpisQuery.data;
  const salesTrend = salesTrendQuery.data || [];
  const paymentBreakdown = paymentBreakdownQuery.data || [];
  const recentSales = recentSalesQuery.data || [];

  return (
    <div className="p-4 sm:p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-1 text-sm font-medium text-gray-500">Today's Sales</div>
          <div className="text-2xl font-bold text-gray-900">
            {kpis ? formatXAF(kpis.todaySales) : '—'}
          </div>
          <div className="mt-1 text-xs text-gray-400">Revenue collected today</div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-1 text-sm font-medium text-gray-500">Pending Sync</div>
          <div className={`text-2xl font-bold ${kpis && kpis.pendingSync > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
            {kpis ? kpis.pendingSync : '—'}
          </div>
          <div className="mt-1 text-xs text-gray-400">Items waiting to sync</div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-1 text-sm font-medium text-gray-500">Open Shifts</div>
          <div className="text-2xl font-bold text-green-600">
            {kpis ? kpis.openShifts : '—'}
          </div>
          <div className="mt-1 text-xs text-gray-400">Shift(s) currently active</div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-1 text-sm font-medium text-gray-500">Active Alerts</div>
          <div className={`text-2xl font-bold ${kpis && kpis.activeAlerts > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {kpis ? kpis.activeAlerts : '—'}
          </div>
          <div className="mt-1 text-xs text-gray-400">Fraud/cash mismatch alerts</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Sales Trend Line Chart */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-3">
          <h2 className="mb-4 text-base font-semibold text-gray-900">7-Day Sales Trend</h2>
          {salesTrend.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-gray-400">
              <div className="text-center">
                <svg className="mx-auto mb-2 h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
                <p className="text-sm font-medium">No data yet</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={salesTrend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(v) => formatDate(v)} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: number) => [formatXAF(value), 'Sales']}
                  labelFormatter={(label) => formatDate(label)}
                />
                <Line type="monotone" dataKey="total" stroke="#3B82F6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Payment Breakdown Pie Chart */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Payment Methods</h2>
          {paymentBreakdown.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-gray-400">
              <div className="text-center">
                <svg className="mx-auto mb-2 h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm font-medium">No payment data</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={paymentBreakdown}
                  dataKey="total"
                  nameKey="method"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  innerRadius={50}
                  paddingAngle={3}
                >
                  {paymentBreakdown.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatXAF(value)} />
                <Legend
                  formatter={(value) => {
                    const labels: Record<string, string> = {
                      cash: 'Cash',
                      mtn: 'MTN MoMo',
                      orange: 'Orange Money',
                      bank: 'Bank Transfer',
                    };
                    return labels[value] || value;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">Recent Transactions</h2>
        </div>
        {recentSales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg className="mb-3 h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-base font-medium text-gray-600">No transactions yet</p>
            <p className="mt-1 text-sm text-gray-400">Sales will appear here once processed</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-3">Invoice</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">Payment</th>
                  <th className="px-5 py-3">Cashier</th>
                  <th className="px-5 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.map((sale) => (
                  <tr key={sale.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{sale.invoiceNumber}</td>
                    <td className="px-5 py-3 font-semibold text-gray-900">{formatXAF(sale.total)}</td>
                    <td className="px-5 py-3 text-gray-600 capitalize">{sale.paymentMethod}</td>
                    <td className="px-5 py-3 text-gray-600">{sale.cashierName}</td>
                    <td className="px-5 py-3 text-gray-500">{formatDate(sale.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}