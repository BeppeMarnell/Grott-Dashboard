import { useEffect, useRef, useState, useCallback } from "react";

export async function getJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

// Poll an endpoint on an interval; returns { data, error, reload }.
export function usePoll(url, ms = 30000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const urlRef = useRef(url);
  urlRef.current = url;

  const reload = useCallback(() => {
    getJSON(urlRef.current).then((d) => { setData(d); setError(null); }).catch(setError);
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () => getJSON(urlRef.current).then((d) => alive && setData(d)).catch((e) => alive && setError(e));
    tick();
    const id = setInterval(tick, ms);
    return () => { alive = false; clearInterval(id); };
  }, [url, ms]);

  return { data, error, reload };
}

export const nf = (v, d = 0) =>
  v == null || isNaN(v)
    ? "–"
    : Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

export function ageSeconds(iso, nowIso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  const now = nowIso ? new Date(nowIso).getTime() : Date.now();
  return Math.max(0, Math.round((now - t) / 1000));
}

export const hhmm = (iso) => (iso ? iso.slice(11, 16) : "");
export const fmtAge = (s) =>
  s == null ? "—" : s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;

export const today = () => new Date().toISOString().slice(0, 10);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthShort = (i) => MONTHS[i] || "";
// "2026-06" -> "Jun 2026" ; "2026-06-24" -> "Jun 24"
export const monthLabel = (ym) => {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  return `${MONTHS[(+m || 1) - 1]} ${y}`;
};
export const dayLabel = (d) => {
  if (!d) return "";
  const [, m, day] = d.split("-");
  return `${MONTHS[(+m || 1) - 1]} ${+day}`;
};
export const dayLong = (d) => {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
};
// Local YYYY-MM-DD for a Date (avoids the UTC shift of toISOString()).
export const isoLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
