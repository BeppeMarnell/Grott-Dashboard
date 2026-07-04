#!/usr/bin/env bash
# Start the grott proxy: listens on :5279, decodes the inverter data into SQLite,
# and forwards traffic on to Growatt's cloud.
set -e
cd "$(dirname "$0")"
source .venv/bin/activate
# Make the SQLite extension importable by grott.
export PYTHONPATH="$(pwd)/extension:$PYTHONPATH"
exec python grott/grott.py -c grott.ini
