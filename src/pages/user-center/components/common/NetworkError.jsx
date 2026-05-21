import React from 'react'

function NetworkError({ error, onRetry }) {
  const getErrorMessage = (error) => {
    if (!error) return '发生未知错误'
    
    const msg = (error?.message || String(error)).toLowerCase()
    
    if (!navigator.onLine) {
      return '无法连接至网络，请检查网络连接后重试'
    }
    
    if (msg.includes('timeout') || msg.includes('超时')) {
      return '网络连接超时，请稍后再试'
    }
    
    if (msg.includes('failed to fetch') || msg.includes('networkerror')) {
      return '无法连接到服务器，请检查网络连接或稍后再试'
    }
    
    if (msg.includes('cors') || msg.includes('blocked')) {
      return '请求被拒绝，请稍后再试'
    }
    
    if (error?.message && error.message.length < 50) {
      return error.message
    }
    
    return '操作失败，请检查网络连接后重试'
  }

  return (
    <div className="network-error">
      <h3>连接错误</h3>
      <p>{getErrorMessage(error)}</p>
      {onRetry && (
        <button onClick={onRetry}>
          <i className="fas fa-sync-alt"></i>
          <span>重试</span>
        </button>
      )}
    </div>
  )
}

export default NetworkError