        document.addEventListener('DOMContentLoaded', function() {
            // 读取保存的主题，默认为浅色
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme === 'dark') {
                document.body.classList.add('dark-theme');
            }
        });

        // 为元素设置无缝滚动效果
        // 修改 initMarquee 函数，增加可见性检测
        function initMarquee(element) {
            if (element._marqueeActive) return;

            const parent = element.parentElement;
            if (!parent) return;

            // 关键：检查元素是否可见（display不为none且offsetParent不为null）
            const isVisible = !!(element.offsetParent || element.getClientRects().length);
            if (!isVisible) {
                // 标记为待处理，等待页面显示后再初始化
                element._pendingMarquee = true;
                return;
            }

            // 保存原始文本
            const originalText = element.textContent;
            
            // 获取样式
            const computedStyle = window.getComputedStyle(element);
            const fontSize = computedStyle.fontSize;
            const fontFamily = computedStyle.fontFamily;
            const fontWeight = computedStyle.fontWeight;
            
            // 使用临时元素测量实际文本宽度
            const tempSpan = document.createElement('span');
            tempSpan.textContent = originalText;
            tempSpan.style.cssText = 'visibility:hidden;position:absolute;white-space:nowrap;';
            tempSpan.style.fontSize = fontSize;
            tempSpan.style.fontFamily = fontFamily;
            tempSpan.style.fontWeight = fontWeight;
            
            document.body.appendChild(tempSpan);
            const textWidth = tempSpan.offsetWidth;
            document.body.removeChild(tempSpan);
            
            // 获取父容器可用宽度（确保容器可见）
            const containerWidth = parent.clientWidth;
            
            // 如果文本未超出容器，不启用滚动
            if (textWidth <= containerWidth) {
                element._marqueeActive = true;
                delete element._pendingMarquee;
                return;
            }
            
            // 创建滚动容器和文本节点
            const container = document.createElement('div');
            container.className = 'marquee-container';
            
            const text1 = document.createElement('span');
            text1.textContent = originalText;
            text1.style.marginRight = '30px';
            
            const text2 = document.createElement('span');
            text2.textContent = originalText;
            
            container.appendChild(text1);
            container.appendChild(text2);
            
            // 清空原元素并添加滚动容器
            element.innerHTML = '';
            element.appendChild(container);

            // 计算滚动宽度
            const contentWidth = textWidth + 30;

            let scrollPos = 0;
            const step = 0.5;

            function animate() {
                scrollPos += step;
                if (scrollPos >= contentWidth) {
                    scrollPos = 0;
                }
                container.style.transform = `translateX(-${scrollPos}px)`;
                requestAnimationFrame(animate);
            }

            requestAnimationFrame(animate);
            element._marqueeActive = true;
            delete element._pendingMarquee;
        }

        // 修改 initAllMarquee，只处理可见元素
        function initAllMarquee() {
            const selectors = [
                '.song-title', '.song-artist',
                '.player-title', '.player-artist',
                '.recent-title', '.recent-artist',
                '.playlist-item-title', '.playlist-item-artist'
            ];
            document.querySelectorAll(selectors.join(',')).forEach(el => {
                // 如果已经初始化过且标记为活跃，则跳过
                if (el._marqueeActive) return;
                // 如果元素当前不可见，标记待处理，不初始化
                if (!el.offsetParent && !el.getClientRects().length) {
                    el._pendingMarquee = true;
                    return;
                }
                initMarquee(el);
            });
        }

        // 修改 refreshMarquee，增加清理和重试逻辑
        function refreshMarquee() {
            const selectors = [
                '.song-title', '.song-artist',
                '.player-title', '.player-artist',
                '.recent-title', '.recent-artist',
                '.playlist-item-title', '.playlist-item-artist'
            ];
            document.querySelectorAll(selectors.join(',')).forEach(el => {
                // 如果之前有滚动容器，恢复原始内容
                const container = el.querySelector('.marquee-container');
                if (container) {
                    const originalText = container.querySelector('span')?.textContent || el.textContent;
                    el.innerHTML = originalText;
                }
                // 重置标记
                delete el._marqueeActive;
                delete el._pendingMarquee;
                // 重新初始化（此时元素可能不可见，initMarquee会处理）
                initMarquee(el);
            });
        }

        // 新增：针对指定容器刷新滚动（用于页面切换后）
        function refreshMarqueeInContainer(container) {
            const selectors = [
                '.song-title', '.song-artist',
                '.player-title', '.player-artist',
                '.recent-title', '.recent-artist',
                '.playlist-item-title', '.playlist-item-artist'
            ];
            container.querySelectorAll(selectors.join(',')).forEach(el => {
                // 如果之前有滚动容器，恢复原始内容
                const containerDiv = el.querySelector('.marquee-container');
                if (containerDiv) {
                    const originalText = containerDiv.querySelector('span')?.textContent || el.textContent;
                    el.innerHTML = originalText;
                }
                delete el._marqueeActive;
                delete el._pendingMarquee;
                initMarquee(el);
            });
        }

        // 窗口尺寸变化时重新检查滚动条件
        let resizeTimeout;
        window.addEventListener('resize', () => {
            // 防抖处理，避免频繁触发
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                // 优化：只处理可见页面的元素
                const visiblePages = document.querySelectorAll('.page[style*="display: block"]');
                if (visiblePages.length === 0) return;
                
                const selectors = [
                    '.song-title', '.song-artist',
                    '.player-title', '.player-artist',
                    '.recent-title', '.recent-artist',
                    '.playlist-item-title', '.playlist-item-artist'
                ];
                
                // 只处理可见页面内的元素
                visiblePages.forEach(page => {
                    page.querySelectorAll(selectors.join(',')).forEach(el => {
                        // 恢复原始内容（如果之前有滚动容器）
                        const container = el.querySelector('.marquee-container');
                        if (container) {
                            // 获取原始文本（第一个span的内容）
                            const originalText = container.querySelector('span')?.textContent || el.textContent;
                            el.innerHTML = originalText;
                        }
                        
                        // 重置标记并重新初始化
                        delete el._marqueeActive;
                        delete el._pendingMarquee;
                        initMarquee(el);
                    });
                });
            }, 250); // 250ms防抖延迟
        });

        // 导出函数到 window，供 app.js 调用
        window.initMarquee = initMarquee;
        window.initAllMarquee = initAllMarquee;
        window.refreshMarquee = refreshMarquee;
        window.refreshMarqueeInContainer = refreshMarqueeInContainer;
