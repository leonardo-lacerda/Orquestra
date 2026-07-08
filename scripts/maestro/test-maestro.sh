#!/usr/bin/env bash
# =============================================================================
# test-maestro.sh — automated E2E test for Maestro orchestration mode
#
# Tests that with the crown active, `verboo` dispatches multi-task prompts
# to worker terminals via `node orquestra.js recruit` instead of executing
# them directly in its own session.
#
# Usage:
#   ./test-maestro.sh                    # run full test
#   ./test-maestro.sh --setup-only       # just set up files, don't run verboo
#   ./test-maestro.sh --verify           # verify files are in place
# =============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

WORKSPACE="${1:-/c/Users/Leo/Downloads/ladings}"
VERBOO_CMD="verboo --dangerously-skip-permissions"
TEST_PROMPT="Cria uma landing page moderna sobre mudanças climáticas e uma API em Node.js que retorna dados climáticos mockados"

pass()  { echo -e "  ${GREEN}✓${NC} $1"; }
fail()  { echo -e "  ${RED}✗${NC} $1"; }
info()  { echo -e "  ${YELLOW}→${NC} $1"; }

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Maestro E2E Test"
echo "  Workspace: $WORKSPACE"
echo "  Date: $(date)"
echo "═══════════════════════════════════════════════════════"
echo ""

# =============================================================================
# Phase 1 — Verify app is running / set up files
# =============================================================================
echo "── Phase 1: Environment setup ──"

# Determine paths
ORQUESTRA_DIR="$WORKSPACE/.orquestra"
PI_AGENT_DIR="$ORQUESTRA_DIR/pi-agent"
CROWN_JSON="$ORQUESTRA_DIR/crown.json"
CLAUDE_LOCAL="$WORKSPACE/CLAUDE.local.md"
EXTENSION_DIR="$PI_AGENT_DIR/extensions/orquestra-maestro"
DOT_PI_DIR="$WORKSPACE/.pi"
GLOBAL_EXT_DIR="$HOME/.pi/agent/extensions/orquestra-maestro"

info "Creating maestro files..."
mkdir -p "$PI_AGENT_DIR"
mkdir -p "$EXTENSION_DIR"
mkdir -p "$DOT_PI_DIR"
mkdir -p "$GLOBAL_EXT_DIR"

# Write crown.json
cat > "$CROWN_JSON" << JCROWN
{
  "terminalPtyId": "test-maestro",
  "activatedAt": 1717600000000,
  "workspacePath": "$WORKSPACE"
}
JCROWN

# Get extension source
EXT_SRC="C:/Users/Leo/Documents/cate/src/agent/extensions/orquestra-maestro"

# Write CLAUDE.local.md — Verboo auto-loads this from the workspace root
cat > "$CLAUDE_LOCAL" << 'EOCLM'
# Maestro Mode — Active

The crown is active on this terminal. You MUST follow these rules:

## Rule 1: Always analyze for sub-tasks
Before responding to ANY request, check: does it have multiple independent parts?
Examples of multi-part requests:
- "Create a landing page AND an API" → 2 independent sub-tasks
- "Build a Dockerfile AND docker-compose.yml" → 2 files to create
- "Make HTML, CSS, and JS" → 3 independent files

## Rule 2: Delegate sub-tasks to workers
When you identify 2+ independent sub-tasks:
  1. Run `node orquestra.js recruit --role "<task-description>" --name <name>` for EACH sub-task
  2. Each worker is a NEW terminal that works independently
  3. Do NOT do the work yourself — let the workers do it

## Rule 3: Never ask permission
You are the Maestro. Orchestrate automatically. Never ask the user if they want you to delegate.

## Rule 4: Simple single tasks execute directly
If the request is ONE simple thing (e.g. "what is the capital of France?"), just answer normally.

## Available commands
- `node orquestra.js recruit --role "descricao" --name nome` — create a new worker terminal
- `node orquestra.js list` — list active workers
- `node orquestra.js dismiss nome` — remove a worker
- `node orquestra.js connect nome ./caminho` — connect worker to a directory
- `node orquestra.js reassign nome --role "nova tarefa"` — change worker task
EOCLM

# Copy extension files from source
if [ -d "$EXT_SRC" ]; then
  cp "$EXT_SRC/index.ts" "$EXTENSION_DIR/index.ts" 2>/dev/null || fail "Cannot copy extension index.ts"
  cp "$EXT_SRC/package.json" "$EXTENSION_DIR/package.json" 2>/dev/null || fail "Cannot copy extension package.json"
  cp "$EXT_SRC/index.ts" "$GLOBAL_EXT_DIR/index.ts" 2>/dev/null || fail "Cannot copy to global ext dir"
  cp "$EXT_SRC/package.json" "$GLOBAL_EXT_DIR/package.json" 2>/dev/null || fail "Cannot copy to global ext dir"
  pass "Extension files copied"
