import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth'

export default function LoginPage() {
  const auth = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setPending(true)
    const message = await auth.login(username.trim(), password)
    setError(message ?? '')
    setPending(false)
  }

  return (
    <div className="login">
      <form onSubmit={(event) => void submit(event)} autoComplete="off">
        <p className="eyebrow">KnowFlow</p>
        <h1>企业知识库</h1>
        <label>
          账号
          <input value={username} autoComplete="off" onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label>
          密码
          <input type="password" value={password} autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" disabled={pending || !username.trim() || !password}>{pending ? '正在登录…' : '登录'}</button>
      </form>
    </div>
  )
}
