import type { ParsedTransaction, StatementParser } from './types.js';

const DATE_AMOUNT_RE =
  /^(\d{2})\.(\d{2})\.(\d{4})([+-])(\d{1,3}(?:\.\d{3})*,\d{2})€$/;

function parseEuroAmount(raw: string, sign: string): number {
  const normalized = raw.replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  return sign === '-' ? -value : value;
}

function normalizeDescription(raw: string): string {
  return raw.replace(/\s{2,}/g, ' ').trim();
}

function isNoiseLine(line: string): boolean {
  return (
    /^Valuta\b/i.test(line) ||
    /^Mastercard\b/i.test(line) ||
    /^Importo originario\b/i.test(line) ||
    /^Entrate\b/i.test(line) ||
    /^IBAN:/i.test(line) ||
    /^BIC:/i.test(line) ||
    /^N\.\s*\d+/i.test(line) ||
    /^\d+\s*\/\s*\d+$/i.test(line) ||
    /^Estratto conto/i.test(line) ||
    /^Emesso in data/i.test(line) ||
    /fino al/i.test(line)
  );
}

function pickDescription(lines: string[], amountLineIndex: number): string {
  for (let i = amountLineIndex - 1; i >= Math.max(0, amountLineIndex - 8); i--) {
    const candidate = lines[i]!;
    if (DATE_AMOUNT_RE.test(candidate)) break;
    if (isNoiseLine(candidate)) continue;
    if (!candidate) continue;
    return normalizeDescription(candidate);
  }
  return 'N26 transaction';
}

export class N26CheckingParser implements StatementParser {
  readonly institution = 'n26';
  readonly accountType = 'checking';

  parse(text: string): ParsedTransaction[] {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const parsed: ParsedTransaction[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const m = line.match(DATE_AMOUNT_RE);
      if (!m) continue;

      const amount = parseEuroAmount(m[5]!, m[4]!);
      if (!Number.isFinite(amount)) continue;

      parsed.push({
        date: `${m[3]}-${m[2]}-${m[1]}`,
        description: pickDescription(lines, i),
        amount: Number(amount.toFixed(2)),
        currency: 'EUR',
      });
    }

    return parsed;
  }
}
