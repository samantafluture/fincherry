import type { ParsedTransaction, StatementParser } from './types.js';

const TX_LINE_RE =
  /^(\d{2})\/(\d{2})\/(\d{4})(.+?)(-?\d{1,3}(?:\.\d{3})*,\d{2})$/;

function parseBrazilianAmount(raw: string): number {
  const normalized = raw
    .replace(/\s+/g, '')
    .replace(/\.(?=\d{3}(?:,|$))/g, '')
    .replace(',', '.');
  return Number(normalized);
}

function toIsoDate(day: string, month: string, year: string): string {
  return `${year}-${month}-${day}`;
}

function normalizeDescription(raw: string): string {
  return raw
    .replace(/\d{2}\/\d{2}$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export class ItauCheckingParser implements StatementParser {
  readonly institution = 'itaú';
  readonly accountType = 'checking';

  parse(text: string): ParsedTransaction[] {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const parsed: ParsedTransaction[] = [];

    for (const line of lines) {
      const m = line.match(TX_LINE_RE);
      if (!m) continue;

      const description = normalizeDescription(m[4] ?? '');
      if (!description || /saldo do dia/i.test(description)) continue;

      const amount = parseBrazilianAmount(m[5] ?? '0');
      if (!Number.isFinite(amount)) continue;

      parsed.push({
        date: toIsoDate(m[1]!, m[2]!, m[3]!),
        description,
        amount: Number(amount.toFixed(2)),
        currency: 'BRL',
      });
    }

    return parsed;
  }
}
