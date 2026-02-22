import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { getDateRange, currentMonthLabel } from '@/lib/dateUtils';
import { formatCAD } from '@/lib/formatCurrency';
import { buildCategoryPathMap, buildGroupedCategoryOptions } from '@/lib/categoryPaths';
import { LazyWhenVisible } from '@/components/ui/LazyWhenVisible';

// ── Design tokens for charts ──────────────────────────────────────────
const C = {
  cherryPink: '#F472B6',
  sapphire: '#1A7A8A',
  softBlue: '#8B9EE0',
  coral: '#F97352',
  green: '#2DD4A0',
  deepBlue: '#0B1628',
  surface: '#0F2035',
  surfaceHover: '#142A42',
  muted: '#7A8BA8',
  border: '#1A2D45',
  white: '#F0F0EC',
};

const DATE_PRESETS = ['This month', '3 months', '6 months', 'YTD'] as const;
type DatePreset = (typeof DATE_PRESETS)[number];

const IncomeVsExpensesChart = lazy(() =>
  import('@/components/charts/IncomeVsExpensesChart').then((m) => ({
    default: m.IncomeVsExpensesChart,
  })),
);
const CategoryTrendsChart = lazy(() =>
  import('@/components/charts/CategoryTrendsChart').then((m) => ({
    default: m.CategoryTrendsChart,
  })),
);
const CategoryBreakdownChart = lazy(() =>
  import('@/components/charts/CategoryBreakdownChart').then((m) => ({
    default: m.CategoryBreakdownChart,
  })),
);

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-medium tracking-widest uppercase text-[var(--color-muted)] mb-3">
      {children}
    </h3>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 ${className}`}
    >
      {children}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 animate-pulse">
      <div className="h-3 w-24 bg-[var(--color-surface-hover)] rounded mb-3" />
      <div className="h-7 w-32 bg-[var(--color-surface-hover)] rounded mb-2" />
      <div className="h-3 w-20 bg-[var(--color-surface-hover)] rounded" />
    </div>
  );
}

function ChartSectionPlaceholder({ height }: { height: number }) {
  return (
    <div
      className="w-full animate-pulse rounded-xl bg-[var(--color-surface-hover)]/80"
      style={{ height }}
      aria-hidden
    />
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [preset, setPreset] = useState<DatePreset>('6 months');
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const categoryMenuRef = useRef<HTMLDivElement | null>(null);
  const { startDate, endDate } = getDateRange(preset);

  const accountIds = selectedAccountIds;
  const categoryIds = selectedCategoryIds;
  const analyticsInput = { startDate, endDate, accountIds, categoryIds };

  const { data: summary, isLoading: summaryLoading } = trpc.analytics.summary.useQuery({
    startDate,
    endDate,
    accountIds,
    categoryIds,
  });
  const { data: incomeVsExpense } = trpc.analytics.incomeVsExpense.useQuery(analyticsInput);
  const { data: byCategory } = trpc.analytics.byCategory.useQuery(analyticsInput);
  const { data: trends } = trpc.analytics.trends.useQuery(analyticsInput);
  const { data: budgetSummary } = trpc.budgets.summary.useQuery({
    startDate,
    endDate,
    accountIds,
  });
  const { data: recentTxs } = trpc.transactions.list.useQuery({
    limit: 8,
    sortBy: 'date',
    sortOrder: 'desc',
    accountIds,
    categoryIds,
    startDate,
    endDate,
  });
  const { data: goals } = trpc.goals.list.useQuery();
  const { data: accounts } = trpc.accounts.list.useQuery();
  const { data: categories } = trpc.categories.list.useQuery();
  const categoryPathById = useMemo(
    () => buildCategoryPathMap(categories ?? []),
    [categories],
  );
  const categoryFilterOptionGroups = useMemo(
    () => buildGroupedCategoryOptions(categories ?? [], categoryPathById, { leafOnly: false }),
    [categories, categoryPathById],
  );
  const filteredCategoryGroups = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return categoryFilterOptionGroups;
    return categoryFilterOptionGroups
      .map((group) => ({
        ...group,
        options: group.options.filter(
          (option) =>
            option.label.toLowerCase().includes(q) ||
            option.path.toLowerCase().includes(q) ||
            group.label.toLowerCase().includes(q),
        ),
      }))
      .filter((group) => group.options.length > 0);
  }, [categoryFilterOptionGroups, categorySearch]);
  const categoryPathByOptionId = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of categoryFilterOptionGroups) {
      for (const option of group.options) {
        map.set(option.id, option.path);
      }
    }
    return map;
  }, [categoryFilterOptionGroups]);

  const trendKeys = useMemo(() => {
    if (!trends || trends.length === 0) return [];
    return Object.keys(trends[0] ?? {}).filter((k) => k !== 'month');
  }, [trends]);
  const filteredAccounts = useMemo(() => {
    if (!accounts) return [];
    const q = accountSearch.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (account) =>
        account.name.toLowerCase().includes(q) ||
        account.institution.toLowerCase().includes(q),
    );
  }, [accounts, accountSearch]);
  const selectedAccountsLabel = useMemo(() => {
    if (!accounts || selectedAccountIds.length === 0) return 'All accounts';
    if (selectedAccountIds.length === 1) {
      const one = accounts.find((account) => account.id === selectedAccountIds[0]);
      return one?.name ?? '1 account';
    }
    return `${selectedAccountIds.length} accounts`;
  }, [accounts, selectedAccountIds]);
  const selectedCategoriesLabel = useMemo(() => {
    if (selectedCategoryIds.length === 0) return 'All categories';
    if (selectedCategoryIds.length === 1) {
      const path = categoryPathByOptionId.get(selectedCategoryIds[0] ?? '');
      return path ? path.replace(/ > /g, ' / ') : '1 category';
    }
    return `${selectedCategoryIds.length} categories`;
  }, [selectedCategoryIds, categoryPathByOptionId]);

  const toMonthBounds = (monthKey: string): { start: string; end: string } | null => {
    const match = monthKey.match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!year || !month) return null;
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
  };

  const goToTransactions = (params: Record<string, string | undefined>) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    navigate(`/transactions?${query.toString()}`);
  };
  const toggleAccount = (accountId: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(accountId)
        ? prev.filter((id) => id !== accountId)
        : [...prev, accountId],
    );
  };
  const toggleCategory = (categoryId: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId],
    );
  };

  useEffect(() => {
    if (!isAccountMenuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (accountMenuRef.current?.contains(target)) return;
      setIsAccountMenuOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isAccountMenuOpen]);

  useEffect(() => {
    if (!isCategoryMenuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (categoryMenuRef.current?.contains(target)) return;
      setIsCategoryMenuOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isCategoryMenuOpen]);

  const summaryCards = [
    {
      label: 'Income',
      value: formatCAD(summary?.income ?? 0),
      delta: summary?.deltas.income ?? 0,
      color: C.green,
      invert: false,
    },
    {
      label: 'Expenses',
      value: formatCAD(summary?.expenses ?? 0),
      delta: summary?.deltas.expenses ?? 0,
      color: C.coral,
      invert: true,
    },
    {
      label: 'Net Saved',
      value: formatCAD(summary?.netSaved ?? 0),
      delta: summary?.deltas.netSaved ?? 0,
      color: C.cherryPink,
      invert: false,
    },
    {
      label: 'Savings Rate',
      value: `${summary?.savingsRate ?? 0}%`,
      delta: null,
      color: C.softBlue,
      invert: false,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Date filter */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--color-muted)]">{currentMonthLabel()} · CAD base</p>
        <div className="flex gap-1.5 flex-wrap items-center">
          {DATE_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`px-3 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                preset === p
                  ? 'bg-[var(--color-cherry-pink)] text-[var(--color-deep-blue)]'
                  : 'bg-[var(--color-surface-hover)] text-[var(--color-muted)] hover:text-[var(--color-white)]'
              }`}
            >
              {p}
            </button>
          ))}
          <div ref={accountMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsAccountMenuOpen((prev) => !prev)}
              className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-[11px] text-[var(--color-white)] min-w-[150px] text-left"
            >
              Accounts: {selectedAccountsLabel}
            </button>
            {isAccountMenuOpen && (
              <div className="absolute z-20 mt-2 w-72 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-xl p-3 space-y-2">
                <input
                  type="search"
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  placeholder="Search account..."
                  className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--color-white)] placeholder:text-[var(--color-muted)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAccountIds([]);
                    setAccountSearch('');
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-md text-xs border bg-[var(--color-surface-hover)] text-[var(--color-muted)] border-[var(--color-border)] hover:text-[var(--color-white)]"
                >
                  Clear all account selections
                </button>
                <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                  {filteredAccounts.map((account) => {
                    const active = selectedAccountIds.includes(account.id);
                    return (
                      <label
                        key={account.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--color-surface-hover)] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => toggleAccount(account.id)}
                          className="accent-[var(--color-cherry-pink)]"
                        />
                        <span className="text-xs text-[var(--color-white)]">
                          {account.name}
                        </span>
                      </label>
                    );
                  })}
                  {filteredAccounts.length === 0 && (
                    <div className="px-2 py-2 text-xs text-[var(--color-muted)]">
                      No accounts match this search.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div ref={categoryMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsCategoryMenuOpen((prev) => !prev)}
              className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-[11px] text-[var(--color-white)] min-w-[170px] text-left"
            >
              Categories: {selectedCategoriesLabel}
            </button>
            {isCategoryMenuOpen && (
              <div className="absolute right-0 z-20 mt-2 w-80 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-xl p-3 space-y-2">
                <input
                  type="search"
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  placeholder="Search category..."
                  className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--color-white)] placeholder:text-[var(--color-muted)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategoryIds([]);
                    setCategorySearch('');
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-md text-xs border bg-[var(--color-surface-hover)] text-[var(--color-muted)] border-[var(--color-border)] hover:text-[var(--color-white)]"
                >
                  Clear all category selections
                </button>
                <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                  {filteredCategoryGroups.map((group) => (
                    <div key={group.label} className="space-y-1">
                      <div className="px-1 text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                        {group.label}
                      </div>
                      {group.options.map((option) => {
                        const active = selectedCategoryIds.includes(option.id);
                        return (
                          <label
                            key={option.id}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--color-surface-hover)] cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={() => toggleCategory(option.id)}
                              className="accent-[var(--color-cherry-pink)]"
                            />
                            <span className="text-xs text-[var(--color-white)]">
                              {option.label}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ))}
                  {filteredCategoryGroups.length === 0 && (
                    <div className="px-2 py-2 text-xs text-[var(--color-muted)]">
                      No categories match this search.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {summaryLoading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : summaryCards.map((c) => (
              <Card key={c.label} className="!p-4">
                <div className="text-[11px] font-medium tracking-widest uppercase text-[var(--color-muted)] mb-1.5">
                  {c.label}
                </div>
                <div
                  className="text-xl font-semibold font-mono"
                  style={{ color: c.color }}
                >
                  {c.value}
                </div>
                {c.delta !== null && (
                  <div
                    className="text-[11px] mt-1.5"
                    style={{ color: (c.invert ? c.delta <= 0 : c.delta >= 0) ? C.green : C.coral }}
                  >
                    {c.delta >= 0 ? '▲' : '▼'} {formatCAD(Math.abs(c.delta))} vs prev
                  </div>
                )}
              </Card>
            ))}
      </div>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Budget vs Actual</SectionTitle>
          <span className="text-[10px] text-[var(--color-muted)]">
            {budgetSummary?.startDate} to {budgetSummary?.endDate}
          </span>
        </div>
        {budgetSummary && budgetSummary.items.length > 0 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-hover)] px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                  Budget
                </div>
                <div className="text-sm font-mono text-[var(--color-white)]">
                  {formatCAD(budgetSummary.totals.budgetCad)}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-hover)] px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                  Actual
                </div>
                <div className="text-sm font-mono text-[var(--color-white)]">
                  {formatCAD(budgetSummary.totals.actualCad)}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-hover)] px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                  Utilization
                </div>
                <div
                  className="text-sm font-mono"
                  style={{
                    color:
                      budgetSummary.totals.utilizationPct <= 100 ? C.green : C.coral,
                  }}
                >
                  {budgetSummary.totals.utilizationPct.toFixed(1)}%
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              {budgetSummary.items.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg px-2.5 py-1.5 bg-[var(--color-surface-hover)]"
                >
                  <div className="min-w-0">
                    <div className="text-xs text-[var(--color-white)] truncate">
                      {item.categoryName}
                    </div>
                    <div className="text-[10px] text-[var(--color-muted)] font-mono">
                      {formatCAD(item.actualCad)} / {formatCAD(item.budgetCad)}
                    </div>
                  </div>
                  <div
                    className="text-xs font-semibold font-mono"
                    style={{ color: item.utilizationPct <= 100 ? C.green : C.coral }}
                  >
                    {item.utilizationPct.toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-24 flex items-center justify-center text-sm text-[var(--color-muted)]">
            No budgets yet. Add budgets in Settings → Budgets.
          </div>
        )}
      </Card>

      {/* Income vs Expenses chart */}
      <Card>
        <SectionTitle>Income vs Expenses</SectionTitle>
        {incomeVsExpense && incomeVsExpense.length > 0 ? (
          <LazyWhenVisible
            minHeight={200}
            placeholder={<ChartSectionPlaceholder height={200} />}
            rootMargin="220px"
          >
            <Suspense fallback={<ChartSectionPlaceholder height={200} />}>
              <IncomeVsExpensesChart
                data={incomeVsExpense}
                onMonthClick={(monthKey) => {
                  const bounds = toMonthBounds(monthKey);
                  if (!bounds) return;
                  goToTransactions({
                    startDate: bounds.start,
                    endDate: bounds.end,
                    accountIds: selectedAccountIds.length > 0 ? selectedAccountIds.join(',') : undefined,
                    categoryIds: selectedCategoryIds.length > 0 ? selectedCategoryIds.join(',') : undefined,
                  });
                }}
                resetKey={`${startDate}:${endDate}:${selectedAccountIds.join(',')}:${selectedCategoryIds.join(',')}`}
              />
            </Suspense>
          </LazyWhenVisible>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-sm text-[var(--color-muted)]">
            No data yet — upload a bank statement to get started
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Category Trends</SectionTitle>
        {trends && trends.length > 0 && trendKeys.length > 0 ? (
          <LazyWhenVisible
            minHeight={220}
            placeholder={<ChartSectionPlaceholder height={220} />}
            rootMargin="220px"
          >
            <Suspense fallback={<ChartSectionPlaceholder height={220} />}>
              <CategoryTrendsChart
                data={trends}
                trendKeys={trendKeys}
                resetKey={`${startDate}:${endDate}:${trendKeys.join('|')}`}
              />
            </Suspense>
          </LazyWhenVisible>
        ) : (
          <div className="h-[220px] flex items-center justify-center text-sm text-[var(--color-muted)]">
            Not enough trend data yet
          </div>
        )}
      </Card>

      {/* Category donut + Accounts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Category breakdown */}
        <Card>
          <SectionTitle>Where Your Money Goes</SectionTitle>
          {byCategory && byCategory.length > 0 ? (
            <div className="space-y-3">
              <div className="mx-auto w-full max-w-[220px]">
                <LazyWhenVisible
                  minHeight={150}
                  placeholder={<ChartSectionPlaceholder height={150} />}
                  rootMargin="220px"
                >
                  <Suspense fallback={<ChartSectionPlaceholder height={150} />}>
                    <CategoryBreakdownChart
                      data={byCategory}
                      onCategoryClick={(categoryId) => {
                        goToTransactions({
                          categoryId,
                          accountIds: selectedAccountIds.length > 0 ? selectedAccountIds.join(',') : undefined,
                          startDate,
                          endDate,
                        });
                      }}
                      resetKey={`${startDate}:${endDate}:${byCategory.length}`}
                    />
                  </Suspense>
                </LazyWhenVisible>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {byCategory.slice(0, 6).map((c) => (
                  <button
                    key={`${c.categoryId ?? 'uncat'}-${c.name}`}
                    type="button"
                    onClick={() => {
                        if (!c.categoryId) return;
                        goToTransactions({
                          categoryId: c.categoryId,
                          accountIds: selectedAccountIds.length > 0 ? selectedAccountIds.join(',') : undefined,
                          startDate,
                          endDate,
                        });
                    }}
                    className="w-full flex items-center justify-between text-[11px] hover:bg-[var(--color-surface-hover)] rounded-md px-1 py-0.5 transition-colors text-left"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div
                        className="w-2 h-2 rounded-sm shrink-0"
                        style={{ background: c.color ?? C.muted }}
                      />
                      <span className="text-[var(--color-white)] truncate">{c.name}</span>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <span className="text-[var(--color-muted)] font-mono">{c.pct}%</span>
                      <span className="text-[var(--color-white)] font-mono min-w-[68px] text-right">
                        {formatCAD(c.amount)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-sm text-[var(--color-muted)]">
              No spending data
            </div>
          )}
        </Card>

        {/* Accounts */}
        <Card>
          <SectionTitle>Accounts</SectionTitle>
          {accounts && accounts.length > 0 ? (
            <div className="space-y-2">
              {accounts.map((a) => {
                const balanceCad = (a as { currentBalanceCad?: number }).currentBalanceCad ?? 0;
                const balanceNative =
                  (a as { currentBalanceNative?: number }).currentBalanceNative ?? 0;

                return (
                  <div
                    key={a.id}
                    className="flex items-center justify-between px-3 py-2 bg-[var(--color-surface-hover)] rounded-xl"
                  >
                    <div>
                      <div className="text-sm font-medium text-[var(--color-white)]">{a.name}</div>
                      <div className="text-[10px] text-[var(--color-muted)]">{a.currency} · {a.institution}</div>
                    </div>
                    <div className="text-right">
                      <div
                        className="text-sm font-mono font-semibold"
                        style={{ color: balanceCad >= 0 ? C.green : C.coral }}
                      >
                        {formatCAD(balanceCad)}
                      </div>
                      <div className="text-[10px] text-[var(--color-muted)] font-mono">
                        {balanceNative.toFixed(2)} {a.currency}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-sm text-[var(--color-muted)]">
              No accounts yet
            </div>
          )}
        </Card>
      </div>

      {/* Recent transactions */}
      <Card>
        <SectionTitle>Recent Transactions</SectionTitle>
        {recentTxs?.data && recentTxs.data.length > 0 ? (
          <div className="space-y-0">
            {recentTxs.data.map((tx, i) => (
              <div
                key={tx.id}
                className="flex items-center justify-between py-2.5"
                style={{
                  borderBottom:
                    i < recentTxs.data.length - 1 ? `1px solid ${C.border}` : 'none',
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-[var(--color-white)] truncate">
                    {tx.description}
                  </div>
                  <div className="flex gap-1.5 mt-0.5 text-[10px] text-[var(--color-muted)]">
                    <span>{tx.date}</span>
                    <span>·</span>
                    <span>{tx.category?.name ?? 'Uncategorized'}</span>
                    <span>·</span>
                    <span>{tx.account?.name}</span>
                  </div>
                </div>
                <div className="ml-3 text-right shrink-0">
                  <div
                    className="text-sm font-semibold font-mono"
                    style={{ color: Number(tx.amountCad) > 0 ? C.green : C.white }}
                  >
                    {Number(tx.amountCad) > 0 ? '+' : ''}
                    {formatCAD(tx.amountCad)}
                  </div>
                  {tx.currency !== 'CAD' && (
                    <div className="text-[9px] text-[var(--color-soft-blue)] font-mono">
                      {tx.currency}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-[var(--color-muted)]">
            No transactions yet — upload your first bank statement
          </div>
        )}
      </Card>

      {/* Goals */}
      {goals && goals.length > 0 && (
        <Card>
          <SectionTitle>Savings Goals</SectionTitle>
          <div className="space-y-4">
            {goals.map((g) => {
              const current = Number(g.currentAmount);
              const target = Number(g.targetAmount);
              const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
              return (
                <div key={g.id}>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-sm font-medium text-[var(--color-white)]">{g.name}</span>
                    <span className="text-xs font-mono text-[var(--color-muted)]">
                      {formatCAD(current)} / {formatCAD(target)}
                    </span>
                  </div>
                  <div className="bg-[var(--color-deep-blue)] rounded-full h-5 overflow-hidden">
                    <div
                      className="h-full rounded-full flex items-center justify-end pr-2 transition-all duration-700"
                      style={{
                        width: `${pct}%`,
                        background: 'linear-gradient(135deg, #F472B6, #8B9EE0)',
                        minWidth: pct > 0 ? '2rem' : 0,
                      }}
                    >
                      <span className="text-[10px] font-bold text-[var(--color-deep-blue)]">
                        {pct}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
