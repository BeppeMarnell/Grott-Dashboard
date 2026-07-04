import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePoll, ageSeconds, fmtAge } from "./api.js";
import LiveDashboard from "./LiveDashboard.jsx";
import Analytics from "./Analytics.jsx";
import Compare from "./Compare.jsx";

const TABS = [
  { id: "live", label: "Live", icon: "◉" },
  { id: "analytics", label: "Analytics", icon: "▤" },
  { id: "compare", label: "Compare", icon: "⇄" },
];

export default function App() {
  const { data: s } = usePoll("/api/summary", 20000);
  const { data: live } = usePoll("/api/live", 20000);
  const { data: datesData } = usePoll("/api/dates", 300000);
  const dates = datesData?.dates || [];
  const [tab, setTab] = useState("live");

  const age = s ? ageSeconds(s.last_seen, s.now) : null;
  const state = age == null ? "idle" : age < 150 ? "live" : age < 1800 ? "idle" : "stale";
  const statusText = { live: `live · ${fmtAge(age)}`, idle: `last seen ${fmtAge(age)}`, stale: `offline · ${fmtAge(age)}` }[state];

  return (
    <div className="wrap">
      <header className="topbar">
        <div className="brand">
          <div className="mark">☀</div>
          <div>
            <h1>Solar Command Center</h1>
            <div className="sub">{live?.inverter || "FPH1B03013"} · {live?.datalogger || "ShineLanBox"}</div>
          </div>
        </div>
        <div className="status">
          <span className={`dot ${state}`} />
          {statusText || "connecting…"}
          {live?.status && <span className={`chip ${live.status === "Normal" ? "normal" : live.status === "Fault" ? "fault" : ""}`}>{live.status}</span>}
        </div>
      </header>

      {/* TAB BAR */}
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? "on" : ""}`} onClick={() => setTab(t.id)}>
            <span className="tico">{t.icon}</span>{t.label}
            {tab === t.id && <motion.span className="tab-underline" layoutId="tab-underline" />}
          </button>
        ))}
      </nav>

      <AnimatePresence mode="wait">
        <motion.div key={tab}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}>
          {tab === "live" && <LiveDashboard s={s} live={live} dates={dates} age={age} />}
          {tab === "analytics" && <Analytics dates={dates} />}
          {tab === "compare" && <Compare dates={dates} />}
        </motion.div>
      </AnimatePresence>

      <footer>solar_panels_logger · local &amp; private · grott → SQLite → React</footer>
    </div>
  );
}
