import { App, Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd'
import { useState } from 'react'
import { formatTime } from '../access'
import { useStore } from '../store'
import type { Account, AccountStatus } from '../types'

interface AccountForm {
  username: string
  name: string
  password?: string
  roleIds: string[]
  status: AccountStatus
}

export default function UserPage() {
  const store = useStore()
  const { message } = App.useApp()
  const [form] = Form.useForm<AccountForm>()
  const [passwordForm] = Form.useForm<{ password: string }>()
  const [keyword, setKeyword] = useState('')
  const [editing, setEditing] = useState<Account | null>(null)
  const [open, setOpen] = useState(false)
  const [resetId, setResetId] = useState<string | null>(null)

  const data = store.db.accounts.filter((account) => {
    const text = `${account.username} ${account.name}`.toLowerCase()
    return text.includes(keyword.trim().toLowerCase())
  })

  const openCreate = () => {
    setEditing(null)
    form.setFieldsValue({ username: '', name: '', password: '', roleIds: [], status: 'enabled' })
    setOpen(true)
  }

  const openEdit = (account: Account) => {
    setEditing(account)
    form.setFieldsValue({
      username: account.username,
      name: account.name,
      roleIds: account.roleIds,
      status: account.status,
    })
    setOpen(true)
  }

  return (
    <div className="page">
      <div className="page-bar">
        <Typography.Title level={4} style={{ margin: 0 }}>用户管理</Typography.Title>
        {store.can('user:create') ? <Button type="primary" onClick={openCreate}>新建用户</Button> : null}
      </div>
      <Input.Search allowClear autoComplete="off" placeholder="搜索账号或姓名" onSearch={setKeyword} onChange={(event) => setKeyword(event.target.value)} style={{ maxWidth: 280 }} />
      <Table
        rowKey="id"
        dataSource={data}
        columns={[
          { title: '账号', dataIndex: 'username' },
          { title: '姓名', dataIndex: 'name' },
          {
            title: '角色',
            dataIndex: 'roleIds',
            render: (ids: string[]) => ids.map((id) => store.db.roles.find((role) => role.id === id)?.name).filter(Boolean).join('、') || '—',
          },
          {
            title: '状态',
            dataIndex: 'status',
            render: (status: AccountStatus) => status === 'enabled' ? <Tag color="success">启用</Tag> : <Tag>停用</Tag>,
          },
          { title: '创建时间', dataIndex: 'createdAt', render: (value: string) => formatTime(value) },
          {
            title: '操作',
            render: (_, account: Account) => (
              <Space>
                {store.can('user:update') ? <Button type="link" onClick={() => openEdit(account)}>编辑</Button> : null}
                {store.can('user:reset-password') ? (
                  <Button type="link" onClick={() => { setResetId(account.id); passwordForm.resetFields() }}>重置密码</Button>
                ) : null}
                {store.can('user:disable') && account.id !== store.current?.id ? (
                  <Popconfirm
                    title={account.status === 'enabled' ? '停用这个用户？' : '重新启用这个用户？'}
                    onConfirm={async () => {
                      const result = await store.saveAccount({
                        username: account.username,
                        name: account.name,
                        roleIds: account.roleIds,
                        status: account.status === 'enabled' ? 'disabled' : 'enabled',
                      }, account.id)
                      if (!result.ok) message.error(result.message)
                    }}
                  >
                    <Button type="link">{account.status === 'enabled' ? '停用' : '启用'}</Button>
                  </Popconfirm>
                ) : null}
                {store.can('user:update') ? (
                  <Popconfirm
                    title="删除这个用户？"
                    onConfirm={async () => {
                      const result = await store.removeAccount(account.id)
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
        title={editing ? '编辑用户' : '新建用户'}
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
            const result = await store.saveAccount(values, editing?.id)
            if (!result.ok) {
              message.error(result.message)
              return
            }
            setOpen(false)
            message.success('已保存')
          }}
        >
          <Form.Item name="username" label="账号" rules={[{ required: true, message: '请输入账号' }]}>
            <Input autoComplete="off" disabled={Boolean(editing)} />
          </Form.Item>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input autoComplete="off" />
          </Form.Item>
          {editing ? null : (
            <Form.Item name="password" label="密码" rules={[{ required: true, min: 6, message: '密码至少 6 位' }]}>
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          )}
          <Form.Item name="roleIds" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select mode="multiple" options={store.db.roles.map((role) => ({ value: role.id, label: role.name }))} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select options={[{ value: 'enabled', label: '启用' }, { value: 'disabled', label: '停用' }]} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="重置密码"
        open={Boolean(resetId)}
        onCancel={() => setResetId(null)}
        onOk={() => passwordForm.submit()}
        destroyOnHidden
      >
        <Form
          form={passwordForm}
          autoComplete="off"
          layout="vertical"
          onFinish={async (values) => {
            if (!resetId) return
            const result = await store.resetPassword(resetId, values.password)
            if (!result.ok) {
              message.error(result.message)
              return
            }
            setResetId(null)
            message.success('密码已重置')
          }}
        >
          <Form.Item name="password" label="新密码" rules={[{ required: true, min: 6, message: '密码至少 6 位' }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
