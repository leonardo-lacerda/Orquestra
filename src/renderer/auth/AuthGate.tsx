// =============================================================================
// AuthGate — Wraps the main app and gates access behind authentication.
//
// Flow on mount:
//   1. Call appAuthRestore() to try restoring a saved Supabase session.
//   2. If session is valid + subscription active → render children.
//   3. If no session / expired / no subscription → show LoginScreen.
//   4. Subscribe to onAppAuthState for async state pushes from main.
//
// After a successful login the parent re-renders with children visible —
// the App component itself doesn't need to manage this state.
// =============================================================================

import React, { useEffect, useState, useCallback } from 'react'
import { LoginScreen } from './LoginScreen'
import type { AppAuthState } from '../../shared/electron-api'

type Phase = 'loading' | 'login' | 'authorized'

interface AuthGateProps {
  children: React.ReactNode
}

export function AuthGate({ children }: AuthGateProps): React.ReactElement {
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | undefined>()
  const [reason, setReason] = useState<string | undefined>()

  // Shared handler for any auth state update
  const handleAuthState = useCallback((state: AppAuthState) => {
    if (state.authorized) {
      setPhase('authorized')
      setError(undefined)
      setReason(undefined)
    } else {
      setPhase('login')
      setError(undefined)
      setReason(state.reason)
    }
  }, [])

  // Try restoring a saved session on mount
  useEffect(() => {
    let cancelled = false

    async function restore(): Promise<void> {
      try {
        const state = await window.electronAPI.appAuthRestore()
        if (cancelled) return
        handleAuthState(state)
      } catch (err) {
        if (cancelled) return
        console.error('[AuthGate] restore failed:', err)
        setPhase('login')
      }
    }

    void restore()

    // Subscribe to async auth state pushes from main (e.g. token refresh failed)
    const unsub = window.electronAPI.onAppAuthState((state) => {
      if (!cancelled) handleAuthState(state)
    })

    return () => {
      cancelled = true
      unsub()
    }
  }, [handleAuthState])

  // Login handler — called by LoginScreen
  const handleLogin = useCallback(async (email: string, password: string): Promise<string | null> => {
    try {
      const state = await window.electronAPI.appAuthSignIn(email, password)
      if (state.authorized) {
        setPhase('authorized')
        setError(undefined)
        setReason(undefined)
        return null
      }
      return state.reason ?? 'Falha ao fazer login.'
    } catch (err) {
      return err instanceof Error ? err.message : 'Erro ao conectar com servidor.'
    }
  }, [])

  // Show nothing while we check the session
  if (phase === 'loading') {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1a1a1e',
      }}>
        <div style={{ color: '#8b8b95', fontSize: 14 }}>Verificando sessão...</div>
      </div>
    )
  }

  // Show login screen when not authorized
  if (phase === 'login') {
    return <LoginScreen onLogin={handleLogin} error={reason} />
  }

  // Authorized — render the app
  return <>{children}</>
}
