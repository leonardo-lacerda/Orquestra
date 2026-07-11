# Linked Context Arrows Development Plan

Date: 2026-07-10

## Implementation Status

Completed on 2026-07-10:

- Phases 0-10 are implemented.
- Context arrows support editor buffers/files, PDF, DOCX, images with OCR, browser text/screenshots, terminal scrollback, agent transcripts, Git diff editors, folder trees, and orchestration metadata.
- Output arrows support terminal/agent to editor delivery.
- Context bundles, limits, redaction, automatic refresh, visual status, menus, settings, terminal/agent notifications, image attachments, and session-safe behavior are active.
- Unit, typecheck, production build, Electron smoke, and linked-context E2E coverage are present.

## Goal

Allow users to link documents, files, browser pages, and other context sources to terminals or agent panels using canvas arrows. A linked terminal should receive and use the linked sources as working context, without the user manually copying file contents or paths.

The user-facing mental model:

- Drag an arrow from a document/file/browser panel into a terminal.
- The arrow means: "this terminal should read/use this context".
- The terminal gets a clear context packet with paths, titles, extracted text, and instructions.
- The connection remains visible and can be refreshed, removed, or inspected.

## Current System Findings

### Canvas Connections

Current connection infrastructure already exists:

- `src/shared/types.ts`
  - `TerminalConnection`
  - `sourceNodeId`
  - `targetNodeId`
  - `type?: 'pipe' | 'orchestration'`
- `src/renderer/stores/canvas/connectionsSlice.ts`
  - `addConnection`
  - `removeConnection`
  - `loadConnections`
  - syncs pipe connections into main with `terminalPipeCreate`.
- `src/renderer/canvas/ConnectionLayer.tsx`
  - draws arrows.
  - supports visual style by connection type.
- `src/renderer/canvas/ConnectionHandles.tsx`
  - drag from right handle to left handle.

This should be extended rather than replaced.

### Existing Panel Types

Relevant canvas-capable panel types:

- `terminal`
- `agent`
- `editor`
- `document`
- `browser`
- `orchestration`

Current file routing:

- `src/renderer/lib/fs/fileRouting.ts`
  - text/code files become `editor`.
  - `.pdf`, `.docx`, images become `document`.

Current document support:

- `DocumentPanel` can display PDF, DOCX, and images.
- `EditorPanel` already reads text files with `fsReadFile`.
- The top canvas toolbar has an `Editor` button that creates editor panels directly.
- Editor panels can represent either a saved file (`filePath`) or a scratch/unsaved buffer (`unsavedContent` in panel state).
- `BrowserPanel` has a webview, URL/title state, and screenshot support.

### Important Constraint

A terminal does not automatically understand a visual arrow. The feature needs a context delivery mechanism:

1. Resolve linked source panels into a structured context bundle.
2. Write that bundle to a stable project-local file or send it directly to the agent.
3. Inject a concise message into the terminal telling it what was linked and where to read it.

## Which Documents Make Sense

### MVP Sources

1. Editor panels from the toolbar or opened files
   - Best first target.
   - The Editor toolbar button must create a first-class linkable context source.
   - Includes `.ts`, `.tsx`, `.js`, `.json`, `.md`, `.txt`, `.py`, `.html`, `.css`, `.yml`, `.yaml`, `.env.example`, config files.
   - Saved editor source of truth: panel `filePath`, read with `fsReadFile`.
   - Scratch/unsaved editor source of truth: live editor buffer if mounted, otherwise persisted `panel.unsavedContent`.
   - Payload: path when available, title, language, dirty/saved state, full text or truncated text.
   - If the editor is dirty, prefer the live buffer over disk so the terminal reads what the user sees.

2. Document panels: PDF
   - Very useful for specs, papers, manuals, contracts, forms, prompts, exam pages.
   - MVP can send path plus an instruction to inspect it if the agent has tools.
   - Better V2 extracts text via main-process PDF extraction.
   - Payload: path, page count if available, extracted text by page, optional screenshot reference.

