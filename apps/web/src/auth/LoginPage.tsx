import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ApiError, friendlyError } from '../api/http'
import { GoogleSignInButton } from './GoogleSignInButton'
import { useAuth } from './AuthProvider'

export function LoginPage() {
  const { user, signIn } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (user) return <Navigate to="/" replace />

  const login = async (credential: string) => {
    setLoading(true)
    setError('')
    try {
      await signIn(credential)
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 403
          ? '허용된 회사 Google 계정으로 로그인해주세요'
          : friendlyError(caught),
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-wordmark">AIMS</div>
        <span className="eyebrow">INTERNAL WORK LOG</span>
        <h1>업무 기록을 시작하세요</h1>
        <p>회사 Google 계정으로<br />AIMS에 로그인하세요.</p>
        <GoogleSignInButton disabled={loading} onCredential={login} />
        {loading ? <p className="login-status">로그인하는 중…</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <small>승인된 회사 계정만 사용할 수 있습니다.</small>
      </section>
    </main>
  )
}
