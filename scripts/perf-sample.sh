#!/usr/bin/env bash
# =============================================================================
# perf-sample.sh — macOS battery/heat triage for Orquestra.
#
# Samples per-second CPU for WindowServer (the macOS compositor) and all Orquestra
# processes (main + renderer + GPU helpers), so you can tell WHERE the cost is
# when the app feels hot:
#
#   - WindowServer climbs while Orquestra is busy  -> compositor cost (translucency,
#     blur, continuous repaints, GPU layers). Fix in the renderer/CSS/window.
#   - an Orquestra process climbs                   -> app CPU (which process tells you
#     main=IPC/polling, a renderer helper=a panel like xterm/Monaco).
#   - neither climbs                           -> Orquestra isn't the drain.
#
# Run it FOREGROUND while reproducing the heat (Orquestra window frontmost, not
# occluded — macOS throttles compositing for hidden windows, which skews things).
#
#   bash scripts/perf-sample.sh [seconds]      # default 20
# =============================================================================

set -euo pipefail
DUR="${1:-20}"
# top's first sample reports cumulative-since-boot values, so take DUR+1 and skip it.
SAMPLES=$((DUR + 1))

echo "Sampling WindowServer + Orquestra for ${DUR}s (1s interval). Keep the Orquestra window frontmost..."
echo

top -l "$SAMPLES" -s 1 -stats command,cpu 2>/dev/null | awk '
  /^Processes:/ {
    if (sample > 1) printf "  t+%-3d  WindowServer=%5.1f%%   Orquestra(all)=%5.1f%%\n", sample-2, ws, orquestra
    if (sample > 1) { if (ws  > wsmax)  wsmax  = ws;  if (orquestra > orquestramax) orquestramax = orquestra }
    ws = 0; orquestra = 0; sample++
  }
  /WindowServer/        { ws = $NF + 0 }
  $1 == "Orquestra"          { orquestra += $NF + 0 }
  END {
    printf "\n  PEAK   WindowServer=%5.1f%%   Orquestra(all)=%5.1f%%\n", wsmax, orquestramax
    print  ""
    print  "Read: WindowServer peak high + Orquestra low  -> compositor (CSS blur/translucency, repaints)."
    print  "      Orquestra peak high                      -> app CPU; rerun Orquestra with ORQUESTRA_PERF=1 + open the HUD (Cmd+Alt+P) to see which process/path."
  }
'
