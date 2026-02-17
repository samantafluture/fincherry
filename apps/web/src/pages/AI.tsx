import { useState } from 'react';
import { Sparkles, TrendingDown, AlertTriangle, Lightbulb } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { getDateRange } from '@/lib/dateUtils';
import { formatCAD } from '@/lib/formatCurrency';

const ICON_MAP = {
  positive: { Icon: TrendingDown, bg: '#0B2420', border: '#1A4A3A', color: '#2DD4A0' },
  warning: { Icon: AlertTriangle, bg: '#1F1508', border: '#3D2A0A', color: '#F97352' },
  suggestion: { Icon: Lightbulb, bg: '#0F1530', border: '#1A2D55', color: '#F472B6' },
};

export function AIPage() {
  const [category, setCategory] = useState('Food & Drink');
  const [reduction, setReduction] = useState(20);
  const { startDate, endDate } = getDateRange('3 months');

  const insights = trpc.ai.insights.useMutation();
  const scenario = trpc.ai.scenario.useMutation();
  const { data: categories } = trpc.categories.list.useQuery();

  const topCategories = categories?.filter((c) => c.parentId === null) ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--color-white)]">AI Insights</h1>

      {/* Generate insights */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5">
        <h3 className="text-[11px] font-medium tracking-widest uppercase text-[var(--color-muted)] mb-3">
          Monthly Analysis
        </h3>

        <button
          onClick={() => insights.mutate({ startDate, endDate })}
          disabled={insights.isPending}
          className="flex items-center gap-2 bg-[var(--color-cherry-pink)] text-[var(--color-deep-blue)] font-semibold rounded-xl px-5 py-2.5 text-sm hover:opacity-90 disabled:opacity-40 transition"
        >
          <Sparkles size={15} />
          {insights.isPending ? 'Analyzing...' : 'Generate Insights (last 3 months)'}
        </button>

        {insights.data && (
          <div className="mt-4 space-y-3">
            {insights.data.insights.map((ins, i) => {
              const style =
                ICON_MAP[ins.type as keyof typeof ICON_MAP] ?? ICON_MAP.suggestion;
              const { Icon } = style;
              return (
                <div
                  key={i}
                  className="rounded-xl p-4"
                  style={{ background: style.bg, border: `1px solid ${style.border}` }}
                >
                  <div className="flex items-center gap-2.5 mb-2">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: style.color }}
                    >
                      <Icon size={14} color="#0B1628" />
                    </div>
                    <span className="text-sm font-semibold text-[var(--color-white)]">
                      {ins.title}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-muted)] leading-relaxed pl-9">
                    {ins.body}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {insights.isError && (
          <p className="mt-3 text-xs text-[var(--color-coral)]">{insights.error.message}</p>
        )}
      </div>

      {/* What-if scenario */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5">
        <h3 className="text-[11px] font-medium tracking-widest uppercase text-[var(--color-muted)] mb-3">
          What-If Scenario
        </h3>

        <div className="flex gap-3 flex-wrap mb-4">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-white)] focus:outline-none"
          >
            {topCategories.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--color-muted)]">reduce by</span>
            <input
              type="number"
              value={reduction}
              onChange={(e) => setReduction(Number(e.target.value))}
              min={1}
              max={100}
              className="w-16 bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-white)] font-mono text-center focus:outline-none"
            />
            <span className="text-sm text-[var(--color-muted)]">%</span>
          </div>
          <button
            onClick={() =>
              scenario.mutate({
                categoryName: category,
                reductionPercent: reduction,
                startDate,
                endDate,
              })
            }
            disabled={scenario.isPending}
            className="px-4 py-2 bg-[var(--color-indigo-dye)] text-[var(--color-white)] rounded-xl text-sm font-medium hover:bg-[var(--color-sapphire)] disabled:opacity-40 transition-colors"
          >
            {scenario.isPending ? 'Calculating...' : 'Calculate'}
          </button>
        </div>

        {scenario.data && (
          <div className="bg-[var(--color-surface-hover)] rounded-xl p-4">
            <div className="grid grid-cols-3 gap-3 text-center mb-3">
              {[
                {
                  value: formatCAD(scenario.data.monthlySavings),
                  label: 'saved / month',
                  color: '#2DD4A0',
                },
                {
                  value: formatCAD(scenario.data.yearlySavings),
                  label: 'saved / year',
                  color: '#F472B6',
                },
                {
                  value: `${scenario.data.reductionPercent}%`,
                  label: 'reduction',
                  color: '#8B9EE0',
                },
              ].map((m) => (
                <div key={m.label}>
                  <div className="text-lg font-bold font-mono" style={{ color: m.color }}>
                    {m.value}
                  </div>
                  <div className="text-[10px] text-[var(--color-muted)] mt-0.5">{m.label}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-[var(--color-muted)] leading-relaxed">
              Current spend in <strong className="text-[var(--color-white)]">{scenario.data.categoryName}</strong>:{' '}
              {formatCAD(scenario.data.currentMonthlySpend)}/mo. Reducing by {scenario.data.reductionPercent}% would save{' '}
              {formatCAD(scenario.data.monthlySavings)}/mo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
