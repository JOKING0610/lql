import React from 'react'

function UserInfo() {
  return (
    <div className="sidebar-user">
      <div className="sidebar-avatar">
        <i className="fas fa-user"></i>
      </div>
      <div className="sidebar-user-name">未登录</div>
      <div className="sidebar-user-role">普通用户</div>
    </div>
  )
}

export default UserInfo