3. Document panels: DOCX
   - Useful for requirements docs, proposals, reports.
   - MVP can send path.
   - V2 extracts text via `mammoth` in main.
   - Payload: path, headings, paragraphs, tables if practical.

4. Browser panels
   - Important because the example image shows a browser/form linked to a terminal.
   - MVP should send URL and title.
   - V2 should extract visible text from the webview.
   - V3 can attach screenshots for visual-only pages.
   - Payload: URL, title, selected/visible text, screenshot path.

5. Image documents
   - Useful for screenshots, diagrams, UI states, forms.
   - MVP sends image path and metadata.
   - V2 sends image attachment to agent panels where supported.
   - V3 OCR for terminal-only flows.

### Later Sources

6. Folder nodes or dropped folders
   - Useful for "read this module/package".
   - Payload should be a tree plus selected files, not recursive full content by default.

7. Search results / Git diff / Source Control selections
   - Useful for review workflows.
   - Payload: changed files, hunks, staged/unstaged status.

8. Terminal output as context
   - Link terminal A to terminal B as "read this output", distinct from current `pipe`.
   - Payload: recent scrollback excerpt.

9. Orchestration panel tasks
   - Link a plan/task card to a worker terminal.
   - Payload: task description, acceptance criteria, dependencies.

## UX Proposal

### Arrow Direction

Use direction to encode meaning:

- `document/editor/browser -> terminal/agent`
  - Context link. Target receives source context.
- `terminal -> terminal`
  - Existing PTY pipe.
- `maestro terminal -> worker terminal`
  - Existing orchestration arrow.
- `terminal/agent -> document/editor`
  - Future "write result to file" or "review/update this file".

### Handles

Keep the right-side output handle and left-side input handle, but make them type-aware:

- Source-capable panels show an output handle:
  - editor, document, browser, terminal, agent, orchestration.
- Context targets show an input handle:
  - terminal, agent.
- Invalid targets should not pulse during drag.

### Connection Types And Colors

Add semantic connection types:

```ts
type CanvasConnectionType =
  | 'pipe'
  | 'orchestration'
  | 'context'
  | 'review'
  | 'output'
```

Visual language:

- `pipe`: blue animated dashed line.
- `orchestration`: orange dashed line.
- `context`: purple/teal solid or gently dashed line.
- `review`: yellow line.
- `output`: green line.

### Context Connection Popover

Clicking or right-clicking a context arrow should show:

- Source title/path/URL.
- Target terminal title.
- Last sync time.
- Context mode:
  - Path only
  - Summary
  - Full text
  - Visible browser text
  - Screenshot/image
- Actions:
  - Send context now
  - Refresh context
  - Open source
  - Disconnect

### Terminal Feedback

When a context link is created, the target terminal should receive a small message:

```text
[orquestra] Linked context added:
- src/auth/session.ts
- docs/spec.pdf

Context bundle: .orquestra/context/terminal-abc/latest.md
Read this context before continuing.
```

For active agent terminals, optionally send a direct prompt:

```text
You have new linked context from Orquestra. Read:
.orquestra/context/terminal-abc/latest.md
Then use it for the current task.
```

## Data Model

Rename or extend `TerminalConnection` into a more general connection type.

Recommended conservative migration:

```ts
export type CanvasConnectionType =
  | 'pipe'
  | 'orchestration'
  | 'context'
  | 'review'
  | 'output'

export interface CanvasConnection {
  id: string
  sourceNodeId: CanvasNodeId
  targetNodeId: CanvasNodeId
  autoExecute?: boolean
  type: CanvasConnectionType
  metadata?: {
    createdAt: number
    lastSyncedAt?: number
    sourcePanelId?: string
    targetPanelId?: string
    contextMode?: 'path' | 'summary' | 'full' | 'visible' | 'screenshot' | 'buffer'
    sourceKind?: 'file' | 'editor' | 'folder' | 'browser' | 'terminal' | 'agent' | 'orchestration'
    bundlePath?: string
    error?: string
  }
}
```

