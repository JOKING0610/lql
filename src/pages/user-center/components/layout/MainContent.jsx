import React from 'react'
import AccountPanel from '../panels/AccountPanel'
import PointsPanel from '../panels/PointsPanel'
import HistoryPanel from '../panels/HistoryPanel'

function MainContent({ activePanel, onToggleSidebar }) {
  const panelComponents = {
    account: AccountPanel,
    points: PointsPanel,
    history: HistoryPanel,
  }

  const PanelComponent = panelComponents[activePanel] || AccountPanel

  return (
    <main className="main-content">
      {/* 顶部栏 - 移动端可见 */}
      <div className="top-bar">
        <button 
          className="hamburger-btn"
          onClick={onToggleSidebar}
        >
          <i className="fas fa-bars"></i>
        </button>
        <h1 className="top-bar-title">用户中心</h1>
      </div>

      {/* 内容面板 */}
      <div className="content-panel active">
        <PanelComponent />
      </div>
    </main>
  )
}

export default MainContent