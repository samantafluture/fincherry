import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { ChartErrorBoundary } from '@/components/ui/ChartErrorBoundary';
import { formatCAD } from '@/lib/formatCurrency';

const C = {
  cherryPink: '#F472B6',
  sapphire: '#1A7A8A',
  softBlue: '#8B9EE0',
  coral: '#F97352',
  green: '#2DD4A0',
  deepBlue: '#0B1628',
  border: '#1A2D45',
  muted: '#7A8BA8',
  white: '#F0F0EC',
};

const trendPalette = [C.cherryPink, C.softBlue, C.sapphire, C.coral, C.green];

type CategoryTrendsChartProps = {
  data: Array<Record<string, number | string>>;
  trendKeys: string[];
  resetKey?: string;
};

export function CategoryTrendsChart({ data, trendKeys, resetKey }: CategoryTrendsChartProps) {
  return (
    <ChartErrorBoundary
      fallbackHeight={220}
      label="Category trends chart"
      resetKey={resetKey}
    >
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
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
            tickFormatter={(v: number) => `$${Math.round(v)}`}
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
            formatter={(v: number | string) => [formatCAD(Number(v)), undefined]}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: C.muted }} />
          {trendKeys.map((key, idx) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={trendPalette[idx % trendPalette.length]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartErrorBoundary>
  );
}
