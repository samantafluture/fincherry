/**
 * Rule-based auto-categorization service.
 * Matches transaction descriptions against user-defined keyword rules.
 */
import { desc, eq, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { categorizationRules, transactions } from '../db/schema.js';

type RuleRow = {
  pattern: string;
  categoryId: string;
};

class CategorizerService {
  private normalizeForLiteralMatch(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private matchesRule(description: string, pattern: string): boolean {
    const normalizedDescription = description.toLowerCase();

    // Regex support is kept for advanced rules.
    try {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(normalizedDescription)) return true;
    } catch {
      // Ignore invalid regex and continue to robust literal matching.
    }

    // Robust literal matching to tolerate spaces/punctuation/accents:
    // "UBEREATS" matches "UBER EATS", "CAFÉ" matches "CAFE", etc.
    const literalDescription = this.normalizeForLiteralMatch(description);
    const literalPattern = this.normalizeForLiteralMatch(pattern);
    if (!literalPattern) return false;
    if (literalDescription.includes(literalPattern)) return true;

    const compactDescription = literalDescription.replace(/\s+/g, '');
    const compactPattern = literalPattern.replace(/\s+/g, '');
    return compactPattern.length >= 3 && compactDescription.includes(compactPattern);
  }

  private async loadRules(): Promise<RuleRow[]> {
    const rules = await db.query.categorizationRules.findMany({
      columns: { pattern: true, categoryId: true },
      orderBy: desc(categorizationRules.priority),
    });
    return rules;
  }

  private matchDescriptionToRules(
    description: string,
    rules: RuleRow[],
  ): string | null {
    for (const rule of rules) {
      if (this.matchesRule(description, rule.pattern)) return rule.categoryId;
    }
    return null;
  }

  /** Return the category ID for a single description, or null if no rule matches. */
  async suggest(description: string): Promise<string | null> {
    const rules = await this.loadRules();
    return this.matchDescriptionToRules(description, rules);
  }

  async suggestBatch(descriptions: string[]): Promise<(string | null)[]> {
    const rules = await this.loadRules();

    return descriptions.map((description) =>
      this.matchDescriptionToRules(description, rules),
    );
  }

  async applyRuleToExistingTransactions(
    rule: RuleRow,
    options?: { onlyUncategorized?: boolean },
  ): Promise<number> {
    const onlyUncategorized = options?.onlyUncategorized ?? true;
    const rows = await db.query.transactions.findMany({
      columns: { id: true, description: true },
      where: onlyUncategorized ? isNull(transactions.categoryId) : undefined,
    });

    let updated = 0;
    for (const row of rows) {
      if (!this.matchesRule(row.description, rule.pattern)) continue;
      await db
        .update(transactions)
        .set({ categoryId: rule.categoryId, updatedAt: new Date() })
        .where(eq(transactions.id, row.id));
      updated++;
    }

    return updated;
  }

  async applyRulesToExistingTransactions(
    options?: { onlyUncategorized?: boolean },
  ): Promise<{ scanned: number; updated: number }> {
    const onlyUncategorized = options?.onlyUncategorized ?? true;
    const rules = await this.loadRules();
    if (rules.length === 0) return { scanned: 0, updated: 0 };

    const rows = await db.query.transactions.findMany({
      columns: { id: true, description: true, categoryId: true },
      where: onlyUncategorized ? isNull(transactions.categoryId) : undefined,
    });

    let updated = 0;
    for (const row of rows) {
      const matchedCategoryId = this.matchDescriptionToRules(row.description, rules);
      if (!matchedCategoryId) continue;
      if (row.categoryId === matchedCategoryId) continue;

      await db
        .update(transactions)
        .set({ categoryId: matchedCategoryId, updatedAt: new Date() })
        .where(eq(transactions.id, row.id));
      updated++;
    }

    return { scanned: rows.length, updated };
  }
}

export const categorizerService = new CategorizerService();
