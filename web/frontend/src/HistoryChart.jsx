import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { usePoll, nf } from "./api.js";

function Tip({ active, payload, currency }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="recharts-default-tooltip" style={{ padding: "8px 11px" }}>
      <div style={{ color: "var(--muted)" }}>{p.day}</div>
      <div style={{ color: "var(--volt)", fontWeight: 700 }}>{nf(p.kwh, 2)} kWh</div>
      <div style={{ color: "var(--good)" }}>{currency}{nf(p.value, 2)}</div>
      <div style={{ color: "var(--faint)", fontSize: 11 }}>peak {nf(p.peak_w)} W</div>
    </div>
  );
}

export default function HistoryChart() {
  const { data } = usePoll("/api/history?days=45", 120000);
  const days = data?.days || [];
  const cur = data?.currency || "€";
  const label = (d) => d.slice(5);

  return (
    <div className="panel rise" style={{ animationDelay: "0.25s" }}>
      <div className="section-h" style={{ margin: "2px 2px 14px" }}>
        <h2>Daily history</h2>
        <span className="hint">kWh bars · {cur} line · last {days.length}d</span>
      </div>
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={days} margin={{ top: 6, right: 4, left: -4, bottom: 0 }}>
            <defs>
              <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6ea8fe" stopOpacity={0.95} />
                <stop offset="100%" stopColor="#6ea8fe" stopOpacity={0.25} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="day" tickFormatter={label} tick={{ fill: "#5a6473", fontSize: 10, fontFamily: "JetBrains Mono" }}
              minTickGap={26} axisLine={false} tickLine={false} />
            <YAxis yAxisId="l" tick={{ fill: "#5a6473", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} width={44} />
            <YAxis yAxisId="r" orientation="right" tick={{ fill: "#54e08a", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} width={40} />
            <Tooltip content={<Tip currency={cur} />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Bar yAxisId="l" dataKey="kwh" fill="url(#barGrad)" radius={[4, 4, 0, 0]} maxBarSize={26} />
            <Line yAxisId="r" type="monotone" dataKey="value" stroke="#54e08a" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
