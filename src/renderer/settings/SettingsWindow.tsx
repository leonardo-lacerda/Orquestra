// =============================================================================
// SettingsWindow — wide settings dialog: a left sidebar (search + section nav
// with scroll-spy) beside one long scrollable content column.
//
// The content stays a single scrollable page; the sidebar jumps to a section
// on click and highlights whichever section is currently scrolled into view.
// The search box live-filters individual setting rows across every section
// (via SettingsSearchContext) — non-matching rows hide, empty sections
// collapse, and the sidebar lists only sections that still have matches.
// =============================================================================

import { MagnifyingGlass, BracketsCurly } from '@phosphor-icons/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Modal } from '../ui/Modal'
import log from '../lib/logger'
import { useAppStore } from '../stores/appStore'
import { openFileAsPanel } from '../lib/fs/fileRouting'
import { GeneralSettings } from './GeneralSettings'
import { AppearanceSettings } from './AppearanceSettings'
import { CanvasSettings } from './CanvasSettings'
import { TerminalSettings } from './TerminalSettings'
import { OrchestrationSettings } from './OrchestrationSettings'
import { BrowserSettings } from './BrowserSettings'
import { SidebarSettings } from './SidebarSettings'
import { FileExplorerSettings } from './FileExplorerSettings'
import { WorktreeSettings } from './WorktreeSettings'
import { ShortcutSettings } from './ShortcutSettings'
import { NotificationSettings } from './NotificationSettings'
import { UpdatesSettings } from './UpdatesSettings'
import { ProvidersSettings } from './ProvidersSettings'
import { SkillsSettings } from './SkillsSettings'
import { SettingsSearchContext } from './SettingsSearchContext'
import { TextInput } from './SettingsComponents'
import { useTranslation } from '../i18n/useTranslation'
import type { Translations } from '../i18n/translations'

// Build SECTIONS using translated titles.
function getSections(t: (key: keyof Translations) => string) {
  return [
    { title: t('settings.section.general'), component: GeneralSettings },
    { title: t('settings.section.appearance'), component: AppearanceSettings },
    { title: t('settings.section.canvas'), component: CanvasSettings },
    { title: t('settings.section.terminal'), component: TerminalSettings },
    { title: t('settings.section.orchestration'), component: OrchestrationSettings },
    { title: t('settings.section.browser'), component: BrowserSettings },
    { title: t('settings.section.sidebar'), component: SidebarSettings },
    { title: t('settings.section.fileExplorer'), component: FileExplorerSettings },
    { title: t('settings.section.worktrees'), component: WorktreeSettings },
    { title: t('settings.section.notifications'), component: NotificationSettings },
    { title: t('settings.section.providers'), component: ProvidersSettings },
    { title: t('settings.section.skills'), component: SkillsSettings },
    { title: t('settings.section.updates'), component: UpdatesSettings },
    { title: t('settings.section.shortcuts'), component: ShortcutSettings },
  ] as const
}

// DOM id for a section. Slugify spaces (e.g. "File Explorer") so the result is
// a valid CSS selector for querySelector/scrollIntoView.
const sectionId = (title: string): string => `settings-section-${title.toLowerCase().replace(/\s+/g, '-')}`

interface SettingsWindowProps {
  isOpen: boolean
  onClose: () => void
  /** Lowercase section title to scroll into view on open. */
  initialTab?: string
}

