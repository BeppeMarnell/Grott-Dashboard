"""
Solar dashboard backend.

Reads the SQLite db filled by the grott extension and exposes JSON APIs for the
React frontend (built into ./frontend/dist and served as static files):

  /api/summary   today / month / year / all-time energy + money, live power
  /api/live      latest instantaneous technical metrics (PV strings, grid, temps)
  /api/timeline  intraday power curve with selectable granularity
  /api/history   per-day energy + money for the history chart
"""

import os
import json
import configparser
import datetime
import sqlite3
from zoneinfo import ZoneInfo

from flask import Flask, jsonify, request, send_from_directory

TZ = ZoneInfo(os.environ.get("SOLAR_TZ", "Europe/Rome"))

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(ROOT, "config.ini")
DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend", "dist")

cfg = configparser.ConfigParser()
cfg.read(CONFIG_PATH)

# Environment variables (set by Docker) override config.ini.
DB_PATH = os.environ.get("SOLAR_DB") or cfg.get(
    "paths", "db", fallback=os.path.join(ROOT, "data", "solar.db"))
PRICE = float(os.environ.get("SOLAR_PRICE") or
              cfg.getfloat("economics", "price_eur_per_kwh", fallback=0.25))
CURRENCY = cfg.get("economics", "currency_symbol", fallback="€")
REFRESH = int(os.environ.get("SOLAR_REFRESH") or
              cfg.getint("web", "refresh_seconds", fallback=60))
HOST = os.environ.get("SOLAR_WEB_HOST") or cfg.get("web", "host", fallback="127.0.0.1")
PORT = int(os.environ.get("SOLAR_WEB_PORT") or cfg.getint("web", "port", fallback=8088))

app = Flask(__name__, static_folder=None)


# --- raw register decoding ---------------------------------------------------
# grott stores raw (undivided) register values in samples.raw_json. These are the
# standard Growatt divide factors for the fields this FPH inverter reports.
def _f(raw, key, divide=1.0):
    try:
        v = raw.get(key)
        return None if v is None else round(float(v) / divide, 3)
    except (TypeError, ValueError):
        return None

PV_STATUS = {0: "Waiting", 1: "Normal", 2: "Fault", 3: "Flash/Update"}


def decode_metrics(raw):
    pv_in = _f(raw, "pvpowerin", 10) or 0.0
    pv_out = _f(raw, "pvpowerout", 10) or 0.0
    eff = round(pv_out / pv_in * 100, 1) if pv_in > 0 else None
    return {
        "status": PV_STATUS.get(int(raw.get("pvstatus", -1)), "Unknown"),
        "pv_in_w": pv_in,
        "pv_out_w": pv_out,
        "efficiency_pct": eff,
        "pv1_v": _f(raw, "pv1voltage", 10),
        "pv1_a": _f(raw, "pv1current", 10),
        "pv1_w": _f(raw, "pv1watt", 10),
        "pv2_v": _f(raw, "pv2voltage", 10),
        "pv2_a": _f(raw, "pv2current", 10),
        "pv2_w": _f(raw, "pv2watt", 10),
        "grid_v": _f(raw, "pvgridvoltage", 10),
        "grid_a": _f(raw, "pvgridcurrent", 10),
        "grid_w": _f(raw, "pvgridpower", 10),
        "grid_hz": _f(raw, "pvfrequentie", 100),
        "temp_c": _f(raw, "pvtemperature", 10),
        "ipm_temp_c": _f(raw, "pvipmtemperature", 10),
        "worktime_h": _f(raw, "totworktime", 7200),
        "energy_today_kwh": _f(raw, "pvenergytoday", 10),
        "energy_total_kwh": _f(raw, "pvenergytotal", 10),
    }


# --- db helper ---------------------------------------------------------------
def q(sql, params=()):
    if not os.path.exists(DB_PATH):
        return []
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    try:
        return con.execute(sql, params).fetchall()
    except sqlite3.OperationalError:
        return []
    finally:
        con.close()


def _now():
    return datetime.datetime.now(TZ)


def money(kwh):
    return round((kwh or 0.0) * PRICE, 2)


