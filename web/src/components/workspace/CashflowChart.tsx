import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { inr, inrCompact } from "../../lib/format";
import type { MonthRow } from "../../lib/types";

export function CashflowChart({ months }: { months: MonthRow[] }) {
  // Chart libraries need numbers; these are the engine's values, unchanged.
  const data = months.map((m) => ({
    month: m.month,
    Stay: Number(m.stay_cash),
    Switch: Number(m.switch_cash),
  }));
  const last = months[months.length - 1];

  return (
    <figure className="chart">
      <figcaption>
        <h3>Cash balance over time</h3>
        <p className="muted small">
          Month-end cash if you stay versus switch. Hover or focus the chart for exact values.
        </p>
      </figcaption>
      <div
        className="chart__canvas"
        role="img"
        aria-label={`Line chart of cash balance over ${months.length} months. By month ${last.month}, staying ends at ${inr(last.stay_cash)} and switching at ${inr(last.switch_cash)}.`}
      >
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#223049" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="month"
              stroke="#6f7f99"
              tick={{ fill: "#9aa8bf", fontSize: 12 }}
              tickLine={false}
              label={{ value: "Month", position: "insideBottomRight", offset: -2, fill: "#6f7f99", fontSize: 12 }}
            />
            <YAxis
              stroke="#6f7f99"
              width={64}
              tick={{ fill: "#9aa8bf", fontSize: 12 }}
              tickLine={false}
              tickFormatter={inrCompact}
            />
            <ReferenceLine y={0} stroke="#fb7185" strokeDasharray="4 4" />
            <Tooltip
              formatter={(v) => inr(Number(v))}
              labelFormatter={(m) => `Month ${m}`}
              contentStyle={{
                background: "#0f1829",
                border: "1px solid #31435f",
                borderRadius: 8,
                color: "#e8eef8",
              }}
            />
            <Legend wrapperStyle={{ color: "#9aa8bf" }} />
            <Line
              type="monotone"
              dataKey="Stay"
              stroke="#9db4d9"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="Switch"
              stroke="#2dd4bf"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
