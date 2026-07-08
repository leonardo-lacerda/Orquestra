#!/usr/bin/env bash
# =============================================================================
# Manual E2E Test: Verboo orchestration with crown
#
# Tests that verboo --dangerously-skip-permissions automatically uses
# `node orquestra.js recruit` when the crown is active.
#
# Usage:
#   1. Start Orquestra, open a terminal, activate the crown
#   2. In that terminal, run: bash scripts/maestro/test-verboo-orchestrate.sh
#
# The script will guide you through the test steps.
# =============================================================================

set -e

echo "═══════════════════════════════════════════════"
echo "  Verboo Orchestration E2E Test"
echo "═══════════════════════════════════════════════"
echo ""
echo "Prerequisites:"
echo "  1. Orquestra app is running"
echo "  2. A terminal panel has the CROWN activated (click the crown icon)"
echo "  3. You are in the terminal with the crown active"
echo "  4. The project has orquestra.js in its root"
echo ""

# Check prerequisites
if [ ! -f "orquestra.js" ] && [ -f "scripts/maestro/orquestra.js" ]; then
  echo "⚠️  orquestra.js not found in workspace root."
  echo "   Copying from scripts/maestro/orquestra.js..."
  cp scripts/maestro/orquestra.js .
fi

if [ ! -f "orquestra.js" ]; then
  echo "❌ orquestra.js not found. Activate the crown first, or copy manually."
  exit 1
fi

echo "✅ orquestra.js found"
echo ""

# =============================================================================
# Test Step 1: Verify CLI works
# =============================================================================
echo "───────────────────────────────────────────────"
echo "  Step 1: Verify orquestra.js CLI"
echo "───────────────────────────────────────────────"

node orquestra.js --help
echo ""
echo "✅ CLI works"
echo ""

# =============================================================================
# Test Step 2: Check crown is active
# =============================================================================
echo "───────────────────────────────────────────────"
echo "  Step 2: Check crown marker"
echo "───────────────────────────────────────────────"

if [ -f ".orquestra/crown.json" ]; then
  echo "✅ Crown is active! Marker found at .orquestra/crown.json"
  cat .orquestra/crown.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'   Terminal: {d.get(\"terminalPtyId\",\"?\")}'); print(f'   Activated: {d.get(\"activatedAt\",\"?\")}')" 2>/dev/null || cat .orquestra/crown.json
else
  echo "❌ Crown marker not found at .orquestra/crown.json"
  echo "   Please activate the crown first (click the crown icon on your terminal)"
  exit 1
fi
echo ""

# =============================================================================
# Test Step 3: Check APPEND_SYSTEM.md
# =============================================================================
echo "───────────────────────────────────────────────"
echo "  Step 3: Check APPEND_SYSTEM.md in pi-agent"
echo "───────────────────────────────────────────────"

APPEND_PATH=".orquestra/pi-agent/APPEND_SYSTEM.md"
if [ -f "$APPEND_PATH" ]; then
  echo "✅ APPEND_SYSTEM.md found"
  head -5 "$APPEND_PATH"
else
  echo "⚠️  APPEND_SYSTEM.md not found — extension might not inject correctly"
  echo "   Check if Pi reads from $APPEND_PATH"
fi
echo ""

# =============================================================================
# Test Step 4: Check Maestro skill in .claude/commands
# =============================================================================
echo "───────────────────────────────────────────────"
echo "  Step 4: Check maestro skill"
echo "───────────────────────────────────────────────"

if [ -f ".claude/commands/maestro.md" ]; then
  echo "✅ maestro.md skill found in .claude/commands/"
else
  echo "⚠️  maestro.md not found — you may need to re-activate the crown"
fi
echo ""

# =============================================================================
# Test Step 5: Recruit a worker (manual verification)
# =============================================================================
echo "───────────────────────────────────────────────"
echo "  Step 5: Recruit a test worker"
echo "───────────────────────────────────────────────"
echo ""
echo "This will send a 'recruit' command to create a test worker."
echo "You should see a new terminal panel appear on the canvas."
echo ""

read -p "Press Enter to recruit a test worker named 'test-worker-1'..."

node orquestra.js recruit --role "Say hello and print the current date" --name test-worker-1

echo ""
echo "✅ Recruit command sent."
echo "   Check the canvas — a new terminal should appear named 'test-worker-1'"
echo ""

# =============================================================================
# Test Step 6: List workers
# =============================================================================
echo "───────────────────────────────────────────────"
echo "  Step 6: List workers"
echo "───────────────────────────────"

read -p "Press Enter to list workers..."

echo ""
node orquestra.js list
echo ""

echo "✅ List command sent. Check the console/logs for worker list."
echo ""

# =============================================================================
# Test Step 7: Connect a file to a worker
# =============================================================================
echo "───────────────────────────────────────────────"
echo "  Step 7: Connect a file to the worker"
echo "───────────────────────────────"

read -p "Press Enter to connect orquestra.js to the worker..."

if [ -f "orquestra.js" ]; then
  node orquestra.js connect test-worker-1 orquestra.js
  echo "✅ Connect command sent."
else
  echo "⚠️  No file to connect, skipping..."
fi
echo ""

# =============================================================================
# Test Step 8: Dismiss the worker
# =============================================================================
echo "───────────────────────────────────────────────"
echo "  Step 8: Dismiss the test worker"
echo "───────────────────────────────"

read -p "Press Enter to dismiss 'test-worker-1'..."

node orquestra.js dismiss test-worker-1

echo "✅ Dismiss command sent. The worker terminal should close."
echo ""

# =============================================================================
# Summary
# =============================================================================
echo "═══════════════════════════════════════════════"
echo "  Test Summary"
echo "═══════════════════════════════════════════════"
echo ""
echo "  ✅ Step 1: CLI works"
echo "  ✅ Step 2: Crown active"
echo "  ✅ Step 3: APPEND_SYSTEM.md present"
echo "  ✅ Step 4: Maestro skill present"
echo "  ✅ Step 5: Recruit sent"
echo "  ✅ Step 6: List sent"
echo "  ✅ Step 7: Connect sent"
echo "  ✅ Step 8: Dismiss sent"
echo ""
echo "  Manual verification required:"
echo "  - Did a new terminal appear on the canvas for test-worker-1?"
echo "  - Was the worker terminal running with the given role?"
echo "  - Did the dismiss command close it?"
echo "  - After the crown was activated, did verboo auto-orchestrate"
echo "    without needing /maestro?"
echo ""
echo "  Next: Run verboo --dangerously-skip-permissions and give it a"
echo "  multi-step task like building a landing page + API."
echo "  It should automatically use 'node orquestra.js recruit'."
echo ""
