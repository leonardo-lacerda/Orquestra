// =============================================================================
// LoginScreen — Full-screen login UI shown when the user is not authenticated.
// Styled to match the Orquestra desktop aesthetic.
// =============================================================================

import React, { useState, useCallback } from 'react'

interface LoginScreenProps {
  onLogin: (email: string, password: string) => Promise<string | null>
  error?: string
}

export function LoginScreen({ onLogin, error: externalError }: LoginScreenProps): React.ReactElement {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(externalError ?? null)

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return

    setLoading(true)
    setError(null)

    try {
      const err = await onLogin(email.trim(), password)
      if (err) {
        setError(err)
        setLoading(false)
      }
      // If no error, AuthGate will detect the state change and transition
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer login.')
      setLoading(false)
    }
  }, [email, password, onLogin])

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#1a1a1e',
      color: '#e4e4e7',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 32,
        width: 340,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'flex-end',
            gap: 3,
            height: 22,
          }}>
            <span style={{ width: 5, backgroundColor: '#e45858', borderRadius: 2, height: '40%' }} />
            <span style={{ width: 5, backgroundColor: '#7c6ff0', borderRadius: 2, height: '100%' }} />
            <span style={{ width: 5, backgroundColor: '#e45858', borderRadius: 2, height: '65%' }} />
            <span style={{ width: 5, backgroundColor: '#7c6ff0', borderRadius: 2, height: '85%' }} />
          </span>
          <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.5px' }}>Orquestra</span>
        </div>

        {/* Login card */}
        <div style={{
          width: '100%',
          borderRadius: 12,
          border: '1px solid #2a2a30',
          backgroundColor: '#202024',
          padding: 32,
        }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: '#e4e4e7' }}>
              Bem-vindo de volta
            </h1>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#8b8b95' }}>
              Entre com suas credenciais Orquestra
            </p>
          </div>

          {error && (
            <div style={{
              padding: '10px 14px',
              marginBottom: 16,
              borderRadius: 8,
              backgroundColor: 'rgba(228, 88, 88, 0.1)',
              border: '1px solid rgba(228, 88, 88, 0.3)',
              color: '#e45858',
              fontSize: 13,
              lineHeight: 1.4,
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#a1a1aa', marginBottom: 4 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                autoFocus
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #2a2a30',
                  backgroundColor: '#18181b',
                  color: '#e4e4e7',
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => e.target.style.borderColor = '#7c6ff0'}
                onBlur={(e) => e.target.style.borderColor = '#2a2a30'}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#a1a1aa', marginBottom: 4 }}>
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #2a2a30',
                  backgroundColor: '#18181b',
                  color: '#e4e4e7',
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => e.target.style.borderColor = '#7c6ff0'}
                onBlur={(e) => e.target.style.borderColor = '#2a2a30'}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              style={{
                width: '100%',
                padding: '10px 0',
                marginTop: 4,
                borderRadius: 8,
                border: 'none',
                backgroundColor: loading ? '#4a4a55' : '#7c6ff0',
                color: '#fff',
                fontSize: 14,
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: (!email.trim() || !password) && !loading ? 0.5 : 1,
              }}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        {/* Register link */}
        <div style={{ fontSize: 13, color: '#8b8b95', textAlign: 'center' }}>
          Não tem uma conta?{' '}
          <span
            onClick={() => window.open('https://www.orquestra.space', '_blank')}
            style={{ color: '#7c6ff0', cursor: 'pointer', textDecoration: 'none' }}
          >
            Cadastre-se
          </span>
        </div>
      </div>
    </div>
  )
}
