import { Navigate, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import { useAuth } from './auth'
import AskPage from './pages/AskPage'
import DocumentListPage from './pages/DocumentListPage'
import DocumentReaderPage from './pages/DocumentReaderPage'
import LoginPage from './pages/LoginPage'

function Shell() {
  const auth = useAuth()
  const navigate = useNavigate()
  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/ask" className="brand">KnowFlow</NavLink>
        <nav>
          <NavLink to="/ask">问答</NavLink>
          <NavLink to="/documents">文档</NavLink>
        </nav>
        <div className="session">
          <span>{auth.account?.name}</span>
          <button type="button" onClick={() => { auth.logout(); navigate('/login', { replace: true }) }}>退出</button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}

function RequireAuth() {
  const auth = useAuth()
  if (!auth.ready) return <p className="muted center">正在打开…</p>
  if (!auth.account) return <Navigate to="/login" replace />
  return <Shell />
}

export default function App() {
  const auth = useAuth()
  return (
    <Routes>
      <Route path="/login" element={auth.account ? <Navigate to="/ask" replace /> : <LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/ask" element={<AskPage />} />
        <Route path="/documents" element={<DocumentListPage />} />
        <Route path="/documents/:id" element={<DocumentReaderPage />} />
        <Route path="*" element={<Navigate to="/ask" replace />} />
      </Route>
    </Routes>
  )
}
