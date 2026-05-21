// localStorage工具函数

// 获取设置
export function getSetting(key) {
  const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true'
  const settingsKey = isLoggedIn ? 'user_setting' : 'guest_settings'
  const settings = JSON.parse(localStorage.getItem(settingsKey) || '{}')
  return settings[key]
}

// 设置设置
export function setSetting(key, value) {
  const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true'
  const settingsKey = isLoggedIn ? 'user_setting' : 'guest_settings'
  const settings = JSON.parse(localStorage.getItem(settingsKey) || '{}')
  settings[key] = value
  localStorage.setItem(settingsKey, JSON.stringify(settings))
}

// 获取用户数据
export function getUserData() {
  const userData = localStorage.getItem('vipUser')
  return userData ? JSON.parse(userData) : null
}

// 设置用户数据
export function setUserData(data) {
  localStorage.setItem('vipUser', JSON.stringify(data))
}

// 获取会话令牌
export function getSessionToken() {
  return localStorage.getItem('sessionToken')
}

// 设置会话令牌
export function setSessionToken(token) {
  localStorage.setItem('sessionToken', token)
}

// 检查是否已登录
export function isLoggedIn() {
  return localStorage.getItem('userLoggedIn') === 'true'
}

// 设置登录状态
export function setLoggedIn(status) {
  localStorage.setItem('userLoggedIn', status.toString())
}

// 获取用户名
export function getUsername() {
  return localStorage.getItem('username')
}

// 设置用户名
export function setUsername(username) {
  localStorage.setItem('username', username)
}

// 获取用户头像
export function getUserAvatar() {
  return localStorage.getItem('userAvatar')
}

// 设置用户头像
export function setUserAvatar(avatarUrl) {
  localStorage.setItem('userAvatar', avatarUrl)
}

// 清除用户数据
export function clearUserData() {
  localStorage.removeItem('sessionToken')
  localStorage.removeItem('vipUser')
  localStorage.removeItem('userLoggedIn')
  localStorage.removeItem('username')
  localStorage.removeItem('userAvatar')
}

// 获取播放数据
export function getPlayData() {
  const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true'
  if (isLoggedIn) {
    return JSON.parse(localStorage.getItem('user_plays') || '{}')
  } else {
    const settings = JSON.parse(localStorage.getItem('guest_settings') || '{}')
    return settings.plays || {}
  }
}

// 设置播放数据
export function setPlayData(data) {
  const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true'
  if (isLoggedIn) {
    localStorage.setItem('user_plays', JSON.stringify(data))
  } else {
    const settings = JSON.parse(localStorage.getItem('guest_settings') || '{}')
    settings.plays = data
    localStorage.setItem('guest_settings', JSON.stringify(settings))
  }
}

// 迁移游客设置到用户设置
export function migrateGuestSettings() {
  const guestSettings = JSON.parse(localStorage.getItem('guest_settings') || '{}')
  let userSettings = JSON.parse(localStorage.getItem('user_setting') || '{}')

  if (!userSettings.theme && guestSettings.theme) {
    userSettings = { ...guestSettings }
    delete userSettings.plays
    localStorage.setItem('user_setting', JSON.stringify(userSettings))
  }

  if (guestSettings.plays && !localStorage.getItem('user_plays')) {
    localStorage.setItem('user_plays', JSON.stringify(guestSettings.plays))
  }
}

// 设置数据同步标记
export function setDataJustSynced() {
  localStorage.setItem('dataJustSynced', Date.now().toString())
}

// 检查数据是否刚刚同步过
export function isDataJustSynced() {
  const timestamp = localStorage.getItem('dataJustSynced')
  if (!timestamp) return false
  
  // 检查是否在5秒内
  const now = Date.now()
  const syncedTime = parseInt(timestamp)
  return (now - syncedTime) < 5000
}