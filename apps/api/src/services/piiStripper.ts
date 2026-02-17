/**
 * PII stripper — anonymizes transaction data before sending to Claude API.
 * Keeps: dates, CAD amounts, category names, flags (recurring, income/expense).
 * Removes: merchant names, account numbers, addresses, descriptions.
 */
import type { Transaction, Category } from '../db/schema.js';

export interface AnonymizedTransaction {
  date: string;
  amountCad: number;
  category: string;
  isIncome: boolean;
  isRecurring: boolean;
  month: string; // YYYY-MM
}

type TransactionWithCategory = Transaction & {
  category?: Category | null;
};

export function stripPII(transactions: TransactionWithCategory[]): AnonymizedTransaction[] {
  return transactions.map((tx) => ({
    date: tx.date,
    amountCad: Math.abs(Number(tx.amountCad)),
    category: tx.category?.name ?? 'Uncategorized',
    isIncome: Number(tx.amountCad) > 0,
    isRecurring: tx.isRecurring,
    month: tx.date.substring(0, 7),
  }));
}
