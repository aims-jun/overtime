// oxlint-disable react/only-export-components -- route elements and router belong together
import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom'
import { LoginPage } from '../auth/LoginPage'
import { useAuth } from '../auth/AuthProvider'
import { OvertimePage } from '../overtime/OvertimePage'

function LoadingPage() {
  return <main className="loading-page">서비스를 준비하는 중…</main>
}

function ProtectedLayout() {
  const { user, loading, signOut } = useAuth()
  if (loading) return <LoadingPage />
  if (!user) return <Navigate to="/login" replace />
  return (
    <>
      <header className="app-header">
        <a className="brand" href="/">늦은 기록</a>
        <div className="user-menu">
          <span>{user.name}</span>
          <button type="button" onClick={() => void signOut()}>로그아웃</button>
        </div>
      </header>
      <Outlet />
    </>
  )
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedLayout />,
    children: [{ path: '/', element: <OvertimePage /> }],
  },
])
