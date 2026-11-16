import { App, Button, Form, Input, Modal, Popconfirm, Space, Table, Tag, Tree, Typography } from 'antd'
import type { DataNode } from 'antd/es/tree'
import { useState } from 'react'
import { useStore } from '../store'
import type { MenuItem, Role } from '../types'

function menuTree(menus: MenuItem[], parentId: string | null): DataNode[] {
  return menus
    .filter((menu) => menu.parentId === parentId)
    .sort((a, b) => a.sort - b.sort)
    .map((menu) => ({
      key: menu.id,
      title: menu.name,
      children: menuTree(menus, menu.id),
    }))
}

export default function RolePage() {
  const store = useStore()
  const { message } = App.useApp()
  const [form] = Form.useForm<{ name: string; code: string }>()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Role | null>(null)
  const [checked, setChecked] = useState<string[]>([])

  const openCreate = () => {
    setEditing(null)
    form.setFieldsValue({ name: '', code: '' })
    setChecked([])
    setOpen(true)
  }

  const openEdit = (role: Role) => {
    setEditing(role)
    form.setFieldsValue({ name: role.name, code: role.code })
    setChecked(role.menuIds)
    setOpen(true)
  }

  return (
    <div className="page">
      <div className="page-bar">
        <Typography.Title level={4} style={{ margin: 0 }}>角色管理</Typography.Title>
        {store.can('role:create') ? <Button type="primary" onClick={openCreate}>新建角色</Button> : null}
      </div>
      <Table
        rowKey="id"
        dataSource={store.db.roles}
        columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '编码', dataIndex: 'code' },
          {
            title: '类型',
            dataIndex: 'isSystem',
            render: (isSystem: boolean) => isSystem ? <Tag color="blue">系统</Tag> : <Tag>自定义</Tag>,
          },
          {
            title: '操作',
            render: (_, role: Role) => (
              <Space>
                {store.can('role:update') || store.can('role:assign') ? (
                  <Button type="link" onClick={() => openEdit(role)}>编辑</Button>
                ) : null}
                {store.can('role:delete') && !role.isSystem ? (
                  <Popconfirm
                    title="删除这个角色？"
                    onConfirm={async () => {
                      const result = await store.removeRole(role.id)
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
      <Modal
        title={editing ? '编辑角色' : '新建角色'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form
          form={form}
          autoComplete="off"
          layout="vertical"
          onFinish={async (values) => {
            const result = await store.saveRole({ ...values, menuIds: checked }, editing?.id)
            if (!result.ok) {
              message.error(result.message)
              return
            }
            setOpen(false)
            message.success('已保存')
          }}
        >
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item name="code" label="编码" rules={[{ required: true, message: '请输入编码' }]}>
            <Input autoComplete="off" disabled={editing?.isSystem} />
          </Form.Item>
          <Typography.Text>菜单权限</Typography.Text>
          <div className="tree-box">
            <Tree
              checkable
              defaultExpandAll
              checkedKeys={checked}
              treeData={menuTree(store.db.menus, null)}
              onCheck={(keys) => {
                const list = Array.isArray(keys) ? keys : keys.checked
                setChecked(list.map(String))
              }}
            />
          </div>
        </Form>
      </Modal>
    </div>
  )
}
