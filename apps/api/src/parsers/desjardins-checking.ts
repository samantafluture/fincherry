import type { ParsedTransaction, StatementParser } from './types.js';

function parseAmount(raw: string): number {
  return Number(raw.replace(/\s+/g, '').replace(/,/g, ''));
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s{2,}/g, ' ').trim();
}

function parseDate(dayText: string, year: number): string {
  const day = Number(dayText);
  return `${year}-01-${String(day).padStart(2, '0')}`;
}

function extractYear(text: string): number {
  const match = text.match(/From January 1 to January 31,\s*(\d{4})/i);
  return match ? Number(match[1]) : new Date().getFullYear();
}

function extractCodeRows(lines: string[]): Array<{ day: string; code: string }> {
  const rows: Array<{ day: string; code: string }> = [];
  for (const line of lines) {
    if (/^Balance forward$/i.test(line)) break;
    const m = line.match(/^JAN\s?(\d{1,2})([A-Z]{2,3})$/);
    if (!m) continue;
    rows.push({ day: m[1]!, code: m[2]! });
  }
  return rows;
}

function extractSectionLines(
  lines: string[],
  startAtIndex: number,
  endBefore: string,
): string[] {
  if (startAtIndex === -1) return [];
  const end = lines.findIndex((l, i) => i > startAtIndex && l === endBefore);
  if (end === -1) return lines.slice(startAtIndex + 1);
  return lines.slice(startAtIndex + 1, end);
}

function normalizePcaDescriptions(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (line === 'Mastercar' && out.length > 0) {
      out[out.length - 1] = `${out[out.length - 1]}d`;
      continue;
    }
    out.push(line);
  }
  return out.map(normalizeSpaces);
}

function extractPcaAmountRows(lines: string[]): Array<{ amount: number; balance: number }> {
  const out: Array<{ amount: number; balance: number }> = [];
  for (const line of lines) {
    const m = line.match(/^(\d{1,3}(?:\s\d{3})*(?:\.\d{2})?)\s+(\d{1,3}(?:\s\d{3})*\.\d{2})$/);
    if (!m) continue;
    out.push({ amount: parseAmount(m[1]!), balance: parseAmount(m[2]!) });
  }
  return out;
}

function extractTsAmountRows(lines: string[]): Array<{ amount: number; balance: number }> {
  const out: Array<{ amount: number; balance: number }> = [];
  for (const line of lines) {
    const m = line.match(/^(\d{1,3}(?:\s\d{3})*(?:\.\d{2})?)\s+(\d{1,3}(?:\s\d{3})*\.\d{2})$/);
    if (!m) continue;
    out.push({ amount: parseAmount(m[1]!), balance: parseAmount(m[2]!) });
  }
  return out;
}

function signFromBalanceDelta(previous: number, current: number, amount: number): number {
  const delta = Number((current - previous).toFixed(2));
  if (Math.abs(delta - amount) < 0.02) return amount;
  if (Math.abs(delta + amount) < 0.02) return -amount;
  return delta >= 0 ? amount : -amount;
}

export class DesjardinsCheckingParser implements StatementParser {
  readonly institution = 'desjardins';
  readonly accountType = 'checking';

  parse(text: string): ParsedTransaction[] {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const year = extractYear(text);
    const codeRows = extractCodeRows(lines);
    if (codeRows.length < 31) return [];

    const pcaCodes = codeRows.slice(0, 25);
    const tsCodes = codeRows.slice(25, 31);

    const balanceForwardIndexes = lines
      .map((line, idx) => ({ line, idx }))
      .filter((x) => x.line === 'Balance forward')
      .map((x) => x.idx);

    const firstBalanceForward = balanceForwardIndexes[0] ?? -1;
    const secondBalanceForward = balanceForwardIndexes[1] ?? -1;
    const periodMarker = lines.find((line) => /^From January 1 to January 31,\s*\d{4}$/i.test(line));

    const pcaDescriptionLines = extractSectionLines(lines, firstBalanceForward, 'Balance forward');
    const pcaDescriptions = normalizePcaDescriptions(pcaDescriptionLines).slice(0, 25);

    const allAmountRows = extractPcaAmountRows(lines);
    // PCA section: opening balance + 25 transaction rows
    const pcaOpening = allAmountRows[0]?.amount ?? 0;
    const pcaRows = allAmountRows.slice(1, 26);

    const tsDescriptionLines = extractSectionLines(lines, secondBalanceForward, periodMarker ?? '')
      .filter((line) => line !== 'Balance forward')
      .slice(0, 6)
      .map(normalizeSpaces);

    const savingsRows = extractTsAmountRows(lines).slice(26);
    // TS1 section: opening balance + 6 transaction rows
    const ts1Opening = savingsRows[0]?.amount ?? 0;
    const ts1Rows = savingsRows.slice(1, 7);

    // TS2 section: in some extracts the opening balance is omitted.
    const ts2Chunk = savingsRows.slice(7);
    const hasTs2Opening = ts2Chunk.length >= 7;
    const ts2Rows = hasTs2Opening ? ts2Chunk.slice(1, 7) : ts2Chunk.slice(0, 6);
    const ts2Opening =
      hasTs2Opening
        ? (ts2Chunk[0]?.amount ?? 0)
        : ((ts2Rows[0]?.balance ?? 0) - (ts2Rows[0]?.amount ?? 0));

    const parsed: ParsedTransaction[] = [];

    let pcaPrev = pcaOpening;
    for (let i = 0; i < Math.min(pcaCodes.length, pcaDescriptions.length, pcaRows.length); i++) {
      const code = pcaCodes[i]!;
      const desc = pcaDescriptions[i]!;
      const row = pcaRows[i]!;
      const signedAmount = signFromBalanceDelta(pcaPrev, row.balance, row.amount);
      parsed.push({
        date: parseDate(code.day, year),
        description: desc,
        amount: Number(signedAmount.toFixed(2)),
        currency: 'CAD',
      });
      pcaPrev = row.balance;
    }

    let ts1Prev = ts1Opening;
    for (let i = 0; i < Math.min(tsCodes.length, tsDescriptionLines.length, ts1Rows.length); i++) {
      const code = tsCodes[i]!;
      const desc = `${tsDescriptionLines[i]!} (TS 1)`;
      const row = ts1Rows[i]!;
      const signedAmount = signFromBalanceDelta(ts1Prev, row.balance, row.amount);
      parsed.push({
        date: parseDate(code.day, year),
        description: desc,
        amount: Number(signedAmount.toFixed(2)),
        currency: 'CAD',
      });
      ts1Prev = row.balance;
    }

    let ts2Prev = ts2Opening;
    for (let i = 0; i < Math.min(tsCodes.length, tsDescriptionLines.length, ts2Rows.length); i++) {
      const code = tsCodes[i]!;
      const desc = `${tsDescriptionLines[i]!} (TS 2)`;
      const row = ts2Rows[i]!;
      const signedAmount = signFromBalanceDelta(ts2Prev, row.balance, row.amount);
      parsed.push({
        date: parseDate(code.day, year),
        description: desc,
        amount: Number(signedAmount.toFixed(2)),
        currency: 'CAD',
      });
      ts2Prev = row.balance;
    }

    return parsed;
  }
}
