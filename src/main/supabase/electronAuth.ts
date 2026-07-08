// =============================================================================
// ElectronAuth — Main-process Supabase auth manager for the desktop app.
//
// Two responsibilities:
//   1. Email/password login + session persistence (via Electron safeStorage)
//   2. Subscription/license check against the user's Supabase project
//
// Security model:
//   - Supabase client runs ONLY in the main process.
//   - The renderer never touches the anon key or session tokens directly.
//   - Sessions are encrypted at rest via safeStorage (OS-level encryption).
//   - Subscription status is checked through RLS (the user's own JWT), so an
//     attacker with the anon key alone cannot read other users' subscriptions.
//   - Subscription is revalidated every 30 minutes while the app runs, so
//     cancelling a subscription mid-session is detected within ~30 min.
// =============================================================================

import { safeStorage } from 'electron'
import { createClient, type SupabaseClient, type Session, type User } from '@supabase/supabase-js'
import fsp from 'fs/promises'
import path from 'path'
import log from '../../main/logger'

// ---------------------------------------------------------------------------
// Config — embedded at build time (public anon key, same as web/mobile apps)
// ---------------------------------------------------------------------------

const SUPABASE_URL = 'https://yktidzsrldsksvaubagt.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrdGlkenNybGRza3N2YXViYWd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzODA0NTksImV4cCI6MjA5ODk1NjQ1OX0.w-YGyQ1t2juivf9SN56yHmjk73Gt4k5oNNj-usBRoyc'

/** The website's base URL — used for links in the login UI. */
export const WEBSITE_URL = 'https://www.orquestra.space'

/** Valid subscription statuses that grant desktop access. */
const ACTIVE_STATUSES = ['active', 'trialing']

/** How often to re-check the user's subscription status while the app runs. */
const REVALIDATION_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes

// ---------------------------------------------------------------------------
// Subscription shape returned from Supabase
// ---------------------------------------------------------------------------

export interface SubscriptionInfo {
  id: string
  status: string
  plan: string | null
  currentPeriodEnd: string | null
  trialEnd: string | null
  cancelAtPeriodEnd: boolean
}

export interface AuthState {
  /** True when the user is logged in AND has an active subscription. */
  authorized: boolean
  user: { id: string; email: string } | null
  subscription: SubscriptionInfo | null
  /** Human-readable reason when authorized === false. */
  reason?: string
}

// ---------------------------------------------------------------------------
// Session file path (under userData)
// ---------------------------------------------------------------------------

let sessionPath: string | null = null

/** Whether safeStorage (OS-level encryption) is available on this system. */
let storageAvailable = false

function setUserDataDir(userData: string): void {
  const dir = path.join(userData, 'auth')
  sessionPath = path.join(dir, 'session.enc')
  storageAvailable = safeStorage.isEncryptionAvailable()
  if (!storageAvailable) {
    log.warn('[electronAuth] safeStorage not available — session will not persist between restarts')
  }
}

// ---------------------------------------------------------------------------
// ElectronAuth — singleton
// ---------------------------------------------------------------------------

export class ElectronAuth {
  private supabase: SupabaseClient | null = null
  private _state: AuthState = { authorized: false, user: null, subscription: null }
  /** Callback fired when auth state changes asynchronously (e.g. token expired). */
  private _onStateChange: ((state: AuthState) => void) | null = null
  /** Timer for periodic subscription revalidation. */
  private _revalidationTimer: ReturnType<typeof setInterval> | null = null

  /** Register a callback for async state changes (wired to broadcastAuthState). */
  set onStateChange(cb: ((state: AuthState) => void) | null) {
    this._onStateChange = cb
  }

