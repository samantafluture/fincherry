import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { ChartErrorBoundary } from '@/components/ui/ChartErrorBoundary';

const C = {
  cherryPink: '#F472B6',
  deepBlue: '#0B1628',
  border: '#1A2D45',
  muted: '#7A8BA8',
  white: '#F0F0EC',
};

type GoalSnapshot = {
  snapshotDate: string;
  currentAmount: number | string;
};

type GoalProgressChartProps = {
  goalId: string;
  snapshots: GoalSnapshot[];
};

export function GoalProgressChart({ goalId, snapshots }: GoalProgressChartProps) {
  return (
    <ChartErrorBoundary
      fallbackHeight={140}
      label="Goal progress chart"
      resetKey={`${goalId}:${snapshots.length}`}
    >
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={snapshots}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
          <XAxis
            dataKey="snapshotDate"
            tick={{ fill: C.muted, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: C.muted, fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            contentStyle={{
              background: C.deepBlue,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              color: C.white,
              fontSize: 12,
            }}
            formatter={(v: number | string) => [`$${Number(v).toLocaleString()}`, undefined]}
          />
          <Area
            type="monotone"
            dataKey="currentAmount"
            stroke={C.cherryPink}
            fill={`${C.cherryPink}20`}
            strokeWidth={2}
            name="Balance"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartErrorBoundary>
  );
}
