import type { ParsedTransaction, StatementParser } from './types.js';

const ROW_START_RE = /^(\d{3})([A-Za-z]{3})\s?(\d{1,2})([A-Za-z]{3})\s?(\d{1,2})(.*)$/;
const AMOUNT_ONLY_RE = /^-?\d{1,3}(?:,\d{3})*\.\d{2}-?$/;
const AMOUNT_AT_END_RE = /(-?\d{1,3}(?:,\d{3})*\.\d{2}-?)$/;

const MONTH_TO_NUMBER: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function normalizeDescription(raw: string): string {
  return raw.replace(/\s{2,}/g, ' ').trim();
}

function parseStatementMonthYear(text: string): { month: number; year: number } {
  const m = text.match(/StatementDate\s*([A-Za-z]{3})\s+\d{1,2},\s*(\d{4})/i);
  if (!m) {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
  }
  const month = MONTH_TO_NUMBER[(m[1] ?? '').slice(0, 3).toLowerCase()] ?? 1;
  return { month, year: Number(m[2]) };
}

function yearForMonth(statementMonth: number, statementYear: number, txMonth: number): number {
  if (txMonth > statementMonth + 1) return statementYear - 1;
  return statementYear;
}

function parseAmount(raw: string): number {
  const trimmed = raw.trim();
  const isCredit = trimmed.endsWith('-') || trimmed.startsWith('-');
  const numeric = Number(trimmed.replace(/-/g, '').replace(/,/g, ''));
  return isCredit ? -numeric : numeric;
}

function isHeaderNoise(line: string): boolean {
  return (
    /^REF\.#/i.test(line) ||
    /^TRANS\./i.test(line) ||
    /^DATE$/i.test(line) ||
    /^POST$/i.test(line) ||
    /^DETAILS/i.test(line) ||
    /^Continued on next page$/i.test(line) ||
    /^Transactions-continued$/i.test(line) ||
    /^StatementPeriod$/i.test(line) ||
    /^StatementDate$/i.test(line) ||
    /^Account#$/i.test(line) ||
    /^Page$/i.test(line)
  );
}

export class ScotiabankCreditCardParser implements StatementParser {
  readonly institution = 'scotiabank';
  readonly accountType = 'credit_card';

  parse(text: string): ParsedTransaction[] {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const { month: statementMonth, year: statementYear } =
      parseStatementMonthYear(text);

    const parsed: ParsedTransaction[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const row = line.match(ROW_START_RE);
      if (!row) continue;

      const txMonthToken = (row[2] ?? '').slice(0, 3).toLowerCase();
      const txMonth = MONTH_TO_NUMBER[txMonthToken];
      if (!txMonth) continue;

      const txDay = Number(row[3]);
      if (!Number.isFinite(txDay)) continue;

      let description = normalizeDescription(row[6] ?? '');
      let amountRaw: string | null = null;

      const inlineAmount = description.match(AMOUNT_AT_END_RE);
      if (inlineAmount) {
        amountRaw = inlineAmount[1]!;
        description = normalizeDescription(
          description.slice(0, Math.max(0, description.length - amountRaw.length)),
        );
      }

      if (!amountRaw) {
        for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
          const next = lines[j]!;
          if (ROW_START_RE.test(next)) break;
          if (isHeaderNoise(next)) continue;
          if (AMOUNT_ONLY_RE.test(next)) {
            amountRaw = next;
            i = j;
            break;
          }
          description = normalizeDescription(`${description} ${next}`);
        }
      }

      if (!amountRaw || !description) continue;
      if (/^SUB-TOTAL\b/i.test(description)) continue;
      if (/^PAYMENT - THANK YOU/i.test(description)) continue;

      const rawAmount = parseAmount(amountRaw);
      if (!Number.isFinite(rawAmount) || rawAmount === 0) continue;

      // Credit-card convention in FinCherry: debits are negative, credits are positive.
      const amount = Number((-rawAmount).toFixed(2));
      const year = yearForMonth(statementMonth, statementYear, txMonth);
      const isoDate = `${year}-${String(txMonth).padStart(2, '0')}-${String(txDay).padStart(2, '0')}`;

      parsed.push({
        date: isoDate,
        description,
        amount,
        currency: 'CAD',
      });
    }

    return parsed;
  }
}
