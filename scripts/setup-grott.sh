#!/usr/bin/env bash
# Fetch upstream grott and apply the solar_panels_logger local-ACK patch.
#
# grott is a third-party project (https://github.com/johanmeijer/grott) and is
# NOT vendored in this repo. This script clones it at the commit this project
# was built against and applies patches/grottproxy-solar-local-ack.patch, which
# makes the proxy send local ACKs/ping-echoes so an "Offline" logger streams
# data without the cloud. Run once after cloning this repo.
set -euo pipefail
cd "$(dirname "$0")/.."

GROTT_REPO="${GROTT_REPO:-https://github.com/johanmeijer/grott.git}"
GROTT_COMMIT="${GROTT_COMMIT:-fb52e2d4ff3065f60db45a7c2c82f2ad7e9f8463}"
PATCH="patches/grottproxy-solar-local-ack.patch"

if [ -d grott/.git ]; then
  echo "grott/ already exists — skipping clone. Delete it to re-fetch."
else
  echo "Cloning grott ($GROTT_COMMIT)..."
  git clone "$GROTT_REPO" grott
  git -C grott checkout --quiet "$GROTT_COMMIT"
fi

echo "Applying $PATCH ..."
if git -C grott apply --check "../$PATCH" 2>/dev/null; then
  git -C grott apply "../$PATCH"
  echo "Patch applied."
elif grep -q "solar_panels_logger patch" grott/grottproxy.py; then
  echo "Patch already present — nothing to do."
else
  echo "ERROR: could not apply $PATCH cleanly." >&2
  exit 1
fi
echo "Done. grott is ready."
