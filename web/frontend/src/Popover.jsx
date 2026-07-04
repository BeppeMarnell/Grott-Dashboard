import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { dayLabel, monthLabel, isoLocal } from "./api.js";

const POP_W = 320; // estimate used only for viewport clamping

// A popover anchored to a trigger button but rendered into <body> via a portal.
// Because it lives at the top of the stacking order, it can never be covered by
// a sibling panel (the bug where the calendar slid under "Yearly totals").
export default function Popover({ label, children, className = "" }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const tRef = useRef(null);
  const pRef = useRef(null);

  const place = () => {
    const t = tRef.current?.getBoundingClientRect();
    if (!t) return;
    const left = Math.max(8, Math.min(t.left, window.innerWidth - POP_W - 8));
    setPos({ top: t.bottom + 8, left });
  };

  useLayoutEffect(() => { if (open) place(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!tRef.current?.contains(e.target) && !pRef.current?.contains(e.target)) setOpen(false);
    };
    const onMove = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  return (
    <>
      <button ref={tRef} className={`cal-trigger ${className}`} onClick={() => setOpen((o) => !o)}>
        {label} <span style={{ opacity: 0.6 }}>▾</span>
      </button>
      {open && createPortal(
        <div ref={pRef} className="cal-pop cal-pop-fixed" style={{ top: pos.top, left: pos.left }}>
          {children(() => setOpen(false))}
        </div>,
        document.body
      )}
    </>
  );
}

const isMonthKey = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthDate = (key) => new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, 1);
const monthNumber = (key) => +key.slice(0, 4) * 12 + +key.slice(5, 7) - 1;

function availableMonths(dates) {
  return Array.from(new Set(
    (dates || [])
      .map((d) => String(d).slice(0, 7))
      .filter(isMonthKey)
  )).sort();
}

function monthBounds(months) {
  if (!months.length) {
    const m = new Date();
    const cur = new Date(m.getFullYear(), m.getMonth(), 1);
    return { startMonth: cur, endMonth: cur };
  }
  return { startMonth: monthDate(months[0]), endMonth: monthDate(months[months.length - 1]) };
}

function nearestAvailableMonth(d, months, fallback) {
  if (!months.length) return fallback;

  const key = monthKey(d);
  if (months.includes(key)) return monthDate(key);

  const target = monthNumber(key);
  const closest = months.reduce((best, next) => {
    const bestGap = Math.abs(monthNumber(best) - target);
    const nextGap = Math.abs(monthNumber(next) - target);
    return nextGap < bestGap ? next : best;
  }, months[0]);

  return monthDate(closest);
}

function snapAvailableMonth(next, current, months, fallback) {
  if (!months.length) return fallback;

  const key = monthKey(next);
  if (months.includes(key)) return monthDate(key);

  const target = monthNumber(key);
  const currentNum = monthNumber(monthKey(current));

  if (target > currentNum) {
    const later = months.find((m) => monthNumber(m) >= target);
    return monthDate(later || months[months.length - 1]);
  }

  if (target < currentNum) {
    for (let i = months.length - 1; i >= 0; i -= 1) {
      if (monthNumber(months[i]) <= target) return monthDate(months[i]);
    }
    return monthDate(months[0]);
  }

  return nearestAvailableMonth(next, months, fallback);
}

const loggedDays = (dates) =>
  (dates || []).map((d) => new Date(String(d).slice(0, 10) + "T00:00:00"));

const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

function useAvailableCalendarMonth(value, dates) {
  const months = useMemo(() => availableMonths(dates), [dates]);
  const monthsSig = months.join("|");
  const { startMonth, endMonth } = useMemo(() => monthBounds(months), [monthsSig]);
  const selectedMonth = value && isMonthKey(String(value).slice(0, 7))
    ? monthDate(String(value).slice(0, 7))
    : null;
  const [month, setMonth] = useState(() => nearestAvailableMonth(selectedMonth || endMonth, months, endMonth));

  useEffect(() => {
    setMonth(nearestAvailableMonth(selectedMonth || endMonth, months, endMonth));
  }, [value, monthsSig]);

  const setAvailableMonth = (next) => {
    setMonth((current) => snapAvailableMonth(next, current, months, endMonth));
  };

  return { months, month, setAvailableMonth, startMonth, endMonth };
}

// Single-day picker. value/onChange are "YYYY-MM-DD"; only logged days are selectable.
export function DayField({ value, onChange, dates, color }) {
  const sel = value ? new Date(value + "T00:00:00") : undefined;
  const { month, setAvailableMonth, startMonth, endMonth } = useAvailableCalendarMonth(value, dates);
  const logged = new Set((dates || []).map((d) => String(d).slice(0, 10)));
  return (
    <Popover label={<span style={color ? { color } : undefined}>{value ? dayLabel(value) : "Pick a day"}</span>}>
      {(close) => (
        <DayPicker
          mode="single" captionLayout="dropdown"
          startMonth={startMonth} endMonth={endMonth}
          month={month} onMonthChange={setAvailableMonth}
          selected={sel}
          onSelect={(d) => {
            if (!d) return;
            const next = isoLocal(d);
            if (!logged.has(next)) return;
            onChange(next);
            close();
          }}
          disabled={(d) => !logged.has(isoLocal(d))}
          modifiers={{ logged: loggedDays(dates) }} modifiersClassNames={{ logged: "rdp-logged" }}
        />
      )}
    </Popover>
  );
}

// Month picker. value/onChange are "YYYY-MM". Only months that have data are
// selectable: every day in an empty month is disabled, so it can't be clicked.
export function MonthField({ value, onChange, dates, color }) {
  const sel = value ? new Date(value + "-01T00:00:00") : undefined;
  const { months, month, setAvailableMonth, startMonth, endMonth } = useAvailableCalendarMonth(value, dates);
  const has = new Set(months);
  return (
    <Popover label={<span style={color ? { color } : undefined}>{value ? monthLabel(value) : "Pick a month"}</span>}>
      {(close) => (
        <DayPicker
          mode="single" captionLayout="dropdown"
          startMonth={startMonth} endMonth={endMonth}
          month={month} onMonthChange={setAvailableMonth}
          selected={sel}
          onSelect={(d) => {
            if (!d) return;
            const next = ym(d);
            if (!has.has(next)) return;
            onChange(next);
            close();
          }}
          disabled={(d) => !has.has(ym(d))}
        />
      )}
    </Popover>
  );
}
