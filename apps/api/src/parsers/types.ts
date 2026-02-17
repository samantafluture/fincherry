export interface ParsedTransaction {
  date: string; // ISO date: YYYY-MM-DD
  description: string;
  amount: number; // negative = expense, positive = income
  currency: 'CAD' | 'BRL' | 'EUR' | 'USD';
}

export interface StatementParser {
  institution: string;
  accountType: string;
  parse(text: string): ParsedTransaction[];
}
