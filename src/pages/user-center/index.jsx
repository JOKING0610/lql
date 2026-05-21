import React from 'react'
import ReactDOM from 'react-dom/client'
import UserCenterApp from './UserCenterApp'
import './styles/UserCenter.css'

// 检查是否应该显示用户中心（路径路由：/lql/usercenter）
function shouldShowUserCenter() {
  const path = window.location.pathname
  return path.endsWith('/usercenter') || path.endsWith('/usercenter/')
}

// 主应用入口
function App() {
  if (shouldShowUserCenter()) {
    return <UserCenterApp />
  }
  
  // 如果不是用户中心，显示主应用
  // 这里可以加载主应用逻辑，或者重定向到主应用
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      fontFamily: 'DM Sans, sans-serif'
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1>零柒零音乐</h1>
        <p>正在加载主应用...</p>
        <button 
          onClick={() => window.location.href = './index.html'}
          style={{
            padding: '10px 20px',
            marginTop: '20px',
            background: '#000',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          返回主应用
        </button>
      </div>
    </div>
  )
}

// 渲染应用
const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)