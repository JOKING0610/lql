import { useEffect, useRef } from 'react'

/**
 * App component - thin React wrapper around the original music app HTML structure.
 * All original DOM IDs, classes, and HTML structure are preserved exactly.
 * Original JavaScript logic is loaded after mount via dynamic script injection.
 */
function App() {
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    // Apply saved theme before JS loads to prevent flash
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme === 'dark' || (savedTheme && savedTheme.startsWith('dark'))) {
      document.documentElement.classList.add('dark-theme')
    }

    // Load the marquee/utility script first, then the main app script
    const loadScript = (src) => {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = src
        script.onload = resolve
        script.onerror = reject
        document.body.appendChild(script)
      })
    }

    // Load the marquee/utility script first, then the main app script
    // Since DOMContentLoaded already fired, we manually trigger the initialization
    // by dispatching DOMContentLoaded to all existing listeners in app.js
    import('./lib/marquee.js').then(() => {
      import('./lib/app.js').then(() => {
        if (typeof window._appInitialized === 'undefined') {
          window._appInitialized = true
          // Dispatch DOMContentLoaded so all existing app.js listeners fire
          // This is safe because we check for existing state inside each handler
          document.dispatchEvent(new Event('DOMContentLoaded'))
        }
      }).catch(console.error)
    }).catch(console.error)
  }, [])

  return (
    <>
      {/* 星空画布背景 */}
      <div className="star-canvas-container">
        <canvas id="starCanvas"></canvas>
      </div>

      <div className="app">
        {/* 主页 */}
        <div className="page" id="homePage" style={{display: 'none'}}>
          <div className="home-container">
            <div className="home-header">
              <h1 className="home-title">零柒零音乐&nbsp;&nbsp;0.3</h1>
              <p className="home-subtitle">极简▪优美</p>
              <div className="home-stats-card">
                <div className="stats-icon">
                  <i className="fas fa-chart-line"></i>
                </div>
                <div className="stats-content">
                  <div className="stats-label">站点访问</div>
                  <div className="stats-value-container">
                    <span id="siteVisitCount">加载中...</span>
                    <span className="stats-unit" id="siteVisitUnit" style={{display: 'none'}}>次</span>
                  </div>
                </div>
                <button className="stats-refresh-btn" onClick={() => window.updateSiteVisitCount && window.updateSiteVisitCount()} title="刷新访问次数">
                  <i className="fas fa-sync-alt"></i>
                </button>
              </div>
            </div>



            {/* 公告卡片 */}
            <div className="home-announcement" id="homeAnnouncement">
              <div className="announcement-header">
                <i className="fas fa-bullhorn"></i>
                <span>公告栏</span>
                <button className="announcement-refresh" id="refreshAnnouncementBtn" title="刷新公告">
                  <i className="fas fa-sync-alt"></i>
                </button>
              </div>
              <div className="announcement-list" id="announcementList">
                <div className="announcement-loading"><i className="fas fa-spinner fa-spin"></i> 加载中...</div>
              </div>
            </div>
          </div>
        </div>

        {/* 网易云搜索页面 */}
        <div className="page" id="wyPage" style={{display: 'none'}}>
          <div className="search-container">
            <div className="search-wrapper">
              <div className="search-input-group">
                <input type="text" className="search-input" id="wySearchInput" placeholder="请输入搜索内容..." autoComplete="off" />
                <button className="search-clear" id="wySearchClear"><i className="fas fa-times-circle"></i></button>
              </div>
              <button className="search-btn" id="wySearchBtn">
                <i className="fas fa-search"></i>
              </button>
            </div>
          </div>

          <div className="toolbar">
            <div className="toolbar-actions">
              <button className="icon-btn" id="wyPlaylistBtn" title="播放列表">
                <i className="fas fa-list"></i>
              </button>
            </div>
          </div>

          <div className="history-section" id="wyHistorySection">
            <div className="history-header">
              <span className="history-title"><i className="fas fa-clock-rotate-left"></i> 最近搜索</span>
              <button className="history-clear" id="wyClearHistoryBtn">清空</button>
            </div>
            <div className="history-list" id="wyHistoryList"></div>
          </div>

          <div className="results-section">
            <div className="loading-overlay" id="wyLoadingOverlay" style={{display: 'none'}}>
              <div className="loading-info">
                <div className="spinner"></div>
              </div>
            </div>
            <div className="empty-state" id="wyEmptyState">
              <div className="empty-icon">
                <i className="fas fa-compact-disc"></i>
              </div>
              <p className="empty-title">启程音乐之旅</p>
              <p className="empty-desc">输入关键词，遇见心动旋律</p>
            </div>
            <ul className="song-list" id="wySongList"></ul>
            <div className="load-more" id="wyLoadMoreContainer" style={{display: 'none'}}>
              <button className="load-more-btn" id="wyLoadMoreBtn">加载更多 <i className="fas fa-chevron-down"></i></button>
            </div>
          </div>
        </div>

        {/* Bilibili搜索页面 */}
        <div className="page" id="biliPage" style={{display: 'none'}}>
          <div className="search-container">
            <div className="search-wrapper">
              <div className="search-input-group">
                <input type="text" className="search-input" id="biliSearchInput" placeholder="请输入搜索内容..." autoComplete="off" />
                <button className="search-clear" id="biliSearchClear"><i className="fas fa-times-circle"></i></button>
              </div>
              <button className="search-btn" id="biliSearchBtn">
                <i className="fas fa-search"></i>
              </button>
            </div>
          </div>

          <div className="toolbar">
            <div className="toolbar-actions">
              <button className="icon-btn" id="biliPlaylistBtn" title="播放列表">
                <i className="fas fa-list"></i>
              </button>
            </div>
          </div>

          <div className="history-section" id="biliHistorySection">
            <div className="history-header">
              <span className="history-title"><i className="fas fa-clock-rotate-left"></i> 最近搜索</span>
              <button className="history-clear" id="biliClearHistoryBtn">清空</button>
            </div>
            <div className="history-list" id="biliHistoryList"></div>
          </div>

          <div className="results-section">
            <div className="loading-overlay" id="biliLoadingOverlay" style={{display: 'none'}}>
              <div className="loading-info">
                <div className="spinner"></div>
              </div>
            </div>
            <div id="biliResultsContainer">
              <div className="empty-state" id="biliEmptyState">
                <div className="empty-icon">
                  <i className="fab fa-bilibili"></i>
                </div>
                <p className="empty-title">探索Bilibili音乐区</p>
                <p className="empty-desc">输入UP主或歌名试试</p>
              </div>
            </div>
            <ul className="song-list" id="biliSongList"></ul>
            <div className="load-more" id="biliLoadMoreContainer" style={{display: 'none'}}>
              <button className="load-more-btn" id="biliLoadMoreBtn">加载更多 <i className="fas fa-chevron-down"></i></button>
            </div>
          </div>
        </div>

        {/* QQ音乐搜索页面 */}
        <div className="page" id="qqPage" style={{display: 'none'}}>
          <div className="search-container">
            <div className="search-wrapper">
              <div className="search-input-group">
                <input type="text" className="search-input" id="qqSearchInput" placeholder="请输入歌曲名或歌手..." autoComplete="off" />
                <button className="search-clear" id="qqSearchClear"><i className="fas fa-times-circle"></i></button>
              </div>
              <button className="search-btn" id="qqSearchBtn">
                <i className="fas fa-search"></i>
              </button>
            </div>
          </div>

          <div className="toolbar">
            <div className="toolbar-actions">
              <button className="icon-btn" id="qqPlaylistBtn" title="播放列表">
                <i className="fas fa-list"></i>
              </button>
            </div>
          </div>

          <div className="history-section" id="qqHistorySection">
            <div className="history-header">
              <span className="history-title"><i className="fas fa-clock-rotate-left"></i> 最近搜索</span>
              <button className="history-clear" id="qqClearHistoryBtn">清空</button>
            </div>
            <div className="history-list" id="qqHistoryList"></div>
          </div>

          <div className="results-section">
            <div className="loading-overlay" id="qqLoadingOverlay" style={{display: 'none'}}>
              <div className="spinner"></div>
            </div>
            <div className="empty-state" id="qqEmptyState">
              <div className="empty-icon"><i className="fab fa-qq"></i></div>
              <p className="empty-title">QQ音乐搜歌</p>
              <p className="empty-desc">输入歌曲或歌手，发现好音乐</p>
            </div>
            <ul className="song-list" id="qqSongList"></ul>
            <div className="load-more" id="qqLoadMoreContainer" style={{display: 'none'}}>
              <button className="load-more-btn" id="qqLoadMoreBtn">加载更多 <i className="fas fa-chevron-down"></i></button>
            </div>
          </div>
        </div>

        {/* 个人页面 */}
        <div className="page" id="profilePage" style={{display: 'none'}}>
          <div className="profile-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 0'}}>
            <div style={{display: 'flex', gap: '16px', alignItems: 'flex-start'}}>
              <div className="profile-avatar" id="profileAvatar">
                <div className="avatar-container">
                  <div className="avatar-inner">
                    <i className="fas fa-user"></i>
                  </div>
                  <div className="avatar-border"></div>
                </div>
              </div>
              <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                <div>
                  <h2 className="profile-name" id="profileName" style={{marginBottom: '4px'}}>访客</h2>
                  <p className="profile-desc" id="profileDesc" style={{fontSize: '13px'}}>登录以同步您的音乐数据</p>
                </div>
                <button className="login-action-btn" id="profileLoginBtn" onClick={() => window.openLoginPage && window.openLoginPage()}>
                  <i className="fas fa-sign-in-alt"></i> 登录 / 注册
                </button>
                <button className="login-action-btn" id="goUserCenterBtn" onClick={() => window.location.href = './user-center.html'} style={{background: 'var(--surface-elevated)', border: '1px solid var(--border)'}}>
                  <i className="fas fa-user-gear"></i> 前往用户中心
                </button>
                <div style={{display: 'flex', gap: '8px'}}>
                  <button className="login-action-btn" id="editAvatarBtn" style={{display: 'none'}}>
                    <i className="fas fa-camera"></i> 更换头像
                  </button>
                  <button className="login-action-btn logout" id="profileLogoutBtn" onClick={() => window.confirmLogout && window.confirmLogout()} style={{display: 'none'}}>
                    <i className="fas fa-sign-out-alt"></i> 退出登录
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="stats-section">
            <div className="stats-grid">
              <div className="stat-item">
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '8px', marginBottom: '12px', whiteSpace: 'nowrap'}}>
                  <i className="fas fa-play-circle" style={{color: 'var(--primary)', fontSize: '20px'}}></i>
                  <span style={{fontSize: '15px', color: 'var(--text)', whiteSpace: 'nowrap'}}>播放次数：</span>
                  <span className="stat-value" id="totalPlays" style={{fontSize: '24px', fontWeight: '700', margin: '0', whiteSpace: 'nowrap'}}>0</span>
                </div>
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '8px', whiteSpace: 'nowrap'}}>
                  <i className="fas fa-clock" style={{color: 'var(--primary)', fontSize: '20px'}}></i>
                  <span style={{fontSize: '15px', color: 'var(--text)', whiteSpace: 'nowrap'}}>播放时长：</span>
                  <span className="stat-value" id="totalPlayTime" style={{fontSize: '18px', fontWeight: '700', margin: '0', whiteSpace: 'nowrap'}}>0</span>
                </div>
              </div>
            </div>
          </div>

          <div className="section collapsible-section" id="pointsCollapsibleSection" style={{display: 'none'}}>
            <div className="section-header collapsible-header" onClick={() => window.togglePointsSection && window.togglePointsSection()} style={{background: 'linear-gradient(135deg, var(--accent-color) 0%, var(--accent-dark) 100%)', borderRadius: '16px', padding: '16px 20px', marginBottom: '0', cursor: 'pointer', transition: 'all 0.3s ease'}}>
              <h3 className="section-title" style={{color: 'var(--accent-text)', margin: '0', display: 'flex', alignItems: 'center', gap: '10px'}}>
                <i className="fas fa-coins" style={{fontSize: '18px'}}></i>
                <span style={{fontSize: '15px', fontWeight: '600'}}>我的积分</span>
              </h3>
              <button className="collapse-toggle" id="pointsCollapseToggle" style={{background: 'rgba(255, 255, 255, 0.2)', border: 'none', color: 'var(--accent-text)', cursor: 'pointer', padding: '8px 12px', borderRadius: '10px', transition: 'all 0.3s ease', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <i className="fas fa-chevron-down" style={{fontSize: '16px'}}></i>
              </button>
            </div>
            <div className="collapsible-content collapsed" id="pointsCollapsibleContent">
              <div className="points-display" id="pointsDisplay" style={{paddingBottom: '0', marginBottom: '0', background: 'rgba(255, 255, 255, 0.08)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: '16px', padding: '16px', border: '1px solid rgba(255, 255, 255, 0.1)'}}>
                <div className="points-total">
                  <span className="points-value" id="totalPointsValue">0</span>
                  <span className="points-label">普通积分</span>
                </div>
                <div className="points-total" style={{marginLeft: '20px'}}>
                  <span className="points-value" id="vipPointsValue">0</span>
                  <span className="points-label">会员积分</span>
                </div>
              </div>

              <div id="redeemCodeSection" style={{paddingTop: '16px', marginTop: '0', paddingBottom: '0', marginBottom: '0'}}>
                <div className="section-header" style={{marginBottom: '8px'}}>
                  <h3 className="section-title"><i className="fas fa-ticket-alt"></i> 兑换积分密钥</h3>
                </div>
                <div style={{background: 'rgba(255, 255, 255, 0.08)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: '16px', padding: '16px', border: '1px solid rgba(255, 255, 255, 0.1)', marginBottom: '0'}}>
                  <div style={{display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center'}}>
                    <input type="text" id="redeemCodeInput" placeholder="请输入积分密钥" style={{flex: '1', minWidth: '200px', padding: '12px 14px', border: '2px solid rgba(255, 255, 255, 0.2)', borderRadius: '10px', fontSize: '13px', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-primary)', outline: 'none', transition: 'all 0.3s ease', fontFamily: "'Monaco', 'Menlo', monospace"}} />
                    <button className="btn-primary" id="redeemBtn" onClick={() => window.redeemCode && window.redeemCode()} style={{padding: '12px 24px', borderRadius: '10px', fontSize: '13px', fontWeight: '500', background: 'linear-gradient(135deg, var(--accent-color), var(--accent-dark))', color: 'var(--accent-text)', border: '2px solid rgba(0, 0, 0, 0.2)', cursor: 'pointer', transition: 'all 0.3s ease', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 3px 10px rgba(var(--accent-rgb), 0.3)'}}>
                      <i className="fas fa-gift"></i> 兑换
                    </button>
                  </div>
                  <div id="redeemMessage" style={{marginTop: '10px', padding: '10px', borderRadius: '8px', display: 'none', fontSize: '13px', textAlign: 'center'}}></div>
                </div>
              </div>

              <div id="membershipRedeemSection" style={{paddingTop: '16px', marginTop: '0', paddingBottom: '0', marginBottom: '0'}}>
                <div className="section-header" style={{marginBottom: '8px'}}>
                  <h3 className="section-title"><i className="fas fa-crown"></i> 兑换会员</h3>
                </div>
                <div style={{background: 'rgba(255, 255, 255, 0.08)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderRadius: '16px', padding: '16px', border: '1px solid rgba(255, 255, 255, 0.1)', marginBottom: '0'}}>
                  <div id="currentMembershipStatus" style={{marginBottom: '16px', padding: '12px', background: '#fef3c7', borderRadius: '10px', color: '#92400e', fontSize: '13px', textAlign: 'center'}}>
                    <i className="fas fa-info-circle"></i> 点击下方按钮使用积分兑换会员时长
                  </div>
                  <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px'}}>
                    <button className="btn-outline" onClick={() => window.redeemMembership && window.redeemMembership(7, 'normal')} style={{padding: '12px', borderRadius: '10px'}}>
                      <div style={{fontSize: '16px', fontWeight: '600'}}>7天会员</div>
                      <div style={{fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px'}}>100积分</div>
                    </button>
                    <button className="btn-outline" onClick={() => window.redeemMembership && window.redeemMembership(30, 'normal')} style={{padding: '12px', borderRadius: '10px'}}>
                      <div style={{fontSize: '16px', fontWeight: '600'}}>30天会员</div>
                      <div style={{fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px'}}>350积分</div>
                    </button>
                    <button className="btn-outline" onClick={() => window.redeemMembership && window.redeemMembership(90, 'normal')} style={{padding: '12px', borderRadius: '10px'}}>
                      <div style={{fontSize: '16px', fontWeight: '600'}}>90天会员</div>
                      <div style={{fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px'}}>900积分</div>
                    </button>
                    <button className="btn-outline" onClick={() => window.redeemMembership && window.redeemMembership(365, 'normal')} style={{padding: '12px', borderRadius: '10px'}}>
                      <div style={{fontSize: '16px', fontWeight: '600'}}>1年会员</div>
                      <div style={{fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px'}}>3000积分</div>
                    </button>
                  </div>
                  <div style={{marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.1)'}}>
                    <div style={{fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px'}}>使用会员积分兑换（折扣价）：</div>
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px'}}>
                      <button className="btn-outline" onClick={() => window.redeemMembership && window.redeemMembership(7, 'vip')} style={{padding: '10px', borderRadius: '10px', background: 'rgba(251, 191, 36, 0.1)', borderColor: 'rgba(251, 191, 36, 0.3)'}}>
                        <div style={{fontSize: '14px', fontWeight: '600', color: '#fbbf24'}}>7天会员</div>
                        <div style={{fontSize: '11px', color: '#fbbf24', marginTop: '4px'}}>80会员积分</div>
                      </button>
                      <button className="btn-outline" onClick={() => window.redeemMembership && window.redeemMembership(30, 'vip')} style={{padding: '10px', borderRadius: '10px', background: 'rgba(251, 191, 36, 0.1)', borderColor: 'rgba(251, 191, 36, 0.3)'}}>
                        <div style={{fontSize: '14px', fontWeight: '600', color: '#fbbf24'}}>30天会员</div>
                        <div style={{fontSize: '11px', color: '#fbbf24', marginTop: '4px'}}>280会员积分</div>
                      </button>
                      <button className="btn-outline" onClick={() => window.redeemMembership && window.redeemMembership(90, 'vip')} style={{padding: '10px', borderRadius: '10px', background: 'rgba(251, 191, 36, 0.1)', borderColor: 'rgba(251, 191, 36, 0.3)'}}>
                        <div style={{fontSize: '14px', fontWeight: '600', color: '#fbbf24'}}>90天会员</div>
                        <div style={{fontSize: '11px', color: '#fbbf24', marginTop: '4px'}}>720会员积分</div>
                      </button>
                      <button className="btn-outline" onClick={() => window.redeemMembership && window.redeemMembership(365, 'vip')} style={{padding: '10px', borderRadius: '10px', background: 'rgba(251, 191, 36, 0.1)', borderColor: 'rgba(251, 191, 36, 0.3)'}}>
                        <div style={{fontSize: '14px', fontWeight: '600', color: '#fbbf24'}}>1年会员</div>
                        <div style={{fontSize: '11px', color: '#fbbf24', marginTop: '4px'}}>2400会员积分</div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div id="pointsHistorySection" style={{paddingTop: '12px', marginTop: '0'}}>
                <div className="section-header" style={{marginBottom: '8px'}}>
                  <h3 className="section-title"><i className="fas fa-history"></i> 积分记录</h3>
                </div>
                <div className="points-history-list" id="pointsHistoryList" style={{display: 'block'}}>
                  <div className="empty-state">
                    <i className="fas fa-coins"></i>
                    <p>暂无积分记录</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="section">
            <div className="section-header">
              <h3 className="section-title"><i className="fas fa-history"></i> 最近聆听</h3>
              <a href="#" className="section-more">查看全部</a>
            </div>
            <div className="recent-list" id="recentList">
              <div className="empty-state">
                <i className="fas fa-headphones"></i>
                <p>暂无播放记录</p>
              </div>
            </div>
          </div>
        </div>

        {/* 设置页面 */}
        <div className="page" id="settingsPage" style={{display: 'none'}}>
          <div className="settings-modern-container" style={{maxWidth: '800px', margin: '0 auto', padding: '20px 16px'}}>
            {/* 页面标题 */}
            <div style={{marginBottom: '32px'}}>
              <h2 style={{fontSize: '28px', fontWeight: '700', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px'}}>
                <i className="fas fa-cog" style={{color: 'var(--primary)'}}></i>
                设置
              </h2>
              <p style={{fontSize: '14px', color: 'var(--text-secondary)'}}>自定义您的使用体验</p>
            </div>

            {/* 主题设置卡片 */}
            <div className="settings-card" style={{borderRadius: '16px', padding: '24px', marginBottom: '3px'}}>
              <h3 style={{fontSize: '18px', fontWeight: '600', color: 'var(--text)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                <i className="fas fa-palette" style={{color: '#8b5cf6'}}></i>
                外观设置
              </h3>

              {/* 主题切换 - 保留原始结构 */}
              <div className="settings-group">
                <div className="settings-label">主题</div>
                <div className="theme-toggle-container">
                  <div aria-hidden="true" className="theme-toggle-bg"></div>
                  <div className="theme-toggle">
                    <div className="theme-toggle-pill" id="themeTogglePill"></div>
                    <button className="theme-toggle-btn" data-theme="light">
                      <i className="fas fa-sun"></i>
                      <span>浅色</span>
                    </button>
                    <button className="theme-toggle-btn" data-theme="dark">
                      <i className="fas fa-moon"></i>
                      <span>深色</span>
                    </button>
                    <button className="theme-toggle-btn" data-theme="star">
                      <i className="fas fa-star"></i>
                      <span>星空</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 配色方案 - 保留原始结构 */}
              <div className="settings-group" id="colorSchemeGroup" style={{display: 'none'}}>
                <div className="settings-label">配色方案</div>
                <div className="custom-select" id="colorSchemeSelect">
                  <div className="custom-select-trigger">
                    <span className="custom-select-value" id="colorSchemeValue">默认</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </div>
                  <div className="custom-select-content" id="colorSchemeContent"></div>
                </div>
              </div>
            </div>

            {/* 音乐搜索设置 */}
            <div className="collapsible-card collapsed" style={{marginBottom: '3px'}}>
              <div className="collapsible-header collapsed" onClick={(e) => window.toggleCollapsible && window.toggleCollapsible(e.currentTarget)}>
                <div className="collapsible-header-left">
                  <span className="collapsible-icon" style={{background: 'rgba(16, 185, 129, 0.1)', color: '#10b981'}}><i className="fas fa-music"></i></span>
                  <span className="collapsible-title">音乐搜索设置</span>
                </div>
                <span className="collapsible-arrow"><i className="fas fa-chevron-down"></i></span>
              </div>
              <div className="collapsible-content collapsed">
                <form className="settings-group nested" onSubmit={(e) => e.preventDefault()}>
                  <div className="settings-row">
                    <div className="settings-row-info">
                      <span className="settings-row-label">API Token</span>
                      <a href="https://yunzhiapi.cn/user/" target="_blank" rel="noopener noreferrer" className="settings-row-link">
                        <i className="fas fa-external-link-alt"></i>获取
                      </a>
                    </div>
                    <div className="token-input-container">
                      <input type="text" className="settings-input" style={{display: 'none'}} aria-hidden="true" tabIndex="-1" autoComplete="username" readOnly />
                      <input type="password" className="settings-input" id="tokenInput" placeholder="输入云智API Token" autoComplete="new-password" />
                      <button type="button" className="token-toggle-btn" onClick={() => window.toggleTokenVisibility && window.toggleTokenVisibility('tokenInput')}>
                        <i className="fas fa-eye-slash"></i>
                      </button>
                    </div>
                  </div>
                  <div className="settings-row" id="tokenSourceGroup">
                    <div className="settings-row-info">
                      <span className="settings-row-label">Token来源</span>
                    </div>
                    <div className="token-source-selector">
                      <label className="token-source-option">
                        <input type="radio" name="tokenSource" value="personal" defaultChecked />
                        <span><i className="fas fa-user"></i> 个人</span>
                      </label>
                      <label className="token-source-option vip-option" id="vipTokenOption">
                        <input type="radio" name="tokenSource" value="vip" disabled />
                        <span><i className="fas fa-crown"></i> 会员</span>
                      </label>
                    </div>
                    <p className="settings-hint" id="tokenSourceHint">使用您自己的云智API Token</p>
                  </div>
                </form>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-row-label">网易云搜索数量</span>
                    <span className="settings-row-hint">最大 20</span>
                  </div>
                  <input type="number" className="settings-input compact" id="wyPageSizeInput" min="1" max="20" defaultValue="20" />
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-row-label">Bilibili 搜索数量</span>
                    <span className="settings-row-hint">最大 50</span>
                  </div>
                  <input type="number" className="settings-input compact" id="biliPageSizeInput" min="1" max="50" defaultValue="20" />
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-row-label">QQ音乐搜索数量</span>
                    <span className="settings-row-hint">最大 20</span>
                  </div>
                  <input type="number" className="settings-input compact" id="qqPageSizeInput" min="1" max="20" defaultValue="20" />
                </div>
              </div>
            </div>

            {/* 导航栏设置 */}
            <div className="collapsible-card collapsed" style={{marginBottom: '3px'}}>
              <div className="collapsible-header collapsed" onClick={(e) => window.toggleCollapsible && window.toggleCollapsible(e.currentTarget)}>
                <div className="collapsible-header-left">
                  <span className="collapsible-icon" style={{background: 'rgba(249, 115, 22, 0.1)', color: '#f97316'}}><i className="fas fa-bars"></i></span>
                  <span className="collapsible-title">导航栏设置</span>
                </div>
                <span className="collapsible-arrow"><i className="fas fa-chevron-down"></i></span>
              </div>
              <div className="collapsible-content collapsed">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-row-label">显示文本</span>
                    <span className="settings-row-hint">图标下方文字</span>
                  </div>
                  <div className="toggle-switch">
                    <input type="checkbox" id="navbarTextToggle" />
                    <label htmlFor="navbarTextToggle"></label>
                  </div>
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-row-label">网易云音乐</span>
                    <span className="settings-row-hint">导航栏按钮</span>
                  </div>
                  <div className="toggle-switch">
                    <input type="checkbox" id="wyNavToggle" defaultChecked />
                    <label htmlFor="wyNavToggle"></label>
                  </div>
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-row-label">Bilibili</span>
                    <span className="settings-row-hint">导航栏按钮</span>
                  </div>
                  <div className="toggle-switch">
                    <input type="checkbox" id="biliNavToggle" defaultChecked />
                    <label htmlFor="biliNavToggle"></label>
                  </div>
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <span className="settings-row-label">QQ音乐</span>
                    <span className="settings-row-hint">导航栏按钮</span>
                  </div>
                  <div className="toggle-switch">
                    <input type="checkbox" id="qqNavToggle" defaultChecked />
                    <label htmlFor="qqNavToggle"></label>
                  </div>
                </div>
              </div>
            </div>

            {/* 默认页面卡片 */}
            <div className="settings-card" style={{borderRadius: '16px', padding: '24px', marginBottom: '12px'}}>
              <h3 style={{fontSize: '18px', fontWeight: '600', color: 'var(--text)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                <i className="fas fa-home" style={{color: '#14b8a6'}}></i>
                默认页面
              </h3>
              <div className="settings-group">
                <div className="settings-label">默认页面</div>
                <div className="custom-select" id="defaultPageSelect">
                  <div className="custom-select-trigger">
                    <span className="custom-select-value">选择默认页面</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </div>
                  <div className="custom-select-content">
                    <div className="custom-select-item" data-value="home">主页</div>
                    <div className="custom-select-item" data-value="wy">网易云搜索页面</div>
                    <div className="custom-select-item" data-value="bili">Bilibili搜索页面</div>
                    <div className="custom-select-item" data-value="qq">QQ音乐搜索页面</div>
                    <div className="custom-select-item" data-value="profile">个人页面</div>
                  </div>
                </div>
                <p className="settings-hint">应用启动时默认显示的页面</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 底部播放器 */}
      <div className="player hidden" id="player">
        <div className="player-content">
          <div className="player-cover">
            <i className="fas fa-disc-record"></i>
          </div>
          <div className="player-info">
            <div className="player-title" id="playerTitle">未选择歌曲</div>
            <div className="player-artist" id="playerArtist">--</div>
            <div className="player-progress" id="progressBar">
              <div className="player-progress-buffer" id="playerBufferFill"></div>
              <div className="player-progress-bar" id="progressFill"></div>
            </div>
          </div>
          <div className="player-controls-container">
            <div className="player-time" id="timeDisplay">00:00 / 00:00</div>
            <div className="player-controls">
              <button className="player-btn" id="prevBtn"><i className="fas fa-backward-step"></i></button>
              <button className="player-btn play-btn" id="playBtn"><i className="fas fa-play"></i></button>
              <button className="player-btn" id="nextBtn"><i className="fas fa-forward-step"></i></button>
            </div>
          </div>
          <div className="player-volume">
            <div className="volume-icon" id="volumeIcon">
              <i className="fas fa-volume-up"></i>
            </div>
            <div className="volume-slider" id="volumeSlider">
              <div className="volume-slider-fill" id="volumeSliderFill"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal overlay */}
      <div className="modal-overlay" id="modalOverlay"></div>

      {/* 设置模态框 */}
      <div className="modal" id="settingsModal">
        <div className="modal-header">
          <h3 className="modal-title">设置</h3>
          <button className="modal-close" onClick={() => window.closeModal && window.closeModal('settingsModal')}>
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="modal-body">
          <form className="settings-group" onSubmit={(e) => e.preventDefault()}>
            <div className="settings-label" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <span>API Token</span>
              <a href="https://yunzhiapi.cn/user/" target="_blank" rel="noopener noreferrer" style={{color: 'var(--primary)', textDecoration: 'none', fontSize: '12px', fontWeight: '500'}}>
                <i className="fas fa-external-link-alt" style={{marginRight: '4px'}}></i>获取Token
              </a>
            </div>
            <div className="token-input-container">
              <input type="password" className="settings-input" id="modalTokenInput" placeholder="输入云智API Token" autoComplete="new-password" />
              <button type="button" className="token-toggle-btn" onClick={() => window.toggleTokenVisibility && window.toggleTokenVisibility('modalTokenInput')}>
                <i className="fas fa-eye-slash"></i>
              </button>
            </div>
            <p className="settings-hint">配置后才能使用网易云和QQ音乐</p>
          </form>
          <div className="settings-group">
            <div className="settings-label">网易云搜索数量</div>
            <input type="number" className="settings-input" id="modalWyPageSizeInput" min="1" max="20" defaultValue="20" />
            <p className="settings-hint">网易云每次搜索歌曲数量，最大20</p>
          </div>
          <div className="settings-group">
            <div className="settings-label">Bilibili搜索数量</div>
            <input type="number" className="settings-input" id="modalBiliPageSizeInput" min="1" max="50" defaultValue="20" />
            <p className="settings-hint">BiliBili音乐每次搜索的歌曲数量，最大50</p>
          </div>
          <div className="settings-group">
            <div className="settings-label">QQ音乐搜索数量</div>
            <input type="number" className="settings-input" id="modalQQPageSizeInput" min="1" max="20" defaultValue="20" />
            <p className="settings-hint">QQ音乐每次搜索的歌曲数量，最大20</p>
          </div>
          <div className="settings-group">
            <div className="settings-label">默认页面</div>
            <select className="settings-input" id="modalDefaultPageInput">
              <option value="home">主页</option>
              <option value="wy">网易云搜索页面</option>
              <option value="bili">Bilibili搜索页面</option>
              <option value="qq">QQ音乐搜索页面</option>
              <option value="profile">个人页面</option>
            </select>
            <p className="settings-hint">应用启动时默认显示的页面</p>
          </div>
        </div>
      </div>

      {/* 播放列表模态框 */}
      <div className="modal" id="playlistModal">
        <div className="modal-header">
          <h3 className="modal-title">播放列表</h3>
          <button className="modal-close" onClick={() => window.closeModal && window.closeModal('playlistModal')}>
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="modal-body" id="playlistContent">
          <div className="playlist-empty">
            <i className="fas fa-music"></i>
            <p>播放列表为空</p>
          </div>
        </div>
      </div>

      {/* Toast 通知 */}
      <div className="toast" id="toast">
        <i className="fas fa-circle-check"></i>
        <span id="toastMessage"></span>
        <button className="toast-close" id="toastCloseBtn"><i className="fas fa-times"></i></button>
      </div>

      {/* 历史记录弹窗 */}
      <div className="modal" id="historyModal">
        <div className="modal-header">
          <h3 className="modal-title">全部播放历史</h3>
          <button className="modal-close" onClick={() => window.closeModal && window.closeModal('historyModal')}>
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="modal-body" id="historyModalBody"></div>
      </div>

      {/* 音频元素 */}
      <audio id="audioPlayer"></audio>

      {/* 全屏播放器 */}
      <div className="fullscreen-player" id="fullscreenPlayer">
        <canvas id="visualizerCanvas" className="fullscreen-visualizer-canvas"></canvas>
        <button className="fullscreen-player-close" id="fullscreenPlayerClose">
          <i className="fas fa-times"></i>
        </button>
        <div className="fullscreen-player-content">
          <div className="fullscreen-player-main">
            <div className="fullscreen-player-left">
              <div className="fullscreen-player-cover" id="fullscreenPlayerCover">
                <i className="fas fa-disc-record"></i>
              </div>
              <div className="fullscreen-player-info">
                <h2 className="fullscreen-player-title" id="fullscreenPlayerTitle"></h2>
                <p className="fullscreen-player-artist" id="fullscreenPlayerArtist"></p>
              </div>
            </div>
            <div className="fullscreen-lyrics-container" id="fullscreenLyricsContainer">
              <div className="fullscreen-lyrics-header">
                <i className="fas fa-file-alt"></i> 歌词
              </div>
              <div className="fullscreen-lyrics" id="fullscreenLyrics">
                <div className="lyrics-placeholder"><i className="fas fa-music"></i> 暂无歌词，享受旋律~</div>
              </div>
            </div>
          </div>
          <div className="fullscreen-player-progress-section">
            <div className="fullscreen-player-progress-container">
              <div className="fullscreen-player-progress" id="fullscreenPlayerProgress">
                <div className="fullscreen-player-progress-bar" id="fullscreenPlayerProgressBar"></div>
              </div>
              <div className="fullscreen-player-time">
                <span id="fullscreenPlayerCurrentTime">0:00</span>
                <span id="fullscreenPlayerDuration">0:00</span>
              </div>
            </div>
            <div className="fullscreen-player-controls-row">
              <div className="fullscreen-player-controls">
                <button className="fullscreen-player-btn" id="fullscreenPlayerPrev">
                  <i className="fas fa-step-backward"></i>
                </button>
                <button className="fullscreen-player-btn fullscreen-player-play-btn" id="fullscreenPlayerPlay">
                  <i className="fas fa-play"></i>
                </button>
                <button className="fullscreen-player-btn" id="fullscreenPlayerNext">
                  <i className="fas fa-step-forward"></i>
                </button>
                <button className="fullscreen-player-btn" id="fullscreenPlayerDownload" title="下载歌曲">
                  <i className="fas fa-download"></i>
                </button>
              </div>
              <div className="fullscreen-player-extras">
                <div className="dropdown-container">
                  <button className="dropdown-trigger" id="speedDropdownTrigger">
                    <i className="fas fa-gauge-high"></i>
                    <span id="currentSpeedLabel">1.0x</span>
                    <i className="fas fa-chevron-down"></i>
                  </button>
                  <div className="dropdown-menu" id="speedDropdownMenu">
                    <button className="dropdown-item speed-item" data-speed="0.5">0.5x</button>
                    <button className="dropdown-item speed-item" data-speed="0.75">0.75x</button>
                    <button className="dropdown-item speed-item" data-speed="1.0">1.0x</button>
                    <button className="dropdown-item speed-item" data-speed="1.25">1.25x</button>
                    <button className="dropdown-item speed-item" data-speed="1.5">1.5x</button>
                    <button className="dropdown-item speed-item" data-speed="2.0">2.0x</button>
                  </div>
                </div>
                <div className="dropdown-container">
                  <button className="dropdown-trigger" id="modeDropdownTrigger">
                    <i className="fas fa-list" id="modeIcon"></i>
                    <i className="fas fa-chevron-down"></i>
                  </button>
                  <div className="dropdown-menu" id="modeDropdownMenu">
                    <button className="dropdown-item mode-item" data-mode="order"><i className="fas fa-list"></i> 顺序</button>
                    <button className="dropdown-item mode-item" data-mode="random"><i className="fas fa-random"></i> 随机</button>
                    <button className="dropdown-item mode-item" data-mode="loop"><i className="fas fa-repeat"></i> 单曲循环</button>
                  </div>
                </div>
                <button className="fullscreen-player-btn" id="toggleVisualizerBtn" title="音频可视化" style={{display: 'none'}}>
                  <i className="fas fa-chart-bar"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 账号异处登录模态框 */}
      <div className="modal" id="sessionExpiredModal">
        <div className="modal-header">
          <h3 className="modal-title" id="sessionExpiredModalTitle">
            <i className="fas fa-user-shield" style={{marginRight: '8px', color: '#ef4444'}}></i>
            账号安全提醒
          </h3>
        </div>
        <div className="modal-body">
          <div style={{textAlign: 'center', padding: '20px 0'}}>
            <i className="fas fa-exclamation-triangle" style={{fontSize: '48px', color: '#ef4444', marginBottom: '16px'}}></i>
            <p style={{fontSize: '16px', color: 'var(--text)', marginBottom: '8px'}} id="sessionExpiredModalMessage">
              您的账号已在其他设备登录
            </p>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-blue" onClick={() => window.closeSessionExpiredModal && window.closeSessionExpiredModal()}>
            确定
          </button>
        </div>
      </div>

      {/* 更换头像模态框 */}
      <div className="modal" id="editAvatarModal">
        <div className="modal-header">
          <h3 className="modal-title">
            <i className="fas fa-camera" style={{marginRight: '8px', color: 'var(--primary)'}}></i>
            更换头像
          </h3>
          <button className="modal-close" onClick={() => window.closeModal && window.closeModal('editAvatarModal')}>
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="modal-body">
          <div style={{padding: '20px 0'}}>
            <p style={{fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px'}}>
              请输入新的头像图片 URL（支持 http/https）
            </p>
            <input type="text" id="avatarUrlInput" style={{width: '100%', padding: '10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '14px'}} placeholder="例如：https://example.com/avatar.jpg" />
          </div>
          <div className="avatar-upload-section">
            <div className="avatar-upload-divider">
              <span>或</span>
            </div>
            <p style={{fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px'}}>
              上传本地图片作为头像
            </p>
            <div className="avatar-local-upload" id="avatarLocalUpload" onClick={() => document.getElementById('avatarFileInput').click()}>
              <input type="file" id="avatarFileInput" accept="image/*" style={{display: 'none'}} onChange={(e) => window.handleAvatarFileSelect && window.handleAvatarFileSelect(e)} />
              <div className="avatar-upload-content" id="avatarUploadContent">
                <i className="fas fa-cloud-upload-alt" style={{fontSize: '32px', color: 'var(--text-tertiary)', marginBottom: '8px'}}></i>
                <p style={{fontSize: '14px', color: 'var(--text-secondary)'}}>点击选择图片</p>
                <p style={{fontSize: '12px', color: 'var(--text-tertiary)'}}>支持 JPG、PNG、GIF 格式</p>
              </div>
              <div className="avatar-preview-container" id="avatarPreviewContainer" style={{display: 'none'}}>
                <img id="avatarPreviewImg" src="" alt="预览" style={{maxWidth: '100%', maxHeight: '150px', borderRadius: 'var(--radius-md)'}} />
              </div>
            </div>
            <button className="avatar-upload-btn" id="avatarUploadBtn" onClick={() => document.getElementById('avatarFileInput').click()} style={{display: 'none'}}>
              <i className="fas fa-upload" style={{marginRight: '6px'}}></i> 选择图片
            </button>
          </div>
          <div style={{marginTop: '30px'}}>
            <h4 style={{fontSize: '14px', fontWeight: '600', marginBottom: '12px'}}>
              <i className="fas fa-history" style={{marginRight: '6px', color: 'var(--primary)'}}></i>
              头像历史
            </h4>
            <div className="avatar-history-list" id="avatarHistoryList">
              <div className="empty-state">
                <i className="fas fa-image"></i>
                <p>暂无头像历史记录</p>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-gray" onClick={() => window.closeModal && window.closeModal('editAvatarModal')}>
            取消
          </button>
          <button className="btn-blue" onClick={() => window.confirmAvatarUpdate && window.confirmAvatarUpdate()}>
            确定
          </button>
        </div>
      </div>

      {/* 登录页面 */}
      <div className="login-page" id="loginPage">
        <div className="auth-box" id="authBox">
          <button className="login-close" onClick={() => window.closeLoginPage && window.closeLoginPage()} title="关闭">
            <i className="fas fa-times"></i>
          </button>
          <div className="mobile-nav">
            <div className="m-tab m-tab-si" id="mSi">登录</div>
            <div className="m-tab m-tab-su" id="mSu">注册</div>
          </div>
          <div className="panel pA" id="pA">
            <form className="p-inner pA-login" onSubmit={(e) => { e.preventDefault(); window.handleLogin && window.handleLogin(); }}>
              <div className="fp-title">登 录 账 号</div>
              <div className="field">
                <input type="text" id="loginUsername" placeholder="用户名" autoComplete="username" />
              </div>
              <div className="field">
                <input type="password" id="loginPassword" placeholder="密码" autoComplete="current-password" />
              </div>
              <span className="forgot" onClick={() => window.showToast && window.showToast('请联系管理员重置密码', 'info')}>忘记密码?</span>
              <button type="submit" className="btn-blue btn-full">登录</button>
            </form>
            <p style={{cursor: 'pointer', marginTop: '6px', color: 'var(--primary)', textAlign: 'center', fontSize: '13px'}} onClick={() => window.location.href = './user-center.html'}>
              <i className="fas fa-user-gear"></i> 前往用户中心
            </p>
            <form className="p-inner pA-reg" onSubmit={(e) => { e.preventDefault(); window.handleRegister && window.handleRegister(); }}>
              <div className="fp-title">创 建 账 号</div>
              <div className="field">
                <input type="text" id="regUsername" placeholder="用户名" autoComplete="off" />
              </div>
              <div className="field">
                <input type="password" id="regPassword" placeholder="密码 (至少6位)" autoComplete="new-password" />
              </div>
              <div className="field">
                <input type="password" id="regConfirmPwd" placeholder="确认密码" autoComplete="off" />
              </div>
              <div className="field">
                <input type="text" id="regSecretKey" placeholder="注册密钥" autoComplete="off" />
              </div>
              <button type="submit" className="btn-blue btn-full" style={{marginTop: '6px'}}>注 册</button>
            </form>
          </div>
          <div className="panel pB" id="pB">
            <div className="d1"></div>
            <div className="d2"></div>
            <div className="p-inner pB-hello">
              <div className="o-title">Hello Friend！</div>
              <div className="o-sub">
                去注册一个账号，成为尊贵的会员，享受数据同步服务！
              </div>
              <button className="btn-blue" id="toSignup">注册</button>
            </div>
            <div className="p-inner pB-welcome">
              <div className="o-title">Welcome Back！</div>
              <div className="o-sub">
                已经有账号了嘛，去登陆账号来进入奇妙世界吧！！！
              </div>
              <button className="btn-blue" id="toSignin">登录</button>
            </div>
          </div>
        </div>
      </div>

      {/* 导航栏 */}
      <div className="navbar" id="navbar">
        <div className="navbar-pill" id="navbarPill"></div>
        <div className="navbar-item" id="navHome" data-i="0">
          <i className="fas fa-home"></i>
          <span>主页</span>
        </div>
        <div className="navbar-item" id="navWy" data-i="1">
          <i className="fas fa-compact-disc"></i>
          <span>网易云</span>
        </div>
        <div className="navbar-item" id="navBili" data-i="2">
          <i className="fab fa-bilibili"></i>
          <span>Bilibili</span>
        </div>
        <div className="navbar-item" id="navQQ" data-i="3">
          <i className="fab fa-qq"></i>
          <span>QQ音乐</span>
        </div>
        <div className="navbar-item" id="navSettings" data-i="4">
          <i className="fas fa-cog"></i>
          <span>设置</span>
        </div>
        <div className="navbar-item" id="navProfile" data-i="5">
          <i className="fas fa-user-astronaut"></i>
          <span>我的</span>
        </div>
      </div>

      {/* 下载选项面板 */}
      <div className="download-options-panel" id="downloadOptionsPanel">
        <div className="download-options-panel-header">
          <div className="download-options-panel-title">下载选项</div>
          <button className="close-download-options-panel" id="closeDownloadOptionsPanel">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="download-options-content">
          <div className="download-options-info">
            <div className="download-options-song-name" id="downloadOptionsSongName">歌曲名称</div>
            <div className="download-options-song-artist" id="downloadOptionsSongArtist">艺术家</div>
          </div>
          <div className="download-options-select-all">
            <button className="select-all-btn" id="selectAllBtn">
              <i className="fas fa-check-double"></i> 全选
            </button>
          </div>
          <div className="download-options-list">
            <label className="download-option-item">
              <input type="checkbox" id="downloadSongCheckbox" defaultChecked />
              <span className="custom-checkbox"><i className="fas fa-check"></i></span>
              <span className="download-option-label">
                <i className="fas fa-music"></i> 歌曲文件
              </span>
            </label>
            <label className="download-option-item">
              <input type="checkbox" id="downloadLyricsCheckbox" />
              <span className="custom-checkbox"><i className="fas fa-check"></i></span>
              <span className="download-option-label">
                <i className="fas fa-file-alt"></i> 歌词文件
              </span>
            </label>
            <label className="download-option-item">
              <input type="checkbox" id="downloadCoverCheckbox" />
              <span className="custom-checkbox"><i className="fas fa-check"></i></span>
              <span className="download-option-label">
                <i className="fas fa-image"></i> 歌曲封面
              </span>
            </label>
          </div>
          <div className="download-options-controls">
            <button className="download-options-btn cancel" id="cancelDownloadOptionsBtn">取消</button>
            <button className="download-options-btn confirm" id="packageDownloadBtnPanel">打包下载</button>
            <button className="download-options-btn confirm" id="confirmDownloadBtn">开始下载</button>
          </div>
        </div>
      </div>

      {/* 下载进度面板 */}
      <div className="download-panel" id="downloadPanel">
        <div className="download-panel-header">
          <div className="download-panel-title">下载进度</div>
          <button className="close-download-panel" id="closeDownloadPanel">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="download-content">
          <div className="download-info">
            <div className="download-file-name" id="downloadFileName">准备下载...</div>
            <div className="download-status" id="downloadStatus">等待中</div>
          </div>
          <div className="download-queue" id="downloadQueue">
            <div className="queue-title"><i className="fas fa-box"></i> 下载队列</div>
            <div className="queue-items" id="queueItems"></div>
          </div>
          <div className="download-progress-container">
            <div className="download-progress-bar" id="downloadProgressBar"></div>
          </div>
          <div className="download-stats">
            <span className="download-percentage" id="downloadPercentage">0%</span>
            <span className="download-speed" id="downloadSpeed">0 KB/s</span>
            <span className="download-size" id="downloadSize">0 MB / 0 MB</span>
          </div>
          <div className="download-controls">
            <button className="download-btn cancel" id="cancelDownloadBtn">取消下载</button>
          </div>
        </div>
      </div>

      {/* 多弹窗提示系统容器 */}
      <div className="toast-container" id="toastContainer"></div>
    </>
  )
}

export default App
