#!/usr/bin/env python3
"""
Back up / switch / restore the Growatt ShineLanBox network settings.

The logger's admin web UI (default admin/admin) has a Network Setting form
posted to /netform. This tool reads the current settings, saves a timestamped
JSON backup, and can repoint the logger's upstream server to this host (so
traffic flows through the local grott proxy) — or restore a backup.

Configure via environment variables (defaults in parentheses):
  LOGGER_HOST   the logger's IP/hostname on your LAN (192.168.1.226)
  LOGGER_USER   admin UI username (admin)
  LOGGER_PASS   admin UI password (admin)

Usage (replace the IP with your host running grott):
  LOGGER_HOST=<logger-ip> python scripts/logger_config.py show
  python scripts/logger_config.py backup
  python scripts/logger_config.py switch --server-ip <this-host-ip>
  python scripts/logger_config.py restore backups/logger-config-<ts>.json

Auth on these boxes is per-client-IP after a /verify POST (no cookie needed),
but we keep a cookie jar too, just in case.
"""

import os
import re
import sys
import json
import time
import argparse
import urllib.parse
import urllib.request
import http.cookiejar

HOST = os.environ.get("LOGGER_HOST", "192.168.1.226")
USER = os.environ.get("LOGGER_USER", "admin")
PASS = os.environ.get("LOGGER_PASS", "admin")
BASE = f"http://{HOST}"
BACKUP_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                          "backups")

# Fields we read from /netset and submit to /netform, in submit order.
TEXT_FIELDS = ["localIP", "netgate", "netmask", "localDNS",
               "serverDomain", "serverIP", "serverPort", "TxInterval"]
RADIO_FIELDS = ["DHCP", "domain"]        # radios: value of the Checked one
SELECT_FIELDS = ["domainEnable"]         # select: value of the Checked option
ALL_FIELDS = ["DHCP", "localIP", "netgate", "netmask", "localDNS",
              "domain", "serverDomain", "serverIP", "domainEnable",
              "serverPort", "TxInterval"]


def opener():
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def login(op):
    data = urllib.parse.urlencode({"username": USER, "pw": PASS}).encode()
    op.open(urllib.request.Request(f"{BASE}/verify", data=data), timeout=8).read()


def fetch_netset(op):
    return op.open(f"{BASE}/netset", timeout=8).read().decode("latin-1")


def parse_settings(html):
    s = {}
    for f in TEXT_FIELDS:
        m = re.search(r'name="%s"[^>]*value="([^"]*)"' % f, html)
        s[f] = m.group(1) if m else ""
    for f in RADIO_FIELDS:
        # find the radio of this name whose tag contains Checked
        checked = ""
        for m in re.finditer(r'<input[^>]*name="%s"[^>]*>' % f, html, re.I):
            tag = m.group(0)
            if re.search(r'checked', tag, re.I):
                vm = re.search(r'value="([^"]*)"', tag)
                checked = vm.group(1) if vm else ""
                break
        s[f] = checked
    for f in SELECT_FIELDS:
        block = re.search(r'name="%s".*?</select>' % f, html, re.S | re.I)
        val = ""
        if block:
            om = re.search(r'<option\s+value="([^"]*)"[^>]*Checked', block.group(0), re.I)
            val = om.group(1) if om else ""
        s[f] = val
    return s


def post_netform(op, settings):
    payload = {k: settings.get(k, "") for k in ALL_FIELDS}
    data = urllib.parse.urlencode(payload).encode()
    resp = op.open(urllib.request.Request(f"{BASE}/netform", data=data), timeout=8)
    return resp.read().decode("latin-1", "ignore")


def save_backup(settings, note):
    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S")
    path = os.path.join(BACKUP_DIR, f"logger-config-{ts}.json")
    blob = {"saved_at": ts, "host": HOST, "note": note, "settings": settings}
    with open(path, "w") as fh:
        json.dump(blob, fh, indent=2)
    return path


def get_current():
    op = opener()
    login(op)
    return op, parse_settings(fetch_netset(op))


def cmd_show(_):
    _, cur = get_current()
    print(json.dumps(cur, indent=2))


def cmd_backup(_):
    _, cur = get_current()
    path = save_backup(cur, "manual backup")
    print("current settings:")
    print(json.dumps(cur, indent=2))
    print(f"\nbacked up to: {path}")


def cmd_switch(args):
    op, cur = get_current()
    path = save_backup(cur, f"pre-switch backup (was using {'domain' if cur.get('domain')=='ON' else 'ip'})")
    print(f"backup saved: {path}")
    new = dict(cur)
    new["domain"] = "OFF"          # use Server IP directly, do not resolve domain
    new["domainEnable"] = "OFF"
    new["serverIP"] = args.server_ip
    new["serverPort"] = args.server_port
    print("\nchanging:")
    for k in ("domain", "domainEnable", "serverIP", "serverPort"):
        print(f"  {k}: {cur.get(k)!r} -> {new[k]!r}")
    if args.dry_run:
        print("\n[dry-run] not submitting.")
        return
    post_netform(op, new)
    print(f"\nsubmitted. logger will reconnect to {args.server_ip}:{args.server_port} within a few minutes.")
    print(f"to undo: python scripts/logger_config.py restore {path}")


def cmd_restore(args):
    with open(args.backup) as fh:
        blob = json.load(fh)
    settings = blob["settings"]
    op = opener()
    login(op)
    # snapshot what it is right now before overwriting, just in case
    cur = parse_settings(fetch_netset(op))
    save_backup(cur, f"pre-restore snapshot (restoring {os.path.basename(args.backup)})")
    print("restoring settings:")
    print(json.dumps(settings, indent=2))
    if args.dry_run:
        print("\n[dry-run] not submitting.")
        return
    post_netform(op, settings)
    print("\nrestored.")


def main():
    p = argparse.ArgumentParser(description="Growatt ShineLanBox config tool")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("show").set_defaults(func=cmd_show)
    sub.add_parser("backup").set_defaults(func=cmd_backup)
    sw = sub.add_parser("switch")
    sw.add_argument("--server-ip", required=True,
                    help="IP of the host running the grott proxy (this machine)")
    sw.add_argument("--server-port", default="5279")
    sw.add_argument("--dry-run", action="store_true")
    sw.set_defaults(func=cmd_switch)
    rs = sub.add_parser("restore")
    rs.add_argument("backup")
    rs.add_argument("--dry-run", action="store_true")
    rs.set_defaults(func=cmd_restore)
    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