Back compatibility:

- Keep exported alias:

```ts
export type TerminalConnection = CanvasConnection
```

- Existing saved connections without `type` default to `pipe`.
- Existing `orchestration` connections keep visual-only behavior.

## Context Bundle Format

Write context bundles under:

```text
.orquestra/context/<target-panel-id>/latest.md
.orquestra/context/<target-panel-id>/<connection-id>.md
.orquestra/context/<target-panel-id>/manifest.json
```

Manifest example:

```json
{
  "targetPanelId": "terminal-1",
  "targetPtyId": "pty-123",
  "updatedAt": 1783650000000,
  "connections": [
    {
      "connectionId": "conn-1",
      "sourcePanelId": "editor-1",
      "sourceKind": "file",
      "path": "C:/repo/src/app.ts",
      "mode": "full",
      "status": "ok",
      "bytes": 13022
    }
  ]
}
```

Bundle markdown example:

```md
# Orquestra Linked Context

Target: Terminal 1
Generated: 2026-07-10T12:00:00.000Z

## Sources

### 1. src/app.ts

- Type: text file
- Path: C:/repo/src/app.ts
- Mode: full

```ts
...
```

### 2. Browser: PROVA 02

- URL: https://docs.google.com/forms/...
- Mode: visible text

```text
...
```
```

## Context Extraction Strategy

### Text Files

Use `fsReadFile(filePath, workspaceId)`.

Rules:

- Max per file for MVP: 80 KB.
- If larger, include head/tail plus "truncated" note.
- Preserve code fences with language detection.
- Use workspace path validation already enforced by fs IPC.

### Editor Buffers

Editor panels created from the toolbar must be treated as linkable documents even when they do not have a `filePath`.

Rules:

- If `filePath` exists and the editor is not dirty, read from disk with `fsReadFile`.
- If the editor is dirty or has no `filePath`, resolve the live Monaco model content for that panel.
- If the panel is not mounted, fall back to persisted `panel.unsavedContent`.
- Include `path` only when a saved file exists.
- Include `isDirty`, `isScratch`, and `language` metadata.
- In the bundle, label scratch editors clearly as "Editor buffer" rather than pretending they are files.

### PDF

MVP:

- Send path-only plus file metadata.

V2:

- Add main-process IPC:

```ts
contextExtractDocument(filePath, workspaceId): Promise<ContextExtractionResult>
```

- Use `pdfjs-dist` or existing PDF tooling to extract text by page.
- Limit pages or characters.

### DOCX

MVP:

- Send path-only.

V2:

- Use `mammoth` in main process to extract text.
- Include headings/tables where possible.

### Images

MVP:

- Send path-only and image metadata.

V2:

- For `agent` panels, pass image attachment through `agentPrompt`.
- For `terminal` panels, write path into bundle and prompt the agent to inspect it if it has vision/file tools.

V3:

- OCR for images/screenshots.

### Browser Pages

MVP:

- Use panel `url` and `title`.

V2:

- Use registered webview to extract:

```js
document.body.innerText
```

- Also support screenshot through existing `webviewScreenshot`.
- For pages like Google Forms, visible text extraction plus screenshot is more useful than URL alone.

Potential new IPC:

```ts
browserExtractContext(panelId): Promise<{
  title: string
  url: string
  text?: string
  screenshotPath?: string
}>
```

## Delivery Strategy To Terminal

### Terminal Target

Use `terminalWrite(ptyId, message + '\r')` only after bundle is written.

Recommended message:

```text
Linked context updated. Read .orquestra/context/<panel>/latest.md before continuing.
```

Do not paste huge content directly into the terminal by default. It is noisy, slow, and can accidentally execute content in a shell.

### Agent Target