export function SettingsWindow({ isOpen, onClose, initialTab }: SettingsWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [rawQuery, setRawQuery] = useState('')
  const { t } = useTranslation()
  const SECTIONS = getSections(t)
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].title.toLowerCase())
  const [visibleSections, setVisibleSections] = useState<Set<string>>(
    () => new Set(SECTIONS.map((s) => s.title.toLowerCase())),
  )

  const query = rawQuery.trim().toLowerCase()

  // Reset search + scroll to the requested section whenever the dialog opens.
  useEffect(() => {
    if (!isOpen) return
    setRawQuery('')
    const target = (initialTab ?? SECTIONS[0].title).toLowerCase()
    setActiveId(target)
    requestAnimationFrame(() => {
      scrollRef.current?.querySelector(`#${sectionId(target)}`)?.scrollIntoView({ block: 'start', behavior: 'auto' })
    })
  }, [isOpen, initialTab])

  // Match scan — after each query change, determine which sections still have
  // visible content. A section shows when there's no query, when its title
  // matches, or when it contains at least one visible row/block ([data-srow]).
  useLayoutEffect(() => {
    if (!isOpen) return
    const root = scrollRef.current
    if (!root) return
    const next = new Set<string>()
    for (const { title } of SECTIONS) {
      const id = title.toLowerCase()
      if (query === '' || title.toLowerCase().includes(query)) {
        next.add(id)
        continue
      }
      if (root.querySelector(`#${sectionId(title)} [data-srow]`)) next.add(id)
    }
    setVisibleSections(next)
  }, [query, isOpen])

  // Scroll-spy — highlight the section whose top sits at/above the fold.
  useEffect(() => {
    if (!isOpen) return
    const root = scrollRef.current
    if (!root) return
    const onScroll = () => {
      const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-section-id]'))
      const rootTop = root.getBoundingClientRect().top
      let current: string | undefined
      for (const s of sections) {
        if (s.hidden) continue
        const top = s.getBoundingClientRect().top - rootTop
        if (top <= 16) current = s.dataset.sectionId
        else break
      }
      const fallback = sections.find((s) => !s.hidden)?.dataset.sectionId
      setActiveId((prev) => current ?? fallback ?? prev)
    }
    onScroll()
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => root.removeEventListener('scroll', onScroll)
    // Re-attach when visibility changes so hidden sections are skipped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, visibleSections])

  // Escape clears an active search first, and only closes the window when the
  // search box is already empty. Owned here (Modal's own Escape-close is off via
  // closeOnEscape) so the two-step behaviour survives.
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (rawQuery) setRawQuery('')
      else onClose()
    }
    document.addEventListener('keydown', onKey, { capture: true })
    return () => document.removeEventListener('keydown', onKey, { capture: true })
  }, [isOpen, rawQuery, onClose])

  // Open the underlying settings.json in a Orquestra editor panel (VS Code's "Open
  // Settings (JSON)"). Main grants this window access to the file and returns
  // its path; we then close the dialog and mount an editor on it. Edits saved
  // there write back to the file, which the watcher reloads into the UI live.
  const openSettingsJson = async () => {
    try {
      const filePath = await window.electronAPI.settingsOpenInEditor()
      onClose()
      const workspaceId = useAppStore.getState().selectedWorkspaceId
      if (workspaceId) {
        openFileAsPanel(workspaceId, filePath)
      } else {
        // No workspace/canvas to host an editor panel — reveal the file so the
        // user can still open it in their own editor.
        void window.electronAPI.shellShowInFolder(filePath)
      }
    } catch (err) {
      log.warn('[settings] Failed to open settings.json:', err)
    }
  }

  if (!isOpen) return null

  const jumpTo = (id: string) => {
    scrollRef.current?.querySelector(`#${sectionId(id)}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    setActiveId(id)
  }

  const navSections = SECTIONS.filter(({ title }) => query === '' || visibleSections.has(title.toLowerCase()))

  return (
    <Modal
      onClose={onClose}
      width="min(900px,92vw)"
      height="80vh"
      zClassName="z-[100001]"
      closeOnEscape={false}
      title={t('settings.title')}
      bodyClassName="contents"
      headerActions={
        <button
          onClick={openSettingsJson}
          title={t('settings.openJson')}
          className="flex items-center gap-1.5 px-2 h-7 rounded-md border border-subtle text-secondary hover:bg-hover hover:text-primary text-xs"
        >
          <BracketsCurly size={14} />
          {t('settings.openJson')}
        </button>
      }
    >
      {/* Body: sidebar + scrollable content */}
      <div className="flex flex-1 min-h-0" data-sidebar-scrollarea>
          {/* Sidebar */}
          <div className="w-[208px] flex-shrink-0 flex flex-col bg-surface-0/30">
            <div className="p-3 flex-shrink-0">
              <div className="relative">
                <MagnifyingGlass
                  size={13}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                />
                <TextInput
                  value={rawQuery}
                  onChange={setRawQuery}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && rawQuery) {
                      e.stopPropagation()
                      setRawQuery('')
                    }
                  }}
                  placeholder={t('settings.searchPlaceholder')}
                  layoutClassName="w-full pl-7 pr-2"
                />
              </div>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 pb-3 flex flex-col gap-0.5">
              {navSections.map(({ title }) => {
                const id = title.toLowerCase()
                const active = id === activeId
                return (
                  <button
                    key={title}
                    onClick={() => jumpTo(id)}
                    className={`text-left px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                      active ? 'bg-surface-3 text-primary' : 'text-secondary hover:bg-hover hover:text-primary'
                    }`}
                  >
                    {title}
                  </button>
                )
              })}
              {navSections.length === 0 && (
                <span className="px-2.5 py-1.5 text-xs text-muted">{t('settings.noMatches')}</span>
              )}
            </nav>
          </div>

          {/* Scrollable sections */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
            <div className="flex flex-col gap-6">
              {SECTIONS.map(({ title, component: Component }) => {
                const id = title.toLowerCase()
                const sectionMatched = query !== '' && title.toLowerCase().includes(query)
                const hidden = query !== '' && !visibleSections.has(id)
                return (
                  <section key={title} id={sectionId(title)} data-section-id={id} hidden={hidden}>
                    <h3 className="text-sm font-semibold text-primary mb-2">
                      {title}
                    </h3>
                    <SettingsSearchContext.Provider value={{ query, sectionMatched }}>
                      <Component />
                    </SettingsSearchContext.Provider>
                  </section>
                )
              })}
              {query !== '' && visibleSections.size === 0 && (
                <div className="py-10 text-center text-sm text-muted">
                  {t('settings.noMatchResults').replace('{query}', rawQuery.trim())}
                </div>
              )}
            </div>
          </div>
      </div>
    </Modal>
  )
}
