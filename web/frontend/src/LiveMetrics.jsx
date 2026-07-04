import { motion } from "framer-motion";
import { nf } from "./api.js";

// metric: label, value, unit, icon, color, and bar fill fraction (0..1)
function Metric({ m, i }) {
  return (
    <motion.div className="metric"
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: i * 0.04 }}>
      <div className="top">
        <span className="name">{m.label}</span>
        <span className="ico">{m.icon}</span>
      </div>
      <div className="reading" style={{ color: m.color }}>
        {nf(m.value, m.dp ?? 1)}<span className="u">{m.unit}</span>
      </div>
      {m.frac != null && (
        <div className="bar"><i style={{ width: `${Math.max(2, Math.min(100, m.frac * 100))}%`, background: m.color }} /></div>
      )}
    </motion.div>
  );
}

export default function LiveMetrics({ live }) {
  if (!live || !live.available)
    return <div className="card" style={{ gridColumn: "1 / -1", color: "var(--muted)" }}>Waiting for inverter telemetry…</div>;

  const eff = live.efficiency_pct;
  const items = [
    { label: "PV input", value: live.pv_in_w, unit: "W", icon: "▲", color: "var(--solar)", frac: live.pv_in_w / 6500 },
    { label: "AC output", value: live.pv_out_w, unit: "W", icon: "⏚", color: "var(--solar)", frac: live.pv_out_w / 6500 },
    { label: "Efficiency", value: eff, unit: "%", icon: "η", color: "var(--good)", frac: eff / 100, dp: 1 },
    { label: "String 1 voltage", value: live.pv1_v, unit: "V", icon: "⚡", color: "var(--volt)", frac: live.pv1_v / 600 },
    { label: "String 1 current", value: live.pv1_a, unit: "A", icon: "↯", color: "var(--volt)", frac: live.pv1_a / 12, dp: 1 },
    { label: "String 1 power", value: live.pv1_w, unit: "W", icon: "▲", color: "var(--solar)", frac: live.pv1_w / 6500 },
    { label: "Grid voltage", value: live.grid_v, unit: "V", icon: "⊟", color: "var(--grid)", frac: (live.grid_v - 200) / 60 },
    { label: "Grid current", value: live.grid_a, unit: "A", icon: "↯", color: "var(--grid)", frac: live.grid_a / 30, dp: 1 },
    { label: "Grid frequency", value: live.grid_hz, unit: "Hz", icon: "∿", color: "var(--grid)", frac: (live.grid_hz - 49.5) / 1, dp: 2 },
    { label: "Inverter temp", value: live.temp_c, unit: "°C", icon: "🌡", color: "var(--hot)", frac: live.temp_c / 90, dp: 1 },
    { label: "IPM temp", value: live.ipm_temp_c, unit: "°C", icon: "🌡", color: "var(--hot)", frac: live.ipm_temp_c / 90, dp: 1 },
    { label: "Total runtime", value: live.worktime_h, unit: "h", icon: "⧖", color: "var(--ink)", frac: null, dp: 0 },
  ];

  return (
    <div className="grid cols-4">
      {items.map((m, i) => <Metric key={m.label} m={m} i={i} />)}
    </div>
  );
}