If the target panel is `agent`, use `agentPrompt`/`agentSteer` if available:

```text
New linked context is available:
.orquestra/context/<panel>/latest.md
Use it for the current task.
```

For images, use `AgentImageAttachment` when possible.

### Manual Refresh

Context should refresh:

- On connection creation.
- On "Refresh context" action.
- Optionally when a linked editor file is saved.
- Optionally when browser page finishes loading.

Avoid continuous auto-refresh at first.

## Permission And Safety Rules

1. Never auto-execute file contents in a shell.
2. Never paste raw context directly into terminal prompt unless the user explicitly chooses "Paste full context".
3. Validate paths through existing main-process path validation.
4. Respect workspace trust and remote runtime boundaries.
5. Store generated context under `.orquestra/context`, not arbitrary paths.
6. Redact obvious secrets in summaries when possible:
   - `.env`
   - private keys
   - tokens
7. Mark redacted/truncated content clearly.
8. For browser content, include URL domain and warn for sensitive pages.

## Settings

Add later, not required for MVP:

```ts
linkedContextDefaultMode: 'path' | 'summary' | 'full'
linkedContextMaxFileBytes: number
linkedContextMaxBundleBytes: number
linkedContextAutoRefresh: boolean
linkedContextIncludeBrowserScreenshots: boolean
linkedContextRedactSecrets: boolean
```

Good defaults:

```ts
linkedContextDefaultMode: 'summary'
linkedContextMaxFileBytes: 80000
linkedContextMaxBundleBytes: 250000
linkedContextAutoRefresh: false
linkedContextIncludeBrowserScreenshots: true
linkedContextRedactSecrets: true
```

## Implementation Phases

The feature should ship in separate phases. Each phase must leave the app in a working state and should be independently testable.

### Phase 0: Technical Preparation

Goal:

- Confirm the current canvas, panel, editor, terminal, and IPC boundaries before changing runtime behavior.

Scope:

- No product behavior changes.
- Validate how panel state stores `filePath`, `isDirty`, `unsavedContent`, browser URL/title, document metadata, and terminal PTY IDs.
- Decide the final names for `CanvasConnection`, `CanvasConnectionType`, `ContextMode`, and `ContextSourcePayload`.

Files to inspect:

- `src/shared/types.ts`
- `src/shared/panels.ts`
- `src/renderer/stores/canvas/connectionsSlice.ts`
- `src/renderer/canvas/ConnectionHandles.tsx`
- `src/renderer/canvas/ConnectionLayer.tsx`
- `src/renderer/panels/EditorPanel.tsx`
- `src/renderer/panels/DocumentPanel.tsx`
- `src/renderer/panels/BrowserPanel.tsx`
- `src/renderer/lib/terminal/terminalRegistry.ts`

Exit criteria:

- A short implementation note confirms which existing fields can be reused and which new APIs are needed.

### Phase 1: Connection Model Foundation

Goal:

- Make canvas arrows generic enough to represent terminal pipes, orchestration links, and context links.

Scope:

- Add `CanvasConnectionType`.
- Add or rename to `CanvasConnection`.
- Keep `TerminalConnection` as an alias for backwards compatibility.
- Add the `context` connection type.
- Ensure existing saved connections without a type still default to `pipe`.
- Ensure orchestration arrows keep their current visual-only behavior.
- Ensure only `pipe` connections sync to the terminal pipe IPC.

Primary files:

- `src/shared/types.ts`
- `src/renderer/stores/canvas/connectionsSlice.ts`
- `src/renderer/stores/canvas/storeTypes.ts`
- session serialization/restoration files if type names change.

Tests:

- Existing pipe connection behavior still works.
- Existing orchestration connection behavior still works.
- A saved connection without `type` hydrates as `pipe`.
- A `context` connection is stored/restored without trying to create a terminal pipe.

Exit criteria:

- The app can store a `context` arrow in canvas state without changing terminal behavior yet.

