import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { ChartErrorBoundary } from '@/components/ui/ChartErrorBoundary';

const C = {
  green: '#2DD4A0',
  coral: '#F97352',
  deepBlue: '#0B1628',
  border: '#1A2D45',
  muted: '#7A8BA8',
  white: '#F0F0EC',
};

type IncomeVsExpensePoint = {
  month: string;
  monthKey?: string;
  income: number;
  expenses: number;
};

type IncomeVsExpensesChartProps = {
  data: IncomeVsExpensePoint[];
  onMonthClick?: (monthKey: string) => void;
  resetKey?: string;
};

export function IncomeVsExpensesChart({
  data,
  onMonthClick,
  resetKey,
}: IncomeVsExpensesChartProps) {
  return (
    <ChartErrorBoundary
      fallbackHeight={200}
      label="Income vs expenses chart"
      resetKey={resetKey}
    >
      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          data={data}
          barGap={3}
          onClick={(state: { activePayload?: Array<{ payload?: { monthKey?: string } }> }) => {
            const monthKey = state.activePayload?.[0]?.payload?.monthKey;
            if (!monthKey || !onMonthClick) return;
            onMonthClick(monthKey);
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
          <XAxis
            dataKey="month"
            tick={{ fill: C.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: C.muted, fontSize: 10 }}
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
            labelStyle={{ color: C.white, fontSize: 11, fontWeight: 600 }}
            itemStyle={{ color: C.white, fontSize: 11 }}
            cursor={{ fill: 'rgba(244, 114, 182, 0.08)' }}
            formatter={(v: number | string) => [`$${Number(v).toLocaleString()}`, undefined]}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: C.muted }} />
          <Bar dataKey="income" fill={C.green} radius={[5, 5, 0, 0]} name="Income" />
          <Bar dataKey="expenses" fill={C.coral} radius={[5, 5, 0, 0]} name="Expenses" />
        </BarChart>
      </ResponsiveContainer>
    </ChartErrorBoundary>
  );
}
