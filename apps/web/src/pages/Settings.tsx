import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import {
  buildCategoryPathMap,
  getLeafCategoryIds,
  isActiveCategoryPath,
} from '@/lib/categoryPaths';

type CategoryTreeNode = {
  id: string;
  name: string;
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
            {['Name', 'Type', 'Institution', 'Currency', ''].map((h) => (
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
  const { data: tree } = trpc.categories.listTree.useQuery();

  const renderNode = (node: CategoryTreeNode, depth = 0) => (
    <div key={node.id} className="space-y-1">
      <div
        className="text-sm"
        style={{
          color: depth === 0 ? 'var(--color-white)' : 'var(--color-muted)',
          paddingLeft: `${depth * 14}px`,
        }}
      >
        {depth > 0 ? '└ ' : ''}
        {node.name}
      </div>
      {Array.isArray(node.children) &&
        node.children.map((child) => renderNode(child, depth + 1))}
    </div>
  );

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 space-y-3">
      {tree?.map((cat) => renderNode(cat as CategoryTreeNode))}
    </div>
  );
}

function RulesSettings() {
  const { data: rules, refetch } = trpc.categories.listRules.useQuery();
  const deleteRule = trpc.categories.deleteRule.useMutation({ onSuccess: () => refetch() });
  const addRule = trpc.categories.addRule.useMutation({ onSuccess: () => { refetch(); setPattern(''); } });
  const { data: cats } = trpc.categories.list.useQuery();
  const categoryPathById = useMemo(
    () => buildCategoryPathMap(cats ?? []),
    [cats],
  );
  const leafCategoryIds = useMemo(
    () => getLeafCategoryIds(cats ?? []),
    [cats],
  );
  const selectableCategories = useMemo(
    () =>
      (cats ?? [])
        .filter((category) => {
          if (!leafCategoryIds.has(category.id)) return false;
          const path = categoryPathById.get(category.id) ?? category.name;
          return isActiveCategoryPath(path);
        })
        .sort((a, b) =>
          (categoryPathById.get(a.id) ?? a.name).localeCompare(
            categoryPathById.get(b.id) ?? b.name,
          ),
        ),
    [cats, leafCategoryIds, categoryPathById],
  );

  const [pattern, setPattern] = useState('');
  const [categoryId, setCategoryId] = useState('');

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
            {selectableCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryPathById.get(c.id) ?? c.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => addRule.mutate({ pattern, categoryId })}
            disabled={!pattern || !categoryId || addRule.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-cherry-pink)] text-[var(--color-deep-blue)] rounded-xl text-sm font-medium disabled:opacity-40 hover:opacity-90 transition"
          >
            <Plus size={14} /> Add
          </button>
        </div>
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
