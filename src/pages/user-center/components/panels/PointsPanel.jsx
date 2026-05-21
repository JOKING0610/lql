import React from 'react'

function PointsPanel() {
  return (
    <div className="points-panel">
      <div className="panel-header">
        <h2 className="panel-title">积分</h2>
        <p className="panel-subtitle">查看积分记录和兑换会员</p>
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

      {/* 积分兑换会员 */}
      <div className="content-card">
        <h3 className="card-title">积分兑换会员</h3>
        <div className="membership-options">
          <div className="membership-option">
            <div className="membership-option-days">7天</div>
            <div className="membership-option-cost">100积分</div>
          </div>
          <div className="membership-option">
            <div className="membership-option-days">30天</div>
            <div className="membership-option-cost">300积分</div>
          </div>
          <div className="membership-option">
            <div className="membership-option-days">90天</div>
            <div className="membership-option-cost">800积分</div>
          </div>
          <div className="membership-option">
            <div className="membership-option-days">365天</div>
            <div className="membership-option-cost">2500积分</div>
          </div>
        </div>
        <button className="redeem-btn">
          <i className="fas fa-exchange-alt"></i>
          <span>兑换会员</span>
        </button>
      </div>

      {/* 积分记录 */}
      <div className="content-card">
        <h3 className="card-title">积分记录</h3>
        <div className="points-history-list">
          <div className="empty-state">
            <i className="fas fa-coins"></i>
            <p>暂无积分记录</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PointsPanel