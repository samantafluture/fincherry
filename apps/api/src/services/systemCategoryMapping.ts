import { db } from '../db/index.js';

const SYSTEM_CATEGORY_PATHS = {
  savingsTransfer: 'Transfer > Savings Transfer',
  creditCardPayment: 'Transfer > Credit Card Payment',
  interestDividends: 'Income > Interest & Dividends',
  readyToEatMeals: 'Expense > Food & Drink > Ready-to-Eat Meals',
  foodDelivery: 'Expense > Food & Drink > Food Delivery',
  thrift: 'Expense > Shopping > Thrift',
} as const;

type CategoryRow = {
  id: string;
  name: string;
  parentId: string | null;
};

function buildCategoryPathMap(categories: CategoryRow[]): Map<string, string> {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const pathById = new Map<string, string>();

  const getPath = (id: string): string => {
    const cached = pathById.get(id);
    if (cached) return cached;

    const category = byId.get(id);
    if (!category) return '';

    if (!category.parentId) {
      pathById.set(id, category.name);
      return category.name;
    }

    const parentPath = getPath(category.parentId);
    const path = parentPath ? `${parentPath} > ${category.name}` : category.name;
    pathById.set(id, path);
    return path;
  };

  for (const category of categories) {
    getPath(category.id);
  }

  return pathById;
}

export function normalizeTransferTag(description: string): 'ts1' | 'ts2' | null {
  if (/\bto\s+TS\s*1\b/i.test(description)) return 'ts1';
  if (/\bto\s+TS\s*2\b/i.test(description)) return 'ts2';
  return null;
}

export function inferSystemCategoryPath(description: string, amount: number): string | null {
  const normalized = description.toLowerCase();

  if (normalizeTransferTag(description)) {
    return SYSTEM_CATEGORY_PATHS.savingsTransfer;
  }

  if (
    amount < 0 &&
    /(\bbill\s+payment\b|credit\s*card\s*payment|mastercard\s*payment)/i.test(description)
  ) {
    return SYSTEM_CATEGORY_PATHS.creditCardPayment;
  }

  if (amount > 0 && /\b(dividend|interest)\b/i.test(description)) {
    return SYSTEM_CATEGORY_PATHS.interestDividends;
  }

  if (/cook\s*unity|cookunity/i.test(normalized)) {
    return SYSTEM_CATEGORY_PATHS.readyToEatMeals;
  }

  if (
    amount < 0 &&
    /(uber\s*eats|doordash|skip\s*the\s*dishes|foodora|\bfood\s*delivery\b|\bdelivery\b)/i.test(
      description,
    )
  ) {
    return SYSTEM_CATEGORY_PATHS.foodDelivery;
  }

  if (amount < 0 && /(renaissance|value\s*village|\bthrift\b)/i.test(description)) {
    return SYSTEM_CATEGORY_PATHS.thrift;
  }

  return null;
}

export async function resolveCategoryIdsByPath(paths: string[]): Promise<Map<string, string>> {
  const wantedPaths = new Set(paths);
  const all = await db.query.categories.findMany({
    columns: { id: true, name: true, parentId: true },
  });
  const pathById = buildCategoryPathMap(all);
  const idByPath = new Map<string, string>();

  for (const category of all) {
    const path = pathById.get(category.id);
    if (!path || !wantedPaths.has(path) || idByPath.has(path)) continue;
    idByPath.set(path, category.id);
  }

  return idByPath;
}

export { SYSTEM_CATEGORY_PATHS };
