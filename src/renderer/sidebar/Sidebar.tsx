import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ProjectList } from './ProjectList'
import { FileExplorer } from './FileExplorer'
import { SearchView } from './SearchView'
import { SourceControlView } from './SourceControlView'
import { useAppStore } from '../stores/appStore'
import { useUIStore, useSidebarLayout } from '../stores/uiStore'
import { useSettingsStore } from '../stores/settingsStore'
import type { SidebarView, SidebarSide } from '../stores/uiStore'
import {
  FolderOpen,
  GitBranch,
  Stack,
  Gear,
  MagnifyingGlass,
  FloppyDisk,
  PuzzlePiece,
  ArrowClockwise,
  DownloadSimple,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react'
import pkg from '../../../package.json'
import { Tooltip } from '../ui/Tooltip'
import { useTranslation } from '../i18n/useTranslation'
import orquestraLogo from '../assets/orquestra.logo.png'
import type { UpdateStatus } from '../../shared/electron-api'

// ---------------------------------------------------------------------------
// Version footer — check for updates (Supabase Storage release feed)
// ---------------------------------------------------------------------------

/**
 * Footer under workspaces: logo + version, or a check/update action button.
 * Uses electron-updater against the Supabase public bucket
 * (`orquestra-releases`). When an update is available/downloaded the control
 * becomes an install/update action.
 */
function SidebarUpdateFooter() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle', version: null })
  // After "up to date", briefly show the message then return to the version chip.
  const [flashUpToDate, setFlashUpToDate] = useState(false)

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.getUpdateStatus || !api.onUpdateStatus) return
    const apply = (s: UpdateStatus) => {
      setStatus(s)
      if (s.state === 'up-to-date') {
        setFlashUpToDate(true)
      }
    }
    void api.getUpdateStatus().then(apply).catch(() => {})
    return api.onUpdateStatus(apply)
  }, [])

  useEffect(() => {
    if (!flashUpToDate) return
    const id = window.setTimeout(() => setFlashUpToDate(false), 2800)
    return () => window.clearTimeout(id)
  }, [flashUpToDate, status.state])

  const onCheck = useCallback(() => {
    setFlashUpToDate(false)
    void window.electronAPI?.checkForUpdates?.()
  }, [])

  const onInstall = useCallback(async () => {
    const feed =
      'https://yktidzsrldsksvaubagt.supabase.co/storage/v1/object/public/orquestra-releases/'
    // Downloaded → install & relaunch. Available → re-check (starts download when
    // packaged/eligible) and open the Supabase feed for manual install fallback.
    if (status.state === 'downloaded') {
      try {
        const ok = await window.electronAPI.quitAndInstallUpdate()
        if (!ok) window.electronAPI.openExternalUrl?.(feed)
      } catch {
        /* ignore */
      }
      return
    }
    if (status.state === 'available' || status.state === 'downloading') {
      void window.electronAPI?.checkForUpdates?.()
      // Manual path always available (soft-check in dev can't auto-install)
      window.electronAPI.openExternalUrl?.(feed)
    }
  }, [status.state])

  const remoteLabel = status.version ? `v${status.version}` : ''
  const checking = status.state === 'checking'
  const hasUpdate =
    status.state === 'available'
    || status.state === 'downloading'
    || status.state === 'downloaded'
  const downloading = status.state === 'downloading'
  const downloaded = status.state === 'downloaded'

  let actionLabel = t('updates.checkForUpdates')
  if (checking) actionLabel = t('updates.checkingForUpdates')
  else if (flashUpToDate || status.state === 'up-to-date') actionLabel = t('updates.upToDate')
  else if (downloaded) actionLabel = t('updates.restartToUpdate')
  else if (downloading) {
    actionLabel = status.percent != null
      ? `${t('updates.updateAvailable')} ${status.percent}%`
      : t('updates.updateAvailable')
  } else if (status.state === 'available') {
    actionLabel = remoteLabel
      ? `${t('updates.updateAvailable')} ${remoteLabel}`
      : t('updates.updateAvailable')
  } else if (status.state === 'error') {
    actionLabel = t('updates.checkForUpdates')
  }

  return (
    <div className="flex-shrink-0 px-2 pt-1.5 pb-4 flex flex-col items-center gap-1.5 select-none">
      <div className="flex items-center justify-center gap-1.5">
        <img src={orquestraLogo} alt="Orquestra" className="h-4 w-auto object-contain opacity-80" />
        <span className="text-[10px] text-muted">v{pkg.version}</span>
      </div>
      <button
        type="button"
        disabled={checking || downloading}
        onClick={hasUpdate && !checking ? onInstall : onCheck}
        className={`max-w-full px-2 py-1 rounded text-[10px] leading-tight transition-colors flex items-center gap-1 ${
          hasUpdate
            ? 'bg-accent/20 text-accent hover:bg-accent/30 border border-accent/40'
            : flashUpToDate || status.state === 'up-to-date'
              ? 'text-muted'
              : 'text-muted hover:text-secondary hover:bg-hover border border-transparent'
        } disabled:opacity-60 disabled:cursor-default`}
        title={
          hasUpdate
            ? (downloaded ? t('updates.restartToUpdate') : t('updates.downloadAndInstall'))
            : t('updates.checkForUpdates')
        }
      >
        {checking || downloading ? (
          <ArrowClockwise size={11} className="animate-spin shrink-0" />
        ) : hasUpdate ? (
          <DownloadSimple size={11} className="shrink-0" />
        ) : null}
        <span className="truncate">{actionLabel}</span>
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// View metadata — icon + title for each possible sidebar view
// ---------------------------------------------------------------------------

function useViewMeta(): Record<SidebarView, { icon: PhosphorIcon; title: string }> {
  const { t } = useTranslation()
  return {
    workspaces: { icon: Stack, title: t('sidebar.workspaces') },
    explorer: { icon: FolderOpen, title: t('sidebar.explorer') },
    search: { icon: MagnifyingGlass, title: t('sidebar.search') },
    git: { icon: GitBranch, title: t('sidebar.sourceControl') },
  }
}

// ---------------------------------------------------------------------------
// Content renderer — renders whichever view is active, regardless of side
// ---------------------------------------------------------------------------

const SidebarViewContent: React.FC<{ view: SidebarView; rootPath: string }> = ({
  view,
  rootPath,
}) => {
  const selectedWorkspaceId = useAppStore((s) => s.selectedWorkspaceId)
  const setWorkspaceRootPath = useAppStore((s) => s.setWorkspaceRootPath)
  const { t } = useTranslation()

  switch (view) {
    case 'workspaces':
      return <ProjectList />
    case 'explorer':
      return rootPath ? (
        <FileExplorer rootPath={rootPath} />
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-muted text-xs gap-3 p-4">
          <span>{t('sidebar.noFolderOpen')}</span>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-secondary hover:text-primary bg-surface-5 hover:bg-hover transition-colors"
            onClick={async () => {
              const path = await window.electronAPI.openFolderDialog()
              if (path && selectedWorkspaceId) {
                setWorkspaceRootPath(selectedWorkspaceId, path)
              }
            }}
          >
            <FolderOpen size={13} />
            {t('sidebar.openFolder')}
          </button>
        </div>
      )
    case 'search':
      return <SearchView rootPath={rootPath} workspaceId={selectedWorkspaceId} />
    case 'git':
      return <SourceControlView rootPath={rootPath} />
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Shared activity bar sidebar — parameterized by side
// ---------------------------------------------------------------------------

const DRAG_MIME = 'application/x-orquestra-view'
const BAR_WIDTH = 40

interface ActivityBarSidebarProps {
  side: SidebarSide
  defaultWidth: number
  minWidth: number
  maxWidth: number
}

const ActivityBarSidebar: React.FC<ActivityBarSidebarProps> = ({ side, defaultWidth, minWidth, maxWidth }) => {
  const layout = useSidebarLayout()
  const views = layout[side]
  const tintOpacity = useSettingsStore((s) => s.sidebarTintOpacity)
  const activeView = useUIStore((s) => (side === 'left' ? s.activeLeftSidebarView : s.activeRightSidebarView))
  const setActiveView = useUIStore((s) =>
    side === 'left' ? s.setActiveLeftSidebarView : s.setActiveRightSidebarView,
  )
  const moveSidebarView = useUIStore((s) => s.moveSidebarView)
  const draggingView = useUIStore((s) => s.draggingView)
  const setDraggingView = useUIStore((s) => s.setDraggingView)
  const isDragActive = draggingView !== null
  const VIEW_META = useViewMeta()
  const { t } = useTranslation()

  // Guard: if activeView is not present on this side (e.g. just moved away), clear it
  useEffect(() => {
    if (activeView !== null && !views.includes(activeView)) {
      setActiveView(null)
    }
  }, [activeView, views, setActiveView])

  const isExpanded = activeView !== null
  const isEmpty = views.length === 0

  // When empty, the sidebar is hidden. During a drag, if the cursor enters
  // this side's half of the window, we reveal it so the user can drop here.
  const [dragRevealed, setDragRevealed] = useState(false)
  useEffect(() => {
    if (!isDragActive || !isEmpty) {
      setDragRevealed(false)
      return
    }
    const onDragOver = (e: DragEvent) => {
      const half = window.innerWidth / 2
      const inside = side === 'left' ? e.clientX < half : e.clientX >= half
      setDragRevealed(inside)
    }
    window.addEventListener('dragover', onDragOver)
    return () => window.removeEventListener('dragover', onDragOver)
  }, [isDragActive, isEmpty, side])

  const [width, setWidth] = useState(defaultWidth)
  const [isResizing, setIsResizing] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  // Drop indicator: index where the drop would land. Mirrored in a ref so the
  // drop handler reads the latest value (state updates from dragOver may not
  // have flushed by the time drop fires).
  const [dropIndicator, setDropIndicatorState] = useState<number | null>(null)
  const dropIndicatorRef = useRef<number | null>(null)
  const setDropIndicator = useCallback((value: number | null | ((prev: number | null) => number | null)) => {
    const next = typeof value === 'function' ? value(dropIndicatorRef.current) : value
    dropIndicatorRef.current = next
    setDropIndicatorState(next)
  }, [])

  const selectedWorkspace = useAppStore((s) => {
    const id = s.selectedWorkspaceId
    return s.workspaces.find((w) => w.id === id)
  })
  const rootPath = selectedWorkspace?.rootPath ?? ''

  const handleResizeDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    startXRef.current = e.clientX
    startWidthRef.current = width
  }, [width])

  useEffect(() => {
    if (!isResizing) return
    let pendingX = startXRef.current
    let rafId = 0
    const onMove = (e: MouseEvent) => {
      pendingX = e.clientX
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          rafId = 0
          // Left: dragging right grows width; Right: dragging left grows width.
          const delta = side === 'left' ? pendingX - startXRef.current : startXRef.current - pendingX
          setWidth(Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta)))
        })
      }
    }
    const onUp = () => setIsResizing(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isResizing, side, minWidth, maxWidth])

  const handleIconClick = useCallback((view: SidebarView) => {
    if (activeView === view) setActiveView(null)
    else setActiveView(view)
  }, [activeView, setActiveView])

  // --- Drag handlers ---

  const handleIconDragStart = (e: React.DragEvent, view: SidebarView) => {
    e.dataTransfer.setData(DRAG_MIME, view)
    e.dataTransfer.setData('text/plain', view)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingView(view)
  }

  const handleIconDragEnd = () => {
    setDraggingView(null)
    setDropIndicator(null)
  }

  const iconsContainerRef = useRef<HTMLDivElement | null>(null)

  const computeDropIndex = (clientY: number): number => {
    const container = iconsContainerRef.current
    if (!container) return views.length
    const buttons = Array.from(container.querySelectorAll<HTMLElement>('[data-sidebar-icon]'))
    if (buttons.length === 0) return 0
    for (let i = 0; i < buttons.length; i++) {
      const rect = buttons[i].getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) return i
    }
    return buttons.length
  }

  const handleBarDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleBarDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDropIndicator(computeDropIndex(e.clientY))
  }

  const handleBarDragLeave = (e: React.DragEvent) => {
    // Only clear when leaving the bar entirely
    const related = e.relatedTarget as Node | null
    if (!related || !(e.currentTarget as HTMLElement).contains(related)) {
      setDropIndicator(null)
    }
  }

  const handleBarDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const view = ((e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain')) as SidebarView) || draggingView
    const targetIndex = computeDropIndex(e.clientY)
    setDropIndicator(null)
    setDraggingView(null)
    if (!view) return
    moveSidebarView(view, side, targetIndex)
  }

  // --- Render ---

  const bar = (
    <div
      className="flex-shrink-0 flex flex-col items-center h-full relative"
      style={{
        width: BAR_WIDTH,
        backgroundColor: isExpanded
          ? 'color-mix(in srgb, var(--surface-0) 60%, transparent)'
          : undefined,
      }}
      onDragEnter={handleBarDragEnter}
      onDragOver={handleBarDragOver}
      onDragLeave={handleBarDragLeave}
      onDrop={handleBarDrop}
    >
      <div ref={iconsContainerRef} className="flex flex-col items-center pt-0.5 w-full relative">
        {views.map((view, index) => {
          const meta = VIEW_META[view]
          const Icon = meta.icon
          const isActive = activeView === view
          const showIndicatorBefore = isDragActive && dropIndicator === index
          const showIndicatorAfter = isDragActive && index === views.length - 1 && dropIndicator === views.length
          return (
            <React.Fragment key={view}>
              {showIndicatorBefore && (
                <div className="w-7 h-[2px] my-0.5 bg-blue-400 rounded-full pointer-events-none" />
              )}
              <div className="relative w-full flex items-center justify-center">
              <div
                role="button"
                tabIndex={0}
                data-sidebar-icon=""
                draggable
                onDragStart={(e) => handleIconDragStart(e, view)}
                onDragEnd={handleIconDragEnd}
                className={`relative flex items-center justify-center w-8 h-8 my-1 rounded transition-colors cursor-pointer ${
                  isActive ? 'text-primary' : 'text-muted hover:text-secondary'
                }`}
                onClick={() => handleIconClick(view)}
                title={isActive ? `${meta.title}. ${t('sidebar.collapseTooltip')}` : meta.title}
              >
                <Icon size={16} className="pointer-events-none" />
              </div>
            </div>
              {showIndicatorAfter && (
                <div className="w-7 h-[2px] my-0.5 bg-blue-400 rounded-full pointer-events-none" />
              )}
            </React.Fragment>
          )
        })}
        {isDragActive && views.length === 0 && dropIndicator !== null && (
          <div className="w-7 h-[2px] my-0.5 bg-blue-400 rounded-full pointer-events-none" />
        )}
      </div>
      {side === 'left' && (
        <div className="mt-auto flex flex-col items-center pb-1 w-full">
          <Tooltip label={t('sidebar.skills')} placement="right">
            <button
              type="button"
              className="flex items-center justify-center w-8 h-8 my-1 rounded text-muted hover:text-secondary transition-colors"
              onClick={() => useUIStore.getState().setShowSkillsDialog(true)}
              aria-label={t('sidebar.skills')}
            >
              <PuzzlePiece size={16} className="pointer-events-none" />
            </button>
          </Tooltip>
          <Tooltip label={t('sidebar.savedLayouts')} placement="right">
            <button
              type="button"
              className="flex items-center justify-center w-8 h-8 my-1 rounded text-muted hover:text-secondary transition-colors"
              onClick={() => useUIStore.getState().setShowLayoutsDialog(true)}
              aria-label={t('sidebar.savedLayouts')}
            >
              <FloppyDisk size={16} className="pointer-events-none" />
            </button>
          </Tooltip>
          <Tooltip label={t('sidebar.settings')} placement="right">
            <button
              type="button"
              className="flex items-center justify-center w-8 h-8 my-1 rounded text-muted hover:text-secondary transition-colors"
              onClick={() => useUIStore.getState().openSettings()}
              aria-label={t('sidebar.settings')}
            >
              <Gear size={16} className="pointer-events-none" />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  )

  const content = (
    <div
      className={`flex-1 min-w-0 flex flex-col h-full overflow-hidden transition-opacity duration-200 relative ${
        isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'
      } ${
        // Left sidebar's vertical scrollbar is on its right edge — exactly where
        // the 6px resize handle sits. Inset the content by the handle width so
        // the scrollbar clears it and stays draggable. (The right sidebar's
        // scrollbar is next to its activity bar, away from its handle.)
        side === 'left' ? 'pr-1' : ''
      }`}
    >
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {activeView && (
          <div key={activeView} className="absolute inset-0 animate-sidebar-view-in">
            <SidebarViewContent view={activeView} rootPath={rootPath} />
          </div>
        )}
      </div>
      {/* Version + check-for-updates — workspaces pane footer */}
      {isExpanded && activeView === 'workspaces' && (
        <SidebarUpdateFooter />
      )}
    </div>
  )

  return (
    <div
      data-sidebar-scrollarea
      className={`flex-shrink-0 relative flex flex-row h-full select-none overflow-hidden ${
        isResizing ? '' : 'transition-[width] duration-200 ease-in-out'
      }`}
      style={{
        width:
          isEmpty && !dragRevealed
            ? 0
            : isExpanded
              ? BAR_WIDTH + width
              : BAR_WIDTH,
        backgroundColor: `color-mix(in srgb, var(--surface-1) ${Math.round(tintOpacity * 100)}%, transparent)`,
      }}
    >
      <div
        className="pointer-events-none absolute top-0 left-0 right-0 h-9"
        style={{ backgroundColor: 'var(--surface-1)' }}
      />
      {side === 'left' ? (
        <>
          {bar}
          {content}
        </>
      ) : (
        <>
          {content}
          {bar}
        </>
      )}

      {/* Resize handle on the inner edge, only when expanded */}
      {isExpanded && (
        <div
          className={`absolute top-0 ${side === 'left' ? 'right-0' : 'left-0'} w-[4px] h-full cursor-col-resize z-10 ${
            isResizing ? 'bg-blue-500/30' : ''
          }`}
          onMouseDown={handleResizeDown}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Public wrappers
// ---------------------------------------------------------------------------

export const Sidebar: React.FC = () => (
  <ActivityBarSidebar side="left" defaultWidth={220} minWidth={140} maxWidth={400} />
)

export const RightSidebar: React.FC = () => (
  <ActivityBarSidebar side="right" defaultWidth={340} minWidth={240} maxWidth={600} />
)
