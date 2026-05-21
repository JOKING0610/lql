import React, { useState, useEffect } from 'react'
import { ThemeProvider } from './contexts/ThemeContext'
import { UserProvider } from './contexts/UserContext'
import { SupabaseProvider } from './contexts/SupabaseContext'
import UserCenterLayout from './components/layout/UserCenterLayout'
import Toast from './components/common/Toast'
import NetworkError from './components/common/NetworkError'

function UserCenterApp() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    // 模拟初始化过程
    const initializeApp = async () => {
      try {
        // 这里可以添加初始化逻辑
        // 比如检查用户状态、加载主题等
        await new Promise(resolve => setTimeout(resolve, 100))
        setIsLoading(false)
      } catch (err) {
        setError(err)
        setIsLoading(false)
      }
    }

    initializeApp()
  }, [])

  if (isLoading) {
    return (
      <div className="user-center-loading">
        <div className="loading-spinner"></div>
        <p>加载中...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="user-center-error">
        <NetworkError error={error} onRetry={() => window.location.reload()} />
      </div>
    )
  }

  return (
    <ThemeProvider>
      <SupabaseProvider>
        <UserProvider>
          <div className="user-center-app">
            <UserCenterLayout />
            <Toast />
          </div>
        </UserProvider>
      </SupabaseProvider>
    </ThemeProvider>
  )
}

export default UserCenterApp