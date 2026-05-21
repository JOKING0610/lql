import React, { useEffect, useRef, useCallback } from 'react'
import { useTheme } from '../../contexts/ThemeContext'

function ThemeSwitcher() {
  const { currentTheme, parseThemeString, switchTheme } = useTheme()
  const pillRef = useRef(null)
  const groupRef = useRef(null)

  // 更新主题按钮状态和指示条位置
  const updateThemeButtons = useCallback(() => {
    if (!pillRef.current || !groupRef.current) return

    const parsed = parseThemeString(currentTheme)
    const btns = groupRef.current.querySelectorAll('.sidebar-theme-btn')
    const pill = pillRef.current

    btns.forEach(btn => {
      btn.classList.remove('active')
      if (btn.dataset.theme === parsed.mode) {
        btn.classList.add('active')
        // 使用 offsetLeft 和 offsetWidth 更稳定
        pill.style.left = btn.offsetLeft + 'px'
        pill.style.width = btn.offsetWidth + 'px'
      }
    })
  }, [currentTheme, parseThemeString])

  // 初始化和监听 resize
  useEffect(() => {
    updateThemeButtons()

    let resizeTimer = null
    const handleResize = () => {
      // 防抖处理，避免频繁更新
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        // 使用 requestAnimationFrame 确保 DOM 重排完成后再更新
        requestAnimationFrame(updateThemeButtons)
      }, 100)
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (resizeTimer) clearTimeout(resizeTimer)
    }
  }, [updateThemeButtons])

  const handleThemeClick = (mode) => {
    switchTheme(mode)
  }

  return (
    <div className="sidebar-theme-group" ref={groupRef}>
      <button
        className="sidebar-theme-btn"
        data-theme="light"
        onClick={() => handleThemeClick('light')}
        title="浅色主题"
      >
        <i className="fas fa-sun"></i>
      </button>
      <button
        className="sidebar-theme-btn"
        data-theme="dark"
        onClick={() => handleThemeClick('dark')}
        title="深色主题"
      >
        <i className="fas fa-moon"></i>
      </button>
      <button
        className="sidebar-theme-btn"
        data-theme="star"
        onClick={() => handleThemeClick('star')}
        title="星空主题"
      >
        <i className="fas fa-star"></i>
      </button>
      <div className="sidebar-theme-pill" ref={pillRef}></div>
    </div>
  )
}

export default ThemeSwitcher