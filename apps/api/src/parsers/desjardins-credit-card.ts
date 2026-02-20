import type { ParsedTransaction, StatementParser } from './types.js';

function parseAmount(raw: string): number {
  return Number(raw.replace(/,/g, ''));
}

function toIsoDate(day: number, month: number, year: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function extractStatementDate(text: string): { month: number; year: number } {
  const match = text.match(/STATEMENT DATE\s*(\d{2})(\d{2})(\d{4})/i);
  if (!match) {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
  }
  return { month: Number(match[2]), year: Number(match[3]) };
}

function normalizeDescription(raw: string): string {
  return raw.replace(/\s{2,}/g, ' ').trim();
}

type ExtractedRow = {
  txDay: number;
  txMonth: number;
  amount: number;
  isCredit: boolean;
  description: string;
};

function extractRows(lines: string[]): ExtractedRow[] {
  const rows: ExtractedRow[] = [];

  for (const line of lines) {
    const m = line.match(
      /^(\d{2})(\d{2})(\d{2})(\d{2})\d{0,2}(.+?)\s+(\d{1,3}(?:,\d{3})*\.\d{2})(CR)?$/,
    );
    if (!m) continue;

    rows.push({
      txDay: Number(m[1]),
      txMonth: Number(m[2]),
      description: normalizeDescription(m[5] ?? ''),
      amount: parseAmount(m[6] ?? '0'),
      isCredit: Boolean(m[7]),
    });
  }

  return rows;
}

export class DesjardinsCreditCardParser implements StatementParser {
  readonly institution = 'desjardins';
  readonly accountType = 'credit_card';

  parse(text: string): ParsedTransaction[] {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const { month: statementMonth, year: statementYear } = extractStatementDate(text);
    const rows = extractRows(lines);

    const parsed: ParsedTransaction[] = [];
    for (const row of rows) {
      // Keep only transaction lines from the statement month and skip payment credits.
      // Payments are already represented by checking-account transactions.
      if (row.txMonth !== statementMonth) continue;
      if (row.isCredit) continue;

      parsed.push({
        date: toIsoDate(row.txDay, row.txMonth, statementYear),
        description: row.description,
        amount: Number((-row.amount).toFixed(2)),
        currency: 'CAD',
      });
    }

    return parsed;
  }
}
