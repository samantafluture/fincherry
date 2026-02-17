type Currency = 'CAD' | 'BRL' | 'EUR' | 'USD';

/** Format an amount as a currency string. Uses JetBrains Mono when rendered. */
export function formatCurrency(
  amount: number | string,
  currency: Currency = 'CAD',
  options?: { showSign?: boolean; compact?: boolean },
): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  const abs = Math.abs(n);
  const locale = currency === 'CAD' ? 'en-CA' : currency === 'BRL' ? 'pt-BR' : 'de-DE';

  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: options?.compact && abs >= 10000 ? 'compact' : 'standard',
    minimumFractionDigits: 0,
    maximumFractionDigits: abs < 100 ? 2 : 0,
  }).format(abs);

  if (options?.showSign) {
    return n >= 0 ? `+${formatted}` : `-${formatted}`;
  }

  return n < 0 ? `-${formatted}` : formatted;
}

export function formatCAD(amount: number | string, compact = false): string {
  return formatCurrency(amount, 'CAD', { compact });
}

export function formatDelta(delta: number): { text: string; positive: boolean } {
  return {
    text: `${delta >= 0 ? '▲' : '▼'} ${formatCAD(Math.abs(delta))}`,
    positive: delta >= 0,
  };
}

export const currencySymbol: Record<Currency, string> = {
  CAD: '$',
  BRL: 'R$',
  EUR: '€',
  USD: 'US$',
};
