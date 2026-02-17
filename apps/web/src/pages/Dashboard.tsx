import { useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { trpc } from '@/lib/trpc';
import { getDateRange, currentMonthLabel } from '@/lib/dateUtils';
import { formatCAD } from '@/lib/formatCurrency';

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

const tooltipStyle = {
  contentStyle: {
    background: C.deepBlue,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    color: C.white,
    fontSize: 12,
  },
};

const DATE_PRESETS = ['This month', '3 months', '6 months', 'YTD'] as const;
type DatePreset = (typeof DATE_PRESETS)[number];

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

export function DashboardPage() {
  const [preset, setPreset] = useState<DatePreset>('6 months');
  const { startDate, endDate } = getDateRange(preset);

  const { data: summary, isLoading: summaryLoading } = trpc.analytics.summary.useQuery({
    startDate,
    endDate,
  });
  const { data: incomeVsExpense } = trpc.analytics.incomeVsExpense.useQuery({ startDate, endDate });
  const { data: byCategory } = trpc.analytics.byCategory.useQuery({ startDate, endDate });
  const { data: recentTxs } = trpc.transactions.list.useQuery({
    limit: 8,
    sortBy: 'date',
    sortOrder: 'desc',
  });
  const { data: goals } = trpc.goals.list.useQuery();
  const { data: accounts } = trpc.accounts.list.useQuery();

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
        <div className="flex gap-1.5 flex-wrap">
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

      {/* Income vs Expenses chart */}
      <Card>
        <SectionTitle>Income vs Expenses</SectionTitle>
        {incomeVsExpense && incomeVsExpense.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={incomeVsExpense} barGap={3}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="month" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: C.muted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip {...tooltipStyle} formatter={(v: number) => [`$${v.toLocaleString()}`, undefined]} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: C.muted }} />
              <Bar dataKey="income" fill={C.green} radius={[5, 5, 0, 0]} name="Income" />
              <Bar dataKey="expenses" fill={C.coral} radius={[5, 5, 0, 0]} name="Expenses" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-sm text-[var(--color-muted)]">
            No data yet — upload a bank statement to get started
          </div>
        )}
      </Card>

      {/* Category donut + Accounts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Category breakdown */}
        <Card>
          <SectionTitle>Where Your Money Goes</SectionTitle>
          {byCategory && byCategory.length > 0 ? (
            <div className="flex items-center gap-3 flex-wrap">
              <ResponsiveContainer width={120} height={120} className="shrink-0">
                <PieChart>
                  <Pie
                    data={byCategory}
                    dataKey="amount"
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={55}
                    strokeWidth={0}
                  >
                    {byCategory.map((c, i) => (
                      <Cell key={i} fill={c.color ?? C.muted} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} formatter={(v: number) => [`$${v}`, undefined]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 min-w-[140px] space-y-1">
                {byCategory.slice(0, 6).map((c) => (
                  <div key={c.name} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-2 h-2 rounded-sm shrink-0"
                        style={{ background: c.color ?? C.muted }}
                      />
                      <span className="text-[var(--color-white)]">{c.name}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-[var(--color-muted)] font-mono">{c.pct}%</span>
                      <span className="text-[var(--color-white)] font-mono min-w-[44px] text-right">
                        ${c.amount}
                      </span>
                    </div>
                  </div>
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
              {accounts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between px-3 py-2 bg-[var(--color-surface-hover)] rounded-xl"
                >
                  <div>
                    <div className="text-sm font-medium text-[var(--color-white)]">{a.name}</div>
                    <div className="text-[10px] text-[var(--color-muted)]">{a.currency} · {a.institution}</div>
                  </div>
                  <div className="text-sm font-mono font-semibold text-[var(--color-white)]">—</div>
                </div>
              ))}
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