def summary():
    today = _now().date().isoformat()
    drow = q("SELECT energy_kwh, peak_power_w, updated_at FROM daily WHERE day=?", (today,))
    today_kwh = (drow[0]["energy_kwh"] or 0.0) if drow else 0.0
    today_peak = (drow[0]["peak_power_w"] or 0.0) if drow else 0.0
    updated = drow[0]["updated_at"] if drow else None

    # Order by ts (the reading's real time), not insert id: while the logger
    # flushes its buffered backlog, the newest-inserted rows are old records, so
    # "live" must follow the latest timestamp to stay on the current reading.
    lrow = q("SELECT ts, power_w, energy_total_kwh FROM samples ORDER BY ts DESC LIMIT 1")
    live_power = (lrow[0]["power_w"] or 0.0) if lrow else 0.0
    total_kwh = (lrow[0]["energy_total_kwh"] or 0.0) if lrow else 0.0
    last_seen = lrow[0]["ts"] if lrow else None

    def period_kwh(prefix):
        r = q("SELECT COALESCE(SUM(energy_kwh),0) AS s FROM daily WHERE day LIKE ?", (prefix + "%",))
        return r[0]["s"] if r else 0.0

    month_kwh = period_kwh(today[:7])
    year_kwh = period_kwh(today[:4])
    all_kwh = (q("SELECT COALESCE(SUM(energy_kwh),0) AS s FROM daily") or [{"s": 0.0}])[0]["s"]
    days_rec = (q("SELECT COUNT(*) AS c FROM daily") or [{"c": 0}])[0]["c"]

    return {
        "live_power_w": round(live_power, 1),
        "today_kwh": round(today_kwh, 2), "today_value": money(today_kwh),
        "today_peak_w": round(today_peak, 1),
        "month_kwh": round(month_kwh, 2), "month_value": money(month_kwh),
        "year_kwh": round(year_kwh, 2), "year_value": money(year_kwh),
        "all_kwh": round(all_kwh, 2), "all_value": money(all_kwh),
        "total_kwh": round(total_kwh, 1), "days_recorded": days_rec,
        "co2_kg_today": round(today_kwh * 0.35, 1),   # ~0.35 kg CO2 / kWh grid avg
        "co2_kg_total": round(all_kwh * 0.35, 1),
        "price": PRICE, "currency": CURRENCY,
        "updated": updated, "last_seen": last_seen, "now": _now().isoformat(),
    }


@app.route("/api/summary")
def api_summary():
    return jsonify(summary())


@app.route("/api/live")
def api_live():
    row = q("SELECT ts, raw_json FROM samples WHERE raw_json IS NOT NULL ORDER BY ts DESC LIMIT 1")
    if not row:
        return jsonify({"available": False, "now": _now().isoformat()})
    raw = json.loads(row[0]["raw_json"])
    out = decode_metrics(raw)
    out.update({"available": True, "ts": row[0]["ts"], "now": _now().isoformat(),
                "datalogger": raw.get("datalogserial"), "inverter": raw.get("pvserial")})
    return jsonify(out)


@app.route("/api/timeline")
def api_timeline():
    """Intraday power curve. ?date=YYYY-MM-DD (default today) &bucket=raw|5|15 (minutes)."""
    date = request.args.get("date") or _now().date().isoformat()
    bucket = request.args.get("bucket", "raw")
    # Order by ts, not insert id: when the logger flushes a buffered backlog it
    # arrives interleaved with live readings (e.g. this morning's withheld sunrise
    # data lands between tonight's live points). Plotting by insert order makes the
    # curve oscillate; ts (the reading's real time) yields the true chronological day.
    rows = q("SELECT ts, power_w, energy_today_kwh FROM samples "
             "WHERE ts LIKE ? ORDER BY ts ASC", (date + "%",))
    pts = [{"t": r["ts"], "w": round(r["power_w"] or 0.0, 1),
            "kwh": round(r["energy_today_kwh"] or 0.0, 2)} for r in rows]

    if bucket in ("5", "15") and pts:
        step = int(bucket)
        buckets = {}
        for p in pts:
            hm = p["t"][11:16]
            h, m = int(hm[:2]), int(hm[3:5])
            key = f"{h:02d}:{(m // step) * step:02d}"
            b = buckets.setdefault(key, {"sum": 0.0, "n": 0, "kwh": p["kwh"]})
            b["sum"] += p["w"]; b["n"] += 1; b["kwh"] = p["kwh"]
        pts = [{"t": f"{date}T{k}:00", "w": round(v["sum"] / v["n"], 1), "kwh": v["kwh"]}
               for k, v in sorted(buckets.items())]

    peak = max((p["w"] for p in pts), default=0.0)
    return jsonify({"date": date, "bucket": bucket, "points": pts, "peak_w": peak,
                    "now": _now().isoformat()})


@app.route("/api/history")
def api_history():
    days_n = int(request.args.get("days", 60))
    rows = list(reversed(q("SELECT day, energy_kwh, peak_power_w FROM daily "
                           "ORDER BY day DESC LIMIT ?", (days_n,))))
    return jsonify({
        "currency": CURRENCY,
        "days": [{"day": r["day"], "kwh": round(r["energy_kwh"] or 0.0, 2),
                  "value": money(r["energy_kwh"]),
                  "peak_w": round(r["peak_power_w"] or 0.0, 1)} for r in rows],
    })


@app.route("/api/dates")
def api_dates():
    rows = q("SELECT DISTINCT substr(ts,1,10) AS d FROM samples ORDER BY d DESC")
    return jsonify({"dates": [r["d"] for r in rows]})