### Phase 2: Type-Aware Arrow Creation

Goal:

- Let users create valid context links from source panels to terminal/agent panels.

Scope:

- Allow output handles on `editor`, `document`, and `browser` nodes.
- Allow input handles on `terminal` and `agent` nodes.
- Add connection type inference:
  - `terminal -> terminal`: `pipe`
  - `orchestration/maestro -> terminal/agent`: `orchestration`
  - `editor/document/browser -> terminal/agent`: `context`
- Prevent invalid links with visual feedback.
- Keep the existing terminal pipe UX unchanged.

Primary files:

- `src/renderer/canvas/ConnectionHandles.tsx`
- `src/renderer/canvas/CanvasNode.tsx`
- `src/renderer/canvas/ConnectionLayer.tsx`
- `src/shared/panels.ts`

Tests:

- Editor to terminal creates `context`.
- Document to terminal creates `context`.
- Browser to terminal creates `context`.
- Terminal to terminal still creates `pipe`.
- Invalid source/target combinations are rejected.

Exit criteria:

- The user can draw a visible context arrow from the toolbar-created Editor panel into a terminal.

### Phase 3: Context Source Resolver

Goal:

- Convert a source panel into a normalized context payload.

Scope:

- Create `src/renderer/contextLinks/contextSourceResolver.ts`.
- Implement MVP source behavior:
  - saved editor with `filePath`: read text from disk unless dirty.
  - scratch editor without `filePath`: read current/persisted buffer and mark as `editor-buffer`.
  - dirty editor: prefer live Monaco buffer over disk.
  - PDF/DOCX/image document: path and metadata only.
  - browser: title and URL only.
- Add size limits and truncation metadata.

API:

```ts
resolveContextSource(params: {
  workspaceId: string
  sourcePanel: PanelState
  mode: ContextMode
}): Promise<ContextSourcePayload>
```

Payload:

```ts
interface ContextSourcePayload {
  kind: 'file' | 'editor-buffer' | 'browser' | 'image' | 'pdf' | 'docx' | 'terminal'
  title: string
  path?: string
  url?: string
  mimeType?: string
  text?: string
  screenshotPath?: string
  isDirty?: boolean
  isScratch?: boolean
  truncated?: boolean
  error?: string
}
```

Primary files:

- `src/renderer/contextLinks/contextSourceResolver.ts`
- `src/renderer/lib/editor/modelCache.ts`
- `src/renderer/lib/editor/editorSaveRegistry.ts`
- `src/shared/types.ts`

Tests:

- Saved editor resolves text and path.
- Scratch editor resolves buffer text with `isScratch: true`.
- Dirty editor resolves live buffer with `isDirty: true`.
- Document resolves path-only payload.
- Browser resolves title/URL payload.

Exit criteria:

- A source panel can be resolved into a context payload without writing any bundle yet.

### Phase 4: Context Bundle Writer

Goal:

- Persist linked context in a stable project-local bundle the terminal can read.

Scope:

- Add main-process IPC for writing and reading bundles.
- Write:
  - `.orquestra/context/<target-panel-id>/latest.md`
  - `.orquestra/context/<target-panel-id>/<connection-id>.md`
  - `.orquestra/context/<target-panel-id>/manifest.json`
- Validate workspace paths in main.
- Enforce bundle size limits.
- Format payloads as readable markdown.

New IPC:

```ts
LINKED_CONTEXT_WRITE = 'linkedContext:write'
LINKED_CONTEXT_READ = 'linkedContext:read'
```

Primary files:

- `src/shared/ipc-channels.ts`
- `src/shared/electron-api.d.ts`
- `src/preload/index.ts`
- `src/main/ipc/linkedContext.ts`
- optional `src/shared/linkedContext.ts`

Tests:

- Bundle path cannot escape workspace.
- `latest.md` is written.
- Per-connection markdown is written.
- Manifest records source/target/status.
- Oversized payloads are truncated or rejected safely.

