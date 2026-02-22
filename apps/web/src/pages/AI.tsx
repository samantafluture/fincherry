import { useEffect, useMemo, useState } from 'react';
import { Sparkles, TrendingDown, AlertTriangle, Lightbulb } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { getDateRange } from '@/lib/dateUtils';
import { formatCAD } from '@/lib/formatCurrency';

const ICON_MAP = {
  positive: { Icon: TrendingDown, bg: '#0B2420', border: '#1A4A3A', color: '#2DD4A0' },
  warning: { Icon: AlertTriangle, bg: '#1F1508', border: '#3D2A0A', color: '#F97352' },
  suggestion: { Icon: Lightbulb, bg: '#0F1530', border: '#1A2D55', color: '#F472B6' },
};

type RangePreset = 'This month' | '3 months' | '6 months' | 'YTD' | 'All time' | 'Custom';
type ComparePreset = 'None' | 'Previous period' | RangePreset;

function toIsoDate(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

function previousPeriod(range: { startDate: string; endDate: string }): {
  startDate: string;
  endDate: string;
} {
  const start = new Date(`${range.startDate}T00:00:00Z`);
  const end = new Date(`${range.endDate}T00:00:00Z`);
  const days = Math.max(
    1,
    Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1,
  );

  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1));

  return {
    startDate: toIsoDate(prevStart),
    endDate: toIsoDate(prevEnd),
  };
}

function currentMonthValue(): string {
  return toIsoDate(new Date()).slice(0, 7);
}

