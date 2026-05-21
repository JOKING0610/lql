# Memory

## 音乐App (musicapp) 项目

### 技术栈
- Vite + vanilla JS (非React, 前身是17018行的1.html)
- Supabase (认证/积分/会员)
- FontAwesome 6.4.0, DM Sans 字体
- 亮色/暗色/星空三主题, 6页面 (首页/网易云/B站/QQ音乐/设置/个人中心)

### 已知问题 & 修复记录
- **kuwo CORS**: 已通过Vite proxy解决 (vite.config.js `/api/kuwo-proxy`)
- **get_user_points 404**: 前端参数已修正为 `{_user_id, _session_token}`，但函数需部署到Supabase SQL Editor
- **积分面板空白 (2025-07-08)**: `switchTab`中`!pointsData`守卫导致`loadPointsHistory`未被调用 → 已移除守卫
- **sql.sql**: 已补全55个DROP FUNCTION语句
- localStorage key: 使用 `STORAGE_KEY` 常量, 值为 `'vipUser'`
- **user-center.html 响应式 (2025-07-08)**: 4断点布局 — 平板(769-1024px窄侧边栏220px)/桌面(>=1025px)/手机(<768px)/小屏(<480px) + 触控优化 + 横屏优化 + 主内容max-width:900px
- **user-center.html UI深度优化 (2025-07-08)**: 语义化CSS变量系统(间距Token/Z-index分层/缓动曲线), viewport-fit=cover安全区, clamp()流体排版(6处), prefers-reduced-motion, :focus-visible, 星空主题z-index冲突修复, Toast z-index升级
- **redeemCode 未定义 (2025-05-17)**: user-center.html 兑换按钮绑定 redeemCode() 但函数缺失 → 已补全，调用后端 `redeem_code(_session_token, _code)` (非 redeem_points_code)
- **兑换积分无变更记录 (2025-05-17)**: `redeem_code` SQL函数只写 `user_points` 和 `user_redeems`，未写 `point_transactions`；而 `get_user_points` 只从 `point_transactions` 读历史 → 已在 sql.sql 的 redeem_code 函数中追加 INSERT INTO point_transactions (transaction_type='redeem')
- **积分页面会员兑换 (2025-05-17)**: user-center.html 积分页面新增"积分兑换会员"功能，调用后端 `user_redeem_membership(_user_id, _days, _point_type, _session_token)`，支持7/30/90/365天，可选普通积分或会员积分抵扣；侧边栏"积分记录"改名为"积分"
- **头像更换功能增强 (2025-07-12)**: 删除重复的 `confirmAvatarChange` 函数，保留增强版（支持历史头像选择+文件上传互斥）；历史头像不消耗积分；头像变更后自动刷新积分；侧边栏头像支持点击放大查看（ESC关闭）
- **图片编辑器功能 (2025-07-12)**: 上传头像前可旋转、缩放、拖拽调整位置；圆形裁剪框确保1:1比例；输出400x400 WebP格式；GIF不支持编辑直接上传；裁剪结果存储到 `window._croppedAvatarBlob`
- **头像编辑器 UI 修复 (2025-07-12)**: 修复 `openEditorFromPreview` 函数缺失；修复 `avatarLocalUpload` → `avatarUploadArea` ID 不匹配；新增 `switchToPreviewState/switchToInitialState` 函数统一管理预览状态切换；编辑按钮在预览区域正确显示
- **头像编辑器功能增强 (2025-07-12)**: 历史头像选择不显示编辑按钮（`switchToPreviewState(url, false)`）；编辑器主题适配（Canvas 背景色使用 `var(--bg)`）；裁剪框动画旋转+十字辅助线；按钮 hover 上浮+阴影效果；模态框 backdrop-filter 模糊
- **头像编辑器移动端适配 (2025-07-12)**: GIF 上传不显示编辑按钮；关闭按钮红色 hover+旋转动画；移动端工具栏按钮 40x40px；触控设备最小 44x44px；横屏 Canvas 最大 50vh；历史头像网格 3 列
- **头像编辑器 UI 深度优化 (2025-07-12)**: 模态框入场动画(avatarModalIn)；毛玻璃 blur(12px) saturate(1.4)；SVG 裁剪框渐变环+外发光+四角指示标+十字辅助线；缩放控件胶囊容器+渐变轨道；确认按钮渐变背景；**三主题完整适配** — 亮色(深蓝黑画布)/暗色(更深底色)/星空(紫蓝色调全局适配+靛蓝按钮)；Canvas 背景色根据主题动态选择
- **更换头像模态框 UI 优化 (2025-07-12)**: 入场动画+毛玻璃；上传区域径向光晕 hover+圆角图标容器；预览图片双层阴影+hover 扩大；历史头像选中态双层阴影；**三主题完整适配** — 星空主题紫蓝半透明底色+靛蓝渐变按钮+紫蓝边框光晕；关闭按钮红色 hover+旋转动画统一
- **头像编辑器 Bug 修复 Round3 (2025-07-12)**: 新增 `_originalFileDataUrl` 变量存储原图URL；`closeAvatarEditor` 重置file input+恢复预览；`handleAvatarUpload` 先设置预览再开编辑器；编辑按钮暗色主题适配；历史头像RPC `get_avatar_history`→`get_user_avatar_history` 修正函数名和参数
- **用户中心路由改造 (2026-05-21)**: Hash路由 `/#usercenter` → 路径路由 `/lql/usercenter`；添加 `appType: 'spa'` + `public/404.html` + index.html SPA还原脚本支持 GitHub Pages；Supabase 改用 CDN 全局变量（`window.supabase.createClient`）不再 npm import
- **用户中心 React 架构 (2026-05-21)**: user-center.html 重构为 React 组件树（UserCenterApp + Sidebar + Panels + Contexts），Vite code splitting + React.lazy 加载
