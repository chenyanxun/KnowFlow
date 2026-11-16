import { Button, Dropdown, Layout, Menu, Result, theme } from 'antd'
import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { buildNav, toSiderItems } from '../access'
import { useStore } from '../store'

const { Header, Sider, Content, Footer } = Layout

export default function AdminLayout() {
  const store = useStore()
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = theme.useToken()
  const contentRef = useRef<HTMLDivElement>(null)
  const account = store.current

  useEffect(() => {
    contentRef.current?.scrollTo(0, 0)
  }, [location.pathname])

  if (!account) return null

  const nav = buildNav(store.navMenus)
  const selected = store.navMenus.find((menu) => menu.type === 'page' && menu.path === location.pathname)
  const openKey = selected?.parentId ?? undefined
  const roleNames = account.roleNames ?? []
  const blocked = selected && !store.canOpenPath(location.pathname)

  return (
    <Layout className="admin-shell">
      <Sider width={220} theme="dark" className="admin-sider">
        <div className="admin-logo">
          <span className="logo-mark">K</span>
          <span className="logo-text">KnowFlow</span>
        </div>
        <div className="admin-menu">
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[location.pathname]}
            defaultOpenKeys={openKey ? [openKey] : []}
            items={toSiderItems(nav)}
            onClick={({ key }) => {
              if (key.startsWith('/')) navigate(key)
            }}
          />
        </div>
      </Sider>
      <Layout className="admin-main">
        <Header className="admin-header" style={{ background: token.colorBgContainer }}>
          <span className="header-title">{selected?.name ?? 'KnowFlow'}</span>
          <Dropdown
            menu={{
              items: [
                { key: 'logout', label: '退出登录' },
              ],
              onClick: ({ key }) => {
                if (key === 'logout') {
                  store.logout()
                  navigate('/login', { replace: true })
                }
              },
            }}
          >
            <Button type="text">
              {account.name}
              <span className="header-role">{roleNames.join('、') || '未分配角色'}</span>
            </Button>
          </Dropdown>
        </Header>
        <Content ref={contentRef} className="admin-content">
          {blocked ? (
            <Result
              status="403"
              title="没有访问权限"
              extra={<Button type="primary" onClick={() => navigate(store.homePath())}>返回可用页面</Button>}
            />
          ) : nav.length === 0 ? (
            <Result status="info" title="还没有可用菜单" subTitle="请让管理员为这个账号分配角色。" />
          ) : (
            <Outlet />
          )}
        </Content>
        <Footer className="admin-footer">© 2026 KnowFlow 版权所有</Footer>
      </Layout>
    </Layout>
  )
}
