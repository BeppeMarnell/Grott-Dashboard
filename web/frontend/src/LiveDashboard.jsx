import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { getJSON, nf, fmtAge, today } from "./api.js";
import ProductionChart from "./ProductionChart.jsx";
import LiveMetrics from "./LiveMetrics.jsx";

function Stat({ label, value, unit, foot, color, delay }) {
  return (
    <motion.div className="card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}>
      <div className="label">{label}</div>
      <div className="val" style={{ fontSize: 30, color: color || "var(--ink)" }}>
        {value}{unit && <span className="u">{unit}</span>}
      </div>
      {foot && <div className="foot">{foot}</div>}
    </motion.div>
  );
}

function Sparkline({ day }) {
  const [pts, setPts] = useState([]);
  useEffect(() => {
    let alive = true;
    const tick = () => getJSON(`/api/timeline?date=${day}&bucket=raw`).then((d) => alive && setPts((d.points || []).slice(-90))).catch(() => {});
    tick();
    const id = setInterval(tick, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [day]);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={pts} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffb627" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#ffb627" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="w" stroke="#ffb627" strokeWidth={2} fill="url(#sparkFill)" dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default function LiveDashboard({ s, live, dates, age }) {
  const cur = s?.currency || "€";
  const td = today();
  // When the logger is offline (stale, same threshold as the status pill in
  // App.jsx) the last sample is no longer "now" — show 0 W, not a frozen value.
  const offline = age != null && age >= 1800;
  const livePower = offline ? 0 : s?.live_power_w;

  return (
    <>
      {/* HERO */}
      <div className="hero rise">
        <div>
          <div className="now-label">Producing now</div>
          <div style={{ marginTop: 6 }}>
            <span className="now-val">{nf(livePower)}</span><span className="now-u">W</span>
          </div>
          <div className="spark">{<Sparkline day={td} />}</div>
        </div>
        <div className="side">
          <div className="mini">
            <div className="label">Today — energy</div>
            <div className="v" style={{ color: "var(--volt)" }}>{nf(s?.today_kwh, 1)}<span className="u">kWh</span></div>
          </div>
          <div className="mini">
            <div className="label">Today — advantage</div>
            <div className="v" style={{ color: "var(--good)" }}>{cur}{nf(s?.today_value, 2)}</div>
          </div>
        </div>
      </div>

      {/* STAT CARDS */}
      <div className="grid cols-4" style={{ marginTop: 14 }}>
        <Stat label="This month" value={nf(s?.month_kwh, 1)} unit="kWh" foot={`${cur}${nf(s?.month_value, 2)} saved`} color="var(--volt)" delay={0.05} />
        <Stat label="This year" value={nf(s?.year_kwh, 0)} unit="kWh" foot={`${cur}${nf(s?.year_value, 2)} saved`} color="var(--volt)" delay={0.1} />
        <Stat label="All-time recorded" value={nf(s?.all_kwh, 0)} unit="kWh" foot={`${cur}${nf(s?.all_value, 2)} · ${nf(s?.days_recorded)} days`} color="var(--good)" delay={0.15} />
        <Stat label="Inverter lifetime" value={nf(s?.total_kwh, 0)} unit="kWh" foot={`peak today ${nf(s?.today_peak_w)} W`} color="var(--solar)" delay={0.2} />
      </div>

      <div style={{ marginTop: 22 }}><ProductionChart lockToday title="Live production" /></div>

      <div className="section-h"><h2>Live telemetry</h2><span className="hint">instantaneous · updates each reading</span></div>
      <LiveMetrics live={live} />

      <div className="grid cols-2" style={{ marginTop: 14 }}>
        <Stat label="CO₂ avoided today" value={nf(s?.co2_kg_today, 1)} unit="kg" foot="≈0.35 kg/kWh grid mix" color="var(--good)" delay={0.05} />
        <Stat label="CO₂ avoided all-time" value={nf(s?.co2_kg_total, 0)} unit="kg" foot={`${nf((s?.co2_kg_total || 0) / 1000, 2)} t`} color="var(--good)" delay={0.1} />
      </div>
    </>
  );
}