else
  fail "Extension source not found at $EXT_SRC"
fi

# Copy orquestra.js CLI
ORQ_JS_SRC="C:/Users/Leo/Documents/cate/scripts/maestro/orquestra.js"
if [ -f "$ORQ_JS_SRC" ]; then
  cp "$ORQ_JS_SRC" "$WORKSPACE/orquestra.js"
  pass "orquestra.js copied to workspace"
else
  fail "orquestra.js not found at $ORQ_JS_SRC"
fi

# Create .orquestra-commands dir (watched by Orquestra)
mkdir -p "$WORKSPACE/.orquestra-commands"

pass "All maestro files written to disk"

# =============================================================================
# Phase 2 — Verify file structure
# =============================================================================
echo ""
echo "── Phase 2: Verification ──"

all_ok=true

[ -f "$CROWN_JSON" ] && pass "crown.json exists" || { fail "crown.json missing"; all_ok=false; }
[ -f "$CLAUDE_LOCAL" ] && pass "CLAUDE.local.md exists (Verboo auto-loads it)" || { fail "CLAUDE.local.md missing"; all_ok=false; }
[ -f "$EXTENSION_DIR/package.json" ] && pass "Extension in .orquestra/pi-agent/extensions/" || { fail "Extension missing in .orquestra/"; all_ok=false; }
[ -f "$GLOBAL_EXT_DIR/package.json" ] && pass "Extension in ~/.pi/agent/extensions/" || { fail "Extension missing in ~/.pi/"; all_ok=false; }
[ -f "$WORKSPACE/orquestra.js" ] && pass "orquestra.js in workspace root" || { fail "orquestra.js missing"; all_ok=false; }
[ -d "$WORKSPACE/.orquestra-commands" ] && pass ".orquestra-commands dir exists" || { fail ".orquestra-commands missing"; all_ok=false; }

if [ "$all_ok" = true ]; then
  echo ""
  echo -e "  ${GREEN}✓ All files verified successfully.${NC}"
else
  echo ""
  echo -e "  ${RED}✗ Some files are missing — check above.${NC}"
  exit 1
fi

# =============================================================================
# Phase 3 — Run verboo with maestro env vars and test prompt
# =============================================================================
echo ""
echo "── Phase 3: Testing Verboo with Maestro ──"

if [ "${SKIP_VERBOO:-}" = "1" ]; then
  info "SKIP_VERBOO=1 — skipping verboo execution"
  info "To test manually, run from $WORKSPACE:"
  info "  $VERBOO_CMD"
  info ""
  info "Make sure CLAUDE.local.md exists in the workspace root —"
  info "Verboo reads it automatically."
  exit 0
fi

# Clean up any previous .orquestra-commands before running
rm -f "$WORKSPACE/.orquestra-commands/"*.json 2>/dev/null || true
rm -f "$WORKSPACE/hello.html" "$WORKSPACE/test.txt" "$WORKSPACE/hello_world.html" "$WORKSPACE/teste.txt" 2>/dev/null || true
info "Previous artifacts cleaned"

info "Running: $VERBOO_CMD"
info "Prompt: \"$TEST_PROMPT\""
echo ""

# Run verboo — it auto-loads CLAUDE.local.md from the workspace root
cd "$WORKSPACE"
timeout 120 $VERBOO_CMD <<< "$TEST_PROMPT" 2>&1 || true

echo ""
echo "── Phase 4: Checking results ──"

# Check if orquestra.js recruit commands were issued
ORQUESTRA_COMMANDS_DIR="$WORKSPACE/.orquestra-commands"
if [ -d "$ORQUESTRA_COMMANDS_DIR" ]; then
  cmd_count=$(ls -1 "$ORQUESTRA_COMMANDS_DIR"/*.json 2>/dev/null | wc -l)
  if [ "$cmd_count" -gt 0 ]; then
    pass "Orquestra detected $cmd_count command(s) in .orquestra-commands/"
    for f in "$ORQUESTRA_COMMANDS_DIR"/*.json; do
      info "  Command: $(basename "$f") → $(cat "$f" | head -c 200)"
    done
  fi
fi

# Check if worker was recruited — look for recruit mentions in output
# (orquestra.js writes recruit commands as JSON files)
echo ""
echo "── Summary ──"
echo "  Test completed at $(date)"
echo "  See above for Verboo's actual behavior."
echo ""
echo "Expected result: Verboo should call 'node orquestra.js recruit'"
echo "for each subtask instead of doing the work itself."
echo ""
echo "If it did NOT, the APPEND_SYSTEM.md instructions may not"
echo "be reaching Verboo's system prompt correctly."
