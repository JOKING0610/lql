import React, { useState, useEffect } from 'react'

function Toast() {
  const [visible, setVisible] = useState(false)
  const [message, setMessage] = useState('')
  const [type, setType] = useState('success')

  useEffect(() => {
    // 这里可以连接到全局状态管理
    // 暂时使用简单的事件监听
    const handleShowToast = (event) => {
      const { message, type = 'success' } = event.detail
      setMessage(message)
      setType(type)
      setVisible(true)
      
      setTimeout(() => {
        setVisible(false)
      }, 2500)
    }

    window.addEventListener('showToast', handleShowToast)
    
    return () => {
      window.removeEventListener('showToast', handleShowToast)
    }
  }, [])

  if (!visible) return null

  return (
    <div className={`toast ${type} show`}>
      {message}
    </div>
  )
}

// 全局显示Toast的函数
export const showToast = (message, type = 'success') => {
  window.dispatchEvent(new CustomEvent('showToast', {
    detail: { message, type }
  }))
}

export default Toast