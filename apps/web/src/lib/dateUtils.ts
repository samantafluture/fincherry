/** Get date range for common presets */
export function getDateRange(preset: string): { startDate: string; endDate: string } {
  const now = new Date();
  const today = now.toISOString().split('T')[0]!;

  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0]!;

  switch (preset) {
    case 'This month':
      return { startDate: firstOfMonth, endDate: today };

    case '3 months': {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 3);
      return { startDate: start.toISOString().split('T')[0]!, endDate: today };
    }

    case '6 months': {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 6);
      return { startDate: start.toISOString().split('T')[0]!, endDate: today };
    }

    case 'YTD':
      return {
        startDate: `${now.getFullYear()}-01-01`,
        endDate: today,
      };

    case 'All time':
      return { startDate: '2020-01-01', endDate: today };

    default:
      return { startDate: firstOfMonth, endDate: today };
  }
}

export function formatDate(dateStr: string, format: 'short' | 'medium' | 'long' = 'medium'): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (format === 'short') return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  if (format === 'long') return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function currentMonthLabel(): string {
  return new Date().toLocaleString('en-CA', { month: 'long', year: 'numeric' });
}
