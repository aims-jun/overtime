// oxlint-disable react/only-export-components -- route elements and router belong together
import { Link, Navigate, Outlet, createBrowserRouter } from 'react-router-dom'
import { AdminPage } from '../admin/AdminPage'
import { LoginPage } from '../auth/LoginPage'
import { useAuth } from '../auth/AuthProvider'
import { OvertimePage } from '../overtime/OvertimePage'

function LoadingPage() {
  return <main className="loading-page">서비스를 준비하는 중…</main>
}

function RoleHome() {
  const { user } = useAuth()
  if (user?.isAdmin) return <Navigate to="/admin" replace />
  return <OvertimePage />
}

function ProtectedLayout() {
  const { user, loading, signOut } = useAuth()
  if (loading) return <LoadingPage />
  if (!user) return <Navigate to="/login" replace />
  return (
    <>
      <header className="app-header">
        <Link className="brand" to={user.isAdmin ? '/admin' : '/'}>AIMS</Link>
        <div className="user-menu">
          {user.isAdmin ? <Link to="/admin">관리자</Link> : null}
          <span>{user.name}</span>
          <button type="button" onClick={() => void signOut()}>로그아웃</button>
        </div>
      </header>
      <Outlet />
    </>
  )
}

function AdminOnly() {
  const { user } = useAuth()
  if (!user?.isAdmin) {
    return (
      <main className="access-denied">
        <span className="eyebrow">403</span>
        <h1>접근 권한이 없습니다</h1>
        <p>관리자 계정으로 로그인해주세요.</p>
        <Link to="/">내 기록으로 돌아가기</Link>
      </main>
    )
  }
  return <AdminPage />
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedLayout />,
    children: [
      { path: '/', element: <RoleHome /> },
      { path: '/admin', element: <AdminOnly /> },
    ],
  },
])
