type CategoryLike = {
  id: string;
  name: string;
  parentId: string | null;
};

export const ACTIVE_CATEGORY_ROOTS = new Set(['Income', 'Expense', 'Transfer', 'Other']);

export function isActiveCategoryPath(path: string): boolean {
  const root = path.split(' > ')[0] ?? path;
  return ACTIVE_CATEGORY_ROOTS.has(root);
}

export function buildCategoryPathMap(categories: CategoryLike[]): Map<string, string> {
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

export function getLeafCategoryIds(categories: CategoryLike[]): Set<string> {
  return new Set(
    categories
      .filter((category) => !categories.some((other) => other.parentId === category.id))
      .map((category) => category.id),
  );
}