Exit criteria:

- Calling the IPC with a context payload creates a valid `.orquestra/context/...` bundle.

### Phase 5: Terminal And Agent Delivery

Goal:

- Make the target terminal/agent aware that linked context exists.

Scope:

- Create `src/renderer/hooks/useLinkedContextConnections.ts`.
- Watch new `context` connections.
- Resolve source payload.
- Write/update bundle.
- Notify target terminal with a concise message and bundle path.
- For agent targets, send the context instruction through `agentPrompt` or `agentSteer`.
- On connection removal, update the manifest/bundle.

Terminal delivery:

```text
Linked context updated: .orquestra/context/<target-panel-id>/latest.md
Read that file before answering the next task.
```

Primary files:

- `src/renderer/hooks/useLinkedContextConnections.ts`
- `src/renderer/App.tsx` or the canvas host where global hooks are installed.
- `src/renderer/lib/terminal/terminalRegistry.ts`
- `src/shared/electron-api.d.ts`

Tests:

- Creating a context connection writes a bundle.
- Creating a context connection notifies the terminal once.
- Rehydrating a session does not spam terminal notifications.
- Removing a context connection updates the manifest.

Exit criteria:

- Dragging Editor -> Terminal creates the bundle and the terminal sees a short context notification.

### Phase 6: Context Arrow UI And Controls

Goal:

- Make context links inspectable and manageable from the canvas.

Scope:

- Add distinct context arrow styling.
- Add hover label with source and target names.
- Add context menu/popover:
  - Refresh context
  - Open bundle
  - Open source
  - Disconnect
- Add a small linked-context count badge on terminal/agent nodes.
- Show error state if context resolution or bundle writing fails.

Primary files:

- `src/renderer/canvas/ConnectionLayer.tsx`
- `src/renderer/canvas/ConnectionPopover.tsx`
- `src/renderer/canvas/CanvasNode.tsx`
- `src/renderer/stores/canvas/connectionsSlice.ts`

Tests:

- Context arrow has correct style.
- Disconnect removes connection.
- Refresh rewrites bundle.
- Error state is visible and does not crash the canvas.

Exit criteria:

- Users can see, refresh, inspect, and remove context links without touching the filesystem manually.

### Phase 7: Browser Context Upgrade

Goal:

- Make browser panels useful context sources beyond URL/title.

Scope:

- Extract title, URL, visible text, and optionally screenshot.
- Use existing screenshot support where possible.
- Handle cross-origin/protected pages gracefully.
- Store screenshot path in manifest when available.

Primary files:

- `src/renderer/panels/BrowserPanel.tsx`
- `src/renderer/lib/portalRegistry.ts`
- `src/main/ipc/capture.ts` or new browser context IPC.
- `src/renderer/contextLinks/contextSourceResolver.ts`

Tests:

- Browser title/URL resolve reliably.
- Simple page visible text is captured.
- Screenshot capture failure falls back to URL/title.
- Bundle records extraction errors clearly.

Exit criteria:

- Linking Browser -> Terminal gives the terminal enough context to understand a visible webpage or form.

### Phase 8: Document Extraction Upgrade

Goal:

- Extract useful text from PDF and DOCX documents instead of path-only context.

Scope:

- Add PDF text extraction with page/character limits.
- Add DOCX text extraction via `mammoth`.
- Normalize extracted content into markdown.
- Keep image documents path-only unless OCR is added later.

Primary files:

- `src/main/ipc/linkedContext.ts`
- `src/main/documentExtraction.ts`
- `src/renderer/contextLinks/contextSourceResolver.ts`

Tests:

- Small PDF fixture extracts text.
- Small DOCX fixture extracts text.
- Large documents are limited safely.
- Extraction failures produce a path-only fallback.

Exit criteria:

- Linking PDF/DOCX -> Terminal creates a bundle with useful extracted text when possible.

### Phase 9: Linked Context Settings

Goal:

