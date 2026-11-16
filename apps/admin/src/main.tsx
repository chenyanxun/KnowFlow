import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App as AntdApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App.tsx'
import { StoreProvider } from './store.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1f4b99',
          colorBgLayout: '#f3f5f8',
          borderRadius: 6,
        },
        components: {
          Layout: {
            siderBg: '#0f1c2e',
            triggerBg: '#0f1c2e',
          },
          Menu: {
            darkItemBg: '#0f1c2e',
            darkSubMenuItemBg: '#0b1626',
            darkItemSelectedBg: '#1f4b99',
          },
        },
      }}
    >
      <AntdApp>
        <StoreProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </StoreProvider>
      </AntdApp>
    </ConfigProvider>
  </StrictMode>,
)
