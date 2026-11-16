import { Button, Result, Spin } from 'antd'
import type { ReactElement } from 'react'
import { Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import AdminLayout from './layout/AdminLayout'
import DashboardPage from './pages/DashboardPage'
import DocumentPage from './pages/DocumentPage'
import EmployeePage from './pages/EmployeePage'
import LoginPage from './pages/LoginPage'
import MenuPage from './pages/MenuPage'
import RolePage from './pages/RolePage'
import UserPage from './pages/UserPage'
import { useStore } from './store'

const pages: Record<string, () => ReactElement> = {
  '/dashboard': () => <DashboardPage />,
  '/system/users': () => <UserPage />,
  '/system/employees': () => <EmployeePage />,
  '/system/roles': () => <RolePage />,
  '/system/menus': () => <MenuPage />,
  '/documents': () => <DocumentPage />,
}

function RequireAuth() {
  const store = useStore()
  if (!store.current) return <Navigate to="/login" replace />
  return <Outlet />
}

function PlaceholderPage() {
  const navigate = useNavigate()
  const store = useStore()
  return (
    <Result
      status="404"
      title="这个地址还没有对应页面"
      extra={<Button type="primary" onClick={() => navigate(store.homePath())}>返回可用页面</Button>}
    />
  )
}

function DeniedPage() {
  const navigate = useNavigate()
  const store = useStore()
  return (
    <Result
      status="403"
      title="没有访问权限"
      extra={<Button type="primary" onClick={() => navigate(store.homePath())}>返回可用页面</Button>}
    />
  )
}

export default function App() {
  const store = useStore()
  if (!store.ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  const routes = store.navMenus.flatMap((menu) => {
    if (menu.type !== 'page' || !menu.path) return []
    const render = pages[menu.path]
    return [(
      <Route
        key={menu.path}
        path={menu.path.replace(/^\//, '')}
        element={render ? render() : <PlaceholderPage />}
      />
    )]
  })

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AdminLayout />}>
          <Route index element={<Navigate to={store.homePath()} replace />} />
          {routes}
          <Route path="*" element={<DeniedPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