- Let users control context behavior without code changes.

Scope:

- Add settings:
  - `linkedContextDefaultMode`
  - `linkedContextMaxFileBytes`
  - `linkedContextMaxBundleBytes`
  - `linkedContextAutoRefresh`
  - `linkedContextIncludeBrowserScreenshots`
  - `linkedContextRedactSecrets`
- Decide whether these live inside Orquestra Settings or a dedicated Context Settings section.

Primary files:

- `src/shared/types.ts`
- `src/main/settingsFile.ts`
- `src/renderer/settings/OrchestrationSettings.tsx` or new `ContextSettings.tsx`

Tests:

- Defaults load correctly.
- Settings persist and restore.
- Resolver/bundle writer uses size and mode settings.
- Screenshot and redaction toggles affect output.

Exit criteria:

- The behavior of linked context can be configured from settings.

### Phase 10: Hardening And E2E

Goal:

- Validate the complete workflow and remove sharp edges.

Scope:

- Add E2E smoke coverage.
- Add session round-trip coverage.
- Add failure-state coverage.
- Add manual QA checklist for canvas interactions.

Unit tests:

- Connection type inference.
- Context source resolver for editor/document/browser.
- Bundle formatter.
- Bundle writer path safety.
- Terminal notification formatting.
- Session round-trip for `context` connections.

E2E smoke:

1. Open workspace.
2. Create a toolbar Editor panel.
3. Type unsaved scratch content.
4. Open terminal on canvas.
5. Drag arrow from Editor to Terminal.
6. Confirm context arrow appears.
7. Confirm `.orquestra/context/<terminal>/latest.md` exists.
8. Confirm bundle includes scratch editor content.
9. Confirm terminal receives "Linked context updated".

Browser E2E:

1. Open browser panel to a simple local HTML page.
2. Link browser to terminal.
3. Confirm bundle contains title, URL, and visible text.

Exit criteria:

- The MVP workflow is stable across reloads and does not regress existing terminal pipe/orchestration behavior.

## MVP Scope

Ship first:

- `context` arrow type.
- Link editor panels to terminals, including toolbar-created scratch editors and saved text/code files.
- Link document/browser panels as path/title/URL context.
- Generate `.orquestra/context/<target>/latest.md`.
- Notify target terminal.
- Context arrow styling and disconnect.
- Tests for resolver, bundle formatter, and connection type inference.

Defer:

- PDF/DOCX full text extraction.
- OCR.
- Continuous auto-refresh.
- Complex browser DOM extraction.
- Multi-file folder semantic selection.
- Secret redaction beyond basic heuristics.

## Recommended First Implementation Order

1. Add `CanvasConnectionType` and `context`.
2. Add connection type inference helper.
3. Make handles type-aware.
4. Add context arrow styling.
5. Implement source resolver for saved editor files, scratch editor buffers, document metadata, and browser metadata.
6. Implement bundle formatter.
7. Add main IPC bundle writer.
8. Add hook that reacts to new context connections and notifies terminal.
9. Add context arrow menu.
10. Add tests.

## Risks

- Pasting large content into terminals can corrupt shell state. Use files + short notifications.
- Browser extraction can fail on cross-origin/protected pages. URL + screenshot fallback is necessary.
- PDF/DOCX extraction can be slow. Run in main with size/page limits.
- Connections must survive session restore without auto-spamming terminal prompts. Store `lastSyncedAt`.
- Remote workspaces need runtime-aware paths. Bundle writing must use the workspace/root runtime path model, not local-only assumptions.

## Open Questions

- Should context links auto-refresh on file save, or should refresh be manual by default?
- Should linking a browser panel send screenshot automatically?
- Should terminal targets receive only bundle path, or also a short summary inline?
- Should context links be global for a terminal, or per current command/task?
- Should a linked file be read-only context or can the terminal be asked to edit it?
- Should source-to-terminal arrows be reversible for "write answer back to document" later?
