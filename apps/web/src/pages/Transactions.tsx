import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { formatCAD, currencySymbol } from '@/lib/formatCurrency';

export function TransactionsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [accountId, setAccountId] = useState<string | undefined>();

  const { data: txData, isLoading } = trpc.transactions.list.useQuery({
    page,
    limit: 50,
    search: search || undefined,
    accountId,
    sortBy: 'date',
    sortOrder: 'desc',
  });

  const { data: accounts } = trpc.accounts.list.useQuery();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--color-white)]">Transactions</h1>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <input
          type="search"
          placeholder="Search transactions..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 min-w-48 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-4 py-2 text-sm text-[var(--color-white)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-cherry-pink)]"
        />
        <select
          value={accountId ?? ''}
          onChange={(e) => { setAccountId(e.target.value || undefined); setPage(1); }}
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-4 py-2 text-sm text-[var(--color-white)] focus:outline-none focus:ring-2 focus:ring-[var(--color-cherry-pink)]"
        >
          <option value="">All accounts</option>
          {accounts?.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-[var(--color-muted)] text-sm">Loading...</div>
        ) : txData?.data.length === 0 ? (
          <div className="p-8 text-center text-[var(--color-muted)] text-sm">
            No transactions found. Upload a PDF statement to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {['Date', 'Description', 'Category', 'Account', 'Amount'].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-[11px] font-medium tracking-wider uppercase text-[var(--color-muted)]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {txData?.data.map((tx, i) => (
                  <tr
                    key={tx.id}
                    className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-hover)] transition-colors"
                  >
                    <td className="px-4 py-3 text-[var(--color-muted)] whitespace-nowrap font-mono text-xs">
                      {tx.date}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-white)] max-w-[200px] truncate">
                      {tx.description}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-surface-hover)] text-[var(--color-muted)]">
                        {tx.category?.name ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)] text-xs whitespace-nowrap">
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {txData && txData.total > 50 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)]">
            <span className="text-xs text-[var(--color-muted)]">
              {(page - 1) * 50 + 1}–{Math.min(page * 50, txData.total)} of {txData.total}
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
                disabled={page * 50 >= txData.total}
                className="px-3 py-1 rounded-lg text-xs bg-[var(--color-surface-hover)] text-[var(--color-muted)] disabled:opacity-40 hover:text-[var(--color-white)] transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
