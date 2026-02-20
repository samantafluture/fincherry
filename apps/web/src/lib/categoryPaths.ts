type CategoryLike = {
  id: string;
  name: string;
  parentId: string | null;
};

export type GroupedCategoryOption = {
  id: string;
  label: string;
  path: string;
  isParent: boolean;
};

export type CategoryOptionGroup = {
  label: string;
  options: GroupedCategoryOption[];
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

export function buildGroupedCategoryOptions(
  categories: CategoryLike[],
  pathById: Map<string, string>,
  options?: { leafOnly?: boolean },
): CategoryOptionGroup[] {
  const leafOnly = options?.leafOnly ?? false;
  const leafIds = getLeafCategoryIds(categories);

  const groups = new Map<string, CategoryOptionGroup>();

  for (const category of categories) {
    const path = pathById.get(category.id) ?? category.name;
    if (!isActiveCategoryPath(path)) continue;
    if (leafOnly && !leafIds.has(category.id)) continue;

    const segments = path.split(' > ');
    const leafLabel = segments[segments.length - 1] ?? category.name;
    const groupLabel = segments.slice(0, -1).join(' / ') || 'Top Level';
    const isParent = categories.some((other) => other.parentId === category.id);

    if (!groups.has(groupLabel)) {
      groups.set(groupLabel, { label: groupLabel, options: [] });
    }

    groups.get(groupLabel)!.options.push({
      id: category.id,
      label: isParent ? `${leafLabel} (All)` : leafLabel,
      path,
      isParent,
    });
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      options: group.options.sort((a, b) => a.path.localeCompare(b.path)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
