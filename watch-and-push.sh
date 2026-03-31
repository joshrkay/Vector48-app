#!/bin/bash
REPO="/Users/joshuakay/Desktop/Vector48-app"
LOG="$REPO/watch-push.log"
BRANCH=$(cd "$REPO" && git branch --show-current 2>/dev/null)
IDLE=20

echo "[$(date)] Watcher started on branch: $BRANCH" >> "$LOG"

while true; do
  cd "$REPO" || exit 1
  CHANGES=$(git status --short 2>/dev/null)
  if [ -n "$CHANGES" ]; then
    echo "[$(date)] Changes detected:" >> "$LOG"
    echo "$CHANGES" >> "$LOG"
    sleep "$IDLE"
    CHANGES_AFTER=$(git status --short 2>/dev/null)
    if [ "$CHANGES" = "$CHANGES_AFTER" ]; then
      echo "[$(date)] Committing and pushing to $BRANCH..." >> "$LOG"
      git add -A
      git commit -m "feat: cursor generated code - $(date '+%Y-%m-%d %H:%M')"
      git push origin "$BRANCH" && echo "[$(date)] Pushed OK" >> "$LOG" || echo "[$(date)] Push FAILED" >> "$LOG"
    else
      echo "[$(date)] Still changing, retrying..." >> "$LOG"
    fi
  fi
  sleep 15
done