@app.route("/api/monthly")
def api_monthly():
    """Energy per calendar month. ?year=YYYY filters; default all months recorded."""
    year = request.args.get("year")
    if year:
        rows = q("SELECT substr(day,1,7) AS m, SUM(energy_kwh) AS kwh, "
                 "MAX(peak_power_w) AS peak, COUNT(*) AS days FROM daily "
                 "WHERE day LIKE ? GROUP BY m ORDER BY m", (year + "%",))
    else:
        rows = q("SELECT substr(day,1,7) AS m, SUM(energy_kwh) AS kwh, "
                 "MAX(peak_power_w) AS peak, COUNT(*) AS days FROM daily "
                 "GROUP BY m ORDER BY m")
    months = [{"month": r["m"], "kwh": round(r["kwh"] or 0.0, 1),
               "value": money(r["kwh"]), "peak_w": round(r["peak"] or 0.0, 1),
               "days": r["days"], "avg_kwh": round((r["kwh"] or 0.0) / max(r["days"], 1), 1)}
              for r in rows]
    return jsonify({"currency": CURRENCY, "months": months})


@app.route("/api/yearly")
def api_yearly():
    """Energy per calendar year (whole history)."""
    rows = q("SELECT substr(day,1,4) AS y, SUM(energy_kwh) AS kwh, "
             "MAX(peak_power_w) AS peak, COUNT(*) AS days FROM daily "
             "GROUP BY y ORDER BY y")
    years = [{"year": r["y"], "kwh": round(r["kwh"] or 0.0, 1),
              "value": money(r["kwh"]), "peak_w": round(r["peak"] or 0.0, 1),
              "days": r["days"], "avg_kwh": round((r["kwh"] or 0.0) / max(r["days"], 1), 1)}
             for r in rows]
    return jsonify({"currency": CURRENCY, "years": years})


@app.route("/api/calendar")
def api_calendar():
    """Every recorded day's energy — for a GitHub-style production heatmap."""
    rows = q("SELECT day, energy_kwh, peak_power_w FROM daily ORDER BY day ASC")
    days = [{"day": r["day"], "kwh": round(r["energy_kwh"] or 0.0, 2),
             "peak_w": round(r["peak_power_w"] or 0.0, 1)} for r in rows]
    mx = max((d["kwh"] for d in days), default=0.0)
    return jsonify({"currency": CURRENCY, "max_kwh": round(mx, 2), "days": days})


@app.route("/api/records")
def api_records():
    """Headline records & lifetime stats for the analytics overview."""
    def one(sql):
        r = q(sql)
        return dict(r[0]) if r else None

    best_day = one("SELECT day, energy_kwh AS kwh, peak_power_w AS peak_w "
                   "FROM daily ORDER BY energy_kwh DESC LIMIT 1")
    best_peak = one("SELECT day, peak_power_w AS peak_w, energy_kwh AS kwh "
                    "FROM daily ORDER BY peak_power_w DESC LIMIT 1")
    best_month = one("SELECT substr(day,1,7) AS month, SUM(energy_kwh) AS kwh "
                     "FROM daily GROUP BY month ORDER BY kwh DESC LIMIT 1")
    agg = one("SELECT COUNT(*) AS days, COALESCE(SUM(energy_kwh),0) AS total, "
              "COALESCE(AVG(energy_kwh),0) AS avg_day, MAX(peak_power_w) AS peak "
              "FROM daily") or {}
    first = one("SELECT MIN(day) AS d FROM daily")

    def fmt(d, *keys):
        if not d:
            return None
        out = {}
        for k in keys:
            v = d.get(k)
            out[k] = round(v, 2) if isinstance(v, (int, float)) else v
        return out

    total = agg.get("total", 0.0) or 0.0
    return jsonify({
        "currency": CURRENCY, "price": PRICE,
        "best_day": fmt(best_day, "day", "kwh", "peak_w"),
        "best_peak": fmt(best_peak, "day", "peak_w", "kwh"),
        "best_month": (best_month and {"month": best_month["month"],
                                       "kwh": round(best_month["kwh"] or 0.0, 1)}) or None,
        "days_recorded": agg.get("days", 0),
        "total_kwh": round(total, 1),
        "total_value": money(total),
        "avg_day_kwh": round(agg.get("avg_day", 0.0) or 0.0, 2),
        "max_peak_w": round(agg.get("peak", 0.0) or 0.0, 1),
        "first_day": first and first.get("d"),
        "co2_kg_total": round(total * 0.35, 1),
    })


# --- serve the built React SPA ----------------------------------------------
@app.route("/")
@app.route("/<path:path>")
def spa(path=""):
    full = os.path.join(DIST, path)
    if path and os.path.isfile(full):
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


if __name__ == "__main__":
    print(f"Solar dashboard on http://{HOST}:{PORT}  (db: {DB_PATH}, dist: {DIST})")
    app.run(host=HOST, port=PORT, debug=False)
