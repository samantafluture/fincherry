import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { ChartErrorBoundary } from '@/components/ui/ChartErrorBoundary';
import { formatCAD } from '@/lib/formatCurrency';

const C = {
  deepBlue: '#0B1628',
  border: '#1A2D45',
  white: '#F0F0EC',
};

type CategoryBreakdownPoint = {
  categoryId?: string | null;
  name: string;
  amount: number;
  color?: string | null;
};

type CategoryBreakdownChartProps = {
  data: CategoryBreakdownPoint[];
  onCategoryClick?: (categoryId: string) => void;
  resetKey?: string;
};

export function CategoryBreakdownChart({
  data,
  onCategoryClick,
  resetKey,
}: CategoryBreakdownChartProps) {
  return (
    <ChartErrorBoundary
      fallbackHeight={150}
      label="Category breakdown chart"
      resetKey={resetKey}
    >
      <ResponsiveContainer width="100%" height={150}>
        <PieChart>
          <Pie
            data={data}
            dataKey="amount"
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={62}
            strokeWidth={0}
            onClick={(entry: { categoryId?: string | null }) => {
              const categoryId = entry?.categoryId;
              if (!categoryId || !onCategoryClick) return;
              onCategoryClick(categoryId);
            }}
          >
            {data.map((item, idx) => (
              <Cell key={idx} fill={item.color ?? '#7A8BA8'} />
            ))}
          </Pie>
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
            formatter={(v: number | string, label) => [formatCAD(Number(v)), String(label ?? '')]}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartErrorBoundary>
  );
}
