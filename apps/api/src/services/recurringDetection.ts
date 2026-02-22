type RecurringSourceTx = {
  id: string;
  accountId: string;
  date: string;
  description: string;
  amountCad: string;
  isRecurring: boolean;
};

type RecurringPeriod = {
  name: 'weekly' | 'biweekly' | 'monthly' | 'quarterly';
  days: number;
  toleranceDays: number;
};

export type RecurringCandidate = {
  key: string;
  accountId: string;
  description: string;
  period: RecurringPeriod['name'];
  confidence: number;
  medianAmountCad: number;
  count: number;
  firstDate: string;
  lastDate: string;
  transactionIds: string[];
};

const PERIODS: RecurringPeriod[] = [
  { name: 'weekly', days: 7, toleranceDays: 2 },
  { name: 'biweekly', days: 14, toleranceDays: 3 },
  { name: 'monthly', days: 30, toleranceDays: 6 },
  { name: 'quarterly', days: 90, toleranceDays: 10 },
];

function normalizeDescription(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\d+/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toDayNumber(isoDate: string): number {
  return Math.floor(new Date(`${isoDate}T00:00:00Z`).getTime() / 86400000);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1]! + sorted[mid]!) / 2;
  return sorted[mid]!;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildGroupKey(tx: RecurringSourceTx): string {
  const normalized = normalizeDescription(tx.description);
  const direction = Number(tx.amountCad) >= 0 ? 'in' : 'out';
  return `${tx.accountId}::${direction}::${normalized}`;
}

export function detectRecurringCandidates(
  transactions: RecurringSourceTx[],
): RecurringCandidate[] {
  const grouped = new Map<string, RecurringSourceTx[]>();

  for (const tx of transactions) {
    const normalized = normalizeDescription(tx.description);
    if (normalized.length < 3) continue;
    const key = buildGroupKey(tx);
    const list = grouped.get(key) ?? [];
    list.push(tx);
    grouped.set(key, list);
  }

  const candidates: RecurringCandidate[] = [];

  for (const [key, group] of grouped) {
    if (group.length < 3) continue;

    const ordered = [...group].sort((a, b) => a.date.localeCompare(b.date));
    const dayNumbers = ordered.map((tx) => toDayNumber(tx.date));
    const intervals: number[] = [];
    for (let i = 1; i < dayNumbers.length; i++) {
      intervals.push(dayNumbers[i]! - dayNumbers[i - 1]!);
    }
    if (intervals.length < 2) continue;

    let bestPeriod: RecurringPeriod | null = null;
    let bestIntervalMatch = 0;
    for (const period of PERIODS) {
      const matching = intervals.filter(
        (interval) => Math.abs(interval - period.days) <= period.toleranceDays,
      ).length;
      const ratio = matching / intervals.length;
      if (ratio > bestIntervalMatch) {
        bestIntervalMatch = ratio;
        bestPeriod = period;
      }
    }
    if (!bestPeriod || bestIntervalMatch < 0.66) continue;

    const spanDays = dayNumbers[dayNumbers.length - 1]! - dayNumbers[0]!;
    if (spanDays < bestPeriod.days * 2 - bestPeriod.toleranceDays) continue;

    const absAmounts = ordered.map((tx) => Math.abs(Number(tx.amountCad)));
    const medianAmount = median(absAmounts);
    if (medianAmount <= 0) continue;
    const toleranceAmount = Math.max(5, medianAmount * 0.12);
    const amountMatches = absAmounts.filter(
      (value) => Math.abs(value - medianAmount) <= toleranceAmount,
    ).length;
    const amountMatchRatio = amountMatches / absAmounts.length;
    if (amountMatchRatio < 0.75) continue;

    const confidence = Math.min(1, round2(bestIntervalMatch * 0.6 + amountMatchRatio * 0.4));
    candidates.push({
      key,
      accountId: ordered[0]!.accountId,
      description: ordered[0]!.description,
      period: bestPeriod.name,
      confidence,
      medianAmountCad: round2(medianAmount),
      count: ordered.length,
      firstDate: ordered[0]!.date,
      lastDate: ordered[ordered.length - 1]!.date,
      transactionIds: ordered.map((tx) => tx.id),
    });
  }

  return candidates.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.count - a.count;
  });
}