export function AIPage() {
  const [categoryId, setCategoryId] = useState('');
  const [goalId, setGoalId] = useState('');
  const [reduction, setReduction] = useState(20);
  const [rangePreset, setRangePreset] = useState<RangePreset>('3 months');
  const initialRange = useMemo(() => getDateRange('3 months'), []);
  const [customStartDate, setCustomStartDate] = useState(initialRange.startDate);
  const [customEndDate, setCustomEndDate] = useState(initialRange.endDate);
  const [comparePreset, setComparePreset] = useState<ComparePreset>('None');
  const [compareCustomStartDate, setCompareCustomStartDate] = useState(initialRange.startDate);
  const [compareCustomEndDate, setCompareCustomEndDate] = useState(initialRange.endDate);
  const [question, setQuestion] = useState('');
  const [reportMonth, setReportMonth] = useState(currentMonthValue());

  const insights = trpc.ai.insights.useMutation();
  const scenario = trpc.ai.scenario.useMutation();
  const ask = trpc.ai.ask.useMutation();
  const monthlyReportGenerate = trpc.ai.monthlyReportGenerate.useMutation();
  const monthlyReports = trpc.ai.monthlyReports.useQuery({ limit: 6 });
  const { data: categories } = trpc.categories.list.useQuery();
  const { data: goals } = trpc.goals.list.useQuery();
  const prediction = trpc.ai.predict.useQuery(
    { goalId },
    { enabled: goalId.length > 0 },
  );

  const topCategories = useMemo(
    () => categories?.filter((c) => c.parentId === null) ?? [],
    [categories],
  );

  const activeRange = useMemo(() => {
    if (rangePreset === 'Custom') {
      return {
        startDate: customStartDate,
        endDate: customEndDate,
      };
    }
    return getDateRange(rangePreset);
  }, [rangePreset, customStartDate, customEndDate]);
  const hasValidRange =
    Boolean(activeRange.startDate) &&
    Boolean(activeRange.endDate) &&
    activeRange.startDate <= activeRange.endDate;
  const comparisonRange = useMemo(() => {
    if (comparePreset === 'None') return null;
    if (comparePreset === 'Previous period') return previousPeriod(activeRange);
    if (comparePreset === 'Custom') {
      return {
        startDate: compareCustomStartDate,
        endDate: compareCustomEndDate,
      };
    }
    return getDateRange(comparePreset);
  }, [
    comparePreset,
    activeRange,
    compareCustomStartDate,
    compareCustomEndDate,
  ]);
  const hasValidComparisonRange =
    comparisonRange === null ||
    (Boolean(comparisonRange.startDate) &&
      Boolean(comparisonRange.endDate) &&
      comparisonRange.startDate <= comparisonRange.endDate);

  useEffect(() => {
    if (!categoryId && topCategories[0]) {
      setCategoryId(topCategories[0].id);
    }
  }, [categoryId, topCategories]);

  useEffect(() => {
    if (!goalId && goals?.[0]) {
      setGoalId(goals[0].id);
    }
  }, [goalId, goals]);

  const runInsights = (refresh: boolean) => {
    if (!hasValidRange) return;
    insights.mutate({
      startDate: activeRange.startDate,
      endDate: activeRange.endDate,
      refresh,
      variationToken: refresh ? `${Date.now()}` : undefined,
    });
  };

  const runAsk = (refresh: boolean) => {
    if (!hasValidRange || !hasValidComparisonRange || question.trim().length < 3) return;
    ask.mutate({
      question: question.trim(),
      startDate: activeRange.startDate,
      endDate: activeRange.endDate,
      compareStartDate: comparisonRange?.startDate,
      compareEndDate: comparisonRange?.endDate,
      refresh,
      variationToken: refresh ? `ask-${Date.now()}` : undefined,
    });
  };

  const runMonthlyReport = async (refresh: boolean) => {
    if (!/^\d{4}-\d{2}$/.test(reportMonth)) return;
    await monthlyReportGenerate.mutateAsync({
      month: reportMonth,
      refresh,
    });
    await monthlyReports.refetch();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--color-white)]">AI Insights</h1>

      {/* Generate insights */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5">
        <h3 className="text-[11px] font-medium tracking-widest uppercase text-[var(--color-muted)] mb-3">
          Monthly Analysis
        </h3>

        <div className="flex flex-wrap gap-2.5 mb-3">
          <select
            value={rangePreset}
            onChange={(e) => setRangePreset(e.target.value as RangePreset)}
            className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-white)] focus:outline-none"
          >
            <option value="This month">This month</option>
            <option value="3 months">Last 3 months</option>
            <option value="6 months">Last 6 months</option>
            <option value="YTD">Year to date</option>
            <option value="All time">All time</option>
            <option value="Custom">Custom range</option>
          </select>

          {rangePreset === 'Custom' && (
            <>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-white)] focus:outline-none"
              />
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-white)] focus:outline-none"
              />
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => runInsights(false)}
            disabled={insights.isPending || !hasValidRange}
            className="flex items-center gap-2 bg-[var(--color-cherry-pink)] text-[var(--color-deep-blue)] font-semibold rounded-xl px-5 py-2.5 text-sm hover:opacity-90 disabled:opacity-40 transition"
          >
            <Sparkles size={15} />
            {insights.isPending ? 'Analyzing...' : 'Generate Insights'}
          </button>
          <button
            onClick={() => runInsights(true)}
            disabled={insights.isPending || !hasValidRange}
            className="px-4 py-2.5 bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-white)] hover:border-[var(--color-soft-blue)] disabled:opacity-40 transition-colors"
          >
            Regenerate
          </button>
        </div>

        {!hasValidRange && (
          <p className="mt-2 text-xs text-[var(--color-coral)]">
            Invalid date range. Start date must be before end date.
          </p>
        )}

        {insights.data && (
          <div className="mt-4 space-y-3">
            <div className="text-[11px] text-[var(--color-muted)]">
              Source:{' '}
              <span className="text-[var(--color-white)]">
                {insights.data.meta.provider === 'gemini' ? 'Gemini' : 'Local fallback'}
              </span>{' '}
              · {insights.data.meta.cached ? 'cached' : 'fresh'} ·{' '}
              {new Date(insights.data.meta.generatedAt).toLocaleString()}
            </div>
            {insights.data.meta.provider !== 'gemini' && (
              <p className="text-[11px] text-[var(--color-coral)]">
                {insights.data.meta.fallbackReason === 'missing_api_key'
                  ? 'Gemini key missing. Set `GEMINI_API_KEY` and restart the API.'
                  : insights.data.meta.fallbackReason === 'provider_error'
                    ? 'Gemini request failed (quota/network/provider error). Showing local fallback insights.'
                    : 'Gemini returned an invalid format. Showing local fallback insights.'}
              </p>
            )}
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

      {/* Ask AI */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5">
        <h3 className="text-[11px] font-medium tracking-widest uppercase text-[var(--color-muted)] mb-3">
          Ask AI
        </h3>

        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask anything about this period, e.g. What changed the most in my finances in the last 6 months?"
          className="w-full min-h-[90px] bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-white)] focus:outline-none"
        />

        <div className="flex flex-wrap gap-2.5 mt-3">
          <select
            value={comparePreset}
            onChange={(e) => setComparePreset(e.target.value as ComparePreset)}
            className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-white)] focus:outline-none"
          >
            <option value="None">No comparison</option>
            <option value="Previous period">Compare: previous period</option>
            <option value="This month">Compare: this month</option>
            <option value="3 months">Compare: last 3 months</option>
            <option value="6 months">Compare: last 6 months</option>
            <option value="YTD">Compare: YTD</option>
            <option value="All time">Compare: all time</option>
            <option value="Custom">Compare: custom range</option>
          </select>

          {comparePreset === 'Custom' && (
            <>
              <input
                type="date"
                value={compareCustomStartDate}
                onChange={(e) => setCompareCustomStartDate(e.target.value)}
                className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-white)] focus:outline-none"
              />
              <input
                type="date"
                value={compareCustomEndDate}
                onChange={(e) => setCompareCustomEndDate(e.target.value)}
                className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-white)] focus:outline-none"
              />
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2.5 mt-3">
          <button
            onClick={() => runAsk(false)}
            disabled={ask.isPending || !hasValidRange || !hasValidComparisonRange || question.trim().length < 3}
            className="px-4 py-2.5 bg-[var(--color-cherry-pink)] text-[var(--color-deep-blue)] rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition"
          >
            {ask.isPending ? 'Thinking...' : 'Ask'}
          </button>
          <button
            onClick={() => runAsk(true)}
            disabled={ask.isPending || !hasValidRange || !hasValidComparisonRange || question.trim().length < 3}
            className="px-4 py-2.5 bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-white)] hover:border-[var(--color-soft-blue)] disabled:opacity-40 transition-colors"
          >
            Regenerate Answer
          </button>
        </div>

        {!hasValidComparisonRange && (
          <p className="mt-2 text-xs text-[var(--color-coral)]">
            Invalid comparison range.
          </p>
        )}

        {ask.data && (
          <div className="mt-4 bg-[var(--color-surface-hover)] rounded-xl p-4 space-y-2">
            <div className="text-[11px] text-[var(--color-muted)]">
              Source:{' '}
              <span className="text-[var(--color-white)]">
                {ask.data.meta.provider === 'gemini' ? 'Gemini' : 'Local fallback'}
              </span>{' '}
              · {ask.data.meta.cached ? 'cached' : 'fresh'} ·{' '}
              {new Date(ask.data.meta.generatedAt).toLocaleString()}
            </div>
            <p className="text-sm text-[var(--color-white)] leading-relaxed whitespace-pre-wrap">
              {ask.data.answer}
            </p>
          </div>
        )}

        {ask.isError && (
          <p className="mt-3 text-xs text-[var(--color-coral)]">{ask.error.message}</p>
        )}
      </div>

      {/* Monthly reports */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5">
        <h3 className="text-[11px] font-medium tracking-widest uppercase text-[var(--color-muted)] mb-3">
          Monthly Reports
        </h3>

        <div className="flex flex-wrap gap-2.5">
          <input
            type="month"
            value={reportMonth}
            onChange={(e) => setReportMonth(e.target.value)}
            className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-white)] focus:outline-none"
          />
          <button
            onClick={() => runMonthlyReport(false)}
            disabled={monthlyReportGenerate.isPending}
            className="px-4 py-2.5 bg-[var(--color-indigo-dye)] text-[var(--color-white)] rounded-xl text-sm font-medium hover:bg-[var(--color-sapphire)] disabled:opacity-40 transition-colors"
          >
            {monthlyReportGenerate.isPending ? 'Generating...' : 'Generate Report'}
          </button>
          <button
            onClick={() => runMonthlyReport(true)}
            disabled={monthlyReportGenerate.isPending}
            className="px-4 py-2.5 bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-white)] hover:border-[var(--color-soft-blue)] disabled:opacity-40 transition-colors"
          >
            Regenerate Report
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {(monthlyReports.data ?? []).map((report) => {
            const response = report.response as {
              insights?: Array<{ title: string; body: string }>;
            } | null;
            const firstInsight = response?.insights?.[0];
            return (
              <div
                key={report.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-3"
              >
                <div className="text-xs text-[var(--color-muted)]">
                  {report.reportMonth} · {new Date(report.createdAt).toLocaleString()} · {report.provider}
                </div>
                {firstInsight ? (
                  <p className="text-sm text-[var(--color-white)] mt-1">
                    <span className="font-semibold">{firstInsight.title}:</span> {firstInsight.body}
                  </p>
                ) : (
                  <p className="text-sm text-[var(--color-muted)] mt-1">
                    Report saved (no preview available).
                  </p>
                )}
              </div>
            );
          })}
          {monthlyReports.data && monthlyReports.data.length === 0 && (
            <p className="text-xs text-[var(--color-muted)]">No saved monthly reports yet.</p>
          )}
        </div>
      </div>

      {/* What-if scenario */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5">
        <h3 className="text-[11px] font-medium tracking-widest uppercase text-[var(--color-muted)] mb-3">
          What-If Scenario
        </h3>

        <div className="flex gap-3 flex-wrap mb-4">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-white)] focus:outline-none"
          >
            {topCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
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
                categoryId,
                reductionPercent: reduction,
                startDate: activeRange.startDate,
                endDate: activeRange.endDate,
              })
            }
            disabled={scenario.isPending || categoryId.length === 0 || !hasValidRange}
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

      {/* Goal prediction */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5">
        <h3 className="text-[11px] font-medium tracking-widest uppercase text-[var(--color-muted)] mb-3">
          Goal Prediction
        </h3>

        <div className="flex gap-3 flex-wrap mb-4">
          <select
            value={goalId}
            onChange={(e) => setGoalId(e.target.value)}
            className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-white)] focus:outline-none min-w-[220px]"
          >
            {(goals ?? []).map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.name}
              </option>
            ))}
          </select>
        </div>

        {!goalId ? (
          <p className="text-xs text-[var(--color-muted)]">No goals available yet.</p>
        ) : prediction.isLoading ? (
          <p className="text-xs text-[var(--color-muted)]">Calculating prediction...</p>
        ) : prediction.isError ? (
          <p className="text-xs text-[var(--color-coral)]">{prediction.error.message}</p>
        ) : prediction.data && 'message' in prediction.data ? (
          <p className="text-xs text-[var(--color-muted)]">{prediction.data.message}</p>
        ) : prediction.data ? (
          <div className="bg-[var(--color-surface-hover)] rounded-xl p-4 space-y-2">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-lg font-bold font-mono text-[var(--color-cherry-pink)]">
                  {formatCAD(prediction.data.monthlyContribution)}
                </div>
                <div className="text-[10px] text-[var(--color-muted)] mt-0.5">monthly pace</div>
              </div>
              <div>
                <div className="text-lg font-bold font-mono text-[var(--color-soft-blue)]">
                  {prediction.data.monthsToCompletion ?? '—'}
                </div>
                <div className="text-[10px] text-[var(--color-muted)] mt-0.5">months left</div>
              </div>
              <div>
                <div className="text-lg font-bold font-mono text-[var(--color-green)]">
                  {prediction.data.percentage}%
                </div>
                <div className="text-[10px] text-[var(--color-muted)] mt-0.5">completed</div>
              </div>
            </div>
            <p className="text-xs text-[var(--color-muted)]">
              Projected completion:{' '}
              <strong className="text-[var(--color-white)]">
                {prediction.data.projectedDate ?? 'not enough positive pace yet'}
              </strong>
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
