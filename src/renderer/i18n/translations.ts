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
  },
}
