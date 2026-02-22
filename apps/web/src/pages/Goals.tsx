import { lazy, Suspense, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { formatCAD } from '@/lib/formatCurrency';
import { LazyWhenVisible } from '@/components/ui/LazyWhenVisible';

const C = {
  coral: '#F97352',
};

const GoalProgressChart = lazy(() =>
  import('@/components/charts/GoalProgressChart').then((m) => ({ default: m.GoalProgressChart })),
);

function GoalChartPlaceholder() {
  return (
    <div className="h-[140px] w-full animate-pulse rounded-xl bg-[var(--color-surface-hover)]/80" aria-hidden />
  );
}

export function GoalsPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: goals, isLoading } = trpc.goals.list.useQuery();

  if (isLoading) {
    return (
      <div className="p-8 text-center text-[var(--color-muted)] text-sm">Loading goals...</div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--color-white)]">Savings Goals</h1>

      {!goals || goals.length === 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-8 text-center text-[var(--color-muted)] text-sm">
          No goals yet. Upload savings account statements to start tracking progress.
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 space-y-6">
          {goals.map((g) => {
            const current = Number(g.currentAmount);
            const target = Number(g.targetAmount);
            const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
            const isOpen = expandedId === g.id;

            return (
              <div key={g.id} className="space-y-2">
                <button
                  className="w-full text-left"
                  onClick={() => setExpandedId(isOpen ? null : g.id)}
                >
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium text-[var(--color-white)]">{g.name}</span>
                    <span className="text-xs font-mono text-[var(--color-muted)]">
                      {formatCAD(current)} / {formatCAD(target)}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="bg-[var(--color-deep-blue)] rounded-full h-5 overflow-hidden">
                    <div
                      className="h-full rounded-full flex items-center justify-end pr-2 transition-all duration-700"
                      style={{
                        width: `${pct}%`,
                        background:
                          pct >= 80
                            ? 'linear-gradient(135deg, #F472B6, #8B9EE0)'
                            : `linear-gradient(135deg, ${C.coral}, #F9A352)`,
                        minWidth: pct > 0 ? '2rem' : 0,
                      }}
                    >
                      <span className="text-[10px] font-bold text-[var(--color-deep-blue)]">
                        {pct}%
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between mt-1.5 text-[11px]">
                    <span className="text-[var(--color-muted)]">
                      {g.goalType === 'annual_recurring' ? '↻ Annual' : '◎ Milestone'} ·{' '}
                      {g.deadline ? `due ${g.deadline}` : 'no deadline'}
                    </span>
                    <span className="text-[var(--color-muted)]">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* Expanded: progress chart */}
                {isOpen && (
                  <GoalDetail goalId={g.id} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GoalDetail({ goalId }: { goalId: string }) {
  const { data: progress } = trpc.goals.progress.useQuery({ id: goalId });

  if (!progress) {
    return <div className="py-4 text-center text-xs text-[var(--color-muted)]">Loading...</div>;
  }

  const snapshots = progress.snapshots ?? [];

  return (
    <div className="pt-3 border-t border-[var(--color-border)] space-y-3">
      {snapshots.length >= 2 ? (
        <LazyWhenVisible
          minHeight={140}
          placeholder={<GoalChartPlaceholder />}
          rootMargin="120px"
        >
          <Suspense fallback={<GoalChartPlaceholder />}>
            <GoalProgressChart goalId={goalId} snapshots={snapshots} />
          </Suspense>
        </LazyWhenVisible>
      ) : (
        <p className="text-xs text-[var(--color-muted)] py-2">
          Upload more savings statements to see the progress chart.
        </p>
      )}

      {progress.projectedCompletionDate && (
        <div className="bg-[var(--color-surface-hover)] rounded-xl p-3 text-xs text-[var(--color-muted)]">
          At <span className="text-[var(--color-white)] font-mono">{formatCAD(progress.avgMonthlyContribution)}/mo</span>,
          projected completion:{' '}
          <span className="text-[var(--color-cherry-pink)] font-semibold">
            {progress.projectedCompletionDate}
          </span>
        </div>
      )}
    </div>
  );
}
