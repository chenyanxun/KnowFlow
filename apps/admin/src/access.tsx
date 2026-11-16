import {
  DashboardOutlined,
  FileOutlined,
  FolderOutlined,
  IdcardOutlined,
  MenuOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import type { MenuItem } from './types'

const iconMap = {
  dashboard: DashboardOutlined,
  user: UserOutlined,
  idcard: IdcardOutlined,
  team: TeamOutlined,
  menu: MenuOutlined,
  file: FileOutlined,
  folder: FolderOutlined,
  setting: SettingOutlined,
}

export function renderIcon(name?: string) {
  const Icon = iconMap[name as keyof typeof iconMap] ?? FolderOutlined
  return <Icon />
}

export interface NavItem {
  id: string
  name: string
  path?: string
  icon?: string
  children: NavItem[]
}

export function buildNav(menus: MenuItem[], parentId: string | null = null): NavItem[] {
  return menus
    .filter((menu) => menu.parentId === parentId && menu.type !== 'button' && menu.visible)
    .sort((a, b) => a.sort - b.sort)
    .flatMap((menu) => {
      if (menu.type === 'page') {
        return menu.path ? [{ id: menu.id, name: menu.name, path: menu.path, icon: menu.icon, children: [] }] : []
      }
      const children = buildNav(menus, menu.id)
      return children.length ? [{ id: menu.id, name: menu.name, icon: menu.icon, children }] : []
    })
}

export function toSiderItems(items: NavItem[]): MenuProps['items'] {
  return items.map((item) => ({
    key: item.path ?? item.id,
    icon: renderIcon(item.icon),
    label: item.name,
    children: item.children.length ? toSiderItems(item.children) : undefined,
  }))
}

export function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export function formatTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}
