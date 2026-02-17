/**
 * Rule-based auto-categorization service.
 * Matches transaction descriptions against user-defined keyword rules.
 */
import { desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { categorizationRules } from '../db/schema.js';

class CategorizerService {
  /** Return the category ID for a single description, or null if no rule matches. */
  async suggest(description: string): Promise<string | null> {
    const rules = await db.query.categorizationRules.findMany({
      orderBy: desc(categorizationRules.priority),
    });

    const normalized = description.toLowerCase();

    for (const rule of rules) {
      try {
        // Treat pattern as regex first, then fall back to plain keyword
        const regex = new RegExp(rule.pattern, 'i');
        if (regex.test(normalized)) {
          return rule.categoryId;
        }
      } catch {
        // Invalid regex — fall back to substring match
        if (normalized.includes(rule.pattern.toLowerCase())) {
          return rule.categoryId;
        }
      }
    }

    return null;
  }

  async suggestBatch(descriptions: string[]): Promise<(string | null)[]> {
    const rules = await db.query.categorizationRules.findMany({
      orderBy: desc(categorizationRules.priority),
    });

    return descriptions.map((desc) => {
      const normalized = desc.toLowerCase();
      for (const rule of rules) {
        try {
          const regex = new RegExp(rule.pattern, 'i');
          if (regex.test(normalized)) return rule.categoryId;
        } catch {
          if (normalized.includes(rule.pattern.toLowerCase())) return rule.categoryId;
        }
      }
      return null;
    });
  }
}

export const categorizerService = new CategorizerService();
