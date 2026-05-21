import React from 'react'

function AccountPanel() {
  return (
    <div className="account-panel">
      <div className="panel-header">
        <h2 className="panel-title">账号</h2>
        <p className="panel-subtitle">管理您的账号信息和设置</p>
      </div>

      {/* 统计卡片 */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-icon">
            <i className="fas fa-play"></i>
          </div>
          <div className="stat-card-value">0</div>
          <div className="stat-card-label">总播放</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">
            <i className="fas fa-clock"></i>
          </div>
          <div className="stat-card-value">0秒</div>
          <div className="stat-card-label">播放时长</div>
        </div>
      </div>

      {/* 积分概览 */}
      <div className="content-card">
        <h3 className="card-title">积分概览</h3>
        <div className="points-overview">
          <div className="points-item">
            <div className="points-num">0</div>
            <div className="points-label">普通积分</div>
          </div>
          <div className="points-item">
            <div className="points-num">0</div>
            <div className="points-label">会员积分</div>
          </div>
        </div>
      </div>

      {/* 功能菜单 */}
      <div className="content-card">
        <h3 className="card-title">功能菜单</h3>
        <div className="menu-list">
          <div className="menu-item">
            <div className="menu-icon">
              <i className="fas fa-coins"></i>
            </div>
            <div className="menu-text">
              <div className="menu-title">积分记录</div>
              <div className="menu-desc">查看积分获取和使用记录</div>
            </div>
            <i className="fas fa-chevron-right menu-arrow"></i>
          </div>
          <div className="menu-item">
            <div className="menu-icon">
              <i className="fas fa-crown"></i>
            </div>
            <div className="menu-text">
              <div className="menu-title">会员中心</div>
              <div className="menu-desc">管理会员状态和权益</div>
            </div>
            <i className="fas fa-chevron-right menu-arrow"></i>
          </div>
          <div className="menu-item">
            <div className="menu-icon">
              <i className="fas fa-history"></i>
            </div>
            <div className="menu-text">
              <div className="menu-title">播放历史</div>
              <div className="menu-desc">查看最近播放的歌曲</div>
            </div>
            <i className="fas fa-chevron-right menu-arrow"></i>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AccountPanel