  /** Initialize with the app's userData path (called from main index). */
  init(userData: string): void {
    setUserDataDir(userData)
    this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: false, // We handle persistence ourselves via safeStorage
        detectSessionInUrl: false,
      },
    })
    log.info('[electronAuth] initialized')

    // Listen for auth state changes — fires on token refresh success/failure
    // and when the session is invalidated server-side.
    this.supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && session) {
        void this.saveSession(session)
      } else if (event === 'SIGNED_OUT') {
        this._state = { authorized: false, user: null, subscription: null }
        this._onStateChange?.(this._state)
      }
    })
  }

  /** The current auth state — read-only snapshot. */
  get state(): Readonly<AuthState> {
    return this._state
  }

  /** Called by the renderer on mount to restore a saved session. */
  async tryRestoreSession(): Promise<AuthState> {
    if (!this.supabase) throw new Error('ElectronAuth not initialized')
    if (!sessionPath) throw new Error('ElectronAuth not initialized')

    const session = await this.loadSession()
    if (!session) {
      this._state = { authorized: false, user: null, subscription: null }
      return this._state
    }

    const { data, error } = await this.supabase.auth.setSession(session)
    if (error || !data.session) {
      log.warn('[electronAuth] session restore failed: %O', error)
      await this.clearSession()
      this._state = { authorized: false, user: null, subscription: null, reason: 'Sessão expirada. Faça login novamente.' }
      return this._state
    }

    const result = await this.refreshAuthState(data.session.user)
    if (result.authorized) this.startRevalidation()
    return result
  }

  /** Sign in with email + password. Returns the new auth state. */
  async signIn(email: string, password: string): Promise<AuthState> {
    if (!this.supabase) throw new Error('ElectronAuth not initialized')

    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password })
    if (error) {
      log.warn('[electronAuth] signIn failed: %s', error.message)
      this._state = { authorized: false, user: null, subscription: null, reason: 'Email ou senha incorretos.' }
      return this._state
    }
    if (!data.session) {
      this._state = { authorized: false, user: null, subscription: null, reason: 'Falha ao criar sessão.' }
      return this._state
    }

    await this.saveSession(data.session)
    const result = await this.refreshAuthState(data.session.user)
    if (result.authorized) this.startRevalidation()
    return result
  }

  /** Start periodic subscription revalidation. Called after successful auth. */
  private startRevalidation(): void {
    this.stopRevalidation()
    log.info('[electronAuth] starting periodic revalidation (every %d min)', REVALIDATION_INTERVAL_MS / 60_000)
    this._revalidationTimer = setInterval(async () => {
      if (this._state.authorized) {
        const state = await this.refreshSubscription()
        if (!state.authorized) {
          log.warn('[electronAuth] subscription expired during revalidation — forcing logout')
          this._onStateChange?.(state)
        }
      }
    }, REVALIDATION_INTERVAL_MS)
  }

  /** Stop periodic revalidation. Called on sign out. */
  private stopRevalidation(): void {
    if (this._revalidationTimer !== null) {
      clearInterval(this._revalidationTimer)
      this._revalidationTimer = null
    }
  }

  /** Sign out — clears session and returns to unauthenticated state. */
  async signOut(): Promise<AuthState> {
    this.stopRevalidation()
    if (this.supabase) {
      await this.supabase.auth.signOut().catch(() => { /* noop */ })
    }
    await this.clearSession()
    this._state = { authorized: false, user: null, subscription: null }
    return this._state
  }

  /** Refresh the subscription check for the current user. */
  async refreshSubscription(): Promise<AuthState> {
    if (!this.supabase) throw new Error('ElectronAuth not initialized')

    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) {
      await this.clearSession()
      this._state = { authorized: false, user: null, subscription: null, reason: 'Sessão expirada.' }
      return this._state
    }

    return this.refreshAuthState(user)
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private async refreshAuthState(user: User): Promise<AuthState> {
    if (!this.supabase) throw new Error('ElectronAuth not initialized')

    const subscription = await this.fetchSubscription(user.id)
    const hasActive = subscription && ACTIVE_STATUSES.includes(subscription.status)

    this._state = {
      authorized: !!hasActive,
      user: { id: user.id, email: user.email ?? '' },
      subscription,
      reason: hasActive ? undefined : 'Sua assinatura não está ativa. Acesse orquestra.space para assinar.',
    }
    return this._state
  }

  private async fetchSubscription(userId: string): Promise<SubscriptionInfo | null> {
    if (!this.supabase) return null

    const { data, error } = await this.supabase
      .from('subscriptions')
      .select('id, status, plan, current_period_end, trial_end, cancel_at_period_end')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing', 'past_due'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      log.warn('[electronAuth] subscription fetch failed: %O', error)
      return null
    }

    if (!data) return null

    return {
      id: data.id,
      status: data.status,
      plan: data.plan,
      currentPeriodEnd: data.current_period_end,
      trialEnd: data.trial_end,
      cancelAtPeriodEnd: data.cancel_at_period_end,
    }
  }

  // -------------------------------------------------------------------------
  // Session persistence (safeStorage encrypted)
  // -------------------------------------------------------------------------

  private async saveSession(session: Session): Promise<void> {
    if (!sessionPath || !storageAvailable) return
    try {
      const dir = path.dirname(sessionPath)
      await fsp.mkdir(dir, { recursive: true, mode: 0o700 })
      const json = JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at ? Math.floor(session.expires_at) : undefined,
      })
      const encrypted = safeStorage.encryptString(json)
      await fsp.writeFile(sessionPath, encrypted, { mode: 0o600 })
    } catch (err) {
      log.warn('[electronAuth] saveSession failed: %O', err)
    }
  }

  private async loadSession(): Promise<{ access_token: string; refresh_token: string } | null> {
    if (!sessionPath) return null
    try {
      const encrypted = await fsp.readFile(sessionPath)
      const json = safeStorage.decryptString(encrypted)
      return JSON.parse(json)
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        log.warn('[electronAuth] loadSession failed: %O', err)
      }
      return null
    }
  }

  private async clearSession(): Promise<void> {
    if (!sessionPath) return
    try {
      await fsp.unlink(sessionPath)
    } catch {
      // ENOENT is fine
    }
  }
}

// Singleton
export const electronAuth = new ElectronAuth()
