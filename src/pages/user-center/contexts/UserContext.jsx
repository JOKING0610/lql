import React, { createContext, useContext, useState, useEffect } from 'react'

const UserContext = createContext()

export function UserProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // 检查登录状态
  const checkLoginState = () => {
    const loggedIn = localStorage.getItem('userLoggedIn') === 'true'
    const userData = JSON.parse(localStorage.getItem('vipUser') || '{}')

    if (loggedIn && userData.username) {
      setUser(userData)
      setIsLoggedIn(true)
    } else {
      setUser(null)
      setIsLoggedIn(false)
    }
    setIsLoading(false)
  }

  // 登录
  const handleLogin = async (username, password) => {
    // 这里会调用Supabase进行登录
    // 暂时返回成功
    const mockUser = {
      id: 'mock-user-id',
      username: username,
      avatar_url: '',
      is_member: false,
      is_permanent_member: false,
      member_days_remaining: 0,
      member_end_time: null
    }

    localStorage.setItem('sessionToken', 'mock-session-token')
    localStorage.setItem('vipUser', JSON.stringify(mockUser))
    localStorage.setItem('userLoggedIn', 'true')
    localStorage.setItem('username', username)

    setUser(mockUser)
    setIsLoggedIn(true)

    return { success: true }
  }

  // 注册
  const handleRegister = async (username, password, secretKey) => {
    // 这里会调用Supabase进行注册
    // 暂时返回成功
    const mockUser = {
      id: 'mock-user-id',
      username: username,
      avatar_url: '',
      is_member: false,
      is_permanent_member: false,
      member_days_remaining: 0,
      member_end_time: null
    }

    localStorage.setItem('sessionToken', 'mock-session-token')
    localStorage.setItem('vipUser', JSON.stringify(mockUser))
    localStorage.setItem('userLoggedIn', 'true')
    localStorage.setItem('username', username)

    setUser(mockUser)
    setIsLoggedIn(true)

    return { success: true }
  }

  // 退出登录
  const handleLogout = () => {
    localStorage.removeItem('sessionToken')
    localStorage.removeItem('vipUser')
    localStorage.removeItem('userLoggedIn')
    localStorage.removeItem('username')

    setUser(null)
    setIsLoggedIn(false)
  }

  // 更新用户信息
  const updateUser = (userData) => {
    setUser(prev => ({ ...prev, ...userData }))
    localStorage.setItem('vipUser', JSON.stringify({ ...user, ...userData }))
  }

  // 初始化时检查登录状态
  useEffect(() => {
    checkLoginState()
  }, [])

  const value = {
    user,
    isLoggedIn,
    isLoading,
    handleLogin,
    handleRegister,
    handleLogout,
    updateUser,
    checkLoginState
  }

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const context = useContext(UserContext)
  if (!context) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return context
}

export default UserContext