# Drawing System — Bug Fixes & Feature Completion Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Fix all drawing system bugs and add select/move/resize to make the whiteboard fully functional.

**Architecture:** Rewrite `DrawingLayer.tsx` with per-element arrowhead markers, capture-phase event handling, drawing selection state, and drag-to-move/resize. Minimal changes to `Canvas.tsx` and store.

**Tech Stack:** React, SVG, Zustand canvas store

---

## Bug Analysis

### Bug 1: Arrowhead color changes globally
**Root cause:** Line 193 in `DrawingLayer.tsx` — one shared `<marker id="drawing-arrowhead">` with `fill={style.strokeColor}`. When user changes color, ALL arrowheads update.
**Fix:** Generate a unique `<marker>` per arrow element using its `id` + `strokeColor`.

### Bug 2: Right-click delete disappears instantly
**Root cause:** The canvas container has `onContextMenu={handleContextMenu}` (line 580 of `Canvas.tsx`) which fires AFTER the SVG's `onContextMenu` and shows the canvas's own menu, replacing the drawing's delete menu. The `e.stopPropagation()` in the SVG handler doesn't help because both are on ancestor/descendant — the canvas handler fires on the container, the SVG handler fires on the `<line>/<rect>` element.
**Fix:** Use `onContextMenu` with `capture: true` on the SVG to intercept before the canvas handler, OR check in the canvas handler if the click target is a drawing element and skip.

### Bug 3: Text tool doesn't work
**Root cause:** The text tool path in `handleMouseDown` does NOT call `e.stopPropagation()` or `e.preventDefault()`. The event bubbles to `useCanvasInteraction` which processes it as a canvas interaction (pan/select), consuming the click.
**Fix:** Always `e.stopPropagation()` + `e.preventDefault()` for ALL draw tools, not just rect/arrow/line.

### Bug 4: No select/move/resize for drawings
**Root cause:** Not implemented. Drawings are rendered but have no interaction except right-click delete.
**Fix:** Add `selectedDrawingId` state, click-to-select in select mode, drag-to-move, and resize handles.

---

## Task 1: Fix arrowhead color — per-element markers

**Objective:** Each arrow gets its own colored arrowhead marker.

**File:** `src/renderer/canvas/DrawingLayer.tsx`

**Step 1:** Remove the shared `<marker>` from `<defs>`.

**Step 2:** For each arrow element, render a unique `<marker>` in `<defs>` keyed by the arrow's id:

```tsx
// Inside the SVG, before the element map:
<defs>
  {allElements.filter(el => el.type === 'arrow').map(el => (
    <marker
      key={`ah-${el.id}`}
      id={`ah-${el.id}`}
      viewBox="0 0 10 10"
      refX="10" refY="5"
      markerWidth="8" markerHeight="8"
      orient="auto-start-reverse"
    >
      <path d="M 0 0 L 10 5 L 0 10 z" fill={el.strokeColor} />
    </marker>
  ))}
</defs>
```

**Step 3:** Update each arrow's `markerEnd` to reference its own marker:

