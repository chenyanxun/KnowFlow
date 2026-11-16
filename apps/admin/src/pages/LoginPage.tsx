import { Alert, Button, Form, Input, Typography } from 'antd'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useStore } from '../store'

export default function LoginPage() {
  const store = useStore()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  if (store.current) return <Navigate to={store.homePath()} replace />

  return (
    <div className="login-page">
      <section className="login-brand">
        <div className="brand-copy">
          <div className="logo-mark">K</div>
          <Typography.Title style={{ color: '#fff', margin: '24px 0 0' }}>KnowFlow</Typography.Title>
          <Typography.Paragraph style={{ color: 'rgba(255,255,255,0.72)', fontSize: 16, marginBottom: 0 }}>
            企业内部知识库
          </Typography.Paragraph>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <Typography.Title level={3} style={{ marginTop: 0 }}>登录</Typography.Title>
          <Form
            autoComplete="off"
            layout="vertical"
            requiredMark={false}
            onFinish={async (values: { username: string; password: string }) => {
              const result = await store.login(values.username, values.password)
              if (!result.ok) {
                setError(result.message)
                return
              }
              navigate(result.path, { replace: true })
            }}
          >
            <Form.Item name="username" label="账号" rules={[{ required: true, message: '请输入账号' }]}>
              <Input size="large" placeholder="请输入账号" autoComplete="off" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password size="large" placeholder="请输入密码" autoComplete="new-password" />
            </Form.Item>
            {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
            <Button type="primary" htmlType="submit" size="large" block>登录</Button>
          </Form>
        </div>
      </section>
    </div>
  )
}
