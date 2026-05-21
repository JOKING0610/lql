import React, { useState } from 'react'
import Sidebar from '../sidebar/Sidebar'
import MainContent from './MainContent'

function UserCenterLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activePanel, setActivePanel] = useState('account')

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const closeSidebar = () => {
    setSidebarOpen(false)
  }

  const switchPanel = (panel) => {
    setActivePanel(panel)
    // 移动端切换面板时关闭侧边栏
    if (window.innerWidth <= 768) {
      closeSidebar()
    }
  }

  return (
    <div className="user-center-layout">
      {/* 移动端遮罩 */}
      {sidebarOpen && (
        <div 
          className="sidebar-overlay active"
          onClick={closeSidebar}
        />
      )}
      
      {/* 侧边栏 */}
      <Sidebar 
        isOpen={sidebarOpen}
        activePanel={activePanel}
        onToggle={toggleSidebar}
        onSwitchPanel={switchPanel}
      />
      
      {/* 主内容区 */}
      <MainContent 
        activePanel={activePanel}
        onToggleSidebar={toggleSidebar}
      />
    </div>
  )
}

export default UserCenterLayout