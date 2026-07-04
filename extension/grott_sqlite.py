"""
grott extension: write each decoded inverter reading into a SQLite database.

grott calls grottext(conf, data, jsonmsg) for every decoded data record.
jsonmsg looks like: {"device": "<sn>", "time": "...", "values": {<raw registers>}}

The values in jsonmsg are RAW (not divided), so we apply the per-field "divide"
factor that grott knows from its record layout (conf.recorddict[conf.layout]).

Two tables are maintained:
  samples : one row per reading (live power + cumulative energy + raw json)
  daily   : one row per day, energy_kwh = max(energy_today) seen that day
"""

import os
import json
import sqlite3
import datetime
from zoneinfo import ZoneInfo

# Local timezone for timestamps / day attribution (container runs UTC otherwise).
_TZ = ZoneInfo(os.environ.get("SOLAR_TZ", "Europe/Rome"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS samples(
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ts               TEXT NOT NULL,
  device           TEXT,
  power_w          REAL,
  energy_today_kwh REAL,
  energy_total_kwh REAL,
  raw_json         TEXT
);
CREATE INDEX IF NOT EXISTS idx_samples_ts ON samples(ts);

CREATE TABLE IF NOT EXISTS daily(
  day              TEXT PRIMARY KEY,
  energy_kwh       REAL,
  peak_power_w     REAL,
  energy_total_kwh REAL,
  updated_at       TEXT
);
"""

# Field-name candidates, tried in order. Covers standard PV and hybrid (SPH/FPH)
# Growatt layouts. The raw value is divided by the layout's divide factor.
POWER_KEYS = ["pvpowerout", "pac", "pactouser", "outputpower"]
TODAY_KEYS = ["pvenergytoday", "eactoday", "epvtoday", "etoday"]
TOTAL_KEYS = ["pvenergytotal", "eactotal", "epvtotal", "etotal"]


def _build_divides(conf):
    divides = {}
    try:
        layout = conf.recorddict[conf.layout]
        for key, meta in layout.items():
            if isinstance(meta, dict) and meta.get("divide"):
                divides[key] = meta["divide"]
    except Exception:
        pass
    return divides


def _pick(values, divides, keys):
    for k in keys:
        if k in values and values[k] is not None:
            try:
                return float(values[k]) / float(divides.get(k, 1) or 1)
            except (TypeError, ValueError):
                continue
    return None


def _db_path(conf):
    # Env var wins (used by Docker); then grott.ini extvar; then a relative default.
    db = os.environ.get("SOLAR_DB")
    if not db and isinstance(getattr(conf, "extvar", None), dict):
        db = conf.extvar.get("db")
    if not db:
        db = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          "..", "data", "solar.db")
    db = os.path.abspath(db)
    os.makedirs(os.path.dirname(db), exist_ok=True)
    return db


def grottext(conf, data, jsonmsg):
    try:
        obj = json.loads(jsonmsg)
    except Exception as e:
        return e

    values = obj.get("values", {}) or {}
    divides = _build_divides(conf)

    power = _pick(values, divides, POWER_KEYS)
    today = _pick(values, divides, TODAY_KEYS)
    total = _pick(values, divides, TOTAL_KEYS)

    # Records that carry no production data at all (pings/announcements) are skipped.
    if power is None and today is None and total is None:
        if getattr(conf, "verbose", False):
            print("\t - grott_sqlite: record without production fields, skipped")
        return 0

    device = obj.get("device", "")
    # Buffered/backlog records (the logger replaying data it withheld while
    # "offline") carry the inverter's real embedded local timestamp in
    # obj["time"]; grott already drops buffered records without a valid one. Use
    # it so replayed history lands at its real time instead of being dumped onto
    # the current minute (which is what made today's curve zig-zag). Live records
    # keep wall-clock _TZ time, because grott stamps live records in UTC.
    buffered = str(obj.get("buffered", "no")).lower() == "yes"
    embedded = str(obj.get("time", "") or "")[:19]
    if buffered and len(embedded) == 19:
        ts = embedded
        day = embedded[:10]
    else:
        now = datetime.datetime.now(_TZ).replace(tzinfo=None)  # naive local time
        ts = now.isoformat(timespec="seconds")
        day = now.strftime("%Y-%m-%d")
    db = _db_path(conf)

    con = sqlite3.connect(db, timeout=15)
    try:
        con.executescript(SCHEMA)
        con.execute(
            "INSERT INTO samples(ts,device,power_w,energy_today_kwh,"
            "energy_total_kwh,raw_json) VALUES(?,?,?,?,?,?)",
            (ts, device, power, today, total, json.dumps(values)),
        )
        con.execute(
            """
            INSERT INTO daily(day, energy_kwh, peak_power_w, energy_total_kwh, updated_at)
            VALUES(?,?,?,?,?)
            ON CONFLICT(day) DO UPDATE SET
              energy_kwh       = MAX(COALESCE(daily.energy_kwh,0),   COALESCE(excluded.energy_kwh,0)),
              peak_power_w     = MAX(COALESCE(daily.peak_power_w,0),  COALESCE(excluded.peak_power_w,0)),
              energy_total_kwh = COALESCE(excluded.energy_total_kwh,  daily.energy_total_kwh),
              updated_at       = excluded.updated_at
            """,
            (day, today, power, total, ts),
        )
        con.commit()
    finally:
        con.close()

    if getattr(conf, "verbose", False):
        print(f"\t - grott_sqlite: {ts}  P={power}W  today={today}kWh  "
              f"total={total}kWh  -> {db}")
    return 0
