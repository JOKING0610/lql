import React from 'react'

function Navigation({ activePanel, onSwitchPanel }) {
  const navItems = [
    { id: 'account', icon: 'fa-user', label: '账号' },
    { id: 'points', icon: 'fa-coins', label: '积分' },
    { id: 'history', icon: 'fa-history', label: '播放历史' },
  ]

  return (
    <nav className="sidebar-nav">
      <div className="sidebar-nav-label">导航</div>
      {navItems.map(item => (
        <button
          key={item.id}
          className={`nav-item ${activePanel === item.id ? 'active' : ''}`}
          onClick={() => onSwitchPanel(item.id)}
        >
          <div className="nav-icon">
            <i className={`fas ${item.icon}`}></i>
          </div>
          <span>{item.label}</span>
          <i className="fas fa-chevron-right sidebar-nav-arrow"></i>
        </button>
      ))}
    </nav>
  )
}

export default Navigation