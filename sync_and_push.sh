#!/bin/bash
cd /home/danger/thbill-risk-info

# Sync data
cp /home/danger/PegTracker/data/thbill_metrics.json data/

# Commit and push if changed
git add data/
if ! git diff --cached --quiet; then
    git commit -m "Update metrics $(date +'%Y-%m-%d %H:%M')"
    git push
    echo "$(date): Pushed updated metrics"
else
    echo "$(date): No changes to push"
fi
