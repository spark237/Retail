/**
 * Format a number as XAF currency.
 * Example: 12500 -> "12 500 XAF"
 */
export function formatXAF(amount: number): string {
  if (amount == null || isNaN(amount)) return '0 XAF';
  const formatted = Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${formatted} XAF`;
}

/**
 * Format a date to a readable string.
 */
export function formatDate(date: Date | number | string): string {
  const d = typeof date === 'number' || typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Format a date with time.
 */
export function formatDateTime(date: Date | number | string): string {
  const d = typeof date === 'number' || typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Generate a unique device ID and persist in localStorage.
 */
export function getOrCreateDeviceId(): string {
  let deviceId = localStorage.getItem('retailguard-device-id');
  if (!deviceId) {
    deviceId = crypto.randomUUID
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem('retailguard-device-id', deviceId);
  }
  return deviceId;
}

/**
 * Get status badge color class based on status string.
 */
export function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'open':
    case 'match':
    case 'active':
    case 'low':
      return 'bg-yellow-100 text-yellow-800';
    case 'closed':
    case 'resolved':
    case 'inactive':
      return 'bg-green-100 text-green-800';
    case 'medium':
      return 'bg-orange-100 text-orange-800';
    case 'high':
    case 'critical':
      return 'bg-red-100 text-red-800';
    case 'mismatch':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

/**
 * Truncate text with ellipsis.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}