import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, Cell,
} from "recharts";
import { usePoll, getJSON, nf, dayLong, dayLabel, monthLabel } from "./api.js";
import { DayField, MonthField } from "./Popover.jsx";

const MODES = [
  { id: "days", label: "Days" },
  { id: "months", label: "Months" },
  { id: "years", label: "Years" },
];

const A_COLOR = "#ffb627";
const B_COLOR = "#6ea8fe";

const minuteOf = (p) => p?.t?.slice(11, 16) || "";
const minuteNumber = (hhmm) => {
  const [h, m] = String(hhmm || "0:0").split(":").map((v) => +v || 0);
  return h * 60 + m;
};
const minuteLabel = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function pointsThrough(points, cutoff) {
  if (!cutoff) return points || [];
  const end = minuteNumber(cutoff);
  return (points || []).filter((p) => minuteNumber(minuteOf(p)) <= end);
}

function lastKwh(points) {
  return points.length ? points[points.length - 1].kwh ?? 0 : 0;
}

function peakW(points) {
  return Math.max(...points.map((p) => p.w || 0), 0);
}

function series(points) {
  return (points || [])
    .map((p) => ({ x: minuteNumber(minuteOf(p)), w: p.w }))
    .filter((p) => Number.isFinite(p.x) && p.w != null)
    .sort((a, b) => a.x - b.x);
}

function valueAt(points, x) {
  if (!points.length || x < points[0].x || x > points[points.length - 1].x) return null;

  for (let i = 0; i < points.length; i += 1) {
    if (points[i].x === x) return points[i].w;
    if (points[i].x > x) {
      const prev = points[i - 1];
      const next = points[i];
      if (!prev || !next || next.x === prev.x) return null;
      const ratio = (x - prev.x) / (next.x - prev.x);
      return prev.w + (next.w - prev.w) * ratio;
    }
  }

  return null;
}

function alignedSeries(aPoints, bPoints) {
  const a = series(aPoints);
  const b = series(bPoints);
  const xs = Array.from(new Set([...a.map((p) => p.x), ...b.map((p) => p.x)])).sort((x, y) => x - y);

  return xs.map((x) => ({
    x,
    a: valueAt(a, x),
    b: valueAt(b, x),
  }));
}

function Delta({ a, b, unit, dp = 0 }) {
  if (a == null || b == null) return null;
  const diff = a - b;
  const pct = b ? (diff / b) * 100 : 0;
  const up = diff >= 0;
  return (
    <span className={`delta ${up ? "up" : "down"}`}>
      {up ? "▲" : "▼"} {nf(Math.abs(diff), dp)}{unit} ({nf(Math.abs(pct), 0)}%)
    </span>
  );
}

