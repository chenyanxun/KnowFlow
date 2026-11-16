import { App, Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag, TreeSelect, Typography } from 'antd'
import { useState } from 'react'
import { useStore } from '../store'
import type { MenuItem, MenuType } from '../types'

interface MenuRow extends MenuItem {
  children?: MenuRow[]
}

function toRows(menus: MenuItem[], parentId: string | null): MenuRow[] {
  return menus
    .filter((menu) => menu.parentId === parentId)
    .sort((a, b) => a.sort - b.sort)
    .map((menu) => {
      const children = toRows(menus, menu.id)
      return children.length ? { ...menu, children } : { ...menu }
    })
}

function parentOptions(menus: MenuItem[], selfId?: string) {
  const blocked = new Set<string>()
  if (selfId) {
    const walk = (id: string) => {
      blocked.add(id)
      menus.filter((menu) => menu.parentId === id).forEach((menu) => walk(menu.id))
    }
    walk(selfId)
  }
  type ParentNode = { value: string; title: string; children?: ParentNode[] }
  const nodes = (parentId: string | null): ParentNode[] =>
    menus
      .filter((menu) => menu.parentId === parentId && menu.type !== 'button' && !blocked.has(menu.id))
      .sort((a, b) => a.sort - b.sort)
      .map((menu) => {
        const children = nodes(menu.id)
        return children.length ? { value: menu.id, title: menu.name, children } : { value: menu.id, title: menu.name }
      })
  return nodes(null)
}

const typeLabel: Record<MenuType, string> = { directory: '目录', page: '页面', button: '按钮' }

export default function MenuPage() {
  const store = useStore()
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<MenuItem | null>(null)
  const type = Form.useWatch<MenuType>('type', form)

  const openForm = (menu?: MenuItem, parentId?: string) => {
    setEditing(menu ?? null)
    form.setFieldsValue(menu ?? {
      parentId: parentId ?? null,
      name: '',
      type: parentId ? 'page' : 'directory',
      path: '',
      permission: '',
      icon: 'folder',
      sort: 1,
      visible: true,
    })
    setOpen(true)
  }

  return (
    <div className="page">
      <div className="page-bar">
        <Typography.Title level={4} style={{ margin: 0 }}>菜单管理</Typography.Title>
        {store.can('menu:create') ? <Button type="primary" onClick={() => openForm()}>新建菜单</Button> : null}
      </div>
      <Table
        rowKey="id"
        pagination={false}
        defaultExpandAllRows
        dataSource={toRows(store.db.menus, null)}
        columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '类型', dataIndex: 'type', render: (value: MenuType) => <Tag>{typeLabel[value]}</Tag> },
          { title: '路径 / 权限码', render: (_, menu: MenuRow) => menu.path || menu.permission || '—' },
          { title: '排序', dataIndex: 'sort', width: 80 },
          { title: '显示', dataIndex: 'visible', render: (visible: boolean) => visible ? '是' : '否' },
          {
            title: '操作',
            render: (_, menu: MenuRow) => (
              <Space>
                {store.can('menu:create') && menu.type !== 'button' ? (
                  <Button type="link" onClick={() => openForm(undefined, menu.id)}>添加下级</Button>
                ) : null}
                {store.can('menu:update') ? <Button type="link" onClick={() => openForm(menu)}>编辑</Button> : null}
                {store.can('menu:delete') ? (
                  <Popconfirm
                    title="删除这个菜单？"
                    onConfirm={async () => {
                      const result = await store.removeMenu(menu.id)
                      if (!result.ok) message.error(result.message)
                    }}
                  >
                    <Button type="link" danger>删除</Button>
                  </Popconfirm>
                ) : null}
              </Space>
            ),
          },
        ]}
      />
      <Modal title={editing ? '编辑菜单' : '新建菜单'} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} destroyOnHidden>
        <Form
          form={form}
          autoComplete="off"
          layout="vertical"
          onFinish={async (values) => {
            const result = await store.saveMenu({
              parentId: values.parentId || null,
              name: values.name,
              type: values.type,
              path: values.path,
              icon: values.icon,
              permission: values.permission,
              sort: values.sort ?? 1,
              visible: values.visible ?? true,
            }, editing?.id)
            if (!result.ok) {
              message.error(result.message)
              return
            }
            setOpen(false)
            message.success('已保存')
          }}
        >
          <Form.Item name="parentId" label="上级">
            <TreeSelect allowClear treeDefaultExpandAll placeholder="不选则为顶级" treeData={parentOptions(store.db.menus, editing?.id)} />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true }]}>
            <Select options={[{ value: 'directory', label: '目录' }, { value: 'page', label: '页面' }, { value: 'button', label: '按钮' }]} />
          </Form.Item>
          {type === 'page' ? (
            <Form.Item name="path" label="路径" rules={[{ required: true, message: '请输入路径' }]}>
              <Input autoComplete="off" placeholder="/documents" />
            </Form.Item>
          ) : null}
          {type === 'button' ? (
            <Form.Item name="permission" label="权限码" rules={[{ required: true, message: '请输入权限码' }]}>
              <Input autoComplete="off" placeholder="document:upload" />
            </Form.Item>
          ) : null}
          {type !== 'button' ? (
            <Form.Item name="icon" label="图标">
              <Select options={[
                { value: 'dashboard', label: '仪表盘' },
                { value: 'setting', label: '设置' },
                { value: 'user', label: '用户' },
                { value: 'team', label: '角色' },
                { value: 'menu', label: '菜单' },
                { value: 'file', label: '文档' },
                { value: 'folder', label: '目录' },
              ]} />
            </Form.Item>
          ) : null}
          <Form.Item name="sort" label="排序">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="visible" label="在侧边栏显示" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
