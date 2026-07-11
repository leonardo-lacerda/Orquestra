export type Language = 'en' | 'pt-BR'

export const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'pt-BR', label: 'Português (Brasil)' },
]

// All translation keys for the app
export interface Translations {
  // Settings Window
  'settings.title': string
  'settings.openJson': string
  'settings.searchPlaceholder': string
  'settings.noMatches': string
  'settings.noMatchResults': string

  // Settings Sections
  'settings.section.general': string
  'settings.section.appearance': string
  'settings.section.canvas': string
  'settings.section.terminal': string
  'settings.section.orchestration': string
  'settings.section.browser': string
  'settings.section.sidebar': string
  'settings.section.fileExplorer': string
  'settings.section.worktrees': string
  'settings.section.notifications': string
  'settings.section.providers': string
  'settings.section.skills': string
  'settings.section.updates': string
  'settings.section.shortcuts': string

  // General Settings
  'general.defaultShellPath': string
  'general.defaultShellPath.desc': string
  'general.autoDetect': string
  'general.warnBeforeQuit': string
  'general.warnBeforeQuit.desc': string
  'general.privacy': string
  'general.privacy.desc': string
  'general.privacyPolicy': string
  'general.language': string
  'general.language.desc': string

  // Appearance Settings
  'appearance.theme': string
  'appearance.theme.desc': string
  'appearance.editorFontSize': string
  'appearance.editorFontSize.desc': string
  'appearance.editorFontFamily': string
  'appearance.editorFontFamily.desc': string
  'appearance.uiScale': string
  'appearance.uiScale.desc': string
  'appearance.disableGpuRasterization': string
  'appearance.disableGpuRasterization.desc': string

  // Canvas Settings
  'canvas.showMinimap': string
  'canvas.showMinimap.desc': string
  'canvas.zoomSpeed': string
  'canvas.zoomSpeed.desc': string
  'canvas.autoFocus': string
  'canvas.autoFocus.desc': string
  'canvas.gridStyle': string
  'canvas.gridStyle.desc': string
  'canvas.gridStyle.lines': string
  'canvas.gridStyle.dots': string
  'canvas.gridStyle.none': string
  'canvas.snapToGrid': string
  'canvas.snapToGrid.desc': string
  'canvas.placementPicker': string
  'canvas.placementPicker.desc': string
  'canvas.showWorktreeTerritory': string
  'canvas.showWorktreeTerritory.desc': string
  'canvas.backgroundImage': string
  'canvas.backgroundImage.desc': string
  'canvas.backgroundImageOpacity': string
  'canvas.backgroundImageOpacity.desc': string
  'canvas.backgroundBrowse': string
  'canvas.backgroundClear': string

  // Terminal Settings
  'terminal.fontFamily': string
  'terminal.fontFamily.desc': string
  'terminal.autoDetect': string
  'terminal.fontSize': string
  'terminal.fontSize.desc': string
  'terminal.scrollback': string
  'terminal.scrollback.desc': string
  'terminal.scrollSpeed': string
  'terminal.scrollSpeed.desc': string
  'terminal.contrast': string
  'terminal.contrast.desc': string
  'terminal.cursorBlink': string
  'terminal.cursorBlink.desc': string
  'terminal.optionIsMeta': string
  'terminal.optionIsMeta.desc': string
  'terminal.autoSuspend': string
  'terminal.autoSuspend.desc': string

  // Orchestration Settings
  'orchestration.intro': string
  'orchestration.group.mode': string
  'orchestration.group.workers': string
  'orchestration.group.delegation': string
  'orchestration.group.permissions': string
  'orchestration.group.completion': string
  'orchestration.mode': string
  'orchestration.mode.desc': string
  'orchestration.mode.manual': string
  'orchestration.mode.assisted': string
  'orchestration.mode.auto': string
  'orchestration.maxWorkers': string
  'orchestration.maxWorkers.desc': string
  'orchestration.maxWorkerRoleChars': string
  'orchestration.maxWorkerRoleChars.desc': string
  'orchestration.defaultWorkerKind': string
  'orchestration.defaultWorkerKind.desc': string
  'orchestration.workerKind.terminal': string
  'orchestration.workerKind.agent': string
  'orchestration.defaultWorkerAgent': string
  'orchestration.defaultWorkerAgent.desc': string
  'orchestration.workerAgent.verboo': string
  'orchestration.workerAgent.claude': string
  'orchestration.workerAgent.codex': string
  'orchestration.workerAgent.opencode': string
  'orchestration.workerAgent.custom': string
  'orchestration.defaultAgentCommand': string
  'orchestration.defaultAgentCommand.desc': string
  'orchestration.effectiveAgentCommand': string
  'orchestration.effectiveAgentCommand.desc': string
  'orchestration.workerNamePrefix': string
  'orchestration.workerNamePrefix.desc': string
  'orchestration.taskSplitStrategy': string
  'orchestration.taskSplitStrategy.desc': string
  'orchestration.taskSplit.auto': string
  'orchestration.taskSplit.byTask': string
  'orchestration.taskSplit.byFile': string
  'orchestration.taskSplit.byStage': string
  'orchestration.contextPolicy': string
  'orchestration.contextPolicy.desc': string
  'orchestration.context.summary': string
  'orchestration.context.relevantFiles': string
  'orchestration.context.full': string
  'orchestration.reviewPolicy': string
  'orchestration.reviewPolicy.desc': string
  'orchestration.review.never': string
  'orchestration.review.onChanges': string
  'orchestration.review.always': string
  'orchestration.permissionMode': string
  'orchestration.permissionMode.desc': string
  'orchestration.permissionMode.ask': string
  'orchestration.permissionMode.bypass': string
  'orchestration.allowFileEdits': string
  'orchestration.allowFileEdits.desc': string
  'orchestration.allowCommands': string
  'orchestration.allowCommands.desc': string
  'orchestration.allowNetwork': string
  'orchestration.allowNetwork.desc': string
  'orchestration.allowNestedWorkers': string
  'orchestration.allowNestedWorkers.desc': string
  'orchestration.onWorkerDone': string
  'orchestration.onWorkerDone.desc': string
  'orchestration.done.keepOpen': string
  'orchestration.done.hide': string
  'orchestration.done.closeOnSuccess': string

  // Browser Settings
  'browser.homepage': string
  'browser.homepage.desc': string
  'browser.searchEngine': string
  'browser.searchEngine.desc': string
  'browser.showBookmarksBar': string
  'browser.showBookmarksBar.desc': string
  'browser.showTabSidebar': string
  'browser.showTabSidebar.desc': string
  'browser.newTabBehavior': string
  'browser.newTabBehavior.desc': string
  'browser.newTabBehavior.startPage': string
  'browser.newTabBehavior.homepage': string
  'browser.newTabBehavior.blank': string
  'browser.terminalLinkTarget': string
  'browser.terminalLinkTarget.desc': string
  'browser.terminalLinkTarget.ask': string
  'browser.terminalLinkTarget.canvas': string
  'browser.terminalLinkTarget.external': string

  // Sidebar Settings
  'sidebar.backgroundOpacity': string
  'sidebar.backgroundOpacity.desc': string
  'sidebar.showFileExplorerOnLaunch': string
  'sidebar.showFileExplorerOnLaunch.desc': string

  // File Explorer Settings
  'fileExplorer.exclusions': string
  'fileExplorer.exclusions.desc': string
  'fileExplorer.addPlaceholder': string
  'fileExplorer.addButton': string

  // Worktree Settings
  'worktree.closeOnDelete': string
  'worktree.closeOnDelete.desc': string
  'worktree.symlinkPaths': string
  'worktree.symlinkPaths.desc': string
  'worktree.addPlaceholder': string
  'worktree.addButton': string

  // Notification Settings
  'notifications.enabled': string
  'notifications.enabled.desc': string
  'notifications.onlyWhenUnfocused': string
  'notifications.onlyWhenUnfocused.desc': string

  // Update Settings
  'updates.beta': string
  'updates.beta.desc': string
  'updates.checkingForUpdates': string
  'updates.upToDate': string
  'updates.updateAvailable': string
  'updates.restartToUpdate': string
  'updates.checkForUpdates': string
  'updates.currentVersion': string
  'updates.downloadAndInstall': string

  // Sidebar
  'sidebar.workspaces': string
  'sidebar.explorer': string
  'sidebar.search': string
  'sidebar.sourceControl': string
  'sidebar.noFolderOpen': string
  'sidebar.openFolder': string
  'sidebar.skills': string
  'sidebar.savedLayouts': string
  'sidebar.settings': string

  // Welcome Page
  'welcome.tagline': string
  'welcome.start': string
  'welcome.openFolder': string
  'welcome.connectRemote': string
  'welcome.newTerminal': string
  'welcome.newEditor': string
  'welcome.newBrowser': string
  'welcome.recent': string
  'welcome.keyboardShortcuts': string
  'welcome.shortcut.newTerminal': string
  'welcome.shortcut.newBrowser': string
  'welcome.shortcut.newEditor': string
  'welcome.shortcut.commandPalette': string
  'welcome.shortcut.toggleSidebar': string
  'welcome.shortcut.resetZoom': string

  // Command Palette
  'palette.searchPlaceholder': string
  'palette.commands': string
  'palette.panels': string
  'palette.files': string
  'palette.recentFiles': string
  'palette.searching': string
  'palette.noResults': string
  'palette.otherWindow': string
  'palette.newTerminal': string
  'palette.newBrowser': string
  'palette.newEditor': string
  'palette.newAgent': string
  'palette.newCanvas': string
  'palette.closePanel': string
  'palette.saveFile': string
  'palette.toggleSidebar': string
  'palette.toggleFileExplorer': string
  'palette.toggleSearch': string
  'palette.toggleMinimap': string
  'palette.resetZoom': string
  'palette.zoomToFit': string
  'palette.zoomToSelection': string
  'palette.autoLayout': string
  'palette.undo': string
  'palette.redo': string
  'palette.savedLayouts': string
  'palette.skills': string
  'palette.showTutorial': string
  'palette.reloadWorkspace': string
  'palette.deleteRuntime': string

  // Project List
  'projects.workspace': string
  'projects.collapseAll': string
  'projects.expandAll': string
  'projects.newWorkspace': string
  'projects.closeSelected': string

  // Source Control
  'git.sourceControl': string
  'git.changes': string
  'git.staged': string
  'git.commitPlaceholder': string
  'git.commit': string
  'git.noChanges': string
  'git.discard': string
  'git.stage': string
  'git.unstage': string
  'git.openFile': string

  // Search View
  'search.title': string
  'search.placeholder': string
  'search.noResults': string
  'search.replaced': string
  'search.replaceAll': string
  'search.replace': string

  // File Explorer
  'explorer.title': string
  'explorer.newFile': string
  'explorer.newFolder': string
  'explorer.rename': string
  'explorer.delete': string
  'explorer.duplicate': string
  'explorer.copyPath': string
  'explorer.copyRelativePath': string
  'explorer.revealInExplorer': string
  'explorer.newFilePlaceholder': string
  'explorer.newFolderPlaceholder': string

  // Auth
  'auth.login.error': string
  'auth.login.serverError': string
  'auth.login.verifyingSession': string
  'auth.login.welcomeBack': string
  'auth.login.subtitle': string
  'auth.login.email': string
  'auth.login.emailPlaceholder': string
  'auth.login.password': string
  'auth.login.signingIn': string
  'auth.login.signIn': string
  'auth.login.noAccount': string

  // Canvas Toolbar
  'canvas.toolbar.terminal': string
  'canvas.toolbar.selectTool': string
  'canvas.toolbar.handTool': string
  'canvas.toolbar.drawTool': string
  'canvas.toolbar.rectangle': string
  'canvas.toolbar.arrow': string
  'canvas.toolbar.line': string
  'canvas.toolbar.text': string
  'canvas.toolbar.browser': string
  'canvas.toolbar.editor': string
  'canvas.toolbar.agent': string
  'canvas.toolbar.zoomOut': string
  'canvas.toolbar.zoomReset': string
  'canvas.toolbar.zoomIn': string
  'canvas.toolbar.minimapShow': string
  'canvas.toolbar.minimapHide': string

  // Canvas Context Menu
  'canvas.context.newTerminal': string
  'canvas.context.newEditor': string
  'canvas.context.newBrowser': string
  'canvas.context.newAgent': string
  'canvas.context.newOrchestration': string
  'canvas.context.newCanvas': string

  // Canvas Node
  'canvas.node.moveToFront': string
  'canvas.node.moveToBack': string

  // Connection Layer
  'connection.refreshContext': string
  'connection.openBundle': string
  'connection.openSource': string
  'connection.sendOutput': string
  'connection.useAsContext': string
  'connection.disconnect': string

  // Search View
  'search.matchCase': string
  'search.matchWord': string
  'search.useRegex': string
  'search.toggleDetails': string
  'search.filesToInclude': string
  'search.filesToExclude': string
  'search.useExcludeSettings': string
  'search.emptyState': string
  'search.results': string
  'search.filesCount': string
  'search.truncated': string

  // Source Control
  'git.branches': string
  'git.newBranchPlaceholder': string
  'git.filterBranchesPlaceholder': string
  'git.current': string
  'git.remote': string
  'git.committing': string
  'git.stagedChanges': string
  'git.changesTitle': string
  'git.untracked': string
  'git.commitLog': string
  'git.worktrees': string
  'git.noChangesDetected': string
  'git.discardChanges': string
  'git.stageFile': string
  'git.unstageFile': string
  'git.unstageAll': string
  'git.stageAll': string
  'git.stash': string
  'git.popStash': string
  'git.fetch': string
  'git.pull': string
  'git.push': string
  'git.refresh': string
  'git.dismiss': string
  'git.deleteBranch': string
  'git.createBranch': string
  'git.cancel': string
  'git.newBranch': string

  // File Explorer (extra)
  'explorer.filterFiles': string
  'explorer.reload': string
  'explorer.filterPlaceholder': string
  'explorer.clear': string
  'explorer.loading': string
  'explorer.noFilesFound': string
  'explorer.openInTerminal': string
  'explorer.paste': string
  'explorer.removeFolder': string
  'explorer.findInFolder': string
  'explorer.deleteConfirm': string
  'explorer.deleteConfirmMessage': string
  'explorer.removeConfirm': string

  // File Tree
  'filetree.rename': string
  'filetree.copyName': string

  // Workspace
  'workspace.default': string
  'workspace.selectWorkspace': string
  'workspace.renameWorkspace': string
  'workspace.changeColor': string
  'workspace.selectFolder': string
  'workspace.copyDir': string
  'workspace.duplicate': string
  'workspace.closeAllPanels': string
  'workspace.closeWorkspace': string
  'workspace.rename': string
  'workspace.close': string
  'workspace.connecting': string
  'workspace.addWorkspace': string
  'workspace.chooseFolder': string
  'workspace.collapse': string
  'workspace.expand': string
  'workspace.canvas': string
  'workspace.otherWindows': string
  'workspace.inAnotherWindow': string

  // Runtime
  'runtime.installing': string
  'runtime.connecting': string
  'runtime.disconnected': string
  'runtime.reconnect': string
  'runtime.notInstalled': string
  'runtime.install': string
  'runtime.unreachable': string
  'runtime.retry': string

  // Skills Dialog
  'skills.searchPlaceholder': string
  'skills.intoWorkspace': string
  'skills.noFolderOpen': string
  'skills.refreshCatalog': string
  'skills.sourcesAndSettings': string
  'skills.installed': string
  'skills.saved': string
  'skills.browse': string
  'skills.noCatalog': string
  'skills.noOtherMatches': string
  'skills.allInCatalog': string
  'skills.missingSkill': string
  'skills.addSource': string
  'skills.savedTooltip': string
  'skills.saveToLibrary': string
  'skills.openOnGitHub': string
  'skills.openFolderFirst': string
  'skills.agents': string
  'skills.install': string
  'skills.installFor': string
  'skills.installedTooltip': string
  'skills.installHere': string

  // Layouts
  'layouts.nameRequired': string
  'layouts.saveFailed': string
  'layouts.layoutNotFound': string
  'layouts.deleteConfirm': string
  'layouts.deleteFailed': string
  'layouts.savePlaceholder': string
  'layouts.emptyState': string
  'layouts.savedLayouts': string
  'layouts.load': string
  'layouts.delete': string

  // Welcome Dialog
  'welcome.welcomeTitle': string
  'welcome.welcomeDesc': string
  'welcome.featureTerminal': string
  'welcome.featureTerminalDesc': string
  'welcome.featureEditor': string
  'welcome.featureEditorDesc': string
  'welcome.featureBrowser': string
  'welcome.featureBrowserDesc': string
  'welcome.featureAgent': string
  'welcome.featureAgentDesc': string
  'welcome.featureCanvas': string
  'welcome.featureCanvasDesc': string
  'welcome.saving': string
  'welcome.continue': string

  // Onboarding
  'onboarding.step1Title': string
  'onboarding.step1Body': string
  'onboarding.step2Title': string
  'onboarding.step2Body': string
  'onboarding.step3Title': string
  'onboarding.step3Body': string
  'onboarding.step4Title': string
  'onboarding.step4Body': string
  'onboarding.step5Title': string
  'onboarding.step5Body': string
  'onboarding.step6Title': string
  'onboarding.step6Body': string

  // Dock
  'dock.closeAll': string
  'dock.rename': string
  'dock.closeOthers': string
  'dock.closeToRight': string
  'dock.splitRight': string
  'dock.moveToNewWindow': string
  'dock.newTab': string
  'dock.splitWith': string
  'dock.editor': string
  'dock.terminal': string
  'dock.browser': string
  'dock.canvas': string
  'dock.orchestration': string
  'dock.closeTitle': string

  // Browser Panel
  'browser.configureProxy': string
  'browser.clearProxy': string

  // Orchestration Panel
  'orchestration.noCommandsFound': string
  'orchestration.workerNotFound': string
  'orchestration.noTerminals': string
  'orchestration.describeTask': string
  'orchestration.aiGenerateInfo': string
  'orchestration.taskPlaceholder': string
  'orchestration.panelTitle': string

  // Git Status
  'gitStatus.modified': string
  'gitStatus.added': string
  'gitStatus.deleted': string
  'gitStatus.renamed': string
  'gitStatus.copied': string
  'gitStatus.typeChanged': string
  'gitStatus.untracked': string
  'gitStatus.conflict': string

  // Terminal Keymap
  'terminalKeymap.deleteToLineStart': string
  'terminalKeymap.deleteWordLeft': string
  'terminalKeymap.deleteWordRight': string
  'terminalKeymap.moveToLineStart': string
  'terminalKeymap.moveToLineEnd': string
  'terminalKeymap.moveWordLeft': string
  'terminalKeymap.moveWordRight': string

  // Parallel Work
  'parallelWork.publishBranch': string
  'parallelWork.changeColor': string
  'parallelWork.discard': string

  // Update Ready Dialog
  'updates.ready': string
  'updates.readyDesc': string
  'updates.installOnQuit': string
  'updates.restarting': string

  // Sidebar extra
  'sidebar.collapseTooltip': string
}

export const translations: Record<Language, Translations> = {
  en: {
    // Settings Window
    'settings.title': 'Settings',
    'settings.openJson': 'Open settings.json',
    'settings.searchPlaceholder': 'Search settings\u2026',
    'settings.noMatches': 'No matches',
    'settings.noMatchResults': 'No settings match \u201C{query}\u201D.',

    // Settings Sections
    'settings.section.general': 'General',
    'settings.section.appearance': 'Appearance',
    'settings.section.canvas': 'Canvas',
    'settings.section.terminal': 'Terminal',
    'settings.section.orchestration': 'Orchestration',
    'settings.section.browser': 'Browser',
    'settings.section.sidebar': 'Sidebar',
    'settings.section.fileExplorer': 'File Explorer',
    'settings.section.worktrees': 'Worktrees',
    'settings.section.notifications': 'Notifications',
    'settings.section.providers': 'Providers',
    'settings.section.skills': 'Skills',
    'settings.section.updates': 'Updates',
    'settings.section.shortcuts': 'Shortcuts',

    // General Settings
    'general.defaultShellPath': 'Default shell path',
    'general.defaultShellPath.desc': 'Leave blank to auto-detect ($SHELL, then a platform default).',
    'general.autoDetect': 'Auto-detect',
    'general.warnBeforeQuit': 'Warn before quit',
    'general.warnBeforeQuit.desc': 'Show confirmation dialog on Cmd+Q',
    'general.privacy': 'Privacy',
    'general.privacy.desc': 'Orquestra collects anonymous usage data and crash reports to improve the app. No file paths, project names, or personal data.',
    'general.privacyPolicy': 'Privacy Policy',
    'general.language': 'Language',
    'general.language.desc': 'Display language for the application interface.',

    // Appearance Settings
    'appearance.theme': 'Theme',
    'appearance.theme.desc': 'Choose a unified color theme for the entire app.',
    'appearance.editorFontSize': 'Editor font size',
    'appearance.editorFontSize.desc': 'Font size in pixels for Monaco editor panels.',
    'appearance.editorFontFamily': 'Editor font family',
    'appearance.editorFontFamily.desc': 'CSS font-family for Monaco editor. Leave blank for the default stack.',
    'appearance.uiScale': 'UI scale',
    'appearance.uiScale.desc': 'Global zoom for Orquestra\u2019s own chrome. 1.0 = 100%.',
    'appearance.disableGpuRasterization': 'Disable GPU rasterization',
    'appearance.disableGpuRasterization.desc': 'Workaround for intermittent glyph dropout. Requires restart.',

    // Canvas Settings
    'canvas.showMinimap': 'Show minimap',
    'canvas.showMinimap.desc': 'Display a floating minimap on the canvas.',
    'canvas.zoomSpeed': 'Zoom speed',
    'canvas.zoomSpeed.desc': 'How fast the canvas zooms with scroll gestures.',
    'canvas.autoFocus': 'Auto-focus largest node',
    'canvas.autoFocus.desc': 'Automatically focus the node occupying the most visible area.',
    'canvas.gridStyle': 'Grid style',
    'canvas.gridStyle.desc': 'Background pattern drawn on the canvas.',
    'canvas.gridStyle.lines': 'Lines',
    'canvas.gridStyle.dots': 'Dots',
    'canvas.gridStyle.none': 'None',
    'canvas.snapToGrid': 'Snap to grid',
    'canvas.snapToGrid.desc': 'Snap panels to the canvas grid while dragging and resizing.',
    'canvas.placementPicker': 'Placement picker',
    'canvas.placementPicker.desc': 'Show the recommendation picker when creating new panels.',
    'canvas.showWorktreeTerritory': 'Show worktree territory',
    'canvas.showWorktreeTerritory.desc': 'Paint soft territory backgrounds behind worktree panels.',
    'canvas.backgroundImage': 'Background image',
    'canvas.backgroundImage.desc': 'Absolute path to an image shown as the canvas wallpaper.',
    'canvas.backgroundImageOpacity': 'Background image opacity',
    'canvas.backgroundImageOpacity.desc': 'Opacity (0\u20131) of the canvas wallpaper layer.',
    'canvas.backgroundBrowse': 'Browse\u2026',
    'canvas.backgroundClear': 'Clear',

    // Terminal Settings
    'terminal.fontFamily': 'Font family',
    'terminal.fontFamily.desc': 'Leave blank to use the system terminal font.',
    'terminal.autoDetect': 'System default',
    'terminal.fontSize': 'Font size',
    'terminal.fontSize.desc': 'Font size in pixels for the terminal.',
    'terminal.scrollback': 'Scrollback buffer',
    'terminal.scrollback.desc': 'Lines kept in the scrollback buffer. Lower = less memory.',
    'terminal.scrollSpeed': 'Scroll speed',
    'terminal.scrollSpeed.desc': 'Vertical wheel-scroll speed multiplier. 1.0 = default.',
    'terminal.contrast': 'Minimum contrast',
    'terminal.contrast.desc': 'Minimum contrast ratio for terminal text. 1 = off; 4.5 = WCAG AA.',
    'terminal.cursorBlink': 'Cursor blink',
    'terminal.cursorBlink.desc': 'Blink the terminal cursor.',
    'terminal.optionIsMeta': 'Option is Meta',
    'terminal.optionIsMeta.desc': 'Treat the \u2325 Option key as Meta in the terminal.',
    'terminal.autoSuspend': 'Auto-suspend idle terminals',
    'terminal.autoSuspend.desc': 'Suspend background terminals after 2 minutes of inactivity.',

    // Orchestration Settings
    'orchestration.intro': 'Configure how Maestro coordinates terminals and workers. Prefer the crown on a terminal (Maestro) — the API Orchestration panel is experimental. Permission toggles guide agents in prompts; they are not a full sandbox.',
    'orchestration.group.mode': 'Mode',
    'orchestration.group.workers': 'Workers',
    'orchestration.group.delegation': 'Delegation',
    'orchestration.group.permissions': 'Permissions',
    'orchestration.group.completion': 'Completion',
    'orchestration.mode': 'Orchestration mode',
    'orchestration.mode.desc': 'How actively Maestro may coordinate work across terminals.',
    'orchestration.mode.manual': 'Manual',
    'orchestration.mode.assisted': 'Assisted',
    'orchestration.mode.auto': 'Auto',
    'orchestration.maxWorkers': 'Max workers (pool size)',
    'orchestration.maxWorkers.desc':
      'Hard ceiling on how many worker terminals one Maestro may keep open at once (the pool). Extra tasks queue or reassign — they do not open a new panel beyond this.',
    'orchestration.maxWorkerRoleChars': 'Max worker role length',
    'orchestration.maxWorkerRoleChars.desc':
      'Maximum characters for each worker’s task prompt (--role): the short job description Maestro sends to that worker only — not your full request and not the whole product brief. Slightly longer roles are truncated; extremely long pastes are rejected so every worker does not receive the same giant instructions. Default 1000. Raise for complex steps; lower to force tighter roles.',
    'orchestration.defaultWorkerKind': 'Default worker type',
    'orchestration.defaultWorkerKind.desc': 'Panel type used when a recruit request asks for auto.',
    'orchestration.workerKind.terminal': 'Terminal',
    'orchestration.workerKind.agent': 'Agent',
    'orchestration.defaultWorkerAgent': 'Default worker AI',
    'orchestration.defaultWorkerAgent.desc': 'Which CLI is started in new terminal workers. Bypass permission flags are chosen for this AI.',
    'orchestration.workerAgent.verboo': 'Verboo',
    'orchestration.workerAgent.claude': 'Claude Code',
    'orchestration.workerAgent.codex': 'Codex',
    'orchestration.workerAgent.opencode': 'OpenCode',
    'orchestration.workerAgent.custom': 'Custom command…',
    'orchestration.defaultAgentCommand': 'Custom agent command',
    'orchestration.defaultAgentCommand.desc': 'Free-text command when Default worker AI is Custom. Include the binary name (e.g. my-agent).',
    'orchestration.effectiveAgentCommand': 'Launch command preview',
    'orchestration.effectiveAgentCommand.desc': 'Exact command Orquestra types into new workers (includes bypass flags when enabled).',
    'orchestration.workerNamePrefix': 'Worker name prefix',
    'orchestration.workerNamePrefix.desc': 'Prefix used when Maestro names workers automatically.',
    'orchestration.taskSplitStrategy': 'Task split strategy',
    'orchestration.taskSplitStrategy.desc': 'Preferred way to divide work between workers.',
    'orchestration.taskSplit.auto': 'Auto',
    'orchestration.taskSplit.byTask': 'By task',
    'orchestration.taskSplit.byFile': 'By file',
    'orchestration.taskSplit.byStage': 'By stage',
    'orchestration.contextPolicy': 'Context policy',
    'orchestration.contextPolicy.desc': 'How much project context workers should receive.',
    'orchestration.context.summary': 'Summary',
    'orchestration.context.relevantFiles': 'Relevant files',
    'orchestration.context.full': 'Full',
    'orchestration.reviewPolicy': 'Review policy',
    'orchestration.reviewPolicy.desc': 'Whether Maestro should add a review step.',
    'orchestration.review.never': 'Never',
    'orchestration.review.onChanges': 'On changes',
    'orchestration.review.always': 'Always',
    'orchestration.permissionMode': 'Tool permission mode',
    'orchestration.permissionMode.desc': 'How worker agents handle tool approval. Bypass adds the correct flags per AI (Claude/Verboo: --dangerously-skip-permissions; Codex: --dangerously-bypass-approvals-and-sandbox; OpenCode: --auto). Ask waits for approval. Applies on the next recruit.',
    'orchestration.permissionMode.ask': 'Ask for permission',
    'orchestration.permissionMode.bypass': 'Bypass permissions',
    'orchestration.allowFileEdits': 'Allow file edits',
    'orchestration.allowFileEdits.desc': 'Guidance for workers (injected into role prompts). Not a hard sandbox — agents can still ignore it.',
    'orchestration.allowCommands': 'Allow commands',
    'orchestration.allowCommands.desc': 'Guidance for workers in role prompts. Not OS-level command blocking.',
    'orchestration.allowNetwork': 'Allow network',
    'orchestration.allowNetwork.desc': 'Guidance for workers in role prompts. Not a network firewall.',
    'orchestration.allowNestedWorkers': 'Allow nested workers',
    'orchestration.allowNestedWorkers.desc': 'When off, Orquestra blocks recruit from worker PTYs and non-Maestro panels (hard). Still tell workers not to recruit in prompts.',
    'orchestration.onWorkerDone': 'When worker finishes',
    'orchestration.onWorkerDone.desc': 'What to do with worker panels after completion.',
    'orchestration.done.keepOpen': 'Keep open',
    'orchestration.done.hide': 'Hide',
    'orchestration.done.closeOnSuccess': 'Close on success',

    // Browser Settings
    'browser.homepage': 'Homepage',
    'browser.homepage.desc': 'URL loaded when opening a new browser tab.',
    'browser.searchEngine': 'Search engine',
    'browser.searchEngine.desc': 'Default search engine for the browser address bar.',
    'browser.showBookmarksBar': 'Show bookmarks bar',
    'browser.showBookmarksBar.desc': 'Display the horizontal bookmarks bar under the URL bar.',
    'browser.showTabSidebar': 'Show tab sidebar',
    'browser.showTabSidebar.desc': 'Display the vertical tab sidebar on the left of the panel.',
    'browser.newTabBehavior': 'New tab behavior',
    'browser.newTabBehavior.desc': 'What a freshly-opened browser panel / new tab loads.',
    'browser.newTabBehavior.startPage': 'Start page',
    'browser.newTabBehavior.homepage': 'Homepage',
    'browser.newTabBehavior.blank': 'Blank page',
    'browser.terminalLinkTarget': 'Terminal link target',
    'browser.terminalLinkTarget.desc': 'Where a Cmd+clicked terminal link opens.',
    'browser.terminalLinkTarget.ask': 'Ask',
    'browser.terminalLinkTarget.canvas': 'Canvas',
    'browser.terminalLinkTarget.external': 'External',

    // Sidebar Settings
    'sidebar.backgroundOpacity': 'Background opacity',
    'sidebar.backgroundOpacity.desc': 'Tint opacity of the sidebar background. 1.0 = fully opaque.',
    'sidebar.showFileExplorerOnLaunch': 'Show file explorer on launch',
    'sidebar.showFileExplorerOnLaunch.desc': 'Open the file explorer sidebar view when the app starts.',

    // File Explorer Settings
    'fileExplorer.exclusions': 'Excluded names',
    'fileExplorer.exclusions.desc': 'Folder/file names hidden in the file explorer, file search, and watcher.',
    'fileExplorer.addPlaceholder': 'Name to exclude\u2026',
    'fileExplorer.addButton': 'Add',

    // Worktree Settings
    'worktree.closeOnDelete': 'Close panels on delete',
    'worktree.closeOnDelete.desc': 'When discarding a worktree, also close its terminal and agent panels.',
    'worktree.symlinkPaths': 'Symlink paths',
    'worktree.symlinkPaths.desc': 'Workspace-root-relative paths to symlink into every new worktree.',
    'worktree.addPlaceholder': 'Relative path\u2026',
    'worktree.addButton': 'Add',

    // Notification Settings
    'notifications.enabled': 'Enable notifications',
    'notifications.enabled.desc': 'Show OS-level notifications.',
    'notifications.onlyWhenUnfocused': 'Only when unfocused',
    'notifications.onlyWhenUnfocused.desc': 'Only send notifications when the app is not focused.',

    // Update Settings
    'updates.beta': 'Beta updates',
    'updates.beta.desc': 'Receive pre-release (beta) updates.',
    'updates.checkingForUpdates': 'Checking for updates\u2026',
    'updates.upToDate': 'You\u2019re up to date!',
    'updates.updateAvailable': 'Update available',
    'updates.restartToUpdate': 'Restart to update',
    'updates.checkForUpdates': 'Check for updates',
    'updates.currentVersion': 'Current version',
    'updates.downloadAndInstall': 'Download & Install',

    // Sidebar
    'sidebar.workspaces': 'Workspaces',
    'sidebar.explorer': 'Explorer',
    'sidebar.search': 'Search',
    'sidebar.sourceControl': 'Source Control',
    'sidebar.noFolderOpen': 'No folder open',
    'sidebar.openFolder': 'Open Folder',
    'sidebar.skills': 'Skills',
    'sidebar.savedLayouts': 'Saved Layouts',
    'sidebar.settings': 'Settings',

    // Welcome Page
    'welcome.tagline': 'Infinite canvas for coding',
    'welcome.start': 'Start',
    'welcome.openFolder': 'Open Folder\u2026',
    'welcome.connectRemote': 'Connect to Remote\u2026',
    'welcome.newTerminal': 'New Terminal',
    'welcome.newEditor': 'New Editor',
    'welcome.newBrowser': 'New Browser',
    'welcome.recent': 'Recent',
    'welcome.keyboardShortcuts': 'Keyboard Shortcuts',
    'welcome.shortcut.newTerminal': 'New Terminal',
    'welcome.shortcut.newBrowser': 'New Browser',
    'welcome.shortcut.newEditor': 'New Editor',
    'welcome.shortcut.commandPalette': 'Command Palette',
    'welcome.shortcut.toggleSidebar': 'Toggle Sidebar',
    'welcome.shortcut.resetZoom': 'Reset Zoom',

    // Command Palette
    'palette.searchPlaceholder': 'Search commands, panels and files by name',
    'palette.commands': 'Commands',
    'palette.panels': 'Panels',
    'palette.files': 'Files',
    'palette.recentFiles': 'Recent Files',
    'palette.searching': 'Searching\u2026',
    'palette.noResults': 'No results',
    'palette.otherWindow': 'Other window',
    'palette.newTerminal': 'New Terminal',
    'palette.newBrowser': 'New Browser',
    'palette.newEditor': 'New Editor',
    'palette.newAgent': 'New Orquestra Agent',
    'palette.newCanvas': 'New Canvas',
    'palette.closePanel': 'Close Panel',
    'palette.saveFile': 'Save File',
    'palette.toggleSidebar': 'Toggle Sidebar',
    'palette.toggleFileExplorer': 'Toggle File Explorer',
    'palette.toggleSearch': 'Toggle Search',
    'palette.toggleMinimap': 'Toggle Minimap',
    'palette.resetZoom': 'Reset Zoom',
    'palette.zoomToFit': 'Zoom to Fit',
    'palette.zoomToSelection': 'Zoom to Selection',
    'palette.autoLayout': 'Auto-Layout Canvas',
    'palette.undo': 'Undo',
    'palette.redo': 'Redo',
    'palette.savedLayouts': 'Saved Layouts\u2026',
    'palette.skills': 'Skills\u2026',
    'palette.showTutorial': 'Show Tutorial',
    'palette.reloadWorkspace': 'Reload Workspace from Disk',
    'palette.deleteRuntime': 'Delete Runtime',

    // Project List
    'projects.workspace': 'Workspace',
    'projects.collapseAll': 'Collapse All',
    'projects.expandAll': 'Expand All',
    'projects.newWorkspace': 'New Workspace',
    'projects.closeSelected': 'Close {count} Workspaces',

    // Source Control
    'git.sourceControl': 'Source Control',
    'git.changes': 'Changes',
    'git.staged': 'Staged',
    'git.commitPlaceholder': 'Commit message\u2026',
    'git.commit': 'Commit',
    'git.noChanges': 'No changes',
    'git.discard': 'Discard',
    'git.stage': 'Stage',
    'git.unstage': 'Unstage',
    'git.openFile': 'Open File',

    // Search View
    'search.title': 'Search',
    'search.placeholder': 'Search files\u2026',
    'search.noResults': 'No results found',
    'search.replaced': '{count} replaced',
    'search.replaceAll': 'Replace All',
    'search.replace': 'Replace',

    // File Explorer
    'explorer.title': 'Explorer',
    'explorer.newFile': 'New File',
    'explorer.newFolder': 'New Folder',
    'explorer.rename': 'Rename',
    'explorer.delete': 'Delete',
    'explorer.duplicate': 'Duplicate',
    'explorer.copyPath': 'Copy Path',
    'explorer.copyRelativePath': 'Copy Relative Path',
    'explorer.revealInExplorer': 'Reveal in File Explorer',
    'explorer.newFilePlaceholder': 'File name\u2026',
    'explorer.newFolderPlaceholder': 'Folder name\u2026',

    // Auth
    'auth.login.error': 'Login failed.',
    'auth.login.serverError': 'Error connecting to server.',
    'auth.login.verifyingSession': 'Verifying session\u2026',
    'auth.login.welcomeBack': 'Welcome back',
    'auth.login.subtitle': 'Sign in with your Orquestra credentials',
    'auth.login.email': 'Email',
    'auth.login.emailPlaceholder': 'you@email.com',
    'auth.login.password': 'Password',
    'auth.login.signingIn': 'Signing in\u2026',
    'auth.login.signIn': 'Sign In',
    'auth.login.noAccount': "Don't have an account?",

    // Canvas Toolbar
    'canvas.toolbar.terminal': 'Terminal. Click for recommendations, or drag onto the canvas.',
    'canvas.toolbar.selectTool': 'Select tool (Space, or {key} inside a panel)',
    'canvas.toolbar.handTool': 'Hand tool for panning (Space, or {key} inside a panel)',
    'canvas.toolbar.drawTool': 'Draw tool for annotations',
    'canvas.toolbar.rectangle': 'Rectangle',
    'canvas.toolbar.arrow': 'Arrow',
    'canvas.toolbar.line': 'Line',
    'canvas.toolbar.text': 'Text',
    'canvas.toolbar.browser': 'Browser ({key})',
    'canvas.toolbar.editor': 'Editor ({key})',
    'canvas.toolbar.agent': 'Orquestra agent',
    'canvas.toolbar.zoomOut': 'Zoom Out ({key})',
    'canvas.toolbar.zoomReset': 'Reset zoom to 100% ({key})',
    'canvas.toolbar.zoomIn': 'Zoom In ({key})',
    'canvas.toolbar.minimapShow': 'Show minimap (drag to move)',
    'canvas.toolbar.minimapHide': 'Hide minimap (drag to move)',

    // Canvas Context Menu
    'canvas.context.newTerminal': 'New Terminal',
    'canvas.context.newEditor': 'New Editor',
    'canvas.context.newBrowser': 'New Browser',
    'canvas.context.newAgent': 'New Orquestra agent',
    'canvas.context.newOrchestration': 'New Orchestration',
    'canvas.context.newCanvas': 'New Canvas',

    // Canvas Node
    'canvas.node.moveToFront': 'Move to Front',
    'canvas.node.moveToBack': 'Move to Back',

    // Connection Layer
    'connection.refreshContext': 'Refresh context',
    'connection.openBundle': 'Open context bundle',
    'connection.openSource': 'Open source',
    'connection.sendOutput': 'Send output now',
    'connection.useAsContext': 'Use as linked context',
    'connection.disconnect': 'Disconnect',

    // Search View
    'search.matchCase': 'Match Case',
    'search.matchWord': 'Match Whole Word',
    'search.useRegex': 'Use Regular Expression',
    'search.toggleDetails': 'Toggle Search Details',
    'search.filesToInclude': 'files to include',
    'search.filesToExclude': 'files to exclude',
    'search.useExcludeSettings': 'Use Exclude Settings and Ignore Files',
    'search.emptyState': 'Search across files in this folder.',
    'search.results': '{count} results',
    'search.filesCount': '{count} files',
    'search.truncated': '(truncated)',

    // Source Control
    'git.branches': 'Branches',
    'git.newBranchPlaceholder': 'New branch name\u2026',
    'git.filterBranchesPlaceholder': 'Filter branches\u2026',
    'git.current': 'current',
    'git.remote': 'Remote',
    'git.committing': 'Committing\u2026',
    'git.stagedChanges': 'Staged Changes',
    'git.changesTitle': 'Changes',
    'git.untracked': 'Untracked',
    'git.commitLog': 'Commit Log',
    'git.worktrees': 'Worktrees',
    'git.noChangesDetected': 'No changes detected',
    'git.discardChanges': 'Discard changes',
    'git.stageFile': 'Stage file',
    'git.unstageFile': 'Unstage file',
    'git.unstageAll': 'Unstage all',
    'git.stageAll': 'Stage all',
    'git.stash': 'Stash changes',
    'git.popStash': 'Pop latest stash',
    'git.fetch': 'Fetch from remote',
    'git.pull': 'Pull from remote',
    'git.push': 'Push to remote',
    'git.refresh': 'Refresh status',
    'git.dismiss': 'Dismiss',
    'git.deleteBranch': 'Delete branch',
    'git.createBranch': 'Create branch',
    'git.cancel': 'Cancel',
    'git.newBranch': 'New branch',

    // File Explorer (extra)
    'explorer.filterFiles': 'Filter Files',
    'explorer.reload': 'Reload',
    'explorer.filterPlaceholder': 'Filter by name',
    'explorer.clear': 'Clear',
    'explorer.loading': 'Loading\u2026',
    'explorer.noFilesFound': 'No files found',
    'explorer.openInTerminal': 'Open in Integrated Terminal',
    'explorer.paste': 'Paste',
    'explorer.removeFolder': 'Remove Folder from Workspace',
    'explorer.findInFolder': 'Find in Folder\u2026',
    'explorer.deleteConfirm': 'Delete {label}? This cannot be undone.',
    'explorer.deleteConfirmMessage': 'Delete {label}? This cannot be undone.',
    'explorer.removeConfirm': 'Remove "{folderName}" from your workspaces?',

    // File Tree
    'filetree.rename': 'Rename\u2026',
    'filetree.copyName': 'Copy Name',

    // Workspace
    'workspace.default': 'Default',
    'workspace.selectWorkspace': 'Select Workspace',
    'workspace.renameWorkspace': 'Rename Workspace',
    'workspace.changeColor': 'Change Color',
    'workspace.selectFolder': 'Select Project Folder',
    'workspace.copyDir': 'Copy Working Directory',
    'workspace.duplicate': 'Duplicate Workspace',
    'workspace.closeAllPanels': 'Close All Panels',
    'workspace.closeWorkspace': 'Close Workspace',
    'workspace.rename': 'Rename',
    'workspace.close': 'Close',
    'workspace.connecting': 'Connecting\u2026',
    'workspace.addWorkspace': 'Add Workspace',
    'workspace.chooseFolder': 'Click to choose a project folder',
    'workspace.collapse': 'Collapse',
    'workspace.expand': 'Expand',
    'workspace.canvas': 'Canvas',
    'workspace.otherWindows': 'Other windows',
    'workspace.inAnotherWindow': '\u2014 in another window',

    // Runtime
    'runtime.installing': 'Installing runtime\u2026',
    'runtime.connecting': 'Connecting\u2026',
    'runtime.disconnected': 'Runtime disconnected',
    'runtime.reconnect': 'Reconnect',
    'runtime.notInstalled': 'Runtime not installed',
    'runtime.install': 'Install',
    'runtime.unreachable': 'Runtime unreachable',
    'runtime.retry': 'Retry',

    // Skills Dialog
    'skills.searchPlaceholder': 'Search skills\u2026',
    'skills.intoWorkspace': 'into {name}',
    'skills.noFolderOpen': 'no folder open',
    'skills.refreshCatalog': 'Refresh catalog',
    'skills.sourcesAndSettings': 'Skill sources & settings',
    'skills.installed': 'Installed \u00B7 {count}',
    'skills.saved': 'Saved \u00B7 {count}',
    'skills.browse': 'Browse \u00B7 {count}',
    'skills.noCatalog': 'No catalog yet. Add a repo in Settings \u2192 Skills.',
    'skills.noOtherMatches': 'No other catalog matches.',
    'skills.allInCatalog': 'Everything in the catalog is already here.',
    'skills.missingSkill': 'Missing a skill?',
    'skills.addSource': 'Add its source',
    'skills.savedTooltip': 'Saved \u2014 click to remove from your library',
    'skills.saveToLibrary': 'Save to your library (cached for reuse)',
    'skills.openOnGitHub': 'Open skill on GitHub',
    'skills.openFolderFirst': 'Open a folder first',
    'skills.agents': 'Agents',
    'skills.install': 'Install',
    'skills.installFor': 'Install for',
    'skills.installedTooltip': 'Installed \u2014 click to remove',
    'skills.installHere': 'Install here',

    // Layouts
    'layouts.nameRequired': 'Name is required',
    'layouts.saveFailed': 'Save failed',
    'layouts.layoutNotFound': 'Layout not found',
    'layouts.deleteConfirm': 'Delete layout "{name}"?',
    'layouts.deleteFailed': 'Delete failed',
    'layouts.savePlaceholder': 'Save current canvas as\u2026',
    'layouts.emptyState': 'No saved layouts yet. Type a name above and hit Enter.',
    'layouts.savedLayouts': 'Saved Layouts',
    'layouts.load': 'Load',
    'layouts.delete': 'Delete',

    // Welcome Dialog
    'welcome.welcomeTitle': 'Welcome to Orquestra',
    'welcome.welcomeDesc': 'An infinite canvas for your terminals, editors, browsers, and agents.',
    'welcome.featureTerminal': 'Terminal',
    'welcome.featureTerminalDesc': 'Full xterm.js with WebGL rendering, SSH, serial, and multiplexing.',
    'welcome.featureEditor': 'Code Editor',
    'welcome.featureEditorDesc': 'Monaco-powered code editing with syntax highlighting and git awareness.',
    'welcome.featureBrowser': 'Browser',
    'welcome.featureBrowserDesc': 'Embedded webview with tab management, bookmarks, and devtools.',
    'welcome.featureAgent': 'AI Agent',
    'welcome.featureAgentDesc': 'Integrated coding agent powered by Claude Code.',
    'welcome.featureCanvas': 'Canvas',
    'welcome.featureCanvasDesc': 'Spatial canvas to organise all your tools visually.',
    'welcome.saving': 'Saving\u2026',
    'welcome.continue': 'Continue',

    // Onboarding
    'onboarding.step1Title': 'Your infinite canvas',
    'onboarding.step1Body': 'Everything lives here \u2014 terminals, editors, browsers, and agents. Pan and zoom freely.',
    'onboarding.step2Title': 'Add anything',
    'onboarding.step2Body': 'Spin up a terminal, open a code file, or browse the web. Drag panels to arrange them.',
    'onboarding.step3Title': 'Your projects',
    'onboarding.step3Body': 'Switch workspaces, manage files, and work with git \u2014 all from one place.',
    'onboarding.step4Title': 'One shortcut for everything',
    'onboarding.step4Body': 'Press \u2318K to search commands, panels, and files instantly.',
    'onboarding.step5Title': 'First orchestration in ~60s',
    'onboarding.step5Body': 'Create a terminal, click the crown to enable Maestro, ask for a multi-part task, watch workers appear on the canvas, then let Maestro wait on results. Prefer Maestro over the experimental Orchestration panel.',
    'onboarding.step6Title': "You're all set",
    'onboarding.step6Body': 'Build your first layout. Try a terminal with Maestro on, or an editor side by side.',

    // Dock
    'dock.closeAll': 'Close All',
    'dock.rename': 'Rename',
    'dock.closeOthers': 'Close Others',
    'dock.closeToRight': 'Close to the Right',
    'dock.splitRight': 'Split Right',
    'dock.moveToNewWindow': 'Move into New Window',
    'dock.newTab': 'New Tab',
    'dock.splitWith': 'Split With',
    'dock.editor': 'Editor',
    'dock.terminal': 'Terminal',
    'dock.browser': 'Browser',
    'dock.canvas': 'Canvas',
    'dock.orchestration': 'Orchestration',
    'dock.closeTitle': 'Close',

    // Browser Panel
    'browser.configureProxy': 'Configure Proxy\u2026',
    'browser.clearProxy': 'Clear Proxy (Direct)',

    // Orchestration Panel
    'orchestration.noCommandsFound': '\u2717 No command [N] found in response',
    'orchestration.workerNotFound': '  \u2717 Worker {index}: not found',
    'orchestration.noTerminals': 'No terminals open. Open terminals on the canvas to use as workers.',
    'orchestration.describeTask': 'Describe what the workers should do',
    'orchestration.aiGenerateInfo': 'AI will generate commands and inject them into terminals',
    'orchestration.taskPlaceholder': 'Describe the task for the workers\u2026',
    'orchestration.panelTitle': 'Orchestration',

    // Git Status
    'gitStatus.modified': 'Modified',
    'gitStatus.added': 'Added',
    'gitStatus.deleted': 'Deleted',
    'gitStatus.renamed': 'Renamed',
    'gitStatus.copied': 'Copied',
    'gitStatus.typeChanged': 'Type changed',
    'gitStatus.untracked': 'Untracked',
    'gitStatus.conflict': 'Conflict',

    // Terminal Keymap
    'terminalKeymap.deleteToLineStart': 'Delete to line start',
    'terminalKeymap.deleteWordLeft': 'Delete word left',
    'terminalKeymap.deleteWordRight': 'Delete word right',
    'terminalKeymap.moveToLineStart': 'Move to line start',
    'terminalKeymap.moveToLineEnd': 'Move to line end',
    'terminalKeymap.moveWordLeft': 'Move word left',
    'terminalKeymap.moveWordRight': 'Move word right',

    // Parallel Work
    'parallelWork.publishBranch': 'Publish branch',
    'parallelWork.changeColor': 'Change color\u2026',
    'parallelWork.discard': 'Discard this work\u2026',

    // Update Ready Dialog
    'updates.ready': 'Update ready',
    'updates.readyDesc': 'Restart to apply, or it installs on next quit.',
    'updates.installOnQuit': 'Install on next quit',
    'updates.restarting': 'Restarting\u2026',

    // Sidebar extra
    'sidebar.collapseTooltip': 'Click to collapse.',
  },

  'pt-BR': {
    // Settings Window
    'settings.title': 'Configura\u00E7\u00F5es',
    'settings.openJson': 'Abrir settings.json',
    'settings.searchPlaceholder': 'Buscar configura\u00E7\u00F5es\u2026',
    'settings.noMatches': 'Sem correspond\u00EAncias',
    'settings.noMatchResults': 'Nenhuma configura\u00E7\u00E3o corresponde a \u201C{query}\u201D.',

    // Settings Sections
    'settings.section.general': 'Geral',
    'settings.section.appearance': 'Apar\u00EAncia',
    'settings.section.canvas': 'Tela',
    'settings.section.terminal': 'Terminal',
    'settings.section.orchestration': 'Orquestra\u00E7\u00E3o',
    'settings.section.browser': 'Navegador',
    'settings.section.sidebar': 'Barra Lateral',
    'settings.section.fileExplorer': 'Explorador de Arquivos',
    'settings.section.worktrees': 'Worktrees',
    'settings.section.notifications': 'Notifica\u00E7\u00F5es',
    'settings.section.providers': 'Provedores',
    'settings.section.skills': 'Skills',
    'settings.section.updates': 'Atualiza\u00E7\u00F5es',
    'settings.section.shortcuts': 'Atalhos',

    // General Settings
    'general.defaultShellPath': 'Caminho do shell padr\u00E3o',
    'general.defaultShellPath.desc': 'Deixe em branco para detec\u00E7\u00E3o autom\u00E1tica ($SHELL, depois padr\u00E3o da plataforma).',
    'general.autoDetect': 'Detec\u00E7\u00E3o autom\u00E1tica',
    'general.warnBeforeQuit': 'Avisar antes de sair',
    'general.warnBeforeQuit.desc': 'Mostrar di\u00E1logo de confirma\u00E7\u00E3o ao usar Cmd+Q',
    'general.privacy': 'Privacidade',
    'general.privacy.desc': 'Orquestra coleta dados an\u00F4nimos de uso e relat\u00F3rios de falha para melhorar o app. Sem caminhos de arquivos, nomes de projetos ou dados pessoais.',
    'general.privacyPolicy': 'Pol\u00EDtica de Privacidade',
    'general.language': 'Idioma',
    'general.language.desc': 'Idioma de exibi\u00E7\u00E3o da interface do aplicativo.',

    // Appearance Settings
    'appearance.theme': 'Tema',
    'appearance.theme.desc': 'Escolha um tema de cores unificado para todo o app.',
    'appearance.editorFontSize': 'Tamanho da fonte do editor',
    'appearance.editorFontSize.desc': 'Tamanho da fonte em pixels para os pain\u00E9is do editor Monaco.',
    'appearance.editorFontFamily': 'Fam\u00EDlia da fonte do editor',
    'appearance.editorFontFamily.desc': 'Fam\u00EDlia CSS para o editor Monaco. Deixe em branco para o padr\u00E3o.',
    'appearance.uiScale': 'Escala da interface',
    'appearance.uiScale.desc': 'Zoom global para a interface do Orquestra. 1.0 = 100%.',
    'appearance.disableGpuRasterization': 'Desabilitar rasteriza\u00E7\u00E3o GPU',
    'appearance.disableGpuRasterization.desc': 'Solu\u00E7\u00E3o para perda intermitente de glifos. Requer rein\u00EDcio.',

    // Canvas Settings
    'canvas.showMinimap': 'Mostrar minimapa',
    'canvas.showMinimap.desc': 'Exibir um minimapa flutuante na tela.',
    'canvas.zoomSpeed': 'Velocidade do zoom',
    'canvas.zoomSpeed.desc': 'Qu\u00E3o r\u00E1pido a tela amplia com gestos de rolagem.',
    'canvas.autoFocus': 'Foco autom\u00E1tico no maior n\u00F3',
    'canvas.autoFocus.desc': 'Focar automaticamente o n\u00F3 que ocupa a maior \u00E1rea vis\u00EDvel.',
    'canvas.gridStyle': 'Estilo da grade',
    'canvas.gridStyle.desc': 'Padr\u00E3o de fundo desenhado na tela.',
    'canvas.gridStyle.lines': 'Linhas',
    'canvas.gridStyle.dots': 'Pontos',
    'canvas.gridStyle.none': 'Nenhum',
    'canvas.snapToGrid': 'Alinhar \u00E0 grade',
    'canvas.snapToGrid.desc': 'Alinhar pain\u00E9is \u00E0 grade da tela ao arrastar e redimensionar.',
    'canvas.placementPicker': 'Seletor de posicionamento',
    'canvas.placementPicker.desc': 'Mostrar o seletor de recomenda\u00E7\u00E3o ao criar novos pain\u00E9is.',
    'canvas.showWorktreeTerritory': 'Mostrar territ\u00F3rio do worktree',
    'canvas.showWorktreeTerritory.desc': 'Pintar fundos de territ\u00F3rio atr\u00E1s dos pain\u00E9is do worktree.',
    'canvas.backgroundImage': 'Imagem de fundo',
    'canvas.backgroundImage.desc': 'Caminho absoluto de uma imagem como papel de parede da tela.',
    'canvas.backgroundImageOpacity': 'Opacidade da imagem de fundo',
    'canvas.backgroundImageOpacity.desc': 'Opacidade (0\u20131) da camada de papel de parede da tela.',
    'canvas.backgroundBrowse': 'Procurar\u2026',
    'canvas.backgroundClear': 'Limpar',

    // Terminal Settings
    'terminal.fontFamily': 'Fam\u00EDlia da fonte',
    'terminal.fontFamily.desc': 'Deixe em branco para usar a fonte padr\u00E3o do sistema.',
    'terminal.autoDetect': 'Padr\u00E3o do sistema',
    'terminal.fontSize': 'Tamanho da fonte',
    'terminal.fontSize.desc': 'Tamanho da fonte em pixels para o terminal.',
    'terminal.scrollback': 'Buffer de rolagem',
    'terminal.scrollback.desc': 'Linhas mantidas no buffer de rolagem. Menor = menos mem\u00F3ria.',
    'terminal.scrollSpeed': 'Velocidade de rolagem',
    'terminal.scrollSpeed.desc': 'Multiplicador de velocidade de rolagem vertical. 1.0 = padr\u00E3o.',
    'terminal.contrast': 'Contraste m\u00EDnimo',
    'terminal.contrast.desc': 'Raz\u00E3o de contraste m\u00EDnima para o texto do terminal. 1 = desligado; 4.5 = WCAG AA.',
    'terminal.cursorBlink': 'Piscar cursor',
    'terminal.cursorBlink.desc': 'Piscar o cursor do terminal.',
    'terminal.optionIsMeta': 'Option \u00E9 Meta',
    'terminal.optionIsMeta.desc': 'Tratar a tecla \u2325 Option como Meta no terminal.',
    'terminal.autoSuspend': 'Suspender terminais inativos',
    'terminal.autoSuspend.desc': 'Suspender terminais em segundo plano ap\u00F3s 2 minutos de inatividade.',

    // Orchestration Settings
    'orchestration.intro': 'Configure como o Maestro coordena terminais e workers. Prefira a coroa no terminal (Maestro) — o painel Orchestration por API é experimental. Permissões orientam o agente no prompt; não são um sandbox completo.',
    'orchestration.group.mode': 'Modo',
    'orchestration.group.workers': 'Workers',
    'orchestration.group.delegation': 'Delega\u00E7\u00E3o',
    'orchestration.group.permissions': 'Permiss\u00F5es',
    'orchestration.group.completion': 'Conclus\u00E3o',
    'orchestration.mode': 'Modo de orquestra\u00E7\u00E3o',
    'orchestration.mode.desc': 'Qu\u00E3o ativamente o Maestro pode coordenar trabalho entre terminais.',
    'orchestration.mode.manual': 'Manual',
    'orchestration.mode.assisted': 'Assistido',
    'orchestration.mode.auto': 'Autom\u00E1tico',
    'orchestration.maxWorkers': 'M\u00E1ximo de workers (tamanho do pool)',
    'orchestration.maxWorkers.desc':
      'Teto r\u00EDgido de quantos terminais worker um Maestro pode manter abertos ao mesmo tempo (o pool). Tarefas extras entram na fila ou usam reassign \u2014 n\u00E3o abrem um painel al\u00E9m deste n\u00FAmero.',
    'orchestration.maxWorkerRoleChars': 'Tamanho m\u00E1ximo do role do worker',
    'orchestration.maxWorkerRoleChars.desc':
      'M\u00E1ximo de caracteres do prompt de tarefa de cada worker (--role): a descri\u00E7\u00E3o curta do trabalho que o Maestro envia s\u00F3 para aquele worker \u2014 n\u00E3o o seu pedido completo nem o brief inteiro do produto. Roles um pouco maiores s\u00E3o truncados; colas enormes s\u00E3o rejeitadas para que cada worker n\u00E3o receba as mesmas instru\u00E7\u00F5es gigantes. Padr\u00E3o 1000. Aumente para passos complexos; diminua para for\u00E7ar roles mais enxutos.',
    'orchestration.defaultWorkerKind': 'Tipo de worker padr\u00E3o',
    'orchestration.defaultWorkerKind.desc': 'Tipo de painel usado quando um recruit pede auto.',
    'orchestration.workerKind.terminal': 'Terminal',
    'orchestration.workerKind.agent': 'Agente',
    'orchestration.defaultWorkerAgent': 'IA padr\u00E3o do worker',
    'orchestration.defaultWorkerAgent.desc': 'Qual CLI \u00E9 iniciada nos novos workers de terminal. As flags de bypass s\u00E3o escolhidas para esta IA.',
    'orchestration.workerAgent.verboo': 'Verboo',
    'orchestration.workerAgent.claude': 'Claude Code',
    'orchestration.workerAgent.codex': 'Codex',
    'orchestration.workerAgent.opencode': 'OpenCode',
    'orchestration.workerAgent.custom': 'Comando personalizado\u2026',
    'orchestration.defaultAgentCommand': 'Comando de agente personalizado',
    'orchestration.defaultAgentCommand.desc': 'Comando livre quando a IA padr\u00E3o \u00E9 Personalizado. Inclui o bin\u00E1rio (ex.: my-agent).',
    'orchestration.effectiveAgentCommand': 'Pr\u00E9-visualiza\u00E7\u00E3o do comando',
    'orchestration.effectiveAgentCommand.desc': 'Comando exacto que o Orquestra escreve nos novos workers (inclui flags de bypass quando activo).',
    'orchestration.workerNamePrefix': 'Prefixo do nome do worker',
    'orchestration.workerNamePrefix.desc': 'Prefixo usado quando o Maestro nomeia workers automaticamente.',
    'orchestration.taskSplitStrategy': 'Estrat\u00E9gia de divis\u00E3o',
    'orchestration.taskSplitStrategy.desc': 'Forma preferida de dividir trabalho entre workers.',
    'orchestration.taskSplit.auto': 'Autom\u00E1tica',
    'orchestration.taskSplit.byTask': 'Por tarefa',
    'orchestration.taskSplit.byFile': 'Por arquivo',
    'orchestration.taskSplit.byStage': 'Por etapa',
    'orchestration.contextPolicy': 'Pol\u00EDtica de contexto',
    'orchestration.contextPolicy.desc': 'Quanto contexto do projeto os workers devem receber.',
    'orchestration.context.summary': 'Resumo',
    'orchestration.context.relevantFiles': 'Arquivos relevantes',
    'orchestration.context.full': 'Completo',
    'orchestration.reviewPolicy': 'Pol\u00EDtica de revis\u00E3o',
    'orchestration.reviewPolicy.desc': 'Se o Maestro deve adicionar uma etapa de revis\u00E3o.',
    'orchestration.review.never': 'Nunca',
    'orchestration.review.onChanges': 'Quando houver mudan\u00E7as',
    'orchestration.review.always': 'Sempre',
    'orchestration.allowFileEdits': 'Permitir edi\u00E7\u00F5es',
    'orchestration.allowFileEdits.desc': 'Orientação injetada no prompt do worker. Não é sandbox real — o agente ainda pode ignorar.',
    'orchestration.allowCommands': 'Permitir comandos',
    'orchestration.allowCommands.desc': 'Orientação no prompt. Não bloqueia comandos no SO.',
    'orchestration.allowNetwork': 'Permitir rede',
    'orchestration.allowNetwork.desc': 'Orientação no prompt. Não é firewall de rede.',
    'orchestration.permissionMode': 'Modo de permissões de ferramentas',
    'orchestration.permissionMode.desc': 'Como os agents dos workers lidam com aprovação de ferramentas. Bypass usa as flags correctas por IA (Claude/Verboo: --dangerously-skip-permissions; Codex: --dangerously-bypass-approvals-and-sandbox; OpenCode: --auto). Ask espera aprovação. Aplica-se no próximo recruit.',
    'orchestration.permissionMode.ask': 'Pedir permissão',
    'orchestration.permissionMode.bypass': 'Bypass de permissões',
    'orchestration.allowNestedWorkers': 'Permitir workers aninhados',
    'orchestration.allowNestedWorkers.desc': 'Desligado: o Orquestra bloqueia recruit de PTYs worker e painéis sem Maestro (hard). Ainda instruímos workers a não recrutar.',
    'orchestration.onWorkerDone': 'Quando worker terminar',
    'orchestration.onWorkerDone.desc': 'O que fazer com pain\u00E9is de worker ap\u00F3s a conclus\u00E3o.',
    'orchestration.done.keepOpen': 'Manter aberto',
    'orchestration.done.hide': 'Ocultar',
    'orchestration.done.closeOnSuccess': 'Fechar no sucesso',

    // Browser Settings
    'browser.homepage': 'P\u00E1gina inicial',
    'browser.homepage.desc': 'URL carregada ao abrir uma nova aba do navegador.',
    'browser.searchEngine': 'Mecanismo de busca',
    'browser.searchEngine.desc': 'Mecanismo de busca padr\u00E3o para a barra de endere\u00E7os.',
    'browser.showBookmarksBar': 'Mostrar barra de favoritos',
    'browser.showBookmarksBar.desc': 'Exibir a barra de favoritos horizontal abaixo da barra de URL.',
    'browser.showTabSidebar': 'Mostrar barra lateral de abas',
    'browser.showTabSidebar.desc': 'Exibir a barra lateral vertical de abas \u00E0 esquerda do painel.',
    'browser.newTabBehavior': 'Comportamento de nova aba',
    'browser.newTabBehavior.desc': 'O que uma nova aba / painel do navegador carrega.',
    'browser.newTabBehavior.startPage': 'P\u00E1gina inicial',
    'browser.newTabBehavior.homepage': 'Homepage',
    'browser.newTabBehavior.blank': 'P\u00E1gina em branco',
    'browser.terminalLinkTarget': 'Destino de links do terminal',
    'browser.terminalLinkTarget.desc': 'Onde um link clicado com Cmd do terminal abre.',
    'browser.terminalLinkTarget.ask': 'Perguntar',
    'browser.terminalLinkTarget.canvas': 'Tela',
    'browser.terminalLinkTarget.external': 'Externo',

    // Sidebar Settings
    'sidebar.backgroundOpacity': 'Opacidade do fundo',
    'sidebar.backgroundOpacity.desc': 'Opacidade do fundo da barra lateral. 1.0 = totalmente opaco.',
    'sidebar.showFileExplorerOnLaunch': 'Mostrar explorador ao iniciar',
    'sidebar.showFileExplorerOnLaunch.desc': 'Abrir o explorador de arquivos ao iniciar o app.',

    // File Explorer Settings
    'fileExplorer.exclusions': 'Nomes exclu\u00EDdos',
    'fileExplorer.exclusions.desc': 'Nomes de pastas/arquivos ocultos no explorador, busca e observador.',
    'fileExplorer.addPlaceholder': 'Nome para excluir\u2026',
    'fileExplorer.addButton': 'Adicionar',

    // Worktree Settings
    'worktree.closeOnDelete': 'Fechar pain\u00E9is ao excluir',
    'worktree.closeOnDelete.desc': 'Ao descartar um worktree, tamb\u00E9m fechar seus pain\u00E9is de terminal e agente.',
    'worktree.symlinkPaths': 'Caminhos de link simb\u00F3lico',
    'worktree.symlinkPaths.desc': 'Caminhos relativos \u00E0 raiz do workspace para criar links em cada novo worktree.',
    'worktree.addPlaceholder': 'Caminho relativo\u2026',
    'worktree.addButton': 'Adicionar',

    // Notification Settings
    'notifications.enabled': 'Ativar notifica\u00E7\u00F5es',
    'notifications.enabled.desc': 'Mostrar notifica\u00E7\u00F5es do sistema operacional.',
    'notifications.onlyWhenUnfocused': 'Somente quando n\u00E3o focado',
    'notifications.onlyWhenUnfocused.desc': 'Enviar notifica\u00E7\u00F5es apenas quando o app n\u00E3o estiver focado.',

    // Update Settings
    'updates.beta': 'Atualiza\u00E7\u00F5es beta',
    'updates.beta.desc': 'Receber atualiza\u00E7\u00F5es pr\u00E9-lan\u00E7amento (beta).',
    'updates.checkingForUpdates': 'Verificando atualiza\u00E7\u00F5es\u2026',
    'updates.upToDate': 'Voc\u00EA est\u00E1 atualizado!',
    'updates.updateAvailable': 'Atualiza\u00E7\u00E3o dispon\u00EDvel',
    'updates.restartToUpdate': 'Reinicie para atualizar',
    'updates.checkForUpdates': 'Verificar atualiza\u00E7\u00F5es',
    'updates.currentVersion': 'Vers\u00E3o atual',
    'updates.downloadAndInstall': 'Baixar e Instalar',

    // Sidebar
    'sidebar.workspaces': 'Workspaces',
    'sidebar.explorer': 'Explorador',
    'sidebar.search': 'Buscar',
    'sidebar.sourceControl': 'Controle de Vers\u00E3o',
    'sidebar.noFolderOpen': 'Nenhuma pasta aberta',
    'sidebar.openFolder': 'Abrir Pasta',
    'sidebar.skills': 'Skills',
    'sidebar.savedLayouts': 'Layouts Salvos',
    'sidebar.settings': 'Configura\u00E7\u00F5es',

    // Welcome Page
    'welcome.tagline': 'Tela infinita para programa\u00E7\u00E3o',
    'welcome.start': 'Iniciar',
    'welcome.openFolder': 'Abrir Pasta\u2026',
    'welcome.connectRemote': 'Conectar ao Remoto\u2026',
    'welcome.newTerminal': 'Novo Terminal',
    'welcome.newEditor': 'Novo Editor',
    'welcome.newBrowser': 'Novo Navegador',
    'welcome.recent': 'Recentes',
    'welcome.keyboardShortcuts': 'Atalhos de Teclado',
    'welcome.shortcut.newTerminal': 'Novo Terminal',
    'welcome.shortcut.newBrowser': 'Novo Navegador',
    'welcome.shortcut.newEditor': 'Novo Editor',
    'welcome.shortcut.commandPalette': 'Paleta de Comandos',
    'welcome.shortcut.toggleSidebar': 'Alternar Barra Lateral',
    'welcome.shortcut.resetZoom': 'Resetar Zoom',

    // Command Palette
    'palette.searchPlaceholder': 'Buscar comandos, pain\u00E9is e arquivos por nome',
    'palette.commands': 'Comandos',
    'palette.panels': 'Pain\u00E9is',
    'palette.files': 'Arquivos',
    'palette.recentFiles': 'Arquivos Recentes',
    'palette.searching': 'Buscando\u2026',
    'palette.noResults': 'Sem resultados',
    'palette.otherWindow': 'Outra janela',
    'palette.newTerminal': 'Novo Terminal',
    'palette.newBrowser': 'Novo Navegador',
    'palette.newEditor': 'Novo Editor',
    'palette.newAgent': 'Novo Agente Orquestra',
    'palette.newCanvas': 'Nova Tela',
    'palette.closePanel': 'Fechar Painel',
    'palette.saveFile': 'Salvar Arquivo',
    'palette.toggleSidebar': 'Alternar Barra Lateral',
    'palette.toggleFileExplorer': 'Alternar Explorador',
    'palette.toggleSearch': 'Alternar Busca',
    'palette.toggleMinimap': 'Alternar Minimapa',
    'palette.resetZoom': 'Resetar Zoom',
    'palette.zoomToFit': 'Zoom para Encaixar',
    'palette.zoomToSelection': 'Zoom na Sele\u00E7\u00E3o',
    'palette.autoLayout': 'Layout Autom\u00E1tico da Tela',
    'palette.undo': 'Desfazer',
    'palette.redo': 'Refazer',
    'palette.savedLayouts': 'Layouts Salvos\u2026',
    'palette.skills': 'Skills\u2026',
    'palette.showTutorial': 'Mostrar Tutorial',
    'palette.reloadWorkspace': 'Recarregar Workspace do Disco',
    'palette.deleteRuntime': 'Excluir Runtime',

    // Project List
    'projects.workspace': 'Workspace',
    'projects.collapseAll': 'Recolher Todos',
    'projects.expandAll': 'Expandir Todos',
    'projects.newWorkspace': 'Novo Workspace',
    'projects.closeSelected': 'Fechar {count} Workspaces',

    // Source Control
    'git.sourceControl': 'Controle de Vers\u00E3o',
    'git.changes': 'Alterados',
    'git.staged': 'Preparados',
    'git.commitPlaceholder': 'Mensagem do commit\u2026',
    'git.commit': 'Commit',
    'git.noChanges': 'Sem altera\u00E7\u00F5es',
    'git.discard': 'Descartar',
    'git.stage': 'Preparar',
    'git.unstage': 'Desfazer prepara\u00E7\u00E3o',
    'git.openFile': 'Abrir Arquivo',

    // Search View
    'search.title': 'Buscar',
    'search.placeholder': 'Buscar arquivos\u2026',
    'search.noResults': 'Nenhum resultado encontrado',
    'search.replaced': '{count} substitu\u00EDdos',
    'search.replaceAll': 'Substituir Todos',
    'search.replace': 'Substituir',

    // File Explorer
    'explorer.title': 'Explorador',
    'explorer.newFile': 'Novo Arquivo',
    'explorer.newFolder': 'Nova Pasta',
    'explorer.rename': 'Renomear',
    'explorer.delete': 'Excluir',
    'explorer.duplicate': 'Duplicar',
    'explorer.copyPath': 'Copiar Caminho',
    'explorer.copyRelativePath': 'Copiar Caminho Relativo',
    'explorer.revealInExplorer': 'Revelar no Explorador de Arquivos',
    'explorer.newFilePlaceholder': 'Nome do arquivo\u2026',
    'explorer.newFolderPlaceholder': 'Nome da pasta\u2026',

    // Auth
    'auth.login.error': 'Falha ao fazer login.',
    'auth.login.serverError': 'Erro ao conectar com servidor.',
    'auth.login.verifyingSession': 'Verificando sess\u00E3o\u2026',
    'auth.login.welcomeBack': 'Bem-vindo de volta',
    'auth.login.subtitle': 'Entre com suas credenciais Orquestra',
    'auth.login.email': 'Email',
    'auth.login.emailPlaceholder': 'seu@email.com',
    'auth.login.password': 'Senha',
    'auth.login.signingIn': 'Entrando\u2026',
    'auth.login.signIn': 'Entrar',
    'auth.login.noAccount': 'N\u00E3o tem uma conta?',

    // Canvas Toolbar
    'canvas.toolbar.terminal': 'Terminal. Clique para recomenda\u00E7\u00F5es, ou arraste para a tela.',
    'canvas.toolbar.selectTool': 'Ferramenta de sele\u00E7\u00E3o (Espa\u00E7o, ou {key} dentro de um painel)',
    'canvas.toolbar.handTool': 'Ferramenta de navega\u00E7\u00E3o (Espa\u00E7o, ou {key} dentro de um painel)',
    'canvas.toolbar.drawTool': 'Ferramenta de desenho para anota\u00E7\u00F5es',
    'canvas.toolbar.rectangle': 'Ret\u00E2ngulo',
    'canvas.toolbar.arrow': 'Seta',
    'canvas.toolbar.line': 'Linha',
    'canvas.toolbar.text': 'Texto',
    'canvas.toolbar.browser': 'Navegador ({key})',
    'canvas.toolbar.editor': 'Editor ({key})',
    'canvas.toolbar.agent': 'Agente Orquestra',
    'canvas.toolbar.zoomOut': 'Reduzir Zoom ({key})',
    'canvas.toolbar.zoomReset': 'Redefinir zoom para 100% ({key})',
    'canvas.toolbar.zoomIn': 'Aumentar Zoom ({key})',
    'canvas.toolbar.minimapShow': 'Mostrar minimapa (arraste para mover)',
    'canvas.toolbar.minimapHide': 'Ocultar minimapa (arraste para mover)',

    // Canvas Context Menu
    'canvas.context.newTerminal': 'Novo Terminal',
    'canvas.context.newEditor': 'Novo Editor',
    'canvas.context.newBrowser': 'Novo Navegador',
    'canvas.context.newAgent': 'Novo Agente Orquestra',
    'canvas.context.newOrchestration': 'Nova Orquestra\u00E7\u00E3o',
    'canvas.context.newCanvas': 'Nova Tela',

    // Canvas Node
    'canvas.node.moveToFront': 'Trazer para Frente',
    'canvas.node.moveToBack': 'Enviar para Tr\u00E1s',

    // Connection Layer
    'connection.refreshContext': 'Atualizar contexto',
    'connection.openBundle': 'Abrir pacote de contexto',
    'connection.openSource': 'Abrir origem',
    'connection.sendOutput': 'Enviar sa\u00EDda agora',
    'connection.useAsContext': 'Usar como contexto vinculado',
    'connection.disconnect': 'Desconectar',

    // Search View
    'search.matchCase': 'Diferenciar Mai\u00FAsculas',
    'search.matchWord': 'Palavra Inteira',
    'search.useRegex': 'Usar Express\u00E3o Regular',
    'search.toggleDetails': 'Alternar Detalhes da Busca',
    'search.filesToInclude': 'arquivos para incluir',
    'search.filesToExclude': 'arquivos para excluir',
    'search.useExcludeSettings': 'Usar Configura\u00E7\u00F5es de Exclus\u00E3o e Ignorar Arquivos',
    'search.emptyState': 'Busque em arquivos desta pasta.',
    'search.results': '{count} resultados',
    'search.filesCount': '{count} arquivos',
    'search.truncated': '(truncado)',

    // Source Control
    'git.branches': 'Branches',
    'git.newBranchPlaceholder': 'Nome do novo branch\u2026',
    'git.filterBranchesPlaceholder': 'Filtrar branches\u2026',
    'git.current': 'atual',
    'git.remote': 'Remoto',
    'git.committing': 'Comitando\u2026',
    'git.stagedChanges': 'Altera\u00E7\u00F5es Preparadas',
    'git.changesTitle': 'Altera\u00E7\u00F5es',
    'git.untracked': 'N\u00E3o monitorados',
    'git.commitLog': 'Hist\u00F3rico de Commits',
    'git.worktrees': 'Worktrees',
    'git.noChangesDetected': 'Nenhuma altera\u00E7\u00E3o detectada',
    'git.discardChanges': 'Descartar altera\u00E7\u00F5es',
    'git.stageFile': 'Preparar arquivo',
    'git.unstageFile': 'Reverter prepara\u00E7\u00E3o',
    'git.unstageAll': 'Reverter tudo',
    'git.stageAll': 'Preparar tudo',
    'git.stash': 'Guardar altera\u00E7\u00F5es',
    'git.popStash': 'Restaurar \u00FAltimo stash',
    'git.fetch': 'Buscar do remoto',
    'git.pull': 'Puxar do remoto',
    'git.push': 'Enviar para remoto',
    'git.refresh': 'Atualizar status',
    'git.dismiss': 'Dispensar',
    'git.deleteBranch': 'Excluir branch',
    'git.createBranch': 'Criar branch',
    'git.cancel': 'Cancelar',
    'git.newBranch': 'Novo branch',

    // File Explorer (extra)
    'explorer.filterFiles': 'Filtrar Arquivos',
    'explorer.reload': 'Recarregar',
    'explorer.filterPlaceholder': 'Filtrar por nome',
    'explorer.clear': 'Limpar',
    'explorer.loading': 'Carregando\u2026',
    'explorer.noFilesFound': 'Nenhum arquivo encontrado',
    'explorer.openInTerminal': 'Abrir no Terminal Integrado',
    'explorer.paste': 'Colar',
    'explorer.removeFolder': 'Remover Pasta do Workspace',
    'explorer.findInFolder': 'Buscar na Pasta\u2026',
    'explorer.deleteConfirm': 'Excluir {label}? Isto n\u00E3o pode ser desfeito.',
    'explorer.deleteConfirmMessage': 'Excluir {label}? Isto n\u00E3o pode ser desfeito.',
    'explorer.removeConfirm': 'Remover "{folderName}" dos seus workspaces?',

    // File Tree
    'filetree.rename': 'Renomear\u2026',
    'filetree.copyName': 'Copiar Nome',

    // Workspace
    'workspace.default': 'Padr\u00E3o',
    'workspace.selectWorkspace': 'Selecionar Workspace',
    'workspace.renameWorkspace': 'Renomear Workspace',
    'workspace.changeColor': 'Alterar Cor',
    'workspace.selectFolder': 'Selecionar Pasta do Projeto',
    'workspace.copyDir': 'Copiar Diret\u00F3rio de Trabalho',
    'workspace.duplicate': 'Duplicar Workspace',
    'workspace.closeAllPanels': 'Fechar Todos os Pain\u00E9is',
    'workspace.closeWorkspace': 'Fechar Workspace',
    'workspace.rename': 'Renomear',
    'workspace.close': 'Fechar',
    'workspace.connecting': 'Conectando\u2026',
    'workspace.addWorkspace': 'Adicionar Workspace',
    'workspace.chooseFolder': 'Clique para escolher uma pasta do projeto',
    'workspace.collapse': 'Recolher',
    'workspace.expand': 'Expandir',
    'workspace.canvas': 'Tela',
    'workspace.otherWindows': 'Outras janelas',
    'workspace.inAnotherWindow': '\u2014 em outra janela',

    // Runtime
    'runtime.installing': 'Instalando runtime\u2026',
    'runtime.connecting': 'Conectando\u2026',
    'runtime.disconnected': 'Runtime desconectado',
    'runtime.reconnect': 'Reconectar',
    'runtime.notInstalled': 'Runtime n\u00E3o instalado',
    'runtime.install': 'Instalar',
    'runtime.unreachable': 'Runtime inacess\u00EDvel',
    'runtime.retry': 'Tentar novamente',

    // Skills Dialog
    'skills.searchPlaceholder': 'Buscar skills\u2026',
    'skills.intoWorkspace': 'em {name}',
    'skills.noFolderOpen': 'nenhuma pasta aberta',
    'skills.refreshCatalog': 'Atualizar cat\u00E1logo',
    'skills.sourcesAndSettings': 'Fontes e configura\u00E7\u00F5es de skills',
    'skills.installed': 'Instaladas \u00B7 {count}',
    'skills.saved': 'Salvas \u00B7 {count}',
    'skills.browse': 'Explorar \u00B7 {count}',
    'skills.noCatalog': 'Nenhum cat\u00E1logo ainda. Adicione um repo em Configura\u00E7\u00F5es \u2192 Skills.',
    'skills.noOtherMatches': 'Nenhuma outra correspond\u00EAncia no cat\u00E1logo.',
    'skills.allInCatalog': 'Tudo no cat\u00E1logo j\u00E1 est\u00E1 aqui.',
    'skills.missingSkill': 'Falta uma skill?',
    'skills.addSource': 'Adicione a fonte',
    'skills.savedTooltip': 'Salva \u2014 clique para remover da sua biblioteca',
    'skills.saveToLibrary': 'Salvar na biblioteca (cache para reuso)',
    'skills.openOnGitHub': 'Abrir skill no GitHub',
    'skills.openFolderFirst': 'Abra uma pasta primeiro',
    'skills.agents': 'Agentes',
    'skills.install': 'Instalar',
    'skills.installFor': 'Instalar para',
    'skills.installedTooltip': 'Instalada \u2014 clique para remover',
    'skills.installHere': 'Instalar aqui',

    // Layouts
    'layouts.nameRequired': 'Nome \u00E9 obrigat\u00F3rio',
    'layouts.saveFailed': 'Falha ao salvar',
    'layouts.layoutNotFound': 'Layout n\u00E3o encontrado',
    'layouts.deleteConfirm': 'Excluir layout "{name}"?',
    'layouts.deleteFailed': 'Falha ao excluir',
    'layouts.savePlaceholder': 'Salvar tela atual como\u2026',
    'layouts.emptyState': 'Nenhum layout salvo. Digite um nome acima e pressione Enter.',
    'layouts.savedLayouts': 'Layouts Salvos',
    'layouts.load': 'Carregar',
    'layouts.delete': 'Excluir',

    // Welcome Dialog
    'welcome.welcomeTitle': 'Bem-vindo ao Orquestra',
    'welcome.welcomeDesc': 'Uma tela infinita para seus terminais, editores, navegadores e agentes.',
    'welcome.featureTerminal': 'Terminal',
    'welcome.featureTerminalDesc': 'xterm.js completo com renderiza\u00E7\u00E3o WebGL, SSH, serial e multiplexa\u00E7\u00E3o.',
    'welcome.featureEditor': 'Editor de C\u00F3digo',
    'welcome.featureEditorDesc': 'Edi\u00E7\u00E3o de c\u00F3digo com Monaco, realce de sintaxe e integra\u00E7\u00E3o com git.',
    'welcome.featureBrowser': 'Navegador',
    'welcome.featureBrowserDesc': 'Webview incorporado com abas, favoritos e ferramentas de desenvolvedor.',
    'welcome.featureAgent': 'Agente de IA',
    'welcome.featureAgentDesc': 'Agente de programa\u00E7\u00E3o integrado com Claude Code.',
    'welcome.featureCanvas': 'Tela',
    'welcome.featureCanvasDesc': 'Tela espacial para organizar todas as suas ferramentas visualmente.',
    'welcome.saving': 'Salvando\u2026',
    'welcome.continue': 'Continuar',

    // Onboarding
    'onboarding.step1Title': 'Sua tela infinita',
    'onboarding.step1Body': 'Tudo vive aqui \u2014 terminais, editores, navegadores e agentes. Navegue e d\u00EA zoom livremente.',
    'onboarding.step2Title': 'Adicione qualquer coisa',
    'onboarding.step2Body': 'Abra um terminal, um arquivo de c\u00F3digo, ou navegue na web. Arraste pain\u00E9is para organiz\u00E1-los.',
    'onboarding.step3Title': 'Seus projetos',
    'onboarding.step3Body': 'Alterne workspaces, gerencie arquivos e trabalhe com git \u2014 tudo em um s\u00F3 lugar.',
    'onboarding.step4Title': 'Um atalho para tudo',
    'onboarding.step4Body': 'Pressione \u2318K para buscar comandos, pain\u00E9is e arquivos instantaneamente.',
    'onboarding.step5Title': 'Primeira orquestra\u00E7\u00E3o em ~60s',
    'onboarding.step5Body': 'Crie um terminal, clique na coroa para ativar o Maestro, pe\u00E7a uma tarefa multi-parte, veja workers no canvas e deixe o Maestro aguardar os resultados. Prefira o Maestro ao painel Orchestration experimental.',
    'onboarding.step6Title': 'Voc\u00EA est\u00E1 pronto',
    'onboarding.step6Body': 'Crie seu primeiro layout. Experimente um terminal com Maestro, ou um editor ao lado.',

    // Dock
    'dock.closeAll': 'Fechar Todos',
    'dock.rename': 'Renomear',
    'dock.closeOthers': 'Fechar Outros',
    'dock.closeToRight': 'Fechar \u00E0 Direita',
    'dock.splitRight': 'Dividir \u00E0 Direita',
    'dock.moveToNewWindow': 'Mover para Nova Janela',
    'dock.newTab': 'Nova Aba',
    'dock.splitWith': 'Dividir Com',
    'dock.editor': 'Editor',
    'dock.terminal': 'Terminal',
    'dock.browser': 'Navegador',
    'dock.canvas': 'Tela',
    'dock.orchestration': 'Orquestra\u00E7\u00E3o',
    'dock.closeTitle': 'Fechar',

    // Browser Panel
    'browser.configureProxy': 'Configurar Proxy\u2026',
    'browser.clearProxy': 'Limpar Proxy (Direto)',

    // Orchestration Panel
    'orchestration.noCommandsFound': '\u2717 Nenhum comando [N] encontrado na resposta',
    'orchestration.workerNotFound': '  \u2717 Worker {index}: n\u00E3o encontrado',
    'orchestration.noTerminals': 'Nenhum terminal aberto. Abra terminais na tela para usar como workers.',
    'orchestration.describeTask': 'Descreva o que os workers devem fazer',
    'orchestration.aiGenerateInfo': 'A IA vai gerar comandos e injetar nos terminais',
    'orchestration.taskPlaceholder': 'Descreva a tarefa para os workers\u2026',
    'orchestration.panelTitle': 'Orquestra\u00E7\u00E3o',

    // Git Status
    'gitStatus.modified': 'Modificado',
    'gitStatus.added': 'Adicionado',
    'gitStatus.deleted': 'Exclu\u00EDdo',
    'gitStatus.renamed': 'Renomeado',
    'gitStatus.copied': 'Copiado',
    'gitStatus.typeChanged': 'Tipo alterado',
    'gitStatus.untracked': 'N\u00E3o monitorado',
    'gitStatus.conflict': 'Conflito',

    // Terminal Keymap
    'terminalKeymap.deleteToLineStart': 'Excluir at\u00E9 o in\u00EDcio da linha',
    'terminalKeymap.deleteWordLeft': 'Excluir palavra \u00E0 esquerda',
    'terminalKeymap.deleteWordRight': 'Excluir palavra \u00E0 direita',
    'terminalKeymap.moveToLineStart': 'Ir ao in\u00EDcio da linha',
    'terminalKeymap.moveToLineEnd': 'Ir ao final da linha',
    'terminalKeymap.moveWordLeft': 'Mover palavra \u00E0 esquerda',
    'terminalKeymap.moveWordRight': 'Mover palavra \u00E0 direita',

    // Parallel Work
    'parallelWork.publishBranch': 'Publicar branch',
    'parallelWork.changeColor': 'Alterar cor\u2026',
    'parallelWork.discard': 'Descartar este trabalho\u2026',

    // Update Ready Dialog
    'updates.ready': 'Atualiza\u00E7\u00E3o pronta',
    'updates.readyDesc': 'Reinicie para aplicar, ou ser\u00E1 instalada na pr\u00F3xima sa\u00EDda.',
    'updates.installOnQuit': 'Instalar ao sair',
    'updates.restarting': 'Reiniciando\u2026',

    // Sidebar extra
    'sidebar.collapseTooltip': 'Clique para recolher.',
  },
}