```tsx
markerEnd={`url(#ah-${el.id})`}
```

**Verify:** `npm run typecheck` — PASS. Draw two arrows with different colors → each has its own colored arrowhead. Change color → existing arrows keep theirs.

---

## Task 2: Fix right-click delete — capture-phase interception

**Objective:** Right-click on a drawing shows delete menu without disappearing.

**File:** `src/renderer/canvas/DrawingLayer.tsx`

**Step 1:** Add a `useEffect` that registers a `contextmenu` handler on the SVG element in the **capture phase** so it fires before the canvas container's handler:

```tsx
const svgRef = useRef<SVGSVGElement>(null)

useEffect(() => {
  const svg = svgRef.current
  if (!svg) return
  const handler = (e: Event) => {
    const target = e.target as SVGElement
    const drawingId = target.getAttribute('data-drawing-id')
    if (drawingId) {
      e.preventDefault()
      e.stopPropagation()
      // Show context menu asynchronously
      showDrawingMenu(drawingId)
    }
  }
  svg.addEventListener('contextmenu', handler, true) // capture phase
  return () => svg.removeEventListener('contextmenu', handler, true)
}, [removeDrawing])
```

**Step 2:** Add `data-drawing-id={el.id}` to each rendered SVG element (rect, line, text).

**Step 3:** Remove the inline `onContextMenu` handlers from elements (no longer needed).

**Step 4:** Add the `showDrawingMenu` async function:

```tsx
const showDrawingMenu = useCallback(async (drawingId: string) => {
  if (!window.electronAPI) return
  const id = await window.electronAPI.showContextMenu([
    { id: 'delete', label: '🗑️ Delete' },
  ])
  if (id === 'delete') removeDrawing(drawingId)
}, [removeDrawing])
```

**Verify:** Right-click on a drawing → menu stays visible → click Delete → drawing removed. Right-click on empty canvas → normal canvas menu.

---

## Task 3: Fix text tool — stop propagation

**Objective:** Clicking in text mode shows the text input at the correct position.

**File:** `src/renderer/canvas/DrawingLayer.tsx`

**Step 1:** In `handleMouseDown`, move `e.stopPropagation()` + `e.preventDefault()` BEFORE the text tool check (so it applies to ALL draw tools):

```tsx
const handleMouseDown = (e: MouseEvent) => {
  if (useUIStore.getState().activeTool !== 'draw') return
  if (e.button !== 0) return
  e.stopPropagation()
  e.preventDefault()

  const drawTool = useUIStore.getState().activeDrawingTool
  const point = getCanvasPoint(e)
  if (!point) return

  if (drawTool === 'text') {
    setTextInput({ clientX: e.clientX, clientY: e.clientY, canvasX: point.x, canvasY: point.y })
    setTimeout(() => textInputRef.current?.focus(), 10)
    return
  }
  // ... rest of rect/arrow/line handling
```

**Step 2:** Add `autoFocus` to the text input and use `useEffect` to focus on mount:

```tsx
useEffect(() => {
  if (textInput) textInputRef.current?.focus()
}, [textInput])
```

**Verify:** Switch to text tool → click on canvas → input appears at cursor → type → Enter → text appears at click position.

---

## Task 4: Add drawing selection state

**Objective:** Click on a drawing in select mode to select it (visual highlight).

**Files:**
- `src/renderer/stores/canvas/storeTypes.ts` — add `selectedDrawingId`
- `src/renderer/stores/canvasStore.ts` — add initial state
- `src/renderer/canvas/DrawingLayer.tsx` — click handler

**Step 1:** Add to `CanvasStoreState`:

```ts
selectedDrawingId: string | null
```

**Step 2:** Add to `CanvasStoreActions`:

```ts
selectDrawing: (id: string | null) => void
```

**Step 3:** In `canvasStore.ts`, add `selectedDrawingId: null` to initial state and the action:

```ts
selectDrawing(id) { set({ selectedDrawingId: id }) },
```

**Step 4:** In `DrawingLayer`, add click handler to each drawing element (only in select mode):

```tsx
onClick={(e) => {
  if (useUIStore.getState().activeTool !== 'select') return
  e.stopPropagation()
  canvasApi.getState().selectDrawing(el.id)
}}
```

**Step 5:** Render a selection indicator (dashed outline) around the selected drawing.

**Verify:** Switch to select tool → click a drawing → dashed blue outline appears. Click empty canvas → deselect.

---

## Task 5: Add drag-to-move for selected drawings

**Objective:** Drag a selected drawing to move it.

**File:** `src/renderer/canvas/DrawingLayer.tsx`

**Step 1:** On `mousedown` on a selected drawing (in select mode), start a drag:

```tsx
onMouseDown={(e) => {
  if (useUIStore.getState().activeTool !== 'select') return
  if (e.button !== 0) return
  e.stopPropagation()
  e.preventDefault()
  canvasApi.getState().selectDrawing(el.id)

  const startX = e.clientX
  const startY = e.clientY
  const origEl = { ...el } // snapshot original position

  const onMove = (ev: MouseEvent) => {
    const store = canvasApi.getState()
    const dx = (ev.clientX - startX) / store.zoomLevel
    const dy = (ev.clientY - startY) / store.zoomLevel
    // Update drawing position based on type
    if (origEl.type === 'rect') {
      store.updateDrawing(el.id, { x: origEl.x + dx, y: origEl.y + dy })
    } else if (origEl.type === 'text') {
      store.updateDrawing(el.id, { x: origEl.x + dx, y: origEl.y + dy })
    } else if (origEl.type === 'arrow' || origEl.type === 'line') {
      store.updateDrawing(el.id, {
        x1: origEl.x1 + dx, y1: origEl.y1 + dy,
        x2: origEl.x2 + dx, y2: origEl.y2 + dy,
      })
    }
  }

  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}}
```

**Verify:** Select a drawing → drag it → it moves. Other drawings stay put.

---

## Task 6: Add resize handles for rectangles

**Objective:** Drag corner handles to resize selected rectangles.

**File:** `src/renderer/canvas/DrawingLayer.tsx`

**Step 1:** When a rect is selected, render 4 corner handles (small squares at corners):

```tsx
{selectedId && el.type === 'rect' && (
  <>
    {[{ cx: el.x, cy: el.y }, { cx: el.x + el.width, cy: el.y },
      { cx: el.x, cy: el.y + el.height }, { cx: el.x + el.width, cy: el.y + el.height }
    ].map((corner, i) => (
      <rect
        key={`handle-${el.id}-${i}`}
        x={corner.cx - 4} y={corner.cy - 4}
        width={8} height={8}
        fill="var(--focus-blue)"
        stroke="var(--surface-0)"
        strokeWidth={1}
        style={{ cursor: 'nwse-resize', pointerEvents: 'auto' }}
        onMouseDown={(e) => { /* resize logic */ }}
      />
    ))}
  </>
)}
```

**Step 2:** Implement resize drag — track which corner, update x/y/width/height accordingly.

**Verify:** Select a rect → 4 blue corner handles appear → drag a corner → rect resizes.

---

## Task 7: Delete key to remove selected drawing

**Objective:** Press Delete/Backspace to remove the selected drawing.

**File:** `src/renderer/canvas/DrawingLayer.tsx`

**Step 1:** Add a `useEffect` keydown listener:

```tsx
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const selectedId = canvasApi.getState().selectedDrawingId
      if (selectedId) {
        canvasApi.getState().removeDrawing(selectedId)
        canvasApi.getState().selectDrawing(null)
      }
    }
    if (e.key === 'Escape') {
      canvasApi.getState().selectDrawing(null)
    }
  }
  document.addEventListener('keydown', handler)
  return () => document.removeEventListener('keydown', handler)
}, [canvasApi])
```

**Verify:** Select drawing → press Delete → drawing removed. Press Escape → deselect.

---

## Task 8: Persist selectedDrawingId reset on tool switch

**Objective:** Clear drawing selection when switching tools.

**File:** `src/renderer/canvas/DrawingLayer.tsx`

**Step 1:** When `activeTool` changes away from 'select', clear selection:

```tsx
useEffect(() => {
  if (activeTool !== 'select') {
    canvasApi.getState().selectDrawing(null)
  }
}, [activeTool, canvasApi])
```

**Verify:** Select a drawing → switch to hand tool → selection cleared.

---

## Files Changed Summary

| File | Changes |
|---|---|
| `src/renderer/canvas/DrawingLayer.tsx` | Major rewrite — all fixes + select/move/resize |
| `src/renderer/stores/canvas/storeTypes.ts` | Add `selectedDrawingId` + `selectDrawing` |
| `src/renderer/stores/canvasStore.ts` | Add initial state + action |

## Verification

After all tasks:
1. `npm run typecheck` — PASS
2. `npm run test` — no new failures
3. Manual test in `npm run dev`:
   - Draw rect → color picker works → arrowhead stays per-element
   - Right-click drawing → delete menu stays
   - Text tool → click → input appears → type → Enter → text placed
   - Select tool → click drawing → blue outline + drag to move
   - Select rect → corner handles → drag to resize
   - Delete key removes selected drawing
   - All shapes persist across session save/restore
