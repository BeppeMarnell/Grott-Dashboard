import { Fragment, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import Popover from "./Popover.jsx";
import { usePoll, nf, dayLong } from "./api.js";

const WD = ["Mon", "", "Wed", "", "Fri", "", ""];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// 5 buckets of green→solar intensity, plus an "empty" tone.
const TONES = ["rgba(255,255,255,0.05)", "#16361f", "#1f7a3d", "#54e08a", "#bfff7a", "#ffb627"];
// Upper-bound fraction of the best day for each non-empty tone.
const FRACS = [0.2, 0.45, 0.7, 0.9, 1];

function level(kwh, max) {
  if (kwh == null || kwh <= 0 || max <= 0) return 0;
  const f = kwh / max;
  if (f < FRACS[0]) return 1;
  if (f < FRACS[1]) return 2;
  if (f < FRACS[2]) return 3;
  if (f < FRACS[3]) return 4;
  return 5;
}

// Local YYYY-MM-DD (avoid UTC shift from toISOString).
const isoLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function CalendarHeatmap() {
  const { data } = usePoll("/api/calendar", 120000);
  const all = data?.days || [];
  const max = data?.max_kwh || 1;

  const byDay = useMemo(() => Object.fromEntries(all.map((d) => [d.day, d])), [all]);

  // Bounds for the picker's month/year dropdowns: first recorded year → this month.
  const now = new Date();
  const firstYear = all.length ? +all[0].day.slice(0, 4) : now.getFullYear();
  const startMonth = new Date(firstYear, 0, 1);
  const endMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // `month` drives which year the heatmap shows; `selected` highlights one day.
  const [month, setMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selected, setSelected] = useState(undefined);

  const yr = String(month.getFullYear());
  const selISO = selected ? isoLocal(selected) : null;

  // Build week columns (Mon-first) covering the displayed year.
  const { weeks, monthSpans, total, active } = useMemo(() => {
    const start = new Date(`${yr}-01-01T00:00:00`);
    const end = new Date(`${yr}-12-31T00:00:00`);
    const cur = new Date(start);
    const dow = (cur.getDay() + 6) % 7; // 0 = Mon
    cur.setDate(cur.getDate() - dow);

    const weeks = [];
    const monthSpans = [];
    let total = 0, active = 0, lastMonth = -1, week = [];
    while (cur <= end || week.length) {
      const iso = isoLocal(cur);
      const inYear = iso.slice(0, 4) === yr;
      const rec = inYear ? byDay[iso] : null;
      if (rec) { total += rec.kwh; active += 1; }
      week.push({ iso, inYear, rec });
      if (week.length === 7) {
        if (week[0].inYear && cur.getMonth() !== lastMonth) {
          lastMonth = cur.getMonth();
          monthSpans.push({ col: weeks.length, label: MO[cur.getMonth()] });
        }
        weeks.push(week);
        week = [];
      }
      cur.setDate(cur.getDate() + 1);
      if (cur > end && week.length === 0) break;
      if (cur > end && week.length === 7) { weeks.push(week); week = []; break; }
    }
    if (week.length) weeks.push(week);
    return { weeks, monthSpans, total, active };
  }, [yr, byDay]);

  // Legend kWh marks: 0 then each tone's upper-bound kWh.
  const marks = [0, ...FRACS.map((f) => max * f)];
  const pickerLabel = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="panel rise" style={{ animationDelay: "0.1s" }}>
      <div className="section-h" style={{ margin: "2px 2px 14px" }}>
        <h2>Production calendar</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="hint">{nf(total, 0)} kWh · {active} sunny days · {yr}</span>
          <Popover label={pickerLabel}>
            {(close) => (
              <DayPicker
                mode="single"
                captionLayout="dropdown"
                startMonth={startMonth}
                endMonth={endMonth}
                month={month}
                onMonthChange={setMonth}
                selected={selected}
                onSelect={(d) => {
                  if (d) { setSelected(d); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }
                  close();
                }}
                disabled={(d) => !byDay[isoLocal(d)]}
                modifiers={{ logged: all.map((d) => new Date(d.day + "T00:00:00")) }}
                modifiersClassNames={{ logged: "rdp-logged" }}
              />
            )}
          </Popover>
        </div>
      </div>

      <div className="heat-scroll">
        <div className="heat-months">
          {monthSpans.map((m) => (
            <span key={m.label} className="heat-mo" style={{ left: 26 + m.col * 15 }}>{m.label}</span>
          ))}
        </div>
        <div className="heat-body">
          <div className="heat-wd">
            {WD.map((w, i) => <span key={i}>{w}</span>)}
          </div>
          <div className="heat-grid">
            {weeks.map((week, wi) => (
              <div key={wi} className="heat-col">
                {week.map((d, di) => (
                  <i
                    key={di}
                    className={`heat-cell${d.iso === selISO ? " sel" : ""}`}
                    style={{ background: d.inYear ? TONES[level(d.rec?.kwh, max)] : "transparent" }}
                    title={d.inYear ? `${dayLong(d.iso)} — ${d.rec ? nf(d.rec.kwh, 1) + " kWh" : "no data"}` : ""}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="heat-legend">
        {TONES.slice(1).map((t, i) => (
          <Fragment key={i}>
            <span className="heat-mark">{nf(marks[i], marks[i] < 10 ? 1 : 0)}</span>
            <i style={{ background: t }} />
          </Fragment>
        ))}
        <span className="heat-mark">{nf(marks[5], 1)}</span>
        <span className="heat-unit">kWh / day</span>
      </div>
    </div>
  );
}
