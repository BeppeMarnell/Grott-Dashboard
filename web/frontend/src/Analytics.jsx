import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, LabelList,
} from "recharts";
import { usePoll, nf, monthLabel, dayLabel } from "./api.js";
import CalendarHeatmap from "./CalendarHeatmap.jsx";
import HistoryChart from "./HistoryChart.jsx";
import ProductionChart from "./ProductionChart.jsx";

function Record({ label, value, unit, foot, color, delay }) {
  return (
    <motion.div className="card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}>
      <div className="label">{label}</div>
      <div className="val" style={{ fontSize: 28, color: color || "var(--ink)" }}>
        {value}{unit && <span className="u">{unit}</span>}
      </div>
      {foot && <div className="foot">{foot}</div>}
    </motion.div>
  );
}

function RecordsPanel() {
  const { data: r } = usePoll("/api/records", 120000);
  const cur = r?.currency || "€";
  return (
    <div className="grid cols-4">
      <Record label="Best day ever" value={nf(r?.best_day?.kwh, 1)} unit="kWh"
        foot={r?.best_day ? dayLabel(r.best_day.day) : "—"} color="var(--solar)" delay={0.02} />
      <Record label="Best month" value={nf(r?.best_month?.kwh, 0)} unit="kWh"
        foot={r?.best_month ? monthLabel(r.best_month.month) : "—"} color="var(--volt)" delay={0.06} />
      <Record label="Record peak" value={nf(r?.max_peak_w, 0)} unit="W"
        foot={r?.best_peak ? dayLabel(r.best_peak.day) : "—"} color="var(--solar2)" delay={0.1} />
      <Record label="Average day" value={nf(r?.avg_day_kwh, 1)} unit="kWh"
        foot={`over ${nf(r?.days_recorded)} days`} color="var(--good)" delay={0.14} />
      <Record label="Lifetime energy" value={nf(r?.total_kwh, 0)} unit="kWh"
        foot={`${cur}${nf(r?.total_value, 0)} saved`} color="var(--good)" delay={0.18} />
      <Record label="CO₂ avoided" value={nf((r?.co2_kg_total || 0) / 1000, 2)} unit="t"
        foot={`${nf(r?.co2_kg_total, 0)} kg`} color="var(--grid)" delay={0.22} />
      <Record label="Days logged" value={nf(r?.days_recorded, 0)}
        foot={r?.first_day ? `since ${dayLabel(r.first_day)}` : "—"} color="var(--ink)" delay={0.26} />
      <Record label="Feed-in tariff" value={`${cur}${nf(r?.price, 3)}`} unit="/kWh"
        foot="config.ini" color="var(--muted)" delay={0.3} />
    </div>
  );
}

function MonthTip({ active, payload, currency }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="recharts-default-tooltip" style={{ padding: "8px 11px" }}>
      <div style={{ color: "var(--muted)" }}>{monthLabel(p.month)}</div>
      <div style={{ color: "var(--solar)", fontWeight: 700 }}>{nf(p.kwh, 0)} kWh</div>
      <div style={{ color: "var(--good)" }}>{currency}{nf(p.value, 2)}</div>
      <div style={{ color: "var(--faint)", fontSize: 11 }}>{p.days} days · avg {nf(p.avg_kwh, 1)} kWh/d</div>
    </div>
  );
}

function MonthlyChart() {
  const { data } = usePoll("/api/monthly", 120000);
  const months = data?.months || [];
  const cur = data?.currency || "€";
  const peak = Math.max(...months.map((m) => m.kwh), 0);
  return (
    <div className="panel rise" style={{ animationDelay: "0.15s" }}>
      <div className="section-h" style={{ margin: "2px 2px 14px" }}>
        <h2>Monthly production</h2>
        <span className="hint">seasonal curve · {months.length} months</span>
      </div>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={months} margin={{ top: 18, right: 6, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="moGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffb627" stopOpacity={0.95} />
                <stop offset="100%" stopColor="#ff7a18" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="month" tickFormatter={(m) => monthLabel(m).slice(0, 3)}
              tick={{ fill: "#5a6473", fontSize: 10, fontFamily: "JetBrains Mono" }} minTickGap={10} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#5a6473", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} width={46} />
            <Tooltip content={<MonthTip currency={cur} />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Bar dataKey="kwh" radius={[5, 5, 0, 0]} maxBarSize={48}>
              {months.map((m, i) => (
                <Cell key={i} fill={m.kwh >= peak ? "var(--solar)" : "url(#moGrad)"} />
              ))}
              <LabelList dataKey="kwh" position="top" formatter={(v) => nf(v, 0)}
                style={{ fill: "#8b97a8", fontSize: 10, fontFamily: "JetBrains Mono" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function YearlyChart() {
  const { data } = usePoll("/api/yearly", 120000);
  const years = data?.years || [];
  const cur = data?.currency || "€";
  if (years.length < 1) return null;
  return (
    <div className="panel rise" style={{ animationDelay: "0.2s" }}>
      <div className="section-h" style={{ margin: "2px 2px 14px" }}>
        <h2>Yearly totals</h2>
        <span className="hint">{years.length} year{years.length > 1 ? "s" : ""}</span>
      </div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={years} layout="vertical" margin={{ top: 4, right: 60, left: 6, bottom: 0 }}>
            <defs>
              <linearGradient id="yrGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#6ea8fe" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#54e08a" stopOpacity={0.95} />
              </linearGradient>
            </defs>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="year" tick={{ fill: "#eef2f8", fontSize: 13, fontFamily: "Bricolage Grotesque" }}
              axisLine={false} tickLine={false} width={52} />
            <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload;
                return (
                  <div className="recharts-default-tooltip" style={{ padding: "8px 11px" }}>
                    <div style={{ color: "var(--muted)" }}>{p.year}</div>
                    <div style={{ color: "var(--good)", fontWeight: 700 }}>{nf(p.kwh, 0)} kWh · {cur}{nf(p.value, 0)}</div>
                    <div style={{ color: "var(--faint)", fontSize: 11 }}>{p.days} days · avg {nf(p.avg_kwh, 1)} kWh/d</div>
                  </div>
                );
              }} />
            <Bar dataKey="kwh" fill="url(#yrGrad)" radius={[0, 6, 6, 0]} maxBarSize={40}>
              <LabelList dataKey="kwh" position="right" formatter={(v) => `${nf(v, 0)} kWh`}
                style={{ fill: "#8b97a8", fontSize: 12, fontFamily: "JetBrains Mono" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function Analytics({ dates = [] }) {
  return (
    <>
      <div className="section-h" style={{ marginTop: 6 }}><h2>Records &amp; lifetime</h2><span className="hint">all-time highlights</span></div>
      <RecordsPanel />

      <div style={{ marginTop: 22 }}><ProductionChart dates={dates.length ? dates : undefined} /></div>

      <div style={{ marginTop: 22 }}><CalendarHeatmap /></div>

      <div className="grid cols-2" style={{ marginTop: 18, alignItems: "start" }}>
        <MonthlyChart />
        <YearlyChart />
      </div>

      <div style={{ marginTop: 18 }}><HistoryChart /></div>
    </>
  );
}
