import React from 'react'
import UserInfo from './UserInfo'
import Stats from './Stats'
import Navigation from './Navigation'
import ThemeSwitcher from './ThemeSwitcher'
import Footer from './Footer'

function Sidebar({ isOpen, activePanel, onToggle, onSwitchPanel }) {
  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      {/* 彩虹条装饰 */}
      <div className="sidebar-header-decor"></div>
      
      {/* 用户信息 */}
      <UserInfo />
      
      {/* 统计数据 */}
      <Stats />
      
      {/* 导航菜单 */}
      <Navigation 
        activePanel={activePanel}
        onSwitchPanel={onSwitchPanel}
      />
      
      {/* 主题切换 */}
      <ThemeSwitcher />
      
      {/* 底部按钮 */}
      <Footer />
    </aside>
  )
}

export default Sidebar