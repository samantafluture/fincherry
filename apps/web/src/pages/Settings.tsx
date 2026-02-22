import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import {
  ACTIVE_CATEGORY_ROOTS,
  buildCategoryPathMap,
  buildGroupedCategoryOptions,
} from '@/lib/categoryPaths';

type CategoryTreeNode = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  isIncome: boolean;
  children?: CategoryTreeNode[];
};

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'accounts' | 'categories' | 'rules'>('accounts');

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--color-white)]">Settings</h1>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-fit">
        {(['accounts', 'categories', 'rules'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'bg-[var(--color-cherry-pink)] text-[var(--color-deep-blue)]'
                : 'text-[var(--color-muted)] hover:text-[var(--color-white)]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'accounts' && <AccountsSettings />}
      {activeTab === 'categories' && <CategoriesSettings />}
      {activeTab === 'rules' && <RulesSettings />}
    </div>
  );
}

function AccountsSettings() {
  const { data: accounts, refetch } = trpc.accounts.list.useQuery();
  const deleteAccount = trpc.accounts.delete.useMutation({ onSuccess: () => refetch() });

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            {['Name', 'Type', 'Institution', 'Currency', 'Balance (CAD)', 'Balance (Native)', ''].map((h) => (
              <th key={h} className="text-left px-4 py-3 text-[11px] font-medium tracking-wider uppercase text-[var(--color-muted)]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {accounts?.map((a) => (
            <tr key={a.id} className="border-b border-[var(--color-border)] last:border-0">
              <td className="px-4 py-3 text-[var(--color-white)]">{a.name}</td>
              <td className="px-4 py-3 text-[var(--color-muted)] text-xs capitalize">{a.type.replace('_', ' ')}</td>
              <td className="px-4 py-3 text-[var(--color-muted)] text-xs">{a.institution}</td>
              <td className="px-4 py-3 text-[var(--color-muted)] text-xs font-mono">{a.currency}</td>
              <td className="px-4 py-3 text-[var(--color-white)] text-xs font-mono">
                {((a as { currentBalanceCad?: number }).currentBalanceCad ?? 0).toFixed(2)}
              </td>
              <td className="px-4 py-3 text-[var(--color-muted)] text-xs font-mono">
                {((a as { currentBalanceNative?: number }).currentBalanceNative ?? 0).toFixed(2)}
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => deleteAccount.mutate({ id: a.id })}
                  className="text-[var(--color-muted)] hover:text-[var(--color-coral)] transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CategoriesSettings() {
  const utils = trpc.useUtils();
  const { data: categories } = trpc.categories.list.useQuery();
  const createCategory = trpc.categories.create.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.categories.list.invalidate(),
        utils.categories.listTree.invalidate(),
        utils.categories.listRules.invalidate(),
      ]);
      setCreateName('');
      setCreateParentId('');
      setCategoryError(null);
    },
    onError: (err) => setCategoryError(err.message),
  });
  const updateCategory = trpc.categories.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.categories.list.invalidate(),
        utils.categories.listTree.invalidate(),
        utils.categories.listRules.invalidate(),
      ]);
      setEditingId(null);
      setEditName('');
      setEditParentId('');
      setCategoryError(null);
    },
    onError: (err) => setCategoryError(err.message),
  });
  const deleteCategory = trpc.categories.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.categories.list.invalidate(),
        utils.categories.listTree.invalidate(),
        utils.categories.listRules.invalidate(),
      ]);
      setCategoryError(null);
    },
    onError: (err) => setCategoryError(err.message),
  });

  const [createName, setCreateName] = useState('');
  const [createParentId, setCreateParentId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editParentId, setEditParentId] = useState('');
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const categoryPathById = useMemo(
    () => buildCategoryPathMap(categories ?? []),
    [categories],
  );
  const groupedCategoryOptions = useMemo(
    () => buildGroupedCategoryOptions(categories ?? [], categoryPathById, { leafOnly: false }),
    [categories, categoryPathById],
  );

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, CategoryTreeNode[]>();
    for (const category of categories ?? []) {
      const key = category.parentId;
      const siblings = map.get(key) ?? [];
      siblings.push(category as CategoryTreeNode);
      map.set(key, siblings);
    }
    for (const [key, siblings] of map.entries()) {
      map.set(
        key,
        siblings.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
      );
    }
    return map;
  }, [categories]);

  const descendantsById = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const visit = (id: string): Set<string> => {
      const cached = map.get(id);
      if (cached) return cached;
      const desc = new Set<string>();
      const children = childrenByParent.get(id) ?? [];
      for (const child of children) {
        desc.add(child.id);
        for (const nested of visit(child.id)) desc.add(nested);
      }
      map.set(id, desc);
      return desc;
    };
    for (const category of categories ?? []) {
      visit(category.id);
    }
    return map;
  }, [categories, childrenByParent]);

  const tree = useMemo(() => {
    const build = (parentId: string | null): CategoryTreeNode[] => {
      return (childrenByParent.get(parentId) ?? []).map((node) => ({
        ...node,
        children: build(node.id),
      }));
    };
    return build(null).filter((root) => ACTIVE_CATEGORY_ROOTS.has(root.name));
  }, [childrenByParent]);

  const startEdit = (node: CategoryTreeNode) => {
    setEditingId(node.id);
    setEditName(node.name);
    setEditParentId(node.parentId ?? '');
    setCategoryError(null);
  };

  const submitCreate = () => {
    if (!createName.trim() || !createParentId) return;
    createCategory.mutate({
      name: createName.trim(),
      parentId: createParentId,
    });
  };

  const submitEdit = () => {
    if (!editingId || !editName.trim() || !editParentId) return;
    updateCategory.mutate({
      id: editingId,
      name: editName.trim(),
      parentId: editParentId,
    });
  };

  const renderNode = (node: CategoryTreeNode, depth = 0) => {
    const isRoot = node.parentId === null;
    const isEditing = editingId === node.id;
    const disallowed = new Set<string>([
      node.id,
      ...(descendantsById.get(node.id) ? Array.from(descendantsById.get(node.id)!) : []),
    ]);
    const parentOptionsForEdit = groupedCategoryOptions
      .map((group) => ({
        ...group,
        options: group.options.filter((option) => !disallowed.has(option.id)),
      }))
      .filter((group) => group.options.length > 0);

    return (
      <div key={node.id} className="space-y-1">
        <div
          className="flex items-center justify-between gap-2 rounded-lg hover:bg-[var(--color-surface-hover)] px-2 py-1.5"
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
        >
          <div className="min-w-0">
            <div
              className="text-sm truncate"
              style={{ color: depth === 0 ? 'var(--color-white)' : 'var(--color-muted)' }}
            >
              {node.name}
            </div>
            <div className="text-[10px] text-[var(--color-muted)] truncate">
              {categoryPathById.get(node.id)}
            </div>
          </div>
          {!isRoot && !isEditing && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => startEdit(node)}
                className="text-[var(--color-muted)] hover:text-[var(--color-soft-blue)]"
                title="Edit category"
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                onClick={() => {
                  const ok = window.confirm(
                    `Delete category "${node.name}"? This works only when no child category, rule, or transaction references it.`,
                  );
                  if (!ok) return;
                  deleteCategory.mutate({ id: node.id });
                }}
                className="text-[var(--color-muted)] hover:text-[var(--color-coral)]"
                title="Delete category"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>
        {isEditing && (
          <div
            className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-2"
            style={{ marginLeft: `${depth * 14 + 20}px` }}
          >
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--color-white)] focus:outline-none"
            />
            <select
              value={editParentId}
              onChange={(e) => setEditParentId(e.target.value)}
              className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--color-white)] focus:outline-none"
            >
              <option value="">Select parent</option>
              {parentOptionsForEdit.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={submitEdit}
                disabled={!editName.trim() || !editParentId || updateCategory.isPending}
                className="px-2 py-1 rounded-md text-xs bg-[var(--color-cherry-pink)] text-[var(--color-deep-blue)] disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setEditName('');
                  setEditParentId('');
                }}
                className="px-2 py-1 rounded-md text-xs bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-white)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {Array.isArray(node.children) && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 space-y-3">
        <h3 className="text-[11px] font-medium tracking-widest uppercase text-[var(--color-muted)]">
          Add Category
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
          <input
            placeholder="Category name (e.g. Printful)"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-white)] placeholder:text-[var(--color-muted)] focus:outline-none"
          />
          <select
            value={createParentId}
            onChange={(e) => setCreateParentId(e.target.value)}
            className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-white)] focus:outline-none"
          >
            <option value="">Select parent (required)</option>
            {groupedCategoryOptions.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            onClick={submitCreate}
            disabled={!createName.trim() || !createParentId || createCategory.isPending}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-[var(--color-cherry-pink)] text-[var(--color-deep-blue)] rounded-xl text-sm font-medium disabled:opacity-40"
          >
            <Plus size={14} /> Add
          </button>
        </div>
        {createParentId && (
          <p className="text-xs text-[var(--color-muted)]">
            Parent path: {categoryPathById.get(createParentId)}
          </p>
        )}
        {categoryError && (
          <p className="text-xs text-[var(--color-coral)]">{categoryError}</p>
        )}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 space-y-2">
        <h3 className="text-[11px] font-medium tracking-widest uppercase text-[var(--color-muted)]">
          Category Hierarchy
        </h3>
        {tree.length === 0 ? (
          <div className="text-sm text-[var(--color-muted)]">No categories found.</div>
        ) : (
          tree.map((cat) => renderNode(cat))
        )}
      </div>
    </div>
  );
}

function RulesSettings() {
  const utils = trpc.useUtils();
  const { data: rules } = trpc.categories.listRules.useQuery();
  const { data: accounts } = trpc.accounts.list.useQuery();
  const [ruleMessage, setRuleMessage] = useState<string | null>(null);
  const [recurringMessage, setRecurringMessage] = useState<string | null>(null);
  const [lookbackMonths, setLookbackMonths] = useState(24);
  const [recurringPreview, setRecurringPreview] = useState<
    {
      key: string;
      accountId: string;
      description: string;
      period: string;
      confidence: number;
      medianAmountCad: number;
      count: number;
      firstDate: string;
      lastDate: string;
      transactionIds: string[];
    }[]
  >([]);
  const deleteRule = trpc.categories.deleteRule.useMutation({
    onSuccess: async () => {
      await utils.categories.listRules.invalidate();
      setRuleMessage('Rule deleted.');
    },
  });
  const addRule = trpc.categories.addRule.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.categories.listRules.invalidate(),
        utils.transactions.list.invalidate(),
        utils.analytics.invalidate(),
        utils.accounts.list.invalidate(),
      ]);
      setPattern('');
      const appliedCount =
        typeof result === 'object' &&
        result &&
        'appliedCount' in result &&
        typeof result.appliedCount === 'number'
          ? result.appliedCount
          : 0;
      setRuleMessage(
        `Rule added. Applied to ${appliedCount} uncategorized transaction${appliedCount === 1 ? '' : 's'}.`,
      );
    },
    onError: (err) => setRuleMessage(err.message),
  });
  const applyRules = trpc.categories.applyRules.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.transactions.list.invalidate(),
        utils.analytics.invalidate(),
        utils.accounts.list.invalidate(),
        utils.categories.listRules.invalidate(),
      ]);
      setRuleMessage(
        `Applied rules to uncategorized transactions: ${result.updated} updated (scanned ${result.scanned}).`,
      );
    },
    onError: (err) => setRuleMessage(err.message),
  });
  const detectRecurring = trpc.transactions.detectRecurring.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.transactions.list.invalidate(),
        utils.analytics.invalidate(),
        utils.accounts.list.invalidate(),
      ]);
      setRecurringPreview(result.topCandidates);
      setRecurringMessage(
        `Scanned ${result.scanned} transactions and found ${result.detected} recurring transactions across ${result.groups} groups. Updated ${result.updated} new recurring flags.`,
      );
    },
    onError: (err) => setRecurringMessage(err.message),
  });
  const { data: cats } = trpc.categories.list.useQuery();
  const categoryPathById = useMemo(
    () => buildCategoryPathMap(cats ?? []),
    [cats],
  );
  const groupedCategoryOptions = useMemo(
    () => buildGroupedCategoryOptions(cats ?? [], categoryPathById, { leafOnly: false }),
    [cats, categoryPathById],
  );

  const [pattern, setPattern] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const accountNameById = useMemo(
    () => new Map((accounts ?? []).map((account) => [account.id, account.name])),
    [accounts],
  );

  return (
    <div className="space-y-4">
      {/* Add rule form */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 space-y-3">
        <h3 className="text-[11px] font-medium tracking-widest uppercase text-[var(--color-muted)]">
          Add Rule
        </h3>
        <div className="flex gap-2 flex-wrap">
          <input
            placeholder="Pattern (keyword or regex)"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className="flex-1 min-w-48 bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl px-4 py-2 text-sm text-[var(--color-white)] placeholder:text-[var(--color-muted)] focus:outline-none"
          />
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl px-4 py-2 text-sm text-[var(--color-white)] focus:outline-none"
          >
            <option value="">Category</option>
            {groupedCategoryOptions.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            onClick={() => addRule.mutate({ pattern, categoryId })}
            disabled={!pattern || !categoryId || addRule.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-cherry-pink)] text-[var(--color-deep-blue)] rounded-xl text-sm font-medium disabled:opacity-40 hover:opacity-90 transition"
          >
            <Plus size={14} /> Add
          </button>
          <button
            onClick={() => applyRules.mutate({ onlyUncategorized: true })}
            disabled={applyRules.isPending}
            className="px-4 py-2 bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-[var(--color-soft-blue)] rounded-xl text-sm font-medium disabled:opacity-40 hover:text-[var(--color-white)] transition-colors"
          >
            {applyRules.isPending ? 'Applying...' : 'Apply rules to uncategorized'}
          </button>
        </div>
        {ruleMessage && (
          <p className="text-xs text-[var(--color-muted)]">{ruleMessage}</p>
        )}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 space-y-3">
        <h3 className="text-[11px] font-medium tracking-widest uppercase text-[var(--color-muted)]">
          Recurring Detection
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-[var(--color-muted)]">
            Lookback (months)
          </label>
          <input
            type="number"
            min={1}
            max={60}
            value={lookbackMonths}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (!Number.isFinite(value)) return;
              setLookbackMonths(Math.max(1, Math.min(60, Math.round(value))));
            }}
            className="w-20 bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--color-white)] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => detectRecurring.mutate({ apply: true, lookbackMonths })}
            disabled={detectRecurring.isPending}
            className="px-4 py-2 bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-[var(--color-soft-blue)] rounded-xl text-sm font-medium disabled:opacity-40 hover:text-[var(--color-white)] transition-colors"
          >
            {detectRecurring.isPending ? 'Detecting...' : 'Detect recurring transactions'}
          </button>
        </div>
        <p className="text-xs text-[var(--color-muted)]">
          Detects repeated descriptions on consistent schedules (weekly/biweekly/monthly/quarterly) with similar amounts and flags them as recurring.
        </p>
        {recurringMessage && (
          <p className="text-xs text-[var(--color-muted)]">{recurringMessage}</p>
        )}
        {recurringPreview.length > 0 && (
          <div className="overflow-x-auto border border-[var(--color-border)] rounded-xl">
            <table className="w-full text-xs">
              <thead className="border-b border-[var(--color-border)]">
                <tr>
                  {['Description', 'Account', 'Period', 'Count', 'Confidence', 'Median (CAD)'].map(
                    (h) => (
                      <th
                        key={h}
                        className="text-left px-3 py-2 text-[10px] font-medium tracking-wider uppercase text-[var(--color-muted)]"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {recurringPreview.map((item) => (
                  <tr key={item.key} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-3 py-2 text-[var(--color-white)]">{item.description}</td>
                    <td className="px-3 py-2 text-[var(--color-muted)]">
                      {accountNameById.get(item.accountId) ?? 'Unknown'}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-muted)] capitalize">{item.period}</td>
                    <td className="px-3 py-2 text-[var(--color-muted)]">{item.count}</td>
                    <td className="px-3 py-2 text-[var(--color-muted)]">
                      {Math.round(item.confidence * 100)}%
                    </td>
                    <td className="px-3 py-2 text-[var(--color-muted)]">
                      {item.medianAmountCad.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rules list */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
        {!rules || rules.length === 0 ? (
          <div className="p-6 text-center text-sm text-[var(--color-muted)]">
            No rules yet. Rules auto-categorize transactions by keyword or regex.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {['Pattern', 'Category', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-medium tracking-wider uppercase text-[var(--color-muted)]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-[var(--color-white)]">{r.pattern}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-muted)]">
                    {(r.categoryId ? categoryPathById.get(r.categoryId) : null) ?? r.category?.name}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => deleteRule.mutate({ id: r.id })}
                      className="text-[var(--color-muted)] hover:text-[var(--color-coral)] transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
