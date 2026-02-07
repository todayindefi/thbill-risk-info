#!/bin/bash
# Sync thBILL metrics from PegTracker to dashboard

SOURCE="/home/danger/PegTracker/data/thbill_metrics.json"
DEST="/home/danger/thbill-risk-info/data/thbill_metrics.json"

if [ -f "$SOURCE" ]; then
    cp "$SOURCE" "$DEST"
    echo "$(date): Synced thbill_metrics.json"
else
    echo "$(date): Source file not found: $SOURCE"
    exit 1
fi
