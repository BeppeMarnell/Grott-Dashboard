#!/usr/bin/env bash
# Start the web dashboard (reads SQLite, serves http://127.0.0.1:8088).
set -e
cd "$(dirname "$0")"
source .venv/bin/activate
exec python web/app.py
