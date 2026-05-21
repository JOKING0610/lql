import React, { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext()

// 配色方案配置
const colorSchemes = {
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

export function ThemeProvider({ children }) {
  const [currentTheme, setCurrentTheme] = useState('dark0')
  const [starBgStars, setStarBgStars] = useState([])
  const [starAnimationId, setStarAnimationId] = useState(null)

  // 解析主题字符串
  const parseThemeString = (themeStr) => {
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

  // 应用主题
  const applyTheme = (themeStr) => {
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
      // 初始化星空背景
      if (!starAnimationId) {
        initStarAnimation()
      }
    } else if (parsed.mode === 'dark') {
      htmlEl.classList.add('dark-theme')
      const scheme = colorSchemes.dark.find(s => s.id === parsed.schemeId) || colorSchemes.dark[0]
      htmlEl.classList.add(scheme.class)
    } else {
      const scheme = colorSchemes.light.find(s => s.id === parsed.schemeId) || colorSchemes.light[0]
      htmlEl.classList.add(scheme.class)
    }
  }

  // 切换主题
  const switchTheme = (mode) => {
    const parsed = parseThemeString(currentTheme)
    let newTheme

    if (mode === 'star') {
      if (parsed.mode === 'star') return
      newTheme = 'star'
    } else if (mode === 'dark') {
      if (parsed.mode === 'dark') return
      const schemeId = localStorage.getItem('colorScheme_dark') || 'default'
      const schemeIndex = colorSchemes.dark.findIndex(s => s.id === schemeId)
      newTheme = `dark${schemeIndex >= 0 ? schemeIndex : 0}`
    } else {
      if (parsed.mode === 'light') return
      const schemeId = localStorage.getItem('colorScheme_light') || 'default'
      const schemeIndex = colorSchemes.light.findIndex(s => s.id === schemeId)
      newTheme = `light${schemeIndex >= 0 ? schemeIndex : 0}`
    }

    setCurrentTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    applyTheme(newTheme)
  }

  // 初始化星空背景动画
  const initStarAnimation = () => {
    const canvas = document.getElementById('starCanvas')
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    let stars = []
    let shootingStars = []

    function resize() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      stars = []
      const starCount = Math.floor((canvas.width * canvas.height) / 2000)
      for (let i = 0; i < starCount; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          radius: Math.random() * 1.5 + 0.5,
          alpha: Math.random() * 0.8 + 0.2,
          speed: Math.random() * 0.5 + 0.1
        })
      }
    }

    resize()
    window.addEventListener('resize', resize)

    function animate() {
      const isStarActive = document.documentElement.classList.contains('star-bg-active')
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (isStarActive) {
        stars.forEach(star => {
          star.alpha += (Math.random() - 0.5) * 0.02
          star.alpha = Math.max(0.1, Math.min(1, star.alpha))
          ctx.beginPath()
          ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`
          ctx.fill()
        })

        if (Math.random() < 0.005) {
          shootingStars.push({
            x: Math.random() * canvas.width,
            y: 0,
            length: Math.random() * 80 + 40,
            speed: Math.random() * 8 + 4,
            alpha: 1
          })
        }

        shootingStars = shootingStars.filter(s => s.alpha > 0)
        shootingStars.forEach(s => {
          s.x += s.speed * 0.5
          s.y += s.speed
          s.alpha -= 0.015
          ctx.beginPath()
          ctx.moveTo(s.x, s.y)
          ctx.lineTo(s.x - s.length * 0.5, s.y - s.length)
          ctx.strokeStyle = `rgba(255, 255, 255, ${s.alpha})`
          ctx.lineWidth = 1.5
          ctx.stroke()
        })
      }

      const animId = requestAnimationFrame(animate)
      setStarAnimationId(animId)
    }

    animate()
  }

  // 初始化主题
  useEffect(() => {
    let savedTheme = localStorage.getItem('theme')
    if (!savedTheme) savedTheme = 'dark0'

    // 兼容旧版
    if (savedTheme === 'star') savedTheme = 'star0'
    if (savedTheme === 'light') savedTheme = 'light0'
    if (savedTheme === 'dark') savedTheme = 'dark0'

    setCurrentTheme(savedTheme)
    applyTheme(savedTheme)
  }, [])

  const value = {
    currentTheme,
    colorSchemes,
    parseThemeString,
    switchTheme,
    applyTheme
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

export default ThemeContext