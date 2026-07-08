// =============================================================================
// IPC handlers for APP_AUTH_* channels — thin wrappers around ElectronAuth.
// =============================================================================

import { ipcMain, BrowserWindow } from 'electron'
import {
  APP_AUTH_RESTORE,
  APP_AUTH_SIGN_IN,
  APP_AUTH_SIGN_OUT,
  APP_AUTH_STATE,
  APP_AUTH_REFRESH_SUB,
} from '../../shared/ipc-channels'
import { electronAuth } from '../supabase/electronAuth'
import log from '../../main/logger'

// ---------------------------------------------------------------------------
// Rate limiting — prevents brute-force attacks on the login IPC.
// Uses an in-memory map keyed by normalized email.
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number
  until: number
}

const loginAttempts = new Map<string, RateLimitEntry>()
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 30_000 // 30 seconds after max attempts
const BACKOFF_BASE_MS = 1_000 // 1 second base backoff per attempt

function checkRateLimit(key: string): string | null {
  const entry = loginAttempts.get(key)
  if (entry && entry.until > Date.now()) {
    const retryAfter = Math.ceil((entry.until - Date.now()) / 1000)
    return `Muitas tentativas. Tente novamente em ${retryAfter} segundos.`
  }
  return null
}

function recordAttempt(key: string): void {
  const entry = loginAttempts.get(key) ?? { count: 0, until: 0 }
  entry.count++
  if (entry.count >= MAX_ATTEMPTS) {
    entry.until = Date.now() + LOCKOUT_MS
  } else {
    entry.until = Date.now() + entry.count * BACKOFF_BASE_MS
  }
  loginAttempts.set(key, entry)
}

function clearRateLimit(key: string): void {
  loginAttempts.delete(key)
}

// Periodic cleanup of stale entries
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of loginAttempts) {
    if (entry.until <= now) loginAttempts.delete(key)
  }
}, 60_000)

// ---------------------------------------------------------------------------

/** Push the current auth state to every window. Used when state changes
 *  asynchronously (e.g. token refresh failure detected in background). */
export function broadcastAuthState(): void {
  const state = electronAuth.state
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(APP_AUTH_STATE, state)
    }
  })
}

export function registerAppAuthHandlers(): void {
  // Wire up async auth state changes (token expiry, etc.) to push to all windows
  electronAuth.onStateChange = () => broadcastAuthState()

  ipcMain.handle(APP_AUTH_RESTORE, async () => {
    try {
      return await electronAuth.tryRestoreSession()
    } catch (err) {
      log.warn('[ipc.appAuth] restore failed: %O', err)
      return { authorized: false, user: null, subscription: null, reason: 'Erro ao restaurar sessão.' }
    }
  })

  ipcMain.handle(APP_AUTH_SIGN_IN, async (_event, email: string, password: string) => {
    const key = typeof email === 'string' ? email.toLowerCase() : ''
    const blocked = checkRateLimit(key)
    if (blocked) {
      return { authorized: false, user: null, subscription: null, reason: blocked }
    }

    try {
      const result = await electronAuth.signIn(email, password)
      if (result.authorized) {
        clearRateLimit(key)
      } else {
        recordAttempt(key)
      }
      return result
    } catch (err) {
      recordAttempt(key)
      log.warn('[ipc.appAuth] signIn failed: %O', err)
      return { authorized: false, user: null, subscription: null, reason: 'Erro ao fazer login.' }
    }
  })

  ipcMain.handle(APP_AUTH_SIGN_OUT, async () => {
    try {
      return await electronAuth.signOut()
    } catch (err) {
      log.warn('[ipc.appAuth] signOut failed: %O', err)
      return { authorized: false, user: null, subscription: null }
    }
  })

  ipcMain.handle(APP_AUTH_REFRESH_SUB, async () => {
    try {
      return await electronAuth.refreshSubscription()
    } catch (err) {
      log.warn('[ipc.appAuth] refreshSub failed: %O', err)
      const current = electronAuth.state
      return { ...current, reason: 'Erro ao verificar assinatura.' }
    }
  })
}
