import { useState, useEffect, useCallback } from 'react'
import log from '../lib/logger'
import { useAppStore } from '../stores/appStore'
import { ensureWorkspaceFolder } from '../hooks/useShortcuts'
import {
  Terminal,
  Globe,
  FileCode,
  FolderOpen,
  Keyboard,
  Folder,
  CloudArrowUp,
} from '@phosphor-icons/react'
import { abbreviateLocalPath, workspaceDisplayName } from '../lib/fs/displayPath'
import { parseLocator, LOCAL_RUNTIME_ID } from '../../main/runtime/locator'
import { RemoteConnectDialog } from '../dialogs/RemoteConnectDialog'
import { workspaceRuntime } from '../lib/workspace/workspaceRuntime'
import { isWorkspaceEffectivelyEmpty } from '../lib/workspace/session'
import type { RemoteConnectSpec } from '../../shared/types'
import { useTranslation } from '../i18n/useTranslation'
import orquestraLogo from '../assets/orquestra.logo.png'

// Abbreviate home directory in paths
export default function WelcomePage({ workspaceId }: { workspaceId: string }) {
  const [recentProjects, setRecentProjects] = useState<string[]>([])
  const [showRemote, setShowRemote] = useState(false)
  const [remotePending, setRemotePending] = useState(false)
  const [remoteError, setRemoteError] = useState<string | null>(null)
  const { t } = useTranslation()

  const connectRemote = useCallback(
    async (spec: RemoteConnectSpec) => {
      setRemotePending(true)
      setRemoteError(null)
      const app = useAppStore.getState()
      const ok = await app.connectRemoteWorkspace(workspaceId, spec)
      setRemotePending(false)
      if (ok) {
        setShowRemote(false)
        const ws = useAppStore.getState().workspaces.find((w) => w.id === workspaceId)
        if (workspaceRuntime(ws).editable && isWorkspaceEffectivelyEmpty(workspaceId)) {
          app.createTerminal(workspaceId)
        }
      } else {
        const ws = useAppStore.getState().workspaces.find((w) => w.id === workspaceId)
        setRemoteError(ws?.runtime?.error ?? 'Failed to connect')
      }
    },
    [workspaceId],
  )

  useEffect(() => {
    window.electronAPI.recentProjectsGet().then(setRecentProjects).catch((err) => log.warn('[welcome] Failed to load recent projects:', err))
  }, [])

  const openFolder = useCallback(async () => {
    const path = await window.electronAPI.openFolderDialog()
    if (!path) return
    const app = useAppStore.getState()
    const ok = await app.setWorkspaceRootPath(workspaceId, path)
    if (ok && isWorkspaceEffectivelyEmpty(workspaceId)) app.createTerminal(workspaceId)
  }, [workspaceId])

  const openRecentProject = useCallback(
    async (path: string) => {
      const app = useAppStore.getState()
      const ok = await app.setWorkspaceRootPath(workspaceId, path)
      if (ok && isWorkspaceEffectivelyEmpty(workspaceId)) app.createTerminal(workspaceId)
    },
    [workspaceId],
  )

  const newTerminal = useCallback(async () => {
    const wsId = await ensureWorkspaceFolder(workspaceId)
    if (wsId) useAppStore.getState().createTerminal(wsId)
  }, [workspaceId])

  const newEditor = useCallback(async () => {
    const wsId = await ensureWorkspaceFolder(workspaceId)
    if (wsId) useAppStore.getState().createEditor(wsId)
  }, [workspaceId])

  const newBrowser = useCallback(async () => {
    const wsId = await ensureWorkspaceFolder(workspaceId)
    if (wsId) useAppStore.getState().createBrowser(wsId)
  }, [workspaceId])

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div className="pointer-events-auto max-w-2xl w-full px-8">
        {/* Header */}
        <div className="flex flex-col items-center mb-10">
          <img src={orquestraLogo} alt="Orquestra" className="h-12 w-auto object-contain mb-2" />
          <p className="text-sm text-muted mt-1">
            {t('welcome.tagline')}
          </p>
        </div>

        {/* Two-column layout: Start + Recent */}
        <div className="flex gap-12">
          {/* Start actions */}
          <div data-onboarding="welcome-actions" className="flex-1">
            <h2 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-3">
              {t('welcome.start')}
            </h2>
            <div className="flex flex-col gap-1">
              <ActionItem
                icon={<FolderOpen size={16} />}
                label={t('welcome.openFolder')}
                onClick={openFolder}
              />
              <ActionItem
                icon={<CloudArrowUp size={16} />}
                label={t('welcome.connectRemote')}
                onClick={() => { setRemoteError(null); setShowRemote(true) }}
              />
              <ActionItem
                icon={<Terminal size={16} />}
                label={t('welcome.newTerminal')}
                shortcut="⌘T"
                onClick={newTerminal}
              />
              <ActionItem
                icon={<FileCode size={16} />}
                label={t('welcome.newEditor')}
                shortcut="⌘⇧E"
                onClick={newEditor}
              />
              <ActionItem
                icon={<Globe size={16} />}
                label={t('welcome.newBrowser')}
                shortcut="⌘⇧B"
                onClick={newBrowser}
              />
            </div>
          </div>

          {/* Recent Projects */}
          {recentProjects.length > 0 && (
            <div className="flex-1">
              <h2 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-3">
                {t('welcome.recent')}
              </h2>
              <div className="flex flex-col gap-0.5">
                {recentProjects.map((projectPath) => {
                  const { runtimeId, path: decodedPath } = parseLocator(projectPath)
                  const sep = runtimeId === LOCAL_RUNTIME_ID ? /[\\/]/ : /\//
                  const name = workspaceDisplayName(projectPath) || projectPath
                  const parentPath = decodedPath.split(sep).slice(0, -1).join('/')
                  const parent = runtimeId === LOCAL_RUNTIME_ID
                    ? abbreviateLocalPath(parentPath)
                    : `${runtimeId}:${parentPath}`
                  return (
                    <button
                      key={projectPath}
                      className="flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-hover transition-colors group"
                      onClick={() => openRecentProject(projectPath)}
                    >
                      <Folder
                        size={14}
                        className="text-muted group-hover:text-secondary flex-shrink-0"
                      />
                      <span className="text-sm text-focus-blue group-hover:text-focus-blue truncate">
                        {name}
                      </span>
                      <span className="text-xs text-muted truncate">
                        {parent}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Keyboard shortcuts */}
        <div className="mt-10 pt-6">
          <h2 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-3">
            {t('welcome.keyboardShortcuts')}
          </h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1">
            <ShortcutRow keys="⌘T" label={t('welcome.shortcut.newTerminal')} />
            <ShortcutRow keys="⌘⇧B" label={t('welcome.shortcut.newBrowser')} />
            <ShortcutRow keys="⌘⇧E" label={t('welcome.shortcut.newEditor')} />
            <ShortcutRow keys="⌘K" label={t('welcome.shortcut.commandPalette')} />
            <ShortcutRow keys="⌘\" label={t('welcome.shortcut.toggleSidebar')} />
            <ShortcutRow keys="⌘0" label={t('welcome.shortcut.resetZoom')} />
          </div>
        </div>
      </div>

      {showRemote && (
        <RemoteConnectDialog
          onSubmit={connectRemote}
          onClose={() => setShowRemote(false)}
          pending={remotePending}
          error={remoteError}
        />
      )}
    </div>
  )
}

function ActionItem({
  icon,
  label,
  shortcut,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  shortcut?: string
  onClick: () => void
}) {
  return (
    <button
      className="flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-hover transition-colors group"
      onClick={onClick}
    >
      <span className="text-muted group-hover:text-secondary">{icon}</span>
      <span className="text-sm text-focus-blue group-hover:text-focus-blue">
        {label}
      </span>
      {shortcut && (
        <span className="ml-auto text-xs text-muted">{shortcut}</span>
      )}
    </button>
  )
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-secondary font-mono w-10 text-right">
        {keys}
      </span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  )
}
