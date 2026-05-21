// 配色方案配置
export const colorSchemes = {
  light: [
    { id: 'default', name: '纯白', class: 'color-scheme-light-default' },
    { id: 'warm', name: '米白', class: 'color-scheme-light-warm' },
    { id: 'gray', name: '浅灰', class: 'color-scheme-light-gray' },
    { id: 'blue', name: '淡蓝', class: 'color-scheme-light-blue' }
  ],
  dark: [
    { id: 'default', name: '深灰', class: 'color-scheme-dark-default' },
    { id: 'deep', name: '暗黑', class: 'color-scheme-dark-deep' },
    { id: 'slate', name: '灰蓝', class: 'color-scheme-dark-slate' },
    { id: 'navy', name: '深蓝', class: 'color-scheme-dark-navy' }
  ]
}

// 解析主题字符串
export function parseThemeString(themeStr) {
  if (!themeStr) return { mode: 'dark', schemeId: 'default' }
  if (themeStr === 'star' || themeStr.startsWith('star')) {
    return { mode: 'star', schemeId: null }
  }
  const match = themeStr.match(/^(light|dark)(\d+)$/)
  if (match) {
    const mode = match[1]
    const schemeIndex = parseInt(match[2])
    const schemes = colorSchemes[mode]
    const scheme = schemes[schemeIndex] || schemes[0]
    return { mode, schemeId: scheme.id }
  }
  if (themeStr === 'light') return { mode: 'light', schemeId: 'default' }
  if (themeStr === 'dark') return { mode: 'dark', schemeId: 'default' }
  return { mode: 'dark', schemeId: 'default' }
}

// 应用主题到DOM
export function applyThemeToDOM(themeStr) {
  const parsed = parseThemeString(themeStr)
  const htmlEl = document.documentElement

  // 移除所有主题类
  const allSchemeClasses = [
    ...colorSchemes.light.map(s => s.class),
    ...colorSchemes.dark.map(s => s.class)
  ]
  htmlEl.classList.remove(...allSchemeClasses, 'dark-theme', 'star-bg-active')

  if (parsed.mode === 'star') {
    htmlEl.classList.add('dark-theme', 'star-bg-active')
  } else if (parsed.mode === 'dark') {
    htmlEl.classList.add('dark-theme')
    const scheme = colorSchemes.dark.find(s => s.id === parsed.schemeId) || colorSchemes.dark[0]
    htmlEl.classList.add(scheme.class)
  } else {
    const scheme = colorSchemes.light.find(s => s.id === parsed.schemeId) || colorSchemes.light[0]
    htmlEl.classList.add(scheme.class)
  }
}

// 获取当前主题
export function getCurrentTheme() {
  let savedTheme = localStorage.getItem('theme')
  if (!savedTheme) savedTheme = 'dark0'

  // 兼容旧版
  if (savedTheme === 'star') savedTheme = 'star0'
  if (savedTheme === 'light') savedTheme = 'light0'
  if (savedTheme === 'dark') savedTheme = 'dark0'

  return savedTheme
}

// 设置主题
export function setTheme(themeStr) {
  localStorage.setItem('theme', themeStr)
  applyThemeToDOM(themeStr)
}

// 切换主题模式
export function switchThemeMode(mode) {
  const currentTheme = getCurrentTheme()
  const parsed = parseThemeString(currentTheme)
  let newTheme

  if (mode === 'star') {
    if (parsed.mode === 'star') return currentTheme
    newTheme = 'star'
  } else if (mode === 'dark') {
    if (parsed.mode === 'dark') return currentTheme
    const schemeId = localStorage.getItem('colorScheme_dark') || 'default'
    const schemeIndex = colorSchemes.dark.findIndex(s => s.id === schemeId)
    newTheme = `dark${schemeIndex >= 0 ? schemeIndex : 0}`
  } else {
    if (parsed.mode === 'light') return currentTheme
    const schemeId = localStorage.getItem('colorScheme_light') || 'default'
    const schemeIndex = colorSchemes.light.findIndex(s => s.id === schemeId)
    newTheme = `light${schemeIndex >= 0 ? schemeIndex : 0}`
  }

  setTheme(newTheme)
  return newTheme
}