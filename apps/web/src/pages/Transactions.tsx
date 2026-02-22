import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { formatCAD, currencySymbol } from '@/lib/formatCurrency';
import {
  buildCategoryPathMap,
  buildGroupedCategoryOptions,
} from '@/lib/categoryPaths';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/toast';

function formatPathForDisplay(path: string): string {
  return path.replace(/ > /g, ' / ');
}

type Currency = 'CAD' | 'BRL' | 'EUR';

type TxDraft = {
  id?: string;
  date: string;
  description: string;
  amount: string;
  currency: Currency;
  accountId: string;
  categoryId: string;
};

function downloadCsv(filename: string, csv: string, mimeType = 'text/csv;charset=utf-8') {
  const blob = new Blob([csv], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const DEFAULT_ROWS_PER_PAGE = 50;
const LARGE_ROWS_THRESHOLD = 120;
const VIRTUAL_ROW_HEIGHT = 78;

export function TransactionsPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_ROWS_PER_PAGE);
  const [accountId, setAccountId] = useState<string | undefined>(
    searchParams.get('accountId') ?? undefined,
  );
  const [accountIds, setAccountIds] = useState<string[]>(
    (searchParams.get('accountIds') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
  const [activeCategoryId, setActiveCategoryId] = useState<string | undefined>(
    searchParams.get('categoryId') ?? undefined,
  );
  const [activeCategoryIds, setActiveCategoryIds] = useState<string[]>(
    (searchParams.get('categoryIds') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
  const [startDate, setStartDate] = useState<string | undefined>(
    searchParams.get('startDate') ?? undefined,
  );
  const [endDate, setEndDate] = useState<string | undefined>(
    searchParams.get('endDate') ?? undefined,
  );
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [draft, setDraft] = useState<TxDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(540);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const categoryMenuRef = useRef<HTMLDivElement | null>(null);
  const tableViewportRef = useRef<HTMLDivElement | null>(null);
  const searchParamsKey = searchParams.toString();

  useEffect(() => {
    setAccountId(searchParams.get('accountId') ?? undefined);
    setAccountIds(
      (searchParams.get('accountIds') ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    );
    setActiveCategoryId(searchParams.get('categoryId') ?? undefined);
    setActiveCategoryIds(
      (searchParams.get('categoryIds') ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    );
    setStartDate(searchParams.get('startDate') ?? undefined);
    setEndDate(searchParams.get('endDate') ?? undefined);
    setPage(1);
  }, [searchParamsKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const node = tableViewportRef.current;
    if (!node) return;
    node.scrollTop = 0;
    setScrollTop(0);
  }, [page, rowsPerPage]);

  const utils = trpc.useUtils();

  const { data: txData, isLoading } = trpc.transactions.list.useQuery({
    page,
    limit: rowsPerPage,
    search: search || undefined,
    accountId,
    accountIds,
    categoryId: activeCategoryId,
    categoryIds: activeCategoryIds,
    startDate,
    endDate,
    sortBy: 'date',
    sortOrder: 'desc',
  });

  const { data: accounts } = trpc.accounts.list.useQuery();
  const { data: categories } = trpc.categories.list.useQuery();
  const categoryPathById = useMemo(
    () => buildCategoryPathMap(categories ?? []),
    [categories],
  );
  const groupedCategoryOptions = useMemo(
    () => buildGroupedCategoryOptions(categories ?? [], categoryPathById, { leafOnly: false }),
    [categories, categoryPathById],
  );
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
  const filteredCategoryGroups = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return groupedCategoryOptions;
    return groupedCategoryOptions
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
  }, [groupedCategoryOptions, categorySearch]);
  const accountFilterLabel = useMemo(() => {
    if (!accounts) return 'All accounts';
    if (accountIds.length > 0) return `${accountIds.length} selected`;
    if (accountId) {
      const one = accounts.find((account) => account.id === accountId);
      return one?.name ?? '1 selected';
    }
    return 'All accounts';
  }, [accounts, accountId, accountIds]);
  const categoryFilterLabel = useMemo(() => {
    if (activeCategoryIds.length > 0) return `${activeCategoryIds.length} selected`;
    if (activeCategoryId) {
      const path = categoryPathById.get(activeCategoryId);
      return path ? path.replace(/ > /g, ' / ') : '1 selected';
    }
    return 'All categories';
  }, [activeCategoryId, activeCategoryIds, categoryPathById]);
  const accountNameById = useMemo(() => {
    return new Map((accounts ?? []).map((account) => [account.id, account.name]));
  }, [accounts]);
  const selectedAccountFilterIds = useMemo(() => {
    const unique = new Set<string>();
    if (accountId) unique.add(accountId);
    for (const id of accountIds) unique.add(id);
    return Array.from(unique);
  }, [accountId, accountIds]);
  const selectedCategoryFilterIds = useMemo(() => {
    const unique = new Set<string>();
    if (activeCategoryId) unique.add(activeCategoryId);
    for (const id of activeCategoryIds) unique.add(id);
    return Array.from(unique);
  }, [activeCategoryId, activeCategoryIds]);
  const hasActiveSelectionPills =
    selectedAccountFilterIds.length > 0 || selectedCategoryFilterIds.length > 0;
  const txRows = txData?.data ?? [];
  const shouldVirtualizeRows = txRows.length >= LARGE_ROWS_THRESHOLD;
  const virtualWindow = useMemo(() => {
    if (!shouldVirtualizeRows) {
      return {
        startIndex: 0,
        endIndex: txRows.length,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
      };
    }
    const safeViewport = Math.max(1, viewportHeight);
    const overscan = 8;
    const startIndex = Math.max(0, Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT) - overscan);
    const visibleCount = Math.ceil(safeViewport / VIRTUAL_ROW_HEIGHT) + overscan * 2;
    const endIndex = Math.min(txRows.length, startIndex + visibleCount);
    return {
      startIndex,
      endIndex,
      topSpacerHeight: startIndex * VIRTUAL_ROW_HEIGHT,
      bottomSpacerHeight: Math.max(0, (txRows.length - endIndex) * VIRTUAL_ROW_HEIGHT),
    };
  }, [scrollTop, shouldVirtualizeRows, txRows.length, viewportHeight]);
  const visibleRows = useMemo(
    () => txRows.slice(virtualWindow.startIndex, virtualWindow.endIndex),
    [txRows, virtualWindow.endIndex, virtualWindow.startIndex],
  );

  useEffect(() => {
    const node = tableViewportRef.current;
    if (!node) return;
    const updateHeight = () => setViewportHeight(node.clientHeight);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [isLoading, shouldVirtualizeRows, txRows.length]);

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

  const updateTx = trpc.transactions.update.useMutation({
    onSuccess: () => {
      utils.transactions.list.invalidate();
      utils.analytics.invalidate();
      utils.accounts.list.invalidate();
      utils.goals.list.invalidate();
      toast({ variant: 'success', title: 'Transaction updated', durationMs: 2200 });
    },
    onError: (err) => {
      toast({ variant: 'error', title: 'Update failed', description: err.message });
    },
  });
  const createTx = trpc.transactions.create.useMutation({
    onSuccess: () => {
      utils.transactions.list.invalidate();
      utils.analytics.invalidate();
      utils.accounts.list.invalidate();
      utils.goals.list.invalidate();
      toast({ variant: 'success', title: 'Transaction created' });
    },
    onError: (err) => {
      toast({ variant: 'error', title: 'Create failed', description: err.message });
    },
  });
  const deleteTx = trpc.transactions.delete.useMutation({
    onSuccess: () => {
      utils.transactions.list.invalidate();
      utils.analytics.invalidate();
      utils.accounts.list.invalidate();
      utils.goals.list.invalidate();
      toast({ variant: 'success', title: 'Transaction deleted' });
    },
    onError: (err) => {
      toast({ variant: 'error', title: 'Delete failed', description: err.message });
    },
  });
  const exportCsv = trpc.transactions.exportCsv.useMutation({
    onSuccess: (result) => {
      downloadCsv(result.filename, result.csv, result.mimeType);
      toast({ variant: 'info', title: 'CSV exported', description: result.filename });
    },
    onError: (err) => {
      toast({ variant: 'error', title: 'CSV export failed', description: err.message });
    },
  });

  const savingDraft = createTx.isPending || updateTx.isPending;
  const deletingTx = deleteTx.isPending;
  const defaultAccount = accounts?.[0];

  const openCreateDialog = () => {
    if (!defaultAccount) return;
    setDraft({
      date: new Date().toISOString().slice(0, 10),
      description: '',
      amount: '',
      currency: defaultAccount.currency as Currency,
      accountId: defaultAccount.id,
      categoryId: '',
    });
    setDraftError(null);
    setIsEditorOpen(true);
  };

  const openEditDialog = (tx: {
    id: string;
    date: string;
    description: string;
    amount: string;
    currency: string;
    accountId: string;
    categoryId: string | null;
  }) => {
    setDraft({
      id: tx.id,
      date: tx.date,
      description: tx.description,
      amount: String(Number(tx.amount)),
      currency: tx.currency as Currency,
      accountId: tx.accountId,
      categoryId: tx.categoryId ?? '',
    });
    setDraftError(null);
    setIsEditorOpen(true);
  };

  const submitDraft = () => {
    if (!draft) return;
    const amount = Number(draft.amount);
    if (!draft.date || !draft.description.trim() || !draft.accountId) {
      setDraftError('Date, description, and account are required.');
      return;
    }
    if (!Number.isFinite(amount) || amount === 0) {
      setDraftError('Amount must be a valid non-zero number.');
      return;
    }

    const payload = {
      date: draft.date,
      description: draft.description.trim(),
      amount,
      currency: draft.currency,
      accountId: draft.accountId,
      categoryId: draft.categoryId || undefined,
    };

    const onSuccess = () => {
      setIsEditorOpen(false);
      setDraft(null);
      setDraftError(null);
    };

    if (draft.id) {
      updateTx.mutate({ id: draft.id, ...payload }, { onSuccess });
      return;
    }

    createTx.mutate(payload, { onSuccess });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--color-white)]">Transactions</h1>

      {(activeCategoryId || activeCategoryIds.length > 0 || startDate || endDate) && (
        <div className="flex items-center justify-between gap-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3 py-2">
          <div className="text-xs text-[var(--color-muted)]">
            Drill-down active
            {accountIds.length > 0 && ` · Accounts: ${accountIds.length} selected`}
            {activeCategoryIds.length > 0 &&
              ` · Categories: ${activeCategoryIds.length} selected`}
            {activeCategoryId &&
              ` · Category: ${(
                categoryPathById.get(activeCategoryId) ?? 'Unknown'
              ).replace(/ > /g, ' / ')}`}
            {startDate && endDate && ` · Period: ${startDate} to ${endDate}`}
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveCategoryId(undefined);
              setActiveCategoryIds([]);
              setAccountIds([]);
              setStartDate(undefined);
              setEndDate(undefined);
              setPage(1);
              navigate('/transactions');
            }}
            className="text-xs text-[var(--color-soft-blue)] hover:text-[var(--color-white)] transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <input
          type="search"
          placeholder="Search transactions..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="flex-1 min-w-48 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-4 py-2 text-sm text-[var(--color-white)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-cherry-pink)]"
        />
        <div ref={accountMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setIsAccountMenuOpen((prev) => !prev)}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-4 py-2 text-sm text-[var(--color-white)] min-w-[170px] text-left"
          >
            Accounts: {accountFilterLabel}
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
                  setAccountId(undefined);
                  setAccountIds([]);
                  setPage(1);
                }}
                className="w-full text-left px-2 py-1.5 rounded-md text-xs border bg-[var(--color-surface-hover)] text-[var(--color-muted)] border-[var(--color-border)] hover:text-[var(--color-white)]"
              >
                Clear all account selections
              </button>
              <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                {filteredAccounts.map((account) => {
                  const active = accountIds.includes(account.id) || accountId === account.id;
                  return (
                    <label
                      key={account.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--color-surface-hover)] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => {
                          setPage(1);
                          setAccountId(undefined);
                          setAccountIds((prev) =>
                            prev.includes(account.id)
                              ? prev.filter((id) => id !== account.id)
                              : [...prev, account.id],
                          );
                        }}
                        className="accent-[var(--color-cherry-pink)]"
                      />
                      <span className="text-xs text-[var(--color-white)]">{account.name}</span>
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
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-4 py-2 text-sm text-[var(--color-white)] min-w-[190px] text-left"
          >
            Categories: {categoryFilterLabel}
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
                  setActiveCategoryId(undefined);
                  setActiveCategoryIds([]);
                  setPage(1);
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
                      const active =
                        activeCategoryIds.includes(option.id) || activeCategoryId === option.id;
                      return (
                        <label
                          key={option.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--color-surface-hover)] cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={() => {
                              setPage(1);
                              setActiveCategoryId(undefined);
                              setActiveCategoryIds((prev) =>
                                prev.includes(option.id)
                                  ? prev.filter((id) => id !== option.id)
                                  : [...prev, option.id],
                              );
                            }}
                            className="accent-[var(--color-cherry-pink)]"
                          />
                          <span className="text-xs text-[var(--color-white)]">{option.label}</span>
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
        <button
          type="button"
          disabled={exportCsv.isPending}
          onClick={() =>
            exportCsv.mutate({
              search: search || undefined,
              accountId,
              accountIds,
              categoryId: activeCategoryId,
              categoryIds: activeCategoryIds,
              startDate,
              endDate,
              sortBy: 'date',
              sortOrder: 'desc',
            })
          }
          className="bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-white)] rounded-xl px-4 py-2 text-sm disabled:opacity-60"
        >
          {exportCsv.isPending ? 'Exporting...' : 'Export CSV'}
        </button>
        <button
          type="button"
          onClick={openCreateDialog}
          disabled={!defaultAccount}
          className="bg-[var(--color-cherry-pink)] text-[var(--color-deep-blue)] rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Add transaction
        </button>
        <label className="flex items-center gap-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs text-[var(--color-muted)]">
          Rows
          <select
            value={rowsPerPage}
            onChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setPage(1);
            }}
            className="bg-transparent text-[var(--color-white)] focus:outline-none"
          >
            {[50, 100, 200, 500].map((value) => (
              <option key={value} value={value} className="bg-[var(--color-surface)]">
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      {hasActiveSelectionPills && (
        <div className="flex items-center justify-between gap-2 flex-wrap bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3 py-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {selectedAccountFilterIds.map((id) => (
              <button
                key={`acc-${id}`}
                type="button"
                onClick={() => {
                  setPage(1);
                  if (accountId === id) setAccountId(undefined);
                  setAccountIds((prev) => prev.filter((v) => v !== id));
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-surface-hover)] border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-white)]"
              >
                <span>Account: {accountNameById.get(id) ?? 'Unknown'}</span>
                <span className="text-[var(--color-muted)]">×</span>
              </button>
            ))}
            {selectedCategoryFilterIds.map((id) => (
              <button
                key={`cat-${id}`}
                type="button"
                onClick={() => {
                  setPage(1);
                  if (activeCategoryId === id) setActiveCategoryId(undefined);
                  setActiveCategoryIds((prev) => prev.filter((v) => v !== id));
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-surface-hover)] border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-white)]"
              >
                <span>
                  Category:{' '}
                  {(categoryPathById.get(id) ?? 'Unknown').replace(/ > /g, ' / ')}
                </span>
                <span className="text-[var(--color-muted)]">×</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setPage(1);
              setAccountId(undefined);
              setAccountIds([]);
              setActiveCategoryId(undefined);
              setActiveCategoryIds([]);
            }}
            className="text-xs text-[var(--color-soft-blue)] hover:text-[var(--color-white)] transition-colors"
          >
            Clear all selections
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="grid grid-cols-6 gap-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full col-span-2" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        ) : txData?.data.length === 0 ? (
          <div className="p-8 text-center text-[var(--color-muted)] text-sm">
            No transactions found. Upload a PDF statement to get started.
          </div>
        ) : (
          <div
            ref={tableViewportRef}
            className={shouldVirtualizeRows ? 'max-h-[68vh] overflow-y-auto' : ''}
            onScroll={
              shouldVirtualizeRows
                ? (event) => setScrollTop((event.currentTarget as HTMLDivElement).scrollTop)
                : undefined
            }
          >
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col className="w-[10%]" />
                <col className="w-[34%]" />
                <col className="w-[21%]" />
                <col className="w-[15%]" />
                <col className="w-[12%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {['Date', 'Description', 'Category', 'Account', 'Amount', 'Actions'].map((h) => (
                    <th
                      key={h}
                      className={`px-4 py-3 text-[11px] font-medium tracking-wider uppercase text-[var(--color-muted)] ${
                        h === 'Amount' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shouldVirtualizeRows && virtualWindow.topSpacerHeight > 0 && (
                  <tr>
                    <td colSpan={6} style={{ height: `${virtualWindow.topSpacerHeight}px` }} />
                  </tr>
                )}
                {visibleRows.map((tx) => {
                  return (
                    <tr
                      key={tx.id}
                      className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-hover)] transition-colors"
                    >
                      <td className="px-4 py-3 text-[var(--color-muted)] whitespace-nowrap font-mono text-xs">
                        {tx.date}
                      </td>
                      <td
                        className="px-4 py-3 text-[var(--color-white)] align-middle"
                        title={tx.description}
                      >
                        <div className="text-xs leading-relaxed text-[var(--color-white)] whitespace-normal break-words [overflow-wrap:anywhere]">
                          {tx.description}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={tx.categoryId ?? ''}
                          onChange={(e) => {
                            const categoryId = e.target.value;
                            if (!categoryId || categoryId === tx.categoryId) return;
                            updateTx.mutate({ id: tx.id, categoryId });
                          }}
                          className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-xs text-[var(--color-white)] focus:outline-none focus:ring-1 focus:ring-[var(--color-cherry-pink)]"
                        >
                          <option value="">
                            {tx.categoryId
                              ? formatPathForDisplay(
                                  categoryPathById.get(tx.categoryId) ??
                                    tx.category?.name ??
                                    'Uncategorized',
                                )
                              : 'Uncategorized'}
                          </option>
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
                      </td>
                      <td className="px-4 py-3 text-[var(--color-muted)] text-xs whitespace-normal break-words [overflow-wrap:anywhere]">
                        {tx.account?.name}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div
                          className="font-mono font-semibold text-sm"
                          style={{ color: Number(tx.amountCad) > 0 ? '#2DD4A0' : 'var(--color-white)' }}
                        >
                          {Number(tx.amountCad) > 0 ? '+' : ''}
                          {formatCAD(tx.amountCad)}
                        </div>
                        {tx.currency !== 'CAD' && (
                          <div className="text-[10px] text-[var(--color-soft-blue)] font-mono">
                            {currencySymbol[tx.currency as keyof typeof currencySymbol] ?? ''}{Math.abs(Number(tx.amount)).toFixed(2)} {tx.currency}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              openEditDialog({
                                id: tx.id,
                                date: tx.date,
                                description: tx.description,
                                amount: tx.amount,
                                currency: tx.currency,
                                accountId: tx.accountId,
                                categoryId: tx.categoryId ?? null,
                              })
                            }
                            className="px-2 py-1 rounded-md text-[11px] bg-[var(--color-surface-hover)] text-[var(--color-soft-blue)] hover:text-[var(--color-white)]"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={deletingTx}
                            onClick={() => {
                              const ok = window.confirm(
                                'Delete this transaction? This cannot be undone.',
                              );
                              if (!ok) return;
                              deleteTx.mutate({ id: tx.id });
                            }}
                            className="px-2 py-1 rounded-md text-[11px] bg-[var(--color-surface-hover)] text-[var(--color-coral)] hover:text-[var(--color-white)] disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {shouldVirtualizeRows && virtualWindow.bottomSpacerHeight > 0 && (
                  <tr>
                    <td colSpan={6} style={{ height: `${virtualWindow.bottomSpacerHeight}px` }} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {txData && txData.total > rowsPerPage && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)]">
            <span className="text-xs text-[var(--color-muted)]">
              {(page - 1) * rowsPerPage + 1}–{Math.min(page * rowsPerPage, txData.total)} of{' '}
              {txData.total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded-lg text-xs bg-[var(--color-surface-hover)] text-[var(--color-muted)] disabled:opacity-40 hover:text-[var(--color-white)] transition-colors"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page * rowsPerPage >= txData.total}
                className="px-3 py-1 rounded-lg text-xs bg-[var(--color-surface-hover)] text-[var(--color-muted)] disabled:opacity-40 hover:text-[var(--color-white)] transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {isEditorOpen && draft && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[var(--color-white)]">
                {draft.id ? 'Edit transaction' : 'Manual transaction'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setIsEditorOpen(false);
                  setDraft(null);
                  setDraftError(null);
                }}
                className="text-xs text-[var(--color-muted)] hover:text-[var(--color-white)]"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                  Date
                </span>
                <input
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft((prev) => (prev ? { ...prev, date: e.target.value } : prev))}
                  className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-white)] focus:outline-none"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                  Account
                </span>
                <select
                  value={draft.accountId}
                  onChange={(e) => {
                    const nextAccountId = e.target.value;
                    const account = accounts?.find((a) => a.id === nextAccountId);
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            accountId: nextAccountId,
                            currency: (account?.currency ?? prev.currency) as Currency,
                          }
                        : prev,
                    );
                  }}
                  className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-white)] focus:outline-none"
                >
                  {(accounts ?? []).map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.currency})
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                  Description
                </span>
                <input
                  type="text"
                  value={draft.description}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev ? { ...prev, description: e.target.value } : prev,
                    )
                  }
                  placeholder="Transaction description"
                  className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-white)] placeholder:text-[var(--color-muted)] focus:outline-none"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                  Amount
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={draft.amount}
                  onChange={(e) =>
                    setDraft((prev) => (prev ? { ...prev, amount: e.target.value } : prev))
                  }
                  placeholder="-34.90 for expense, +1200 for income"
                  className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-white)] placeholder:text-[var(--color-muted)] focus:outline-none"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                  Currency
                </span>
                <select
                  value={draft.currency}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev ? { ...prev, currency: e.target.value as Currency } : prev,
                    )
                  }
                  className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-white)] focus:outline-none"
                >
                  <option value="CAD">CAD</option>
                  <option value="BRL">BRL</option>
                  <option value="EUR">EUR</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                  Category
                </span>
                <select
                  value={draft.categoryId}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev ? { ...prev, categoryId: e.target.value } : prev,
                    )
                  }
                  className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-white)] focus:outline-none"
                >
                  <option value="">Uncategorized</option>
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
              </label>
            </div>

            {draftError && <p className="text-xs text-[var(--color-coral)]">{draftError}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsEditorOpen(false);
                  setDraft(null);
                  setDraftError(null);
                }}
                className="px-3 py-2 rounded-lg text-sm bg-[var(--color-surface-hover)] text-[var(--color-muted)] hover:text-[var(--color-white)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingDraft}
                onClick={submitDraft}
                className="px-3 py-2 rounded-lg text-sm bg-[var(--color-cherry-pink)] text-[var(--color-deep-blue)] disabled:opacity-60"
              >
                {savingDraft ? 'Saving...' : draft.id ? 'Save changes' : 'Create transaction'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
