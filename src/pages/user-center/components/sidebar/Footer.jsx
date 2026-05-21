import React from 'react'

function Footer() {
  const goBack = () => {
    // 设置标记，防止主应用重新拉取数据
    localStorage.setItem('dataJustSynced', Date.now().toString());
    window.location.href = '../';
  }

  return (
    <div className="sidebar-footer">
      <button className="sidebar-back-btn" onClick={goBack}>
        <i className="fas fa-arrow-left"></i>
        <span>返回首页</span>
      </button>
      <button className="sidebar-logout-btn">
        <i className="fas fa-sign-out-alt"></i>
        <span>退出登录</span>
      </button>
    </div>
  )
}

export default Footer