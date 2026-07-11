export interface BrowserContextSnapshot {
  title?: string
  url?: string
  visibleText?: string
  screenshotPath?: string
}

export interface BrowserContextProvider {
  getSnapshot(options?: { includeScreenshot?: boolean }): Promise<BrowserContextSnapshot>
}

const registry = new Map<string, BrowserContextProvider>()

export function registerBrowserContext(panelId: string, provider: BrowserContextProvider): void {
  registry.set(panelId, provider)
}

export function unregisterBrowserContext(panelId: string): void {
  registry.delete(panelId)
}

export function getBrowserContext(panelId: string): BrowserContextProvider | undefined {
  return registry.get(panelId)
}
