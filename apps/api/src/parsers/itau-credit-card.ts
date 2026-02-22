import type { ParsedTransaction, StatementParser } from './types.js';

const START_TWO_DATE_RE = /^(\d{2})\/(\d{2})(.+?)(\d{2})\/(\d{2})(.*)$/;
const START_ONE_DATE_RE =
  /^(\d{2})\/(\d{2})(.+?)(-?\s?\d{1,3}(?:\.\d{3})*[.,]\d{2})$/;
const AMOUNT_AT_END_RE = /(-?\s?\d{1,3}(?:\.\d{3})*[.,]\d{2})$/;
const AMOUNT_ONLY_RE = /^-?\s?\d{1,3}(?:\.\d{3})*[.,]\d{2}$/;

function parseMoney(raw: string): number {
  const normalized = raw
    .replace(/\s+/g, '')
    .replace(/\.(?=\d{3}(?:[.,]|$))/g, '')
    .replace(',', '.');
  return Number(normalized);
}

function normalizeDescription(raw: string): string {
  return raw.replace(/\s{2,}/g, ' ').trim();
}

function extractStatementMonthYear(text: string): { month: number; year: number } {
  const m = text.match(/Emissão:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  if (!m) {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
  }
  return { month: Number(m[2]), year: Number(m[3]) };
}

function yearForMonth(statementMonth: number, statementYear: number, txMonth: number): number {
  if (txMonth > statementMonth + 1) return statementYear - 1;
  return statementYear;
}

export class ItauCreditCardParser implements StatementParser {
  readonly institution = 'itaú';
  readonly accountType = 'credit_card';

  parse(text: string): ParsedTransaction[] {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const { month: statementMonth, year: statementYear } =
      extractStatementMonthYear(text);

    const startIndex = lines.findIndex((line) =>
      /total dos lançamentos atuais/i.test(line),
    );
    const endIndex = lines.findIndex(
      (line, idx) => idx > startIndex && /^PC\s*-\s*\d+/i.test(line),
    );
    const scopedLines =
      startIndex >= 0
        ? lines.slice(startIndex + 1, endIndex > startIndex ? endIndex : undefined)
        : lines;

    const parsed: ParsedTransaction[] = [];

    for (let i = 0; i < scopedLines.length; i++) {
      const line = scopedLines[i]!;
      if (!/^\d{2}\/\d{2}/.test(line)) continue;
      if (!/[A-Za-zÀ-ÿ]/.test(line)) continue;

      let txDay: string | null = null;
      let txMonth: string | null = null;
      let description = '';
      let amountRaw: string | null = null;

      const twoDate = line.match(START_TWO_DATE_RE);
      if (twoDate) {
        txDay = twoDate[1]!;
        txMonth = twoDate[2]!;
        description = normalizeDescription(twoDate[3] ?? '');
        const tail = normalizeDescription(twoDate[6] ?? '');

        const inlineAmount = tail.match(AMOUNT_AT_END_RE);
        if (inlineAmount) {
          amountRaw = inlineAmount[1]!;
          const tailDesc = normalizeDescription(
            tail.slice(0, Math.max(0, tail.length - amountRaw.length)),
          );
          if (tailDesc) description = normalizeDescription(`${description} ${tailDesc}`);
        } else if (tail) {
          description = normalizeDescription(`${description} ${tail}`);
        }
      } else {
        const oneDate = line.match(START_ONE_DATE_RE);
        if (!oneDate) continue;
        txDay = oneDate[1]!;
        txMonth = oneDate[2]!;
        description = normalizeDescription(oneDate[3] ?? '');
        amountRaw = oneDate[4]!;
      }

      if (!amountRaw) {
        for (let j = i + 1; j < Math.min(scopedLines.length, i + 5); j++) {
          const next = scopedLines[j]!;
          if (/^\d{2}\/\d{2}/.test(next)) break;
          if (AMOUNT_ONLY_RE.test(next)) {
            amountRaw = next;
            i = j;
            break;
          }
          description = normalizeDescription(`${description} ${next}`);
        }
      }

      if (!txDay || !txMonth || !amountRaw) continue;
      if (!description) continue;

      const rawValue = parseMoney(amountRaw);
      if (!Number.isFinite(rawValue) || rawValue === 0) continue;

      // Credit-card convention in FinCherry: debits are negative, credits are positive.
      const signedAmount = Number((-rawValue).toFixed(2));
      const monthNumber = Number(txMonth);
      const year = yearForMonth(statementMonth, statementYear, monthNumber);
      const isoDate = `${year}-${txMonth}-${txDay}`;

      parsed.push({
        date: isoDate,
        description,
        amount: signedAmount,
        currency: 'BRL',
      });
    }

    return parsed;
  }
}
