#!/bin/bash
# Watch for changes in Vector48-app and auto-push to GitHub
# Runs every 30 seconds, waits for Cursor to finish writing before committing

REPO="/Users/joshuakay/Vector48-app"
LOG="$REPO/watch-push.log"
IDLE_THRESHOLD=15  # seconds of no file changes before we consider Cursor done

echo "[$(date)] Watcher started" >> "$LOG"

while true; do
  cd "$REPO" || exit 1
  
  CHANGES=$(git status --short 2>/dev/null)
  
  if [ -n "$CHANGES" ]; then
    echo "[$(date)] Changes detected:" >> "$LOG"
    echo "$CHANGES" >> "$LOG"
    
    # Wait for Cursor to finish writing (no new changes for IDLE_THRESHOLD seconds)
    echo "[$(date)] Waiting for Cursor to finish writing..." >> "$LOG"
    sleep "$IDLE_THRESHOLD"
    
    CHANGES_AFTER=$(git status --short 2>/dev/null)
    if [ "$CHANGES" = "$CHANGES_AFTER" ]; then
      # Changes stabilized — commit and push
      echo "[$(date)] Committing and pushing..." >> "$LOG"
      git add -A
      COMMIT_MSG="feat: cursor generated code - $(date '+%Y-%m-%d %H:%M')"
      git commit -m "$COMMIT_MSG"
      git push origin main
      echo "[$(date)] Pushed successfully" >> "$LOG"
    else
      echo "[$(date)] Still changing, will retry next cycle" >> "$LOG"
    fi
  fi
  
  sleep 20
done