/* ---------------- DAYS: overlay two intraday curves ---------------- */
function CompareDays({ dates }) {
  const list = dates.length ? dates : [];
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  const dayA = a || list[0];
  const dayB = b || list[1] || list[0];
  const [pa, setPa] = useState(null);
  const [pb, setPb] = useState(null);

  useEffect(() => {
    if (!dayA) return;
    getJSON(`/api/timeline?date=${dayA}&bucket=5`).then(setPa).catch(() => {});
  }, [dayA]);
  useEffect(() => {
    if (!dayB) return;
    getJSON(`/api/timeline?date=${dayB}&bucket=5`).then(setPb).catch(() => {});
  }, [dayB]);

  const latestDay = list[0];
  const liveCutoff = dayA === latestDay
    ? minuteOf(pa?.points?.at(-1))
    : dayB === latestDay
      ? minuteOf(pb?.points?.at(-1))
      : "";
  const pointsA = useMemo(() => pointsThrough(pa?.points, liveCutoff), [pa, liveCutoff]);
  const pointsB = useMemo(() => pointsThrough(pb?.points, liveCutoff), [pb, liveCutoff]);

  const merged = useMemo(() => alignedSeries(pointsA, pointsB), [pointsA, pointsB]);

  const kA = lastKwh(pointsA);
  const kB = lastKwh(pointsB);
  const peakA = peakW(pointsA);
  const peakB = peakW(pointsB);

  return (
    <>
      <div className="cmp-pick">
        <label><span className="dotk" style={{ background: A_COLOR }} />A
          <DayField value={dayA} onChange={setA} dates={list} color={A_COLOR} />
        </label>
        <label><span className="dotk" style={{ background: B_COLOR }} />B
          <DayField value={dayB} onChange={setB} dates={list} color={B_COLOR} />
        </label>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="label" style={{ color: A_COLOR }}>{dayLong(dayA)}</div>
          <div className="val" style={{ fontSize: 30 }}>{nf(kA, 1)}<span className="u">kWh</span></div>
          <div className="foot">peak {nf(peakA, 0)} W</div>
        </div>
        <div className="card">
          <div className="label" style={{ color: B_COLOR }}>{dayLong(dayB)}</div>
          <div className="val" style={{ fontSize: 30 }}>{nf(kB, 1)}<span className="u">kWh</span> <span style={{ fontSize: 13 }}><Delta a={kA} b={kB} unit="kWh" dp={1} /></span></div>
          <div className="foot">peak {nf(peakB, 0)} W</div>
        </div>
      </div>

      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={merged} margin={{ top: 6, right: 8, left: -4, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} tickFormatter={minuteLabel}
              tick={{ fill: "#5a6473", fontSize: 11, fontFamily: "JetBrains Mono" }} minTickGap={42} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#5a6473", fontSize: 11, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} width={48} />
            <Tooltip
              contentStyle={{ background: "#0d1016", border: "1px solid var(--line2)", borderRadius: 10, fontFamily: "JetBrains Mono", fontSize: 12 }}
              labelStyle={{ color: "var(--muted)" }}
              labelFormatter={minuteLabel}
              formatter={(v, n) => [`${nf(v)} W`, n === "a" ? dayLabel(dayA) : dayLabel(dayB)]} />
            <Line type="monotone" dataKey="a" name="a" stroke={A_COLOR} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
            <Line type="monotone" dataKey="b" name="b" stroke={B_COLOR} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="cmp-hint">
        Intraday power aligned by time of day{liveCutoff ? ` · compared through ${liveCutoff}` : ""}.
      </div>
    </>
  );
}

/* ---------------- MONTHS: pick two months, compare totals ---------------- */
function CompareMonths() {
  const { data } = usePoll("/api/monthly", 120000);
  const months = data?.months || [];
  const cur = data?.currency || "€";
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  if (months.length < 1) return <div className="cmp-hint">Not enough months recorded yet.</div>;

  const ids = months.map((m) => m.month);
  const mA = a || ids.at(-1);
  const mB = b || ids[ids.length - 2] || ids[0];
  const rA = months.find((m) => m.month === mA) || {};
  const rB = months.find((m) => m.month === mB) || {};
  const bars = [
    { k: mA, kwh: rA.kwh || 0, fill: A_COLOR },
    { k: mB, kwh: rB.kwh || 0, fill: B_COLOR },
  ];

  return (
    <>
      <div className="cmp-pick">
        <label><span className="dotk" style={{ background: A_COLOR }} />A
          <MonthField value={mA} onChange={setA} dates={ids} color={A_COLOR} />
        </label>
        <label><span className="dotk" style={{ background: B_COLOR }} />B
          <MonthField value={mB} onChange={setB} dates={ids} color={B_COLOR} />
        </label>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="label" style={{ color: A_COLOR }}>{monthLabel(mA)}</div>
          <div className="val" style={{ fontSize: 30 }}>{nf(rA.kwh, 0)}<span className="u">kWh</span></div>
          <div className="foot">{cur}{nf(rA.value, 2)} · {rA.days} days · avg {nf(rA.avg_kwh, 1)} kWh/d</div>
        </div>
        <div className="card">
          <div className="label" style={{ color: B_COLOR }}>{monthLabel(mB)}</div>
          <div className="val" style={{ fontSize: 30 }}>{nf(rB.kwh, 0)}<span className="u">kWh</span> <span style={{ fontSize: 13 }}><Delta a={rA.kwh} b={rB.kwh} unit="kWh" /></span></div>
          <div className="foot">{cur}{nf(rB.value, 2)} · {rB.days} days · avg {nf(rB.avg_kwh, 1)} kWh/d</div>
        </div>
      </div>

      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bars} margin={{ top: 6, right: 6, left: -4, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="k" tickFormatter={monthLabel} tick={{ fill: "#8b97a8", fontSize: 12, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#5a6473", fontSize: 11, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} width={46} />
            <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }}
              contentStyle={{ background: "#0d1016", border: "1px solid var(--line2)", borderRadius: 10, fontFamily: "JetBrains Mono", fontSize: 12 }}
              formatter={(v) => [`${nf(v, 0)} kWh`, "energy"]} labelFormatter={monthLabel} />
            <Bar dataKey="kwh" radius={[6, 6, 0, 0]} maxBarSize={120}>
              {bars.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/* ---------------- YEARS: year-over-year monthly overlay ---------------- */
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const YR_COLORS = ["#ffb627", "#6ea8fe", "#54e08a", "#ff6b6b", "#38d9c4"];

function CompareYears() {
  const { data } = usePoll("/api/monthly", 120000);
  const months = data?.months || [];
  const years = useMemo(() => Array.from(new Set(months.map((m) => m.month.slice(0, 4)))).sort(), [months]);

  const rows = useMemo(() => {
    const base = MO.map((label, i) => ({ mo: label, idx: i }));
    months.forEach((m) => {
      const y = m.month.slice(0, 4);
      const i = +m.month.slice(5, 7) - 1;
      base[i][y] = m.kwh;
    });
    return base;
  }, [months]);

  if (years.length < 1) return <div className="cmp-hint">Not enough data for a year-over-year view yet.</div>;

  return (
    <>
      <div className="cmp-hint" style={{ marginTop: 0, marginBottom: 12 }}>
        Each line is one year across the calendar — see how seasons and weather shift production year to year.
      </div>
      <div style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 6, right: 8, left: -4, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="mo" tick={{ fill: "#5a6473", fontSize: 11, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#5a6473", fontSize: 11, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} width={48} />
            <Tooltip
              contentStyle={{ background: "#0d1016", border: "1px solid var(--line2)", borderRadius: 10, fontFamily: "JetBrains Mono", fontSize: 12 }}
              labelStyle={{ color: "var(--muted)" }} formatter={(v, n) => [`${nf(v, 0)} kWh`, n]} />
            <Legend wrapperStyle={{ fontFamily: "JetBrains Mono", fontSize: 12 }} />
            {years.map((y, i) => (
              <Line key={y} type="monotone" dataKey={y} stroke={YR_COLORS[i % YR_COLORS.length]}
                strokeWidth={2.5} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

export default function Compare({ dates }) {
  const [mode, setMode] = useState("days");
  return (
    <>
      <div className="section-h" style={{ marginTop: 6 }}>
        <h2>Compare</h2>
        <div className="seg">
          {MODES.map((m) => (
            <button key={m.id} className={mode === m.id ? "on" : ""} onClick={() => setMode(m.id)}>{m.label}</button>
          ))}
        </div>
      </div>
      <div className="panel rise">
        {mode === "days" && <CompareDays dates={dates} />}
        {mode === "months" && <CompareMonths />}
        {mode === "years" && <CompareYears />}
      </div>
    </>
  );
}
