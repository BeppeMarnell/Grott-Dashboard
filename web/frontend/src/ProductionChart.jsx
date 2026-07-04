import { useEffect, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { getJSON, nf, hhmm } from "./api.js";
import { DayField } from "./Popover.jsx";

const BUCKETS = [
  { id: "raw", label: "1 min" },
  { id: "5", label: "5 min" },
  { id: "15", label: "15 min" },
];

function Tip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="recharts-default-tooltip" style={{ padding: "8px 11px" }}>
      <div style={{ color: "var(--muted)" }}>{hhmm(p.t)}</div>
      <div style={{ color: "var(--solar)", fontWeight: 700 }}>{nf(p.w)} W</div>
      <div style={{ color: "var(--muted)", fontSize: 11 }}>{nf(p.kwh, 2)} kWh so far</div>
    </div>
  );
}

export default function ProductionChart({ dates, lockToday = false, title = "Production timeline" }) {
  const td = new Date().toISOString().slice(0, 10);
  const [bucket, setBucket] = useState("raw");
  const [date, setDate] = useState(null);
  const [data, setData] = useState(null);

  // Live view is pinned to today; only the analytics view lets you pick a day.
  const day = lockToday ? td : (date || (dates && dates[0]) || td);

  useEffect(() => {
    let alive = true;
    const url = `/api/timeline?date=${day}&bucket=${bucket}`;
    const tick = () => getJSON(url).then((d) => alive && setData(d)).catch(() => {});
    tick();
    const id = setInterval(tick, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [day, bucket]);

  const pts = data?.points || [];
  const peak = data?.peak_w || 0;
  const isToday = day === new Date().toISOString().slice(0, 10);

  return (
    <div className="panel rise" style={{ animationDelay: "0.15s" }}>
      <div className="section-h" style={{ margin: "2px 2px 14px" }}>
        <h2>{title}</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {!lockToday && dates && dates.length > 1 && (
            <DayField value={day} onChange={setDate} dates={dates} />
          )}
          <div className="seg">
            {BUCKETS.map((b) => (
              <button key={b.id} className={bucket === b.id ? "on" : ""} onClick={() => setBucket(b.id)}>{b.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={pts} margin={{ top: 6, right: 6, left: -4, bottom: 0 }}>
            <defs>
              <linearGradient id="solarFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffb627" stopOpacity={0.55} />
                <stop offset="60%" stopColor="#ff7a18" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#ff7a18" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="t" tickFormatter={hhmm} tick={{ fill: "#5a6473", fontSize: 11, fontFamily: "JetBrains Mono" }}
              minTickGap={42} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#5a6473", fontSize: 11, fontFamily: "JetBrains Mono" }}
              axisLine={false} tickLine={false} width={48} />
            {peak > 0 && (
              <ReferenceLine y={peak} stroke="rgba(255,182,39,0.35)" strokeDasharray="4 4"
                label={{ value: `peak ${nf(peak)} W`, fill: "#ffb627", fontSize: 10, fontFamily: "JetBrains Mono", position: "insideTopRight" }} />
            )}
            <Tooltip content={<Tip />} />
            <Area type="monotone" dataKey="w" stroke="#ffb627" strokeWidth={2}
              fill="url(#solarFill)" isAnimationActive={true} animationDuration={500}
              dot={false} activeDot={{ r: 4, fill: "#ffb627", stroke: "#1a1206" }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div style={{ fontFamily: "JetBrains Mono", fontSize: 11, color: "var(--faint)", padding: "4px 6px 10px" }}>
        {pts.length} points · {isToday ? "live, today" : day} · peak {nf(peak)} W
      </div>
    </div>
  );
}
