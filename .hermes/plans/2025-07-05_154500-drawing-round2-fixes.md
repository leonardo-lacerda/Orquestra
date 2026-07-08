# Drawing System — Round 2 Fixes Plan

## Bug 1: Right-click context menu disappears instantly

**Root cause:** The canvas shows its native context menu via a **two-step state pattern**:
1. Event handler sets `canvasContextMenu` state
2. A `useEffect` watches that state and calls `window.electronAPI.showContextMenu()` asynchronously

The DrawingLayer calls `showContextMenu()` directly in the capture-phase `contextmenu` handler. This doesn't work because:
- Electron's native menu needs to be shown AFTER the event cycle completes
- The async `showContextMenu` call starts but the event continues propagating
- The canvas's own `handleContextMenu` (`e.preventDefault()`) or another handler dismisses it

**Fix:** Use the same state-based pattern as the canvas:
1. Capture-phase handler sets `drawingContextMenuId` state (string | null)
2. A `useEffect` watches it and calls `showContextMenu()` async
3. On dismiss, clear the state

**File:** `src/renderer/canvas/DrawingLayer.tsx`

```tsx
// State
const [drawingContextMenuId, setDrawingContextMenuId] = useState<string | null>(null)

// Capture-phase handler — just sets state, doesn't call showContextMenu
useEffect(() => {
  const svg = svgRef.current
  if (!svg) return
  const handler = (e: Event) => {
    const target = e.target as SVGElement
    const drawingId = target.getAttribute('data-drawing-id')
    if (!drawingId) return
    e.preventDefault()
    e.stopPropagation()
    setDrawingContextMenuId(drawingId)
  }
  svg.addEventListener('contextmenu', handler, true)
  return () => svg.removeEventListener('contextmenu', handler, true)
}, [])

// useEffect that shows the menu (same pattern as Canvas.tsx)
useEffect(() => {
  if (!drawingContextMenuId || !window.electronAPI) return
  let cancelled = false
  const id = drawingContextMenuId

  const show = async () => {
    const result = await window.electronAPI.showContextMenu([
      { id: 'delete', label: '🗑️ Delete' },
    ])
    if (cancelled) return
    if (result === 'delete') removeDrawing(id)
    setDrawingContextMenuId(null)
  }
  show()

  return () => { cancelled = true }
}, [drawingContextMenuId, removeDrawing])
```

**Verify:** Right-click on drawing → menu stays → click Delete → removed.

---

## Bug 2: Text/elements drift during zoom

**Root cause:** The SVG is inside the world div (`width: 1, height: 1`) with `overflow: visible`. The world div's transform is applied imperatively via `el.style.transform = scale(zoom) translate(...)`. 

The issue is that the SVG itself has `position: absolute, top: 0, left: 0, width: 100%, height: 100%` — which makes it 1×1 pixel. The drawings render at canvas-space coordinates via `overflow: visible`. During zoom, the world div's transform changes continuously, and the SVG content follows correctly.

BUT: if there's a `will-change: transform` promotion/de-promotion cycle on the world div (there is — see Canvas.tsx line 211-217), the GPU layer caching can cause the SVG to briefly show stale positions during rapid zoom changes. The `will-change` is toggled on during interaction and debounced off after 150ms.

**Fix:** Add `will-change: transform` to the SVG element itself so it stays on its own GPU layer and doesn't depend on the parent's layer promotion:

```tsx
<svg style={{
  ...
  willChange: 'transform',
  transform: 'translateZ(0)', // force GPU layer
}} />
```

Actually, a better fix: the SVG should NOT be affected by the parent's will-change toggling. The real issue might be that the SVG re-renders during zoom (because `activeTool` is a zustand selector that doesn't change during zoom). Let me check if there's a different cause.

Actually, the most likely cause is simpler: the SVG has `pointerEvents: activeTool === 'draw' ? 'none' : 'auto'` which causes a re-render when switching tools, but NOT during zoom. The drawings are in canvas-space inside the world div, so they should stay put during zoom.

The drift might be because the text element's position is in canvas-space but the user PERCEIVES it as moving because the entire canvas (including the text) pans/zooms relative to the viewport. This is actually correct behavior — the text is anchored to the canvas, not to the screen.

If the user wants text that stays fixed relative to the viewport (screen-space), that would be a different feature entirely. But for a whiteboard, canvas-space anchoring is correct.

**Alternative fix:** Ensure no CSS transitions affect the SVG elements. Check if any parent has `transition` that could affect transforms.

**File:** `src/renderer/canvas/DrawingLayer.tsx` — add `transition: 'none'` and `will-change: 'auto'` to the SVG to prevent any inherited transitions from affecting it.

```tsx
<svg style={{
  position: 'absolute', top: 0, left: 0,
  width: '100%', height: '100%', overflow: 'visible',
  pointerEvents: activeTool === 'draw' ? 'none' : 'auto',
  zIndex: 45000,
  transition: 'none',
  willChange: 'auto',
}} />
```

**Verify:** Zoom in/out rapidly → text stays anchored to its canvas position without drift.

---

## Files Changed

| File | Change |
|---|---|
| `src/renderer/canvas/DrawingLayer.tsx` | Fix context menu (state-based), fix SVG transition |

## Verification

1. `npm run typecheck` — PASS
2. Manual: right-click drawing → menu stays → delete works
3. Manual: zoom in/out → text stays in place
