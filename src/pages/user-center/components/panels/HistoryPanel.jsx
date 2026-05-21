import React from 'react'

function HistoryPanel() {
  return (
    <div className="history-panel">
      <div className="panel-header">
        <h2 className="panel-title">播放历史</h2>
        <p className="panel-subtitle">查看最近播放的歌曲</p>
      </div>

      {/* 播放历史列表 */}
      <div className="content-card">
        <h3 className="card-title">最近播放</h3>
        <div className="play-history-list">
          <div className="empty-state">
            <i className="fas fa-history"></i>
            <p>暂无播放记录</p>
          </div>
        </div>
        <button className="clear-history-btn">
          <i className="fas fa-trash"></i>
          <span>清空播放历史</span>
        </button>
      </div>
    </div>
  )
}

export default HistoryPanel