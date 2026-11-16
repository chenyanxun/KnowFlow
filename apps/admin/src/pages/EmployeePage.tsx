import { App, Button, Form, Input, Modal, Popconfirm, Space, Table, Tag, Typography } from 'antd'
import { useState } from 'react'
import { formatTime } from '../access'
import { useStore } from '../store'
import type { AccountStatus, Employee } from '../types'

interface EmployeeForm {
  username: string
  name: string
  password?: string
}

export default function EmployeePage() {
  const store = useStore()
  const { message } = App.useApp()
  const [form] = Form.useForm<EmployeeForm>()
  const [passwordForm] = Form.useForm<{ password: string }>()
  const [keyword, setKeyword] = useState('')
  const [editing, setEditing] = useState<Employee | null>(null)
  const [open, setOpen] = useState(false)
  const [resetId, setResetId] = useState<string | null>(null)

  const data = store.db.employees.filter((employee) => {
    const text = `${employee.username} ${employee.name}`.toLowerCase()
    return text.includes(keyword.trim().toLowerCase())
  })

  const openCreate = () => {
    setEditing(null)
    form.setFieldsValue({ username: '', name: '', password: '' })
    setOpen(true)
  }

  const openEdit = (employee: Employee) => {
    setEditing(employee)
    form.setFieldsValue({ username: employee.username, name: employee.name })
    setOpen(true)
  }

  return (
    <div className="page">
      <div className="page-bar">
        <Typography.Title level={4} style={{ margin: 0 }}>员工账号</Typography.Title>
        {store.can('employee:create') ? <Button type="primary" onClick={openCreate}>新建员工</Button> : null}
      </div>
      <Input.Search allowClear autoComplete="off" placeholder="搜索账号或姓名" onSearch={setKeyword} onChange={(event) => setKeyword(event.target.value)} style={{ maxWidth: 280 }} />
      <Table
        rowKey="id"
        dataSource={data}
        columns={[
          { title: '账号', dataIndex: 'username' },
          { title: '姓名', dataIndex: 'name' },
          {
            title: '状态',
            dataIndex: 'status',
            render: (status: AccountStatus) => status === 'enabled' ? <Tag color="success">启用</Tag> : <Tag>停用</Tag>,
          },
          { title: '创建时间', dataIndex: 'createdAt', render: (value: string) => formatTime(value) },
          {
            title: '操作',
            render: (_, employee: Employee) => (
              <Space>
                {store.can('employee:update') ? <Button type="link" onClick={() => openEdit(employee)}>编辑</Button> : null}
                {store.can('employee:reset-password') ? (
                  <Button type="link" onClick={() => { setResetId(employee.id); passwordForm.resetFields() }}>重置密码</Button>
                ) : null}
                {store.can('employee:disable') ? (
                  <Popconfirm
                    title={employee.status === 'enabled' ? '停用这个员工？' : '重新启用这个员工？'}
                    onConfirm={async () => {
                      const result = await store.setEmployeeStatus(employee.id, employee.status === 'enabled' ? 'disabled' : 'enabled')
                      if (!result.ok) message.error(result.message)
                    }}
                  >
                    <Button type="link">{employee.status === 'enabled' ? '停用' : '启用'}</Button>
                  </Popconfirm>
                ) : null}
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editing ? '编辑员工' : '新建员工'}
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
            const result = await store.saveEmployee({
              username: values.username,
              name: values.name,
              password: values.password,
              status: 'enabled',
            }, editing?.id)
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
            <Form.Item name="password" label="初始密码" rules={[{ required: true, min: 6, message: '密码至少 6 位' }]}>
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          )}
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
            const result = await store.resetEmployeePassword(resetId, values.password)
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
