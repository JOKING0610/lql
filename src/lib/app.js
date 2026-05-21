        const API_BASE = 'https://yunzhiapi.cn/API';

        // ========== 音频 URL 代理（开发环境绕过 CORS） ==========
        function proxyAudioUrl(url) {
            if (!url || typeof url !== 'string') return url;
            // 仅在 localhost 开发环境生效
            if (!window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) return url;
            // 酷我 CDN
            if (url.includes('lv-sycdn.kuwo.cn')) {
                return url.replace('https://lv-sycdn.kuwo.cn', '/api/kuwo-proxy');
            }
            return url;
        }

        // ── 登录页面功能 ──
        const authBox = document.getElementById('authBox');
        const pA = document.getElementById('pA');
        const pB = document.getElementById('pB');

        // ---------- Supabase 配置 ----------
        const SUPABASE_URL = "https://yeogthpysbqgehjkayaf.supabase.co";
        const SUPABASE_ANON_KEY = "sb_publishable_WoO50Mbz0Rhfy0nPugE3vA_5UP__SYX";
        
        // Supabase 是否可用的标记
        let supabaseAvailable = true;
        
        // ========== 弱网优化工具 ==========
        const SESSION_CHECK_TIMEOUT = 5000;          // 单次检查超时 5 秒
        const MIN_CHECK_INTERVAL = 15000;            // 最小检查间隔 15 秒  
        const MAX_CHECK_INTERVAL = 60000;            // 最大检查间隔 60 秒
        const NETWORK_PENALTY_STEP = 5000;           // 失败一次惩罚增加 5 秒

        // 带超时的 fetch（用于 Supabase 客户端底层请求）
        const originalFetch = window.fetch;
        window.fetch = function(url, options = {}) {
            const timeout = options.timeout || 15000;  // 默认 15 秒超时
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            return originalFetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
        };

        // 当前检查间隔（动态调整）
        let currentSessionCheckInterval = MIN_CHECK_INTERVAL;
        // 最后检查时间戳
        let lastSessionCheckTimeGlobal = 0;
        // 正在检查的标记
        let sessionCheckInProgress = false;
        
        let supabaseClient = null;
        let clientInitialized = false;

        // 初始化 Supabase 客户端
        let supabaseInitPromise = null;
        async function initSupabase() {
            if (clientInitialized) return;
            if (supabaseInitPromise) return supabaseInitPromise;
            if (!supabaseAvailable) {
                throw new Error("Supabase 不可用");
            }

            supabaseInitPromise = (async () => {
                try {
                    if (!SUPABASE_URL || SUPABASE_URL === "https://你的项目.supabase.co" ||
                        !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === "你的anon密钥") {
                        throw new Error("Supabase 配置无效，请检查 URL 和 Key");
                    }

                    // 自定义存储：完全禁用任何存储操作
                    const noopStorage = {
                        getItem: () => null,
                        setItem: () => {},
                        removeItem: () => {},
                    };

                    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                        auth: {
                            storage: noopStorage,          // 使用无操作存储
                            storageKey: null,              // 禁用存储键
                            autoRefreshToken: false,       // 禁用自动刷新令牌
                            persistSession: false,         // 禁用会话持久化
                        },
                        global: {
                            headers: {
                                'X-Client-Info': 'zero-seven-zero-music',
                                'apikey': SUPABASE_ANON_KEY,
                                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                            },
                            // 注入带超时的 fetch
                            fetch: (input, init) => {
                                return originalFetch(input, { ...init, timeout: 15000 });
                            }
                        }
                    });
                    clientInitialized = true;
                } catch (e) {
                    console.error("Supabase 初始化失败", e);
                    clientInitialized = false;
                    supabaseClient = null;
                    supabaseAvailable = false; // 标记 Supabase 不可用
                    throw e;
                }
            })();
            return supabaseInitPromise;
        }

        // 统一的鉴权 RPC 调用（带超时、网络容错）
        async function authRpcCall(rpcName, params, timeoutMs = SESSION_CHECK_TIMEOUT) {
            // 如果 Supabase 不可用，直接返回错误
            if (!supabaseAvailable) {
                console.warn('Supabase 不可用，跳过 RPC 调用:', rpcName);
                throw new Error('Supabase 不可用');
            }
            
            if (rpcName !== 'verify_vip_user' && !params._session_token && !sessionToken) {
                const storedToken = localStorage.getItem('sessionToken');
                if (storedToken) {
                    sessionToken = storedToken;
                }
            }
            
            const finalParams = { ...params };
            if (rpcName !== 'verify_vip_user' && !finalParams._session_token && sessionToken) {
                finalParams._session_token = sessionToken;
            }

            try {
                const { data, error } = await supabaseClient.rpc(rpcName, finalParams, {
                    headers: {
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                    },
                    head: false,
                    count: null,
                });

                if (error) {
                    // 判断是否为网络/超时类错误
                    if (error?.code === 'AbortError' || error?.message?.includes('timeout') || error?.message?.includes('网络') || error?.name === 'TypeError') {
                        console.warn('网络异常，不视为会话过期', error);
                        // 如果是域名解析错误等网络问题，标记 Supabase 不可用
                        if (error?.message?.includes('ERR_NAME_NOT_RESOLVED') || error?.name === 'TypeError') {
                            supabaseAvailable = false;
                        }
                        const netErr = new Error('SESSION_CHECK_NETWORK_ERROR');
                        netErr._networkError = true;   // 标记
                        throw netErr;
                    }
                    throw error;
                }

                // 检查后端返回的会话过期标志或用户被封禁
                if (data && data.success === false) {
                    if (data.error === 'USER_BANNED') {
                        handleSessionExpired(true);
                        throw new Error('您的账号已被封禁');
                    }
                    if (data.error === 'SESSION_EXPIRED') {
                        handleSessionExpired();
                        throw new Error('您的账号已在其他设备登录，请重新登录');
                    }
                }
                
                // 额外检查：每次RPC调用后检查封禁状态
                await checkUserBannedStatusAfterRpc();

                return data;
            } catch (err) {
                // 如果是网络超时或连接失败，不触发过期，仅记录日志
                if (err?._networkError || err?.message === 'SESSION_CHECK_NETWORK_ERROR') {
                    console.warn('会话检查网络异常:', err);
                    // 延长下次检查间隔
                    increaseCheckInterval();
                    throw err; // 继续向上抛出，让调用者处理
                }
                // 其他错误继续抛出
                throw err;
            }
        }

        function increaseCheckInterval() {
            currentSessionCheckInterval = Math.min(
                currentSessionCheckInterval + NETWORK_PENALTY_STEP,
                MAX_CHECK_INTERVAL
            );
        }

        function decreaseCheckInterval() {
            currentSessionCheckInterval = Math.max(
                currentSessionCheckInterval - NETWORK_PENALTY_STEP / 2,
                MIN_CHECK_INTERVAL
            );
        }

        // ========== 统一会话守卫模块 ==========
        let sessionGuardTimer = null;
        let sessionRealtimeChannel = null;
        let userStatusRealtimeChannel = null;
        let backupPollingTimer = null;
        const BACKUP_POLL_INTERVAL = 10 * 1000;

        async function checkSessionFromDB() {
            const user = getCurrentUser();
            if (!user || !user.id) return;
            
            const now = Date.now();
            if (now - lastSessionCheckTimeGlobal < 5000) return;
            lastSessionCheckTimeGlobal = now;
            
            try {
                await initSupabase();
                
                const [sessionData, userData] = await Promise.all([
                    supabaseClient
                        .from('user_sessions')
                        .select('session_token, created_at')
                        .eq('user_id', user.id)
                        .order('created_at', { ascending: false })
                        .limit(1),
                    supabaseClient
                        .from('vip_users')
                        .select('is_banned')
                        .eq('id', user.id)
                        .limit(1)
                ]);
                
                if (sessionData.error) throw sessionData.error;
                if (userData.error) throw userData.error;
                
                if (userData.data && userData.data.length > 0 && userData.data[0].is_banned) {
                    console.warn('检测到账号已被封禁');
                    handleSessionExpired(true);
                    return;
                }
                
                if (sessionData.data && sessionData.data.length > 0) {
                    const latestToken = sessionData.data[0].session_token;
                    const currentToken = localStorage.getItem('sessionToken');
                    if (latestToken && currentToken && latestToken !== currentToken) {
                        console.warn('检测到异地登录，token不一致，退出登录');
                        handleSessionExpired();
                    }
                }
            } catch (err) {
                console.warn('会话数据库检查失败:', err);
            }
        }

        async function checkUserBannedStatus() {
            const user = getCurrentUser();
            if (!user || !user.id) return;
            
            try {
                await initSupabase();
                const { data, error } = await supabaseClient
                    .from('vip_users')
                    .select('is_banned')
                    .eq('id', user.id)
                    .limit(1);
                
                if (error) throw error;
                
                if (data && data.length > 0 && data[0].is_banned) {
                    console.warn('独立检测：账号已被封禁');
                    handleSessionExpired(true);
                }
            } catch (err) {
                console.warn('封禁状态检查失败:', err);
            }
        }

        async function checkUserBannedStatusAfterRpc() {
            const user = getCurrentUser();
            if (!user || !user.id) return;
            if (isSessionExpiredHandling || sessionExpiredNotified) return;
            
            try {
                await initSupabase();
                const { data, error } = await supabaseClient
                    .from('vip_users')
                    .select('is_banned')
                    .eq('id', user.id)
                    .limit(1);
                
                if (error) {
                    console.warn('RPC后封禁检查失败:', error);
                    return;
                }
                
                if (data && data.length > 0 && data[0].is_banned) {
                    console.warn('RPC调用后检测：账号已被封禁');
                    handleSessionExpired(true);
                }
            } catch (err) {
                console.warn('RPC后封禁检查异常:', err);
            }
        }

        function startSessionPollingAsBackup() {
            if (backupPollingTimer) return;
            backupPollingTimer = setInterval(() => {
                if (isSessionExpiredHandling || sessionExpiredNotified) return;
                checkSessionFromDB();
                checkUserBannedStatus();
            }, BACKUP_POLL_INTERVAL);
        }

        function stopSessionPollingAsBackup() {
            if (backupPollingTimer) {
                clearInterval(backupPollingTimer);
                backupPollingTimer = null;
            }
        }

        async function subscribeToSessionChanges() {
            const user = getCurrentUser();
            if (!user || !user.id) return;

            await initSupabase();
            if (!supabaseClient) return;

            if (sessionRealtimeChannel) {
                supabaseClient.removeChannel(sessionRealtimeChannel);
                sessionRealtimeChannel = null;
            }

            sessionRealtimeChannel = supabaseClient
                .channel('user_sessions_channel')
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'user_sessions',
                        filter: `user_id=eq.${user.id}`
                    },
                    async (payload) => {
                        if (isSessionExpiredHandling || sessionExpiredNotified) return;

                        const newSessionToken = payload.new?.session_token;
                        const oldSessionToken = payload.old?.session_token;
                        const currentToken = localStorage.getItem('sessionToken');
                        const eventToken = newSessionToken || oldSessionToken;

                        // 仅当事件中的 token 确实与当前 token 不同时才怀疑过期
                        if (eventToken && currentToken && eventToken !== currentToken) {
                            // 二次确认：调用后端检查当前 token 是否仍然有效
                            try {
                                const check = await authRpcCall('check_session_valid', {
                                    _user_id: user.id,
                                    _session_token: currentToken
                                });
                                if (!check.success) {
                                    handleSessionExpired();
                                }
                                // 若仍有效，可能是事件延迟或无关更新，忽略
                            } catch (e) {
                                console.warn('二次校验失败，忽略实时事件', e);
                            }
                        } else if (payload.eventType === 'DELETE' && oldSessionToken === currentToken) {
                            // 删除事件时也进行二次确认
                            try {
                                const check = await authRpcCall('check_session_valid', {
                                    _user_id: user.id,
                                    _session_token: currentToken
                                });
                                if (!check.success) {
                                    handleSessionExpired();
                                }
                            } catch (e) {
                                console.warn('删除事件二次校验失败，忽略', e);
                            }
                        }
                    }
                )
                .subscribe((status) => {
                    if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
                        console.warn('会话 Realtime 订阅异常，启动后备轮询');
                        startSessionPollingAsBackup();
                    } else if (status === 'SUBSCRIBED') {
                        stopSessionPollingAsBackup();
                    }
                });
        }

        async function subscribeToUserStatusChanges() {
            const user = getCurrentUser();
            if (!user || !user.id) return;

            await initSupabase();
            if (!supabaseClient) return;

            if (userStatusRealtimeChannel) {
                supabaseClient.removeChannel(userStatusRealtimeChannel);
                userStatusRealtimeChannel = null;
            }

            userStatusRealtimeChannel = supabaseClient
                .channel('vip_users_channel')
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'vip_users',
                        filter: `id=eq.${user.id}`
                    },
                    async (payload) => {
                        if (isSessionExpiredHandling || sessionExpiredNotified) return;

                        const isBanned = payload.new?.is_banned;
                        if (isBanned) {
                            console.warn('实时检测到账号已被封禁');
                            handleSessionExpired(true);
                        }
                    }
                )
                .subscribe((status) => {
                    if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
                        console.warn('用户状态 Realtime 订阅异常，启动后备轮询');
                        startSessionPollingAsBackup();
                    }
                });
        }

        function startSessionGuard() {
            stopSessionGuard();

            isSessionExpiredHandling = false;
            sessionExpiredNotified = false;

            const user = getCurrentUser();
            if (!user || !user.id) return;

            subscribeToSessionChanges();
            subscribeToUserStatusChanges();
        }

        function stopSessionGuard() {
            if (sessionGuardTimer) {
                clearInterval(sessionGuardTimer);
                sessionGuardTimer = null;
            }
            
            stopSessionPollingAsBackup();
            
            if (sessionRealtimeChannel) {
                try {
                    supabaseClient.removeChannel(sessionRealtimeChannel);
                } catch (e) {
                    console.warn('移除会话通道失败:', e);
                }
                sessionRealtimeChannel = null;
            }
            
            if (userStatusRealtimeChannel) {
                try {
                    supabaseClient.removeChannel(userStatusRealtimeChannel);
                } catch (e) {
                    console.warn('移除用户状态通道失败:', e);
                }
                userStatusRealtimeChannel = null;
            }
        }

        // ========== 统一会话守卫模块结束 ==========

        // 关闭账号异处登录模态框
        function closeSessionExpiredModal() {
            const modal = document.getElementById('sessionExpiredModal');
            const overlay = document.getElementById('modalOverlay');
            if (modal) modal.classList.remove('show');
            if (overlay) overlay.classList.remove('show');
            
            // 恢复页面操作和滚动
            document.body.style.pointerEvents = 'auto';
            document.body.style.overflow = 'auto';
            
            isSessionExpiredHandling = false;
            sessionExpiredNotified = false;
            switchPage('home');
            location.reload();
        }

        // 会话过期处理：清空本地数据，显示模态框并刷新页面
        function handleSessionExpired(isBanned = false) {
            if (isSessionExpiredHandling) return;
            if (sessionExpiredNotified) return;
            
            isSessionExpiredHandling = true;
            sessionExpiredNotified = true;
            
            localStorage.setItem('sessionExpiredFlag', Date.now().toString());
            
            // 停止所有后台任务
            if (autoSyncInterval) {
                clearInterval(autoSyncInterval);
                autoSyncInterval = null;
            }
            stopSessionGuard();
            if (sessionRealtimeChannel) {
                if (supabaseClient) supabaseClient.removeChannel(sessionRealtimeChannel);
                sessionRealtimeChannel = null;
            }
            if (pointsRealtimeChannel) {
                if (supabaseClient) supabaseClient.removeChannel(pointsRealtimeChannel);
                pointsRealtimeChannel = null;
            }
            
            // ====== 修复点：先清除登录标志，再清除数据，避免 setStorageItem 写入 guest_ 前缀 ======
            // 1. 先移除登录标志
            localStorage.removeItem('userLoggedIn');
            localStorage.removeItem('sessionToken');
            localStorage.removeItem('vipUser');
            localStorage.removeItem('username');
            localStorage.removeItem('userAvatar');
            
            // 2. 再清除其他所有用户数据（直接 removeItem，不调用 setStorageItem）
            localStorage.removeItem('totalPlayTime');
            localStorage.removeItem('songDetailsCache');
            localStorage.removeItem('myPlaylists');
            localStorage.removeItem('sessionExpiredFlag');
            localStorage.removeItem('wyPageSize');
            localStorage.removeItem('biliPageSize');
            localStorage.removeItem('yunzhi_token');
            localStorage.removeItem('theme');
            localStorage.removeItem('navbarShowText');
            localStorage.removeItem('defaultPage');
            localStorage.removeItem('preferred_playbackRate');
            localStorage.removeItem('preferred_playMode');
            localStorage.removeItem('playHistory');   // 直接删除，不通过 setStorageItem
            localStorage.removeItem('searchHistory'); // 直接删除
            localStorage.removeItem('user_settings'); // 旧的用户设置
            localStorage.removeItem('user_setting'); // 新的用户设置
            localStorage.removeItem('user_plays'); // 新的用户播放数据
            localStorage.removeItem('user_points'); // 新的用户积分数据
            localStorage.removeItem('user_avatar_history'); // 新的用户头像历史
            
            // 3. 重置内存中的变量
            sessionToken = '';
            playHistory = [];
            searchHistory = [];
            songDetailsCache = {};
            myPlaylists = [];
            playlist = [];
            wyPageSize = 20;
            biliPageSize = 20;
            yunzhiToken = '';
            currentTheme = 'dark';
            defaultPage = 'home';
            
            // 4. 更新界面
            updateLoginStatus();
            if (profilePage.style.display === 'block') {
                updateProfileStats();
                loadRecentPlays();
                loadMyPlaylists();
                loadAvatarHistory();
                loadPoints();
            }
            clearPlayer();
            wySongList.innerHTML = '';
            biliSongList.innerHTML = '';
            searchResults = { wy: [], bili: [] };
            
            // 更新封禁提示消息
            updateSessionExpiredMessage(isBanned);
            
            // 显示账号异处登录模态框
            openModal('sessionExpiredModal');
        }

        function updateSessionExpiredMessage(isBanned) {
            const modalTitle = document.getElementById('sessionExpiredModalTitle');
            const modalMessage = document.getElementById('sessionExpiredModalMessage');
            if (isBanned) {
                modalTitle.textContent = '账号已被封禁';
                modalMessage.textContent = '您的账号已被管理员封禁，无法继续使用。如有疑问，请联系管理员。';
            } else {
                modalTitle.textContent = '账号已在其他设备登录';
                modalMessage.textContent = '您的账号已在其他设备登录，为了您的账号安全，请重新登录。';
            }
        }

        const STORAGE_KEY = "vipUser";  // 存储键名

        function saveUser(user) {
            if (user) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ 
                    id: user.id, 
                    username: user.username,
                    avatar_url: user.avatar_url || '',
                    is_member: user.is_member || false,
                    is_permanent_member: user.is_permanent_member || false,
                    member_days_remaining: user.member_days_remaining || 0,
                    member_end_time: user.member_end_time || null
                }));
                localStorage.setItem('userLoggedIn', 'true');
                localStorage.setItem('username', user.username);
                if (user.avatar_url) {
                    localStorage.setItem('userAvatar', user.avatar_url);
                }
            } else {
                localStorage.removeItem(STORAGE_KEY);
                localStorage.removeItem('userLoggedIn');
                localStorage.removeItem('username');
                localStorage.removeItem('userAvatar');
            }
            updateLoginStatus();
        }

        function getCurrentUser() {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const user = JSON.parse(stored);
                user.avatar_url = localStorage.getItem('userAvatar') || '';
                return user;
            }
            return null;
        }

        const DURATION = 720;
        let busy = false, timer;

        // 打开登录页面（跳转到用户中心）
        function openLoginPage() {
            window.location.href = './usercenter';
        }

        // ---------- 注册（调用 create_vip_user） ----------
        async function vipSignup(username, password, confirmPwd, secretKey) {
            await initSupabase();

            const uname = username.trim();
            const pwd = password.trim();
            
            // 用户名验证
            if (!uname) throw new Error("用户名不能为空");
            if (uname.length < 1) throw new Error("用户名至少1个字符");
            if (uname.length > 15) throw new Error("用户名不能超过15个字符");
            if (uname.includes(' ')) throw new Error("用户名不能包含空格");
            if (!/^[a-zA-Z0-9\u4e00-\u9fa5]+$/.test(uname)) throw new Error("用户名只能包含字母、数字和中文");
            
            // 密码验证
            if (!pwd) throw new Error("密码不能为空");
            if (pwd.length < 6) throw new Error("密码长度至少6位");
            if (pwd.length > 20) throw new Error("密码不能超过20个字符");
            if (pwd.includes(' ')) throw new Error("密码不能包含空格");
            
            if (pwd !== confirmPwd) throw new Error("两次输入的密码不一致");
            if (!secretKey) throw new Error("注册密钥不能为空");
            if (!supabaseClient) throw new Error("Supabase 客户端未初始化");

            const { data, error } = await supabaseClient.rpc('create_vip_user', {
                _username: uname,
                _password: pwd,
                _key: secretKey
            });

            if (error) {
                console.error('create_vip_user RPC 错误', error);
                throw new Error(`注册失败: ${error.message}`);
            }
            if (!data || !data.success) {
                throw new Error(data?.error || "无效的密钥，请联系管理员获取");
            }
            return data;
        }

        // ---------- 登录（调用 verify_vip_user） ----------
        async function vipLogin(username, password) {
            showGlobalLoading('正在验证账号...');
            await initSupabase();
            
            const uname = username.trim();
            if (!uname) throw new Error("用户名不能为空");
            if (!password) throw new Error("密码不能为空");
            if (!supabaseClient) throw new Error("Supabase 客户端未初始化");

            const { data, error } = await supabaseClient.rpc('verify_vip_user', {
                _username: uname,
                _password: password
            });

            if (error) throw new Error(`登录失败: ${error.message}`);
            if (!data || !data.success) {
                const errorMsg = data?.error;
                if (errorMsg === 'USER_BANNED') {
                    throw new Error("您的账号已被封禁，无法登录。");
                }
                throw new Error(errorMsg === 'USER_NOT_FOUND' ? "用户名不存在" : errorMsg === 'INVALID_PASSWORD' ? "密码错误" : "用户名或密码错误");
            }

            // 存储会话令牌
            sessionToken = data.session_token;
            localStorage.setItem('sessionToken', sessionToken);

            // 存储用户信息
            saveUser({ 
                id: data.user_id, 
                username: data.username,
                avatar_url: data.avatar_url || ''
            });

            // 登录成功后清空当前播放的歌曲
            clearPlayer();

            // 不再自动为新用户创建默认头像
            // 保持原有的头像状态

            isSessionExpiredHandling = false;
            sessionExpiredNotified = false;

            // 启动会话守卫
            startSessionGuard();
            // 订阅积分实时变更
            subscribeToPointsChanges();
            
            // 记录登录日志（使用 authRpcCall）
            try {
                await authRpcCall('record_user_login', { _user_id: data.user_id });
            } catch (logErr) {
                console.warn('记录登录日志失败', logErr);
            }

            // 登录成功后，同步数据时显示加载动画
            showGlobalLoading('正在同步个人数据...');
            
            // 直接获取服务器上的用户数据，不再合并访客数据
            await fetchUserData();
            
            // 上传本地数据到服务器（如果有）
            await syncUserData(false);   // 上传本地数据到服务器
            lastUploadDataHash = getCurrentDataHash();
            loadSearchHistory('wy');
            loadSearchHistory('bili');
            loadSearchHistory('qq');
            updateUserStatsDisplay();
            updateProfileStats();
            
            // 加载积分和头像历史数据
            await loadPoints();
            await loadAvatarHistory();
            
            hideGlobalLoading();

            return data;
        }

        // 关闭登录页面 / 用户中心
        function closeLoginPage() {
            const loginPage = document.getElementById('loginPage');
            loginPage.classList.remove('show');
            document.body.style.overflow = '';
        }

        // 切换登录/注册面板
        function go(toSignup) {
            if (busy) return;
            busy = true;
            clearTimeout(timer);
            authBox.classList.toggle('signup-mode', toSignup);

            // 检测是否为手机（屏幕宽度小于768px）
            const isMobile = window.innerWidth < 768;

            if (isMobile) {
                // 手机上直接切换，不使用动画
                pA.classList.toggle('show-reg', toSignup);
                pB.classList.toggle('show-welcome', toSignup);
                busy = false;
            } else {
                // 桌面端使用动画切换
                timer = setTimeout(() => {
                    pA.classList.toggle('show-reg', toSignup);
                    pB.classList.toggle('show-welcome', toSignup);
                }, DURATION / 2);
                setTimeout(() => {
                    busy = false;
                }, DURATION);
            }
        }

        // 登录功能
        async function handleLogin() {
            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value.trim();

            if (!username || !password) {
                showToast('请输入用户名和密码', 'error');
                return;
            }

            // 🔒 锁定自动同步，防止登录过程中上传旧数据
            isAutoSyncingLocked = true;

            try {
                await vipLogin(username, password);
                showToast('登录成功！', 'success');
                closeLoginPage();

                // 检查会员状态
                await checkMembershipStatus();

                updateLoginStatus();
                updateUserCenterView();

                // vipLogin 内部已调用 fetchUserData 并设置 lastUploadDataHash
                // 刷新搜索历史显示
                loadSearchHistory('wy');
                loadSearchHistory('bili');
                loadSearchHistory('qq');
                updateUserStatsDisplay();
                updateProfileStats();
            } catch (error) {
                hideGlobalLoading();
                showToast(error.message, 'error');
            } finally {
                // 🔓 解锁自动同步
                isAutoSyncingLocked = false;
            }
        }

        // 注册功能
        async function handleRegister() {
            const rawUsername = document.getElementById('regUsername').value;
            const rawPassword = document.getElementById('regPassword').value;
            const rawConfirmPwd = document.getElementById('regConfirmPwd').value;
            const rawSecretKey = document.getElementById('regSecretKey').value;
            
            // 检查空格
            if (rawUsername.includes(' ')) {
                showToast('用户名不能包含空格', 'error');
                return;
            }
            if (rawPassword.includes(' ')) {
                showToast('密码不能包含空格', 'error');
                return;
            }
            if (rawConfirmPwd.includes(' ')) {
                showToast('确认密码不能包含空格', 'error');
                return;
            }
            
            const username = rawUsername.trim();
            const password = rawPassword.trim();
            const confirmPwd = rawConfirmPwd.trim();
            const secretKey = rawSecretKey.trim();

            if (!username && !password && !confirmPwd && !secretKey) {
                showToast('请填写注册信息', 'error');
                return;
            }
            if (!username) {
                showToast('请输入用户名', 'error');
                return;
            }
            if (!password) {
                showToast('请输入密码', 'error');
                return;
            }
            if (!confirmPwd) {
                showToast('请确认密码', 'error');
                return;
            }
            if (!secretKey) {
                showToast('请输入注册密钥', 'error');
                return;
            }

            if (password !== confirmPwd) {
                showToast('两次输入的密码不一致', 'error');
                return;
            }

            try {
                const data = await vipSignup(username, password, confirmPwd, secretKey);
                if (data && data.success) {
                    showToast('注册成功！正在自动登录...', 'success');
                    // 自动填充登录表单并登录
                    document.getElementById('loginUsername').value = username;
                    document.getElementById('loginPassword').value = password;
                    await handleLogin();
                }
                // 清空表单
                document.getElementById('regUsername').value = '';
                document.getElementById('regPassword').value = '';
                document.getElementById('regConfirmPwd').value = '';
                document.getElementById('regSecretKey').value = '';
                go(false); // 切换到登录面板
            } catch (error) {
                if (error.message.includes('用户名') || error.message.includes('already exists')) {
                    showToast('用户名已存在', 'error');
                } else if (error.message.includes('密钥') || error.message.includes('key')) {
                    showToast('注册秘钥无效，请联系管理员获取', 'error');
                } else {
                    showToast(error.message, 'error');
                }
            }
        }

        // 更新登录状态显示
        function updateLoginStatus() {
            const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true';
            const username = localStorage.getItem('username');
            const userAvatar = localStorage.getItem('userAvatar');
            const navProfile = document.getElementById('navProfile');

            // 更新导航栏
            if (navProfile) {
                const span = navProfile.querySelector('span');
                if (isLoggedIn && username) {
                    span.textContent = username;
                } else {
                    span.textContent = '我的';
                }
            }

            // 更新个人页面
            const profileName = document.getElementById('profileName');
            const profileDesc = document.getElementById('profileDesc');
            const profileAvatar = document.getElementById('profileAvatar');
            const profileLoginBtn = document.getElementById('profileLoginBtn');
            const profileLogoutBtn = document.getElementById('profileLogoutBtn');
            const user = getCurrentUser();
            const isMember = user?.is_member;

            if (profileName) {
                profileName.textContent = isLoggedIn && username ? username : '访客';
                if (isMember && isLoggedIn) {
                    profileName.classList.add('vip-name');
                } else {
                    profileName.classList.remove('vip-name');
                }
            }
            if (profileDesc) {
                profileDesc.textContent = isLoggedIn ? '乐在其中 · 自有回响' : '登录以同步您的音乐数据';
            }

            // 更新首页用户中心卡片描述
            const homeUserCenterDesc = document.getElementById('homeUserCenterDesc');
            if (homeUserCenterDesc) {
                homeUserCenterDesc.textContent = isLoggedIn && username ? `已登录：${username}，点击管理账号` : '登录 / 注册，管理账号信息';
            }

            // 更新个人页面"前往用户中心"按钮文字
            const goUserCenterBtn = document.getElementById('goUserCenterBtn');
            if (goUserCenterBtn) {
                goUserCenterBtn.innerHTML = '<i class="fas fa-user-gear"></i> 用户中心';
            }
            if (profileAvatar) {
                const vipClass = isMember ? 'vip-avatar' : '';
                
                if (isLoggedIn && userAvatar) {
                    let finalAvatar = userAvatar;
                    if (finalAvatar.startsWith('//')) finalAvatar = 'https:' + finalAvatar;
                    else if (finalAvatar.startsWith('http://')) finalAvatar = finalAvatar.replace('http://', 'https://');
                    
                    profileAvatar.innerHTML = `<div class="avatar-container ${vipClass}">
                        <div class="avatar-inner">
                            <img src="${finalAvatar}" alt="avatar" loading="lazy" decoding="async"
                                onerror="this.onerror=null; this.parentElement.innerHTML='&lt;i class=&quot;fas fa-user-circle&quot;&gt;&lt;/i&gt;'">
                        </div>
                        <div class="avatar-border"></div>
                        ${isMember ? '<div class="avatar-crown"><i class="fas fa-crown"></i></div>' : ''}
                    </div>`;
                } else {
                    profileAvatar.innerHTML = `<div class="avatar-container ${vipClass}">
                        <div class="avatar-inner"><i class="fas ${isLoggedIn ? 'fa-user-circle' : 'fa-user'}"></i></div>
                        <div class="avatar-border"></div>
                        ${isMember ? '<div class="avatar-crown"><i class="fas fa-crown"></i></div>' : ''}
                    </div>`;
                }
            }
            if (profileLoginBtn && profileLogoutBtn) {
                const profileSyncBtn = document.getElementById('profileSyncBtn');
                const editAvatarBtn = document.getElementById('editAvatarBtn');
                if (isLoggedIn) {
                    profileLoginBtn.style.display = 'none';
                    profileLogoutBtn.style.display = 'flex';
                    if (profileSyncBtn) {
                        profileSyncBtn.style.display = 'flex';
                    }
                    // 显示编辑头像按钮
                    if (editAvatarBtn) {
                        editAvatarBtn.style.display = 'flex';
                        // 移除旧监听避免重复绑定
                        const newBtn = editAvatarBtn.cloneNode(true);
                        editAvatarBtn.parentNode.replaceChild(newBtn, editAvatarBtn);
                        newBtn.addEventListener('click', async () => {
                            // 打开更换头像模态框
                            openModal('editAvatarModal');
                        });
                    }
                    // 显示积分区域
                    const pointsCollapsibleSection = document.getElementById('pointsCollapsibleSection');
                    if (pointsCollapsibleSection) pointsCollapsibleSection.style.display = 'block';
                    // 显示积分记录区域
                    const pointsHistorySection = document.getElementById('pointsHistorySection');
                    if (pointsHistorySection) pointsHistorySection.style.display = 'block';
                } else {
                    profileLoginBtn.style.display = 'flex';
                    profileLogoutBtn.style.display = 'none';
                    if (profileSyncBtn) {
                        profileSyncBtn.style.display = 'none';
                    }
                    if (editAvatarBtn) {
                        editAvatarBtn.style.display = 'none';
                    }
                    // 隐藏积分区域
                    const pointsCollapsibleSection = document.getElementById('pointsCollapsibleSection');
                    if (pointsCollapsibleSection) pointsCollapsibleSection.style.display = 'none';
                    // 隐藏积分记录区域
                    const pointsHistorySection = document.getElementById('pointsHistorySection');
                    if (pointsHistorySection) pointsHistorySection.style.display = 'none';
                }
            }
        }

        // 处理本地图片选择
        let selectedAvatarFile = null;
        let isHistoryAvatarSelected = false;

        function handleAvatarFileSelect(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            // 重置历史头像标记
            isHistoryAvatarSelected = false;

            // 检查文件类型
            if (!file.type.startsWith('image/')) {
                showToast('请选择图片文件', 'error');
                return;
            }

            // 检查文件大小（限制为 2MB）
            if (file.size > 2 * 1024 * 1024) {
                showToast('图片大小不能超过 2MB', 'error');
                return;
            }

            selectedAvatarFile = file;

            // 显示预览
            const reader = new FileReader();
            reader.onload = function(e) {
                const previewContainer = document.getElementById('avatarPreviewContainer');
                const uploadContent = document.getElementById('avatarUploadContent');
                const previewImg = document.getElementById('avatarPreviewImg');

                if (previewContainer && uploadContent && previewImg) {
                    previewImg.src = e.target.result;
                    previewContainer.style.display = 'flex';
                    uploadContent.style.display = 'none';
                }
            };
            reader.readAsDataURL(file);

            // 清空 URL 输入框
            const avatarUrlInput = document.getElementById('avatarUrlInput');
            if (avatarUrlInput) {
                avatarUrlInput.value = '';
            }
        }

        // 清除头像预览
        function clearAvatarPreview() {
            selectedAvatarFile = null;
            isHistoryAvatarSelected = false;
            const previewContainer = document.getElementById('avatarPreviewContainer');
            const uploadContent = document.getElementById('avatarUploadContent');
            const fileInput = document.getElementById('avatarFileInput');

            if (previewContainer) previewContainer.style.display = 'none';
            if (uploadContent) uploadContent.style.display = 'flex';
            if (fileInput) fileInput.value = '';
        }

        // 将本地图片通过 API 上传并更新头像
        async function updateAvatarWithLocalFile() {
            if (!selectedAvatarFile) {
                showToast('请选择本地图片', 'error');
                return;
            }

            closeModal('editAvatarModal');

            const user = getCurrentUser();
            if (!user || !user.id) {
                showToast('请先登录', 'error');
                return;
            }

            try {
                // 显示加载提示
                showToast('正在上传图片...', 'info');

                // 创建 FormData 并添加文件
                const formData = new FormData();
                formData.append('image', selectedAvatarFile);
                formData.append('outputFormat', 'webp'); // 使用 WebP 格式获得更好的压缩率

                // 发送上传请求
                const response = await fetch('https://img.scdn.io/api/v1.php', {
                    method: 'POST',
                    body: formData
                });

                // 处理响应
                const result = await response.json();

                if (result.success) {
                    // 使用 API 返回的图片 URL
                    const avatarUrl = result.url;

                    // 检查积分是否足够
                    await initSupabase();
                    const pointsData = await authRpcCall('get_user_points', {
                        _user_id: user.id
                    });

                    if (pointsData && pointsData.success) {
                        const currentPoints = pointsData.total_points || 0;
                        if (currentPoints < 100) {
                            showToast(`当前积分不足！您当前有 ${currentPoints} 积分，更换头像需要 100 积分`, 'error');
                            return;
                        }
                    }

                    // 更新头像（内部会自动消耗100积分）
                    await updateUserAvatar(avatarUrl);

                    // 清除预览
                    clearAvatarPreview();
                } else {
                    throw new Error(result.message || '上传失败');
                }
            } catch (error) {
                console.error('上传图片失败:', error);
                showToast(`上传图片失败: ${error.message}`, 'error');
            }
        }

        // 确认更换头像
        async function confirmAvatarUpdate() {
            const avatarUrlInput = document.getElementById('avatarUrlInput');
            const avatarUrl = avatarUrlInput.value.trim();
            
            // 如果有本地文件选中，则使用本地文件
            if (selectedAvatarFile) {
                await updateAvatarWithLocalFile();
                return;
            }
            
            if (!avatarUrl) {
                showToast('请输入头像 URL 或选择本地图片', 'error');
                return;
            }
            
            if (!avatarUrl.startsWith('http://') && !avatarUrl.startsWith('https://') && !avatarUrl.startsWith('data:')) {
                showToast('请输入有效的图片 URL', 'error');
                return;
            }
            
            closeModal('editAvatarModal');
            
            const user = getCurrentUser();
            if (!user || !user.id) {
                showToast('请先登录', 'error');
                return;
            }
            
            try {
                // 如果选择了历史头像，不消耗积分
                if (!isHistoryAvatarSelected) {
                    // 不是历史头像，需要检查积分
                    await initSupabase();
                    const pointsData = await authRpcCall('get_user_points', {
                        _user_id: user.id
                    });
                    
                    if (pointsData && pointsData.success) {
                        const currentPoints = pointsData.total_points || 0;
                        if (currentPoints < 100) {
                            showToast(`当前积分不足！您当前有 ${currentPoints} 积分，更换头像需要 100 积分`, 'error');
                            return;
                        }
                    }
                }
                
                // 更新头像（在重置标记之前调用，确保正确传递历史头像标记）
                await updateUserAvatar(avatarUrl, isHistoryAvatarSelected);
                
                // 重置历史头像标记
                isHistoryAvatarSelected = false;
            } catch (error) {
                console.error('更换头像失败:', error);
                showToast('更换头像失败', 'error');
            }
        }

        // 更新用户头像
        async function updateUserAvatar(avatarUrl, isHistoryAvatar = false) {
            const user = getCurrentUser();
            if (!user || !user.id) {
                showToast('请先登录', 'error');
                return;
            }
            
            if (!sessionToken) {
                showToast('会话过期，请重新登录', 'error');
                return;
            }
            
            console.log('更换头像请求:', {
                user_id: user.id,
                avatar_url: avatarUrl,
                session_token: sessionToken
            });
            
            try {
                await initSupabase();
                const data = await authRpcCall('update_user_avatar', {
                    _user_id: user.id,
                    _avatar_url: avatarUrl,
                    _is_history_avatar: isHistoryAvatar
                });
                
                console.log('更换头像响应:', data);
                
                if (data && data.success) {
                    // 更新本地存储
                    localStorage.setItem('userAvatar', avatarUrl);
                    const storedUser = getCurrentUser();
                    if (storedUser) {
                        storedUser.avatar_url = avatarUrl;
                        saveUser(storedUser);
                    }
                    // 刷新页面显示
                    updateLoginStatus();
                    showToast('头像更新成功', 'success');
                    // 刷新头像历史记录
                    if (profilePage.style.display === 'block') {
                        loadAvatarHistory();
                    }
                    // 可选：同步其他数据（如果需要）
                    await syncUserData(false);
                    // 实时更新积分显示
                    if (data.total_points !== undefined) {
                        const pointsElement = document.getElementById('totalPointsValue');
                        if (pointsElement) {
                            pointsElement.textContent = data.total_points;
                        }
                        // 刷新积分记录
                        loadPointsHistory(data.history || []);
                    }
                } else {
                    const errorMessage = data?.error || '更新失败';
                    console.error('更换头像失败:', errorMessage);
                    throw new Error(errorMessage);
                }
            } catch (err) {
                console.error('更换头像异常:', err);
                showToast('更新头像失败：' + err.message, 'error');
            }
        }

        // 登录时，不再合并 guest 数据到 user 数据
        function mergeGuestToUser() {
            // 移除合并逻辑，保持访客数据和用户数据完全分离
            // 登录后直接使用用户数据
        }

        // 登出时，清空保存在本地的用户数据
        function saveUserToGuest() {
            // 直接删除用户数据，不再保存为访客数据
            localStorage.removeItem('user_settings');
        }

        // 退出登录确认
        function confirmLogout() {
            // 直接执行退出登录，不再显示确认模态框
            logout();
        }

        // 退出登录
        async function logout() {
            // 防止重复执行
            if (isSessionExpiredHandling) return;
            isSessionExpiredHandling = true;
            
            // 显示加载动画
            showGlobalLoading('正在退出登录...');

            // 停止同步防抖定时器
            if (syncDebounceTimer) clearTimeout(syncDebounceTimer);

            // 1. 停止所有后台任务
            if (autoSyncInterval) {
                clearInterval(autoSyncInterval);
                autoSyncInterval = null;
            }
            stopSessionGuard();
            if (sessionRealtimeChannel) {
                if (supabaseClient) supabaseClient.removeChannel(sessionRealtimeChannel);
                sessionRealtimeChannel = null;
            }

            // 2. 尝试上传数据（网络请求，失败不影响本地清理）
            try {
                if (sessionToken && getCurrentUser()) {
                    await syncUserData(false);
                }
            } catch(e) {
                console.warn('登出时上传数据失败', e);
            }

            // 3. 尝试撤销会话（网络请求，失败不影响本地清理）
            try {
                if (sessionToken && getCurrentUser()) {
                    await supabaseClient.rpc('revoke_session', { _session_token: sessionToken });
                }
            } catch(e) {
                console.warn('登出时撤销会话失败', e);
            }

            // 4. 清空保存在本地的用户数据
            saveUserToGuest();
            
            // 5. 清除登录相关的本地存储
            localStorage.removeItem('userLoggedIn');
            localStorage.removeItem('sessionToken');
            localStorage.removeItem('vipUser');
            localStorage.removeItem('username');
            localStorage.removeItem('userAvatar');
            localStorage.removeItem('sessionExpiredFlag');
            localStorage.removeItem('user_settings'); // 旧的用户设置
            localStorage.removeItem('user_setting'); // 新的用户设置
            localStorage.removeItem('user_plays'); // 新的用户播放数据
            localStorage.removeItem('user_points'); // 新的用户积分数据
            localStorage.removeItem('user_avatar_history'); // 新的用户头像历史
            
            // 5. 清除全局变量中的用户数据
            sessionToken = '';
            songDetailsCache = {};
            myPlaylists = [];
            playlist = [];
            searchResults = { wy: [], bili: [], qq: [] };
            
            // 重新加载访客数据（从 guest_settings 读取）
            const guestSettings = JSON.parse(localStorage.getItem('guest_settings') || JSON.stringify(DEFAULT_SETTINGS));
            
            // 更新全局变量为访客数据
            playHistory = guestSettings.plays?.playHistory || [];
            searchHistory = guestSettings.plays?.searchHistory || [];
            wyPageSize = guestSettings.wyPageSize || 20;
            biliPageSize = guestSettings.biliPageSize || 20;
            qqPageSize = guestSettings.qqPageSize || 20;
            yunzhiToken = guestSettings.yunzhiToken || '';
            currentTheme = guestSettings.theme || 'dark';
            defaultPage = guestSettings.defaultPage || 'home';
            
            // 刷新UI
            updateLoginStatus();
            
            // 重新加载搜索历史（访客数据）
            loadSearchHistory('wy');
            loadSearchHistory('bili');
            loadSearchHistory('qq');
            
            // 清空所有平台的歌曲列表显示
            if (wySongList) wySongList.innerHTML = '';
            if (biliSongList) biliSongList.innerHTML = '';
            if (qqSongList) qqSongList.innerHTML = '';
            
            // 重置空状态显示
            if (wyEmptyState) wyEmptyState.style.display = 'block';
            if (biliEmptyState) biliEmptyState.style.display = 'block';
            if (qqEmptyState) qqEmptyState.style.display = 'block';
            
            // 刷新积分和积分记录显示（无论是否在个人页面）
            const pointsElement = document.getElementById('totalPointsValue');
            if (pointsElement) {
                pointsElement.textContent = '0';
            }
            
            const pointsHistoryList = document.getElementById('pointsHistoryList');
            if (pointsHistoryList) {
                pointsHistoryList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-coins"></i>
                        <p>暂无积分记录</p>
                    </div>
                `;
            }
            
            const avatarHistoryList = document.getElementById('avatarHistoryList');
            if (avatarHistoryList) {
                avatarHistoryList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-image"></i>
                        <p>暂无头像历史记录</p>
                    </div>
                `;
            }
            
            // 如果当前在个人页面，刷新个人页面显示
            if (profilePage && profilePage.style.display === 'block') {
                updateProfileStats();
                loadRecentPlays();
                loadMyPlaylists();
                loadAvatarHistory();
                loadPoints();
            }
            
            // 如果当前在设置页面，刷新设置项显示
            if (settingsPage && settingsPage.style.display === 'block') {
                document.getElementById('wyPageSizeInput').value = wyPageSize;
                document.getElementById('biliPageSizeInput').value = biliPageSize;
                document.getElementById('qqPageSizeInput').value = qqPageSize;
                document.getElementById('tokenInput').value = yunzhiToken;
                updateNavbarTextVisibility();
                document.getElementById('navbarTextToggle').checked = guestSettings.navbarShowText ?? true;
                updateNavbarButtonsVisibility();
            }
            
            // 重新初始化主题（根据访客主题设置）
            initTheme();
            
            // 清空播放器
            clearPlayer();
            
            showToast('已退出登录', 'success');

            // 重置标志
            isSessionExpiredHandling = false;
            sessionExpiredNotified = false;

            // 切换到主页
            switchPage('home');
            
            // 隐藏加载动画
            hideGlobalLoading();
        }

        // 同步用户数据到服务器
        async function syncUserData(showNotifications = true) {
            if (isAutoSyncingLocked && !showNotifications) return;
            if (isSyncing) return;
            
            const user = getCurrentUser();
            if (!user || !user.id) {
                if (showNotifications) showToast('请先登录', 'error');
                return;
            }
            if (!supabaseClient) {
                if (showNotifications) showToast('系统初始化失败，无法同步', 'error');
                return;
            }

            // 获取当前设置和播放数据
            const settings = getCurrentSettings();
            const plays = getCurrentPlays();
            
            // 检查是否有数据需要同步
            const hasData = (plays.playHistory?.length || 0) > 0 || (plays.searchHistory?.length || 0) > 0 || (plays.totalPlayTime || 0) > 0 || settings.theme;
            if (!hasData) {
                if (showNotifications) showToast('无新数据需要同步', 'info');
                return;
            }

            isSyncing = true;
            if (showNotifications) showToast('正在上传数据...', 'warning');

            try {
                const settingsObj = {
                    theme: settings.theme || 'dark',
                    wyPageSize: settings.wyPageSize || 20,
                    biliPageSize: settings.biliPageSize || 20,
                    qqPageSize: settings.qqPageSize || 20,
                    yunzhiToken: settings.yunzhiToken || '',
                    navbarShowText: settings.navbarShowText ?? true,
                    navbarShowWy: settings.navbarShowWy ?? true,
                    navbarShowBili: settings.navbarShowBili ?? true,
                    navbarShowQq: settings.navbarShowQq ?? true,
                    defaultPage: settings.defaultPage || 'home',
                    wy_page_size: settings.wyPageSize || 20,
                    bili_page_size: settings.biliPageSize || 20,
                    qq_page_size: settings.qqPageSize || 20,
                    token: settings.yunzhiToken || '',
                    navbar_show_text: settings.navbarShowText ?? true,
                    navbar_show_wy: settings.navbarShowWy ?? true,
                    navbar_show_bili: settings.navbarShowBili ?? true,
                    navbar_show_qq: settings.navbarShowQq ?? true,
                    default_page: settings.defaultPage || 'home'
                };
                
                const playsObj = {
                    total_play_time: plays.totalPlayTime || 0,
                    play_history: plays.playHistory || [],
                    search_history: plays.searchHistory || [],
                    total_plays: (plays.playHistory?.length || 0)
                };
                
                const data = await authRpcCall('upsert_user_sync_data_v2', {
                    _user_id: user.id,
                    _settings: settingsObj,
                    _plays: playsObj
                });
                if (data && data.success) {
                    if (showNotifications) showToast('数据上传成功！', 'success');
                    lastUploadDataHash = getCurrentDataHash();
                } else {
                    throw new Error(data?.error || '上传失败');
                }
            } catch (err) {
                console.error('同步数据异常', err);
                if (showNotifications && !err.message.includes('重新登录')) {
                    showToast(`数据上传失败: ${err.message}`, 'error');
                }
            } finally {
                isSyncing = false;
            }
        }

        // 从服务器获取用户数据
        async function fetchUserData() {
            const user = getCurrentUser();
            if (!user || !user.id) return;
            if (!supabaseClient) {
                console.warn('Supabase 未初始化，跳过数据同步');
                return;
            }
            try {
                const data = await authRpcCall('get_user_sync_data_v2', { _user_id: user.id });
                if (data && data.success && data.data) {
                    const sync = data.data;
                    const serverSettings = sync.settings || {};
                    const serverPlays = sync.plays || {};
                    
                    // 获取本地数据
                    const localSettings = getCurrentSettings();
                    const localPlays = getCurrentPlays();
                    const localTotalPlayTime = localPlays.totalPlayTime || 0;
                    const serverTotalPlayTime = serverPlays.totalPlayTime || serverPlays.total_play_time || 0;
                    
                    // 比较播放时长：如果本地时长大于服务端时长，保留本地数据并上传
                    if (localTotalPlayTime > serverTotalPlayTime) {
                        console.log('本地播放时长大于服务端，保留本地数据并上传');
                        await syncUserData(false);
                        return;
                    }
                    
                    // 服务端时长大于或等于本地，使用服务端数据
                    // 优先从 plays 字段获取播放数据（新版），其次从 settings.plays 获取（兼容旧版）
                    const playsData = serverPlays && Object.keys(serverPlays).length > 0 ? serverPlays : (serverSettings.plays || {});
                    
                    // 保存设置数据（不含plays）
                    const newSettings = {
                        theme: serverSettings.theme || 'dark',
                        wyPageSize: serverSettings.wyPageSize || serverSettings.wy_page_size || 20,
                        biliPageSize: serverSettings.biliPageSize || serverSettings.bili_page_size || 20,
                        qqPageSize: serverSettings.qqPageSize || serverSettings.qq_page_size || 20,
                        yunzhiToken: serverSettings.yunzhiToken || serverSettings.token || '',
                        navbarShowText: serverSettings.navbarShowText ?? serverSettings.navbar_show_text ?? true,
                        navbarShowWy: serverSettings.navbarShowWy ?? serverSettings.navbar_show_wy ?? true,
                        navbarShowBili: serverSettings.navbarShowBili ?? serverSettings.navbar_show_bili ?? true,
                        navbarShowQq: serverSettings.navbarShowQq ?? serverSettings.navbar_show_qq ?? true,
                        defaultPage: serverSettings.defaultPage || serverSettings.default_page || 'home'
                    };
                    saveCurrentSettings(newSettings);
                    
                    // 保存播放数据
                    const newPlays = {
                        totalPlayTime: playsData.totalPlayTime || playsData.total_play_time || 0,
                        playHistory: playsData.playHistory || playsData.play_history || [],
                        searchHistory: playsData.searchHistory || playsData.search_history || []
                    };
                    saveCurrentPlays(newPlays);
                    
                    // 更新全局变量
                    playHistory = newPlays.playHistory;
                    searchHistory = newPlays.searchHistory;
                    wyPageSize = newSettings.wyPageSize;
                    biliPageSize = newSettings.biliPageSize;
                    qqPageSize = newSettings.qqPageSize;
                    yunzhiToken = newSettings.yunzhiToken;
                    currentTheme = newSettings.theme;
                    defaultPage = newSettings.defaultPage;
                    // 更新UI
                    document.getElementById('wyPageSizeInput').value = wyPageSize;
                    document.getElementById('biliPageSizeInput').value = biliPageSize;
                    document.getElementById('qqPageSizeInput').value = qqPageSize;
                    document.getElementById('tokenInput').value = yunzhiToken;
                    updateNavbarTextVisibility();
                    document.getElementById('navbarTextToggle').checked = newSettings.navbarShowText;
                    updateNavbarButtonsVisibility();
                    
                    // 更新自定义选择器显示
                    const defaultSelect = document.getElementById('defaultPageSelect');
                    if (defaultSelect) {
                        const valueDisplay = defaultSelect.querySelector('.custom-select-value');
                        const items = defaultSelect.querySelectorAll('.custom-select-item');
                        items.forEach(item => {
                            if (item.dataset.value === defaultPage) {
                                valueDisplay.textContent = item.textContent;
                                item.classList.add('selected');
                            } else {
                                item.classList.remove('selected');
                            }
                        });
                    }
                    
                    // 处理头像
                    if (sync.avatar_url !== undefined) {
                        localStorage.setItem('userAvatar', sync.avatar_url || '');
                        const storedUser = getCurrentUser();
                        if (storedUser) {
                            storedUser.avatar_url = sync.avatar_url || '';
                            saveUser(storedUser);
                        }
                        updateLoginStatus();
                    }
                    
                    if (profilePage.style.display === 'block') {
                        updateProfileStats();
                        loadRecentPlays();
                    }
                    
                    // 初始化主题
                    initTheme();
                    
                    showToast('数据已从服务器同步', 'success');
                }
            } catch (err) {
                console.error('获取数据异常', err);
                hideGlobalLoading();
                if (!err.message.includes('重新登录')) {
                    showToast(`数据同步失败: ${err.message}`, 'warning');
                }
            }
        }






        // 处理"我的"按钮点击
        function handleProfileClick(event) {
            // 直接切换到个人中心页面
            switchPage('profile');
        }

        // 导航栏文本显示控制
        function updateNavbarTextVisibility() {
            const showText = getSetting('navbarShowText', true);
            const navbarItems = document.querySelectorAll('.navbar-item span');
            navbarItems.forEach(span => {
                span.style.display = showText ? 'block' : 'none';
            });
            
            // 更新开关状态
            const navbarTextToggle = document.getElementById('navbarTextToggle');
            if (navbarTextToggle) {
                navbarTextToggle.checked = showText;
            }
        }
        
        function updateNavbarButtonsVisibility() {
            const showWy = getSetting('navbarShowWy', true);
            const showBili = getSetting('navbarShowBili', true);
            const showQq = getSetting('navbarShowQq', true);
            
            const navWy = document.getElementById('navWy');
            const navBili = document.getElementById('navBili');
            const navQQ = document.getElementById('navQQ');
            
            if (navWy) {
                navWy.style.display = showWy ? 'flex' : 'none';
            }
            if (navBili) {
                navBili.style.display = showBili ? 'flex' : 'none';
            }
            if (navQQ) {
                navQQ.style.display = showQq ? 'flex' : 'none';
            }
            
            // 检查当前选中的页面是否仍然可见
            if (currentPageId === 'wy' && !showWy) {
                switchPage('home');
            } else if (currentPageId === 'bili' && !showBili) {
                switchPage('home');
            } else if (currentPageId === 'qq' && !showQq) {
                switchPage('home');
            }
            
            // 更新开关状态
            const wyNavToggle = document.getElementById('wyNavToggle');
            const biliNavToggle = document.getElementById('biliNavToggle');
            const qqNavToggle = document.getElementById('qqNavToggle');
            
            if (wyNavToggle) {
                wyNavToggle.checked = showWy;
            }
            if (biliNavToggle) {
                biliNavToggle.checked = showBili;
            }
            if (qqNavToggle) {
                qqNavToggle.checked = showQq;
            }
            
            // 检查是否只剩下一个音乐按钮，如果是则禁用该开关
            const activeCount = [showWy, showBili, showQq].filter(Boolean).length;
            if (activeCount === 1) {
                // 禁用最后一个活跃的开关
                if (showWy) {
                    if (wyNavToggle) {
                        wyNavToggle.disabled = true;
                        wyNavToggle.parentElement.style.opacity = '0.5';
                    }
                } else if (showBili) {
                    if (biliNavToggle) {
                        biliNavToggle.disabled = true;
                        biliNavToggle.parentElement.style.opacity = '0.5';
                    }
                } else if (showQq) {
                    if (qqNavToggle) {
                        qqNavToggle.disabled = true;
                        qqNavToggle.parentElement.style.opacity = '0.5';
                    }
                }
            } else {
                // 启用所有开关
                if (wyNavToggle) {
                    wyNavToggle.disabled = false;
                    wyNavToggle.parentElement.style.opacity = '1';
                }
                if (biliNavToggle) {
                    biliNavToggle.disabled = false;
                    biliNavToggle.parentElement.style.opacity = '1';
                }
                if (qqNavToggle) {
                    qqNavToggle.disabled = false;
                    qqNavToggle.parentElement.style.opacity = '1';
                }
            }
            
            // 更新胶囊滑块位置和长度
            const activeItem = document.querySelector('.navbar-item.active');
            if (activeItem) {
                moveNavbarPill(activeItem, false);
            }
        }
        
        // 收起/展开设置组
        function toggleCollapsible(header) {
            header.classList.toggle('collapsed');
            const content = header.nextElementSibling;
            if (content) {
                content.classList.toggle('collapsed');
            }
            // 同时切换父容器的展开状态
            const card = header.closest('.collapsible-card');
            if (card) {
                card.classList.toggle('collapsed', header.classList.contains('collapsed'));
            }
        }
        
        // 自适应调节下拉选项高度
        function adjustDropdownHeight(content) {
            if (!content) return;
            
            // 计算下拉选项的位置和可用空间
            const rect = content.getBoundingClientRect();
            const windowHeight = window.innerHeight;
            const spaceBelow = windowHeight - rect.top;
            
            // 设置最大高度为可用空间的80%，留一些余量
            const maxHeight = Math.floor(spaceBelow * 0.8);
            
            // 应用最大高度
            content.style.maxHeight = maxHeight + 'px';
        }

        // 绑定登录页面事件（在DOM加载完成后）
        // 自动登录验证
        async function autoLogin() {
            const storedToken = localStorage.getItem('sessionToken');
            const storedUser = getCurrentUser();
            if (!storedToken || !storedUser || !storedUser.id) {
                return;
            }
            sessionToken = storedToken;
            isAutoSyncingLocked = true;
            try {
                await initSupabase();
                if (!supabaseClient || !supabaseAvailable) {
                    console.warn('Supabase 不可用，跳过自动登录验证，使用本地数据');
                    // Supabase 不可用，但仍保留登录状态
                    localStorage.setItem('userLoggedIn', 'true');
                    updateLoginStatus();
                    // 加载本地数据
                    if (profilePage.style.display === 'block') {
                        updateProfileStats();
                        loadRecentPlays();
                        loadAvatarHistory();
                        loadPoints();
                    }
                    loadSearchHistory('wy');
                    loadSearchHistory('bili');
                    loadSearchHistory('qq');
                    return;
                }
                const result = await authRpcCall('check_session_valid', { _user_id: storedUser.id });
                if (result.success) {
                    // 验证通过（token一致），设置登录状态
                    localStorage.setItem('userLoggedIn', 'true');

                    // 检查用户中心是否刚刚同步过数据（10秒内），如果是则跳过拉取
                    const justSynced = localStorage.getItem('dataJustSynced');
                    const skipFetch = justSynced && (Date.now() - parseInt(justSynced)) < 10000;
                    if (skipFetch) {
                        console.log('检测到用户中心刚同步过数据，跳过重复拉取');
                        localStorage.removeItem('dataJustSynced');
                        lastUploadDataHash = getCurrentDataHash();
                    } else {
                        // 从服务器拉取数据（不清空本地已有数据，由 fetchUserData 内部决定合并策略）
                        await fetchUserData();
                        lastUploadDataHash = getCurrentDataHash();
                    }
                    // 检查会员状态
                    await checkMembershipStatus();
                    updateLoginStatus();
                    // 自动登录成功后启动会话守卫
                    startSessionGuard();
                    // 订阅实时会话变更
                    subscribeToSessionChanges();
                    // 订阅积分实时变更
                    subscribeToPointsChanges();
                    // 启动短轮询作为备份
                    startSessionPollingAsBackup();
                    if (profilePage.style.display === 'block') {
                        updateProfileStats();
                        loadRecentPlays();
                        loadAvatarHistory();
                        loadPoints();
                    }
                    loadSearchHistory('wy');
                    loadSearchHistory('bili');
                    loadSearchHistory('qq');
                    console.log('自动登录成功，数据已从服务器同步');
                } else {
                    // 会话过期或异地登录（后端返回 SESSION_EXPIRED）或用户被封禁（USER_BANNED）
                    if (result.error === 'USER_BANNED') {
                        handleSessionExpired(true);
                    } else {
                        handleSessionExpired();
                    }
                }
            } catch (err) {
                if (err?._networkError || err?.message === 'SESSION_CHECK_NETWORK_ERROR' || err?.message === 'Supabase 不可用') {
                    // 网络问题或 Supabase 不可用，保留登录状态，只显示提示
                    console.warn('自动登录网络异常，保留本地状态', err);
                    showToast('网络不稳定，部分功能可能受限', 'warning');
                    // 保留原有的登录状态，设置 userLoggedIn 标记
                    localStorage.setItem('userLoggedIn', 'true');
                    updateLoginStatus();
                    // 加载本地数据
                    if (profilePage.style.display === 'block') {
                        updateProfileStats();
                        loadRecentPlays();
                        loadAvatarHistory();
                        loadPoints();
                    }
                    loadSearchHistory('wy');
                    loadSearchHistory('bili');
                    loadSearchHistory('qq');
                } else {
                    // 其他未知错误，保守起见执行过期处理
                    console.warn('自动登录过程出错:', err);
                    handleSessionExpired();
                }
            } finally {
                isAutoSyncingLocked = false;
            }
        }

        

        // 订阅当前用户的积分变更
        async function subscribeToPointsChanges() {
            const user = getCurrentUser();
            if (!user || !user.id) return;

            await initSupabase();
            if (!supabaseClient) return;

            // 移除旧订阅
            if (pointsRealtimeChannel) {
                supabaseClient.removeChannel(pointsRealtimeChannel);
                pointsRealtimeChannel = null;
            }

            pointsRealtimeChannel = supabaseClient
                .channel('points_changes')
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'user_points',
                        filter: `user_id=eq.${user.id}`
                    },
                    (payload) => {
                        if (payload.new && payload.new.total_points !== undefined) {
                            console.log(`积分实时更新: ${payload.new.total_points}`);
                            // 更新界面显示
                            const pointsElement = document.getElementById('totalPointsValue');
                            if (pointsElement) {
                                pointsElement.textContent = payload.new.total_points;
                            }
                            // 更新本地存储的积分数据
                            const currentPoints = getCurrentPoints();
                            currentPoints.totalPoints = payload.new.total_points;
                            saveCurrentPoints(currentPoints);
                            // 如果当前在个人页面，刷新积分历史记录
                            if (profilePage.style.display === 'block') {
                                loadPointsHistoryOnly();
                            }
                        }
                    }
                )
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                    }
                });
        }

        // 上次刷新时间戳
        let lastRefreshTime = 0;
        const REFRESH_INTERVAL = 5000; // 5秒

        // 获取并更新站点访问次数
        async function updateSiteVisitCount() {
            const currentTime = Date.now();
            if (currentTime - lastRefreshTime < REFRESH_INTERVAL) {
                showToast('刷新过于频繁，请稍后再刷新', 'warning');
                return;
            }
            
            lastRefreshTime = currentTime;
            
            const visitCountElement = document.getElementById('siteVisitCount');
            const visitUnitElement = document.getElementById('siteVisitUnit');
            if (visitCountElement) {
                visitCountElement.textContent = '获取中...';
            }
            if (visitUnitElement) {
                visitUnitElement.style.display = 'none';
            }
            
            try {
                await initSupabase();
                if (!supabaseClient || !supabaseAvailable) {
                    console.warn('Supabase 不可用，跳过统计');
                    if (visitCountElement) {
                        visitCountElement.textContent = '---';
                    }
                    if (visitUnitElement) {
                        visitUnitElement.style.display = 'none';
                    }
                    return;
                }
                // 查询当前访问次数
                const { data, error } = await supabaseClient
                    .from('site_stats')
                    .select('view_count')
                    .eq('id', 1)
                    .single();
                
                if (error) {
                    console.error('获取访问次数失败:', error);
                    if (visitCountElement) {
                        visitCountElement.textContent = '加载失败';
                    }
                    if (visitUnitElement) {
                        visitUnitElement.style.display = 'none';
                    }
                    showToast('获取访问次数失败，请稍后重试', 'error');
                } else {
                    if (visitCountElement) {
                        visitCountElement.textContent = data.view_count.toLocaleString();
                    }
                    if (visitUnitElement) {
                        visitUnitElement.style.display = 'inline';
                    }
                }
            } catch (err) {
                console.error('获取访问次数出错:', err);
                if (visitCountElement) {
                    visitCountElement.textContent = '加载失败';
                }
                if (visitUnitElement) {
                    visitUnitElement.style.display = 'none';
                }
                showToast('获取访问次数出错，请稍后重试', 'error');
            }
        }

        document.addEventListener('DOMContentLoaded', function() {
            // 初始化折叠内容高度
            const collapsibleContents = document.querySelectorAll('.collapsible-content.collapsed');
            collapsibleContents.forEach(content => {
                content.style.maxHeight = ''; // 确保使用CSS定义的样式
            });
            
            const toSignupBtn = document.getElementById('toSignup');
            const toSigninBtn = document.getElementById('toSignin');
            const mSi = document.getElementById('mSi');
            const mSu = document.getElementById('mSu');

            if (toSignupBtn) {
                toSignupBtn.addEventListener('click', () => go(true));
            }
            if (toSigninBtn) {
                toSigninBtn.addEventListener('click', () => go(false));
            }
            if (mSi) {
                mSi.addEventListener('click', () => go(false));
            }
            if (mSu) {
                mSu.addEventListener('click', () => go(true));
            }

            // 绑定模态框事件
            const modalOverlay = document.getElementById('modalOverlay');
            if (modalOverlay) {
                modalOverlay.addEventListener('click', () => {
                    const sessionExpiredModal = document.getElementById('sessionExpiredModal');
                    if (sessionExpiredModal && sessionExpiredModal.classList.contains('show')) {
                        closeSessionExpiredModal();
                    } else {
                        document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
                        modalOverlay.classList.remove('show');
                    }
                });
            }

            // ---------- 页面打开次数统计（全局，无论登录状态） ----------
            let pageViewRecorded = false;
            async function recordPageView() {
                if (pageViewRecorded) return;
                pageViewRecorded = true;
                try {
                    await initSupabase();
                    if (!supabaseClient || !supabaseAvailable) {
                        console.warn('Supabase 不可用，跳过统计');
                        return;
                    }
                    const { data, error } = await supabaseClient.rpc('increment_page_view');
                    if (error) {
                        console.error('记录页面访问失败:', error);
                    } else {
                        console.log(`页面访问次数已更新: ${data}`);
                        // 更新首页显示的访问次数
                        updateSiteVisitCount();
                    }
                } catch (err) {
                    console.error('页面统计出错:', err);
                }
            }
            
            // 调用统计（只在页面完全加载后执行一次）
            recordPageView();
            // -------------------------------------------

            // 页面可见性变化时，重新调整心跳（可见时立即检查并恢复定时器，不可见时停止定时器）
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    // 页面隐藏时停止会话守卫
                    stopSessionGuard();
                } else {
                    // 页面重新可见，若已登录则重启会话守卫
                    const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true';
                    if (isLoggedIn) {
                        startSessionGuard();
                    }
                }
            });
            
            // 跨标签页同步
            window.addEventListener('storage', (e) => {
                if (e.key === 'sessionExpiredFlag' && !isSessionExpiredHandling && !sessionExpiredNotified) {
                    handleSessionExpired();
                }
            });
            
            // 页面关闭时清理订阅
            window.addEventListener('beforeunload', () => {
                if (sessionRealtimeChannel) {
                    supabaseClient?.removeChannel(sessionRealtimeChannel);
                }
                if (player && typeof player.cleanupVisualizer === 'function') {
                    player.cleanupVisualizer();
                }
            });

            // 初始化登录状态
            updateLoginStatus();
            
            // 初始化导航栏文本显示
            updateNavbarTextVisibility();
            // 初始化导航栏按钮显示
            updateNavbarButtonsVisibility();
            
            // 添加自动登录验证
            autoLogin();
            
            // 会话守卫由 autoLogin() 在验证成功后启动，此处不再重复启动
            // const storedToken = localStorage.getItem('sessionToken');
            // const storedUser = getCurrentUser();
            // if (storedToken && storedUser && storedUser.id) {
            //     startSessionGuard();
            // }
            
            // 绑定导航栏文本开关事件
            const navbarTextToggle = document.getElementById('navbarTextToggle');
            if (navbarTextToggle) {
                navbarTextToggle.addEventListener('change', async function() {
                    const showText = this.checked;
                    setSetting('navbarShowText', showText);
                    updateNavbarTextVisibility();

                    // 登录状态下自动上传
                    const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true';
                    if (isLoggedIn) {
                        await syncUserData(true);   // 显示上传提示
                    } else {
                        showToast('导航栏文本显示设置已保存', 'success');
                    }
                });
            }
            
            // 绑定导航栏按钮显示开关事件
            const wyNavToggle = document.getElementById('wyNavToggle');
            const biliNavToggle = document.getElementById('biliNavToggle');
            const qqNavToggle = document.getElementById('qqNavToggle');
            
            if (wyNavToggle) {
                wyNavToggle.addEventListener('change', async function() {
                    const showWy = this.checked;
                    
                    // 检查是否会导致所有音乐按钮都被关闭
                    if (!showWy) {
                        const showBili = getSetting('navbarShowBili', true);
                        const showQq = getSetting('navbarShowQq', true);
                        if (!showBili && !showQq) {
                            // 至少保留一个音乐按钮
                            this.checked = true;
                            showToast('至少保留一个音乐界面按钮', 'warning');
                            return;
                        }
                    }
                    
                    setSetting('navbarShowWy', showWy);
                    updateNavbarButtonsVisibility();

                    // 登录状态下自动上传
                    const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true';
                    if (isLoggedIn) {
                        await syncUserData(true);   // 显示上传提示
                    } else {
                        showToast('网易云音乐按钮显示设置已保存', 'success');
                    }
                });
            }
            
            if (biliNavToggle) {
                biliNavToggle.addEventListener('change', async function() {
                    const showBili = this.checked;
                    
                    // 检查是否会导致所有音乐按钮都被关闭
                    if (!showBili) {
                        const showWy = getSetting('navbarShowWy', true);
                        const showQq = getSetting('navbarShowQq', true);
                        if (!showWy && !showQq) {
                            // 至少保留一个音乐按钮
                            this.checked = true;
                            showToast('至少保留一个音乐界面按钮', 'warning');
                            return;
                        }
                    }
                    
                    setSetting('navbarShowBili', showBili);
                    updateNavbarButtonsVisibility();

                    // 登录状态下自动上传
                    const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true';
                    if (isLoggedIn) {
                        await syncUserData(true);   // 显示上传提示
                    } else {
                        showToast('Bilibil音乐按钮显示设置已保存', 'success');
                    }
                });
            }
            
            if (qqNavToggle) {
                qqNavToggle.addEventListener('change', async function() {
                    const showQq = this.checked;
                    
                    // 检查是否会导致所有音乐按钮都被关闭
                    if (!showQq) {
                        const showWy = getSetting('navbarShowWy', true);
                        const showBili = getSetting('navbarShowBili', true);
                        if (!showWy && !showBili) {
                            // 至少保留一个音乐按钮
                            this.checked = true;
                            showToast('至少保留一个音乐界面按钮', 'warning');
                            return;
                        }
                    }
                    
                    setSetting('navbarShowQq', showQq);
                    updateNavbarButtonsVisibility();

                    // 登录状态下自动上传
                    const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true';
                    if (isLoggedIn) {
                        await syncUserData(true);   // 显示上传提示
                    } else {
                        showToast('QQ音乐按钮显示设置已保存', 'success');
                    }
                });
            }
            
            // 自动登录会处理数据同步，无需在此重复调用fetchUserData
            
            // 自动同步定时器（每5秒检查一次数据变化）
            autoSyncInterval = setInterval(async () => {
                const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true';
                if (!isLoggedIn) return;
                if (isAutoSyncingLocked) return;
                
                const currentHash = getCurrentDataHash();
                if (currentHash === null) return;
                
                if (lastUploadDataHash === null || currentHash !== lastUploadDataHash) {
                    try {
                        await syncUserData(false);
                        lastUploadDataHash = getCurrentDataHash();
                    } catch (err) {
                        if (err.message === 'SESSION_MISSING') {
                            // 会话丢失，触发过期处理
                            handleSessionExpired();
                        }
                        // 其他错误忽略，下次重试
                    }
                }
            }, 5000);
            
            // 初始化下载面板
            initDownloadPanel();
            initDownloadOptionsPanel();
        });

        // 显示全部播放历史
        function showAllHistory() {
            const modalBody = document.getElementById('historyModalBody');
            if (!modalBody) return;

            if (playHistory.length === 0) {
                modalBody.innerHTML = `
                    <div class="playlist-empty">
                        <i class="fas fa-history"></i>
                        <p>暂无播放记录</p>
                    </div>
                `;
                openModal('historyModal');
                return;
            }

            // 生成历史记录列表（与播放列表样式类似）
            modalBody.innerHTML = `
                <div style="margin-bottom: 12px; text-align: right;">
                    <button class="history-clear" id="clearAllHistoryBtn" style="font-size: 12px;">清空全部</button>
                </div>
                <div class="history-list-container" style="max-height: 60vh; overflow-y: auto;">
                    ${playHistory.map((song, idx) => `
                        <div class="playlist-item" data-id="${song.id}" data-platform="${song.platform || 'wy'}" data-index="${idx}">
                            <div class="playlist-item-cover">
                                ${song.pic ? `<img src="${song.pic.startsWith('http') ? (song.pic.startsWith('https') ? song.pic : song.pic.replace('http://', 'https://')) : 'https://via.placeholder.com/100x100?text=Music'}" alt="" onerror="this.onerror=null;this.parentElement.innerHTML='&lt;i class=&quot;fas fa-music&quot;&gt;&lt;/i&gt;';">` : '<i class="fas fa-music"></i>'}
                            </div>
                            <div class="playlist-item-info">
                                <div class="playlist-item-title">${escapeHTML(song.name)}</div>
                                <div class="playlist-item-artist">${escapeHTML(song.artist)}</div>
                            </div>
                            <button class="playlist-item-remove remove-history" data-id="${song.id}" title="从历史中删除">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    `).join('')}
                </div>
            `;

            // 绑定播放事件
            document.querySelectorAll('#historyModalBody .playlist-item').forEach(item => {
                item.addEventListener('click', function(e) {
                    if (e.target.closest('.remove-history')) return;
                    const songId = this.dataset.id;
                    const platform = this.dataset.platform;
                    const idx = parseInt(this.dataset.index);
                    const songInfo = playHistory[idx];
                    playSong(songId, platform, songInfo);
                    closeModal('historyModal');
                });
            });

            // 绑定单个删除事件
            document.querySelectorAll('#historyModalBody .remove-history').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const songId = this.dataset.id;
                    removeHistoryItem(songId);
                });
            });

            // 绑定清空全部事件
            const clearAllBtn = document.getElementById('clearAllHistoryBtn');
            if (clearAllBtn) {
                clearAllBtn.addEventListener('click', () => {
                    showConfirm('确定要清空全部播放历史吗？', () => {
                        clearAllHistory();
                    });
                });
            }

            openModal('historyModal');
        }

        // 删除单条历史记录
        function removeHistoryItem(songId) {
            playHistory = playHistory.filter(item => String(item.id) !== String(songId));
            setSetting('playHistory', playHistory);
            // 刷新个人页面的最近聆听区域
            if (profilePage.style.display === 'block') {
                loadRecentPlays();
                updateProfileStats();
            }
            // 如果历史记录弹窗打开中，刷新其内容
            const historyModal = document.getElementById('historyModal');
            if (historyModal && historyModal.classList.contains('show')) {
                showAllHistory();
            }
            showToast('已从历史记录中移除', 'success');
        }

        // 清空全部历史记录
        function clearAllHistory() {
            playHistory = [];
            setSetting('playHistory', []);
            if (profilePage.style.display === 'block') {
                loadRecentPlays();
                updateProfileStats();
            }
            const historyModal = document.getElementById('historyModal');
            if (historyModal && historyModal.classList.contains('show')) {
                showAllHistory();
            }
            showToast('历史记录已清空', 'success');
        }

        // 绑定“查看全部”链接事件（需要在 DOM 加载完成后执行）
        document.addEventListener('DOMContentLoaded', function() {
            const viewAllLink = document.querySelector('.section-more');
            if (viewAllLink) {
                viewAllLink.addEventListener('click', function(e) {
                    e.preventDefault();
                    showAllHistory();
                });
            }
        });

        // 默认设置结构（未登录和登录共用同一结构）
        const DEFAULT_SETTINGS = {
            theme: 'dark',               // 'light', 'dark', 'star*'
            wyPageSize: 20,
            biliPageSize: 20,
            qqPageSize: 20,
            yunzhiToken: '',
            navbarShowText: true,
            navbarShowWy: true,
            navbarShowBili: true,
            navbarShowQq: true,
            defaultPage: 'home',
            plays: {
                totalPlayTime: 0,        // 播放总时长（毫秒）
                playHistory: [],         // 播放历史数组
                searchHistory: []        // 搜索历史数组
            }
        };
        
        // 获取当前使用的 settings 对象（guest 或 user）
        function getCurrentSettings() {
            const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true';
            if (isLoggedIn) {
                let settings = localStorage.getItem('user_setting');
                if (!settings) {
                    // 首次登录，使用默认值（不含plays）
                    const defaultSettings = {...DEFAULT_SETTINGS};
                    delete defaultSettings.plays;
                    settings = JSON.stringify(defaultSettings);
                    localStorage.setItem('user_setting', settings);
                }
                return JSON.parse(settings);
            } else {
                let settings = localStorage.getItem('guest_settings');
                if (!settings) {
                    settings = JSON.stringify(DEFAULT_SETTINGS);
                    localStorage.setItem('guest_settings', settings);
                }
                return JSON.parse(settings);
            }
        }
        
        function saveCurrentSettings(settings) {
            const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true';
            const key = isLoggedIn ? 'user_setting' : 'guest_settings';
            localStorage.setItem(key, JSON.stringify(settings));
        }
        
        // 获取当前播放数据（根据登录状态）
        function getCurrentPlays() {
            const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true';
            if (isLoggedIn) {
                let plays = localStorage.getItem('user_plays');
                if (!plays) {
                    plays = JSON.stringify({ totalPlayTime: 0, playHistory: [], searchHistory: [] });
                    localStorage.setItem('user_plays', plays);
                }
                return JSON.parse(plays);
            } else {
                const settings = getCurrentSettings();
                return settings.plays || { totalPlayTime: 0, playHistory: [], searchHistory: [] };
            }
        }
        
        function saveCurrentPlays(plays) {
            const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true';
            if (isLoggedIn) {
                localStorage.setItem('user_plays', JSON.stringify(plays));
            } else {
                const settings = getCurrentSettings();
                settings.plays = plays;
                saveCurrentSettings(settings);
            }
        }
        
        // 获取当前积分数据（根据登录状态）
        function getCurrentPoints() {
            const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true';
            if (isLoggedIn) {
                let points = localStorage.getItem('user_points');
                if (!points) {
                    points = JSON.stringify({ totalPoints: 0, history: [] });
                    localStorage.setItem('user_points', points);
                }
                return JSON.parse(points);
            } else {
                return { totalPoints: 0, history: [] };
            }
        }
        
        function saveCurrentPoints(points) {
            const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true';
            if (isLoggedIn) {
                localStorage.setItem('user_points', JSON.stringify(points));
            }
        }
        
        // 获取当前头像历史（根据登录状态）
        function getCurrentAvatarHistory() {
            const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true';
            if (isLoggedIn) {
                let avatarHistory = localStorage.getItem('user_avatar_history');
                if (!avatarHistory) {
                    avatarHistory = JSON.stringify([]);
                    localStorage.setItem('user_avatar_history', avatarHistory);
                }
                return JSON.parse(avatarHistory);
            } else {
                return [];
            }
        }
        
        function saveCurrentAvatarHistory(avatarHistory) {
            const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true';
            if (isLoggedIn) {
                localStorage.setItem('user_avatar_history', JSON.stringify(avatarHistory));
            }
        }
        
        // 获取单个设置项
        function getSetting(key, defaultValue = null) {
            // 处理播放相关字段
            const playKeys = ['totalPlayTime', 'playHistory', 'searchHistory'];
            if (playKeys.includes(key)) {
                const plays = getCurrentPlays();
                return plays[key] ?? defaultValue;
            }
            const settings = getCurrentSettings();
            return settings.hasOwnProperty(key) ? settings[key] : defaultValue;
        }
        
        // 设置单个设置项（自动保存）
        function setSetting(key, value) {
            // 处理播放相关字段
            const playKeys = ['totalPlayTime', 'playHistory', 'searchHistory'];
            if (playKeys.includes(key)) {
                const plays = getCurrentPlays();
                plays[key] = value;
                saveCurrentPlays(plays);
            } else {
                const settings = getCurrentSettings();
                settings[key] = value;
                saveCurrentSettings(settings);
            }
            // 如果是登录状态，触发自动同步
            if (localStorage.getItem('userLoggedIn') === 'true') {
                triggerSync();
            }
        }
        
        // 迁移旧数据（在页面加载时执行一次）
        function migrateOldGuestData() {
            // 检查是否存在旧的独立 guest_* 字段
            const oldKeys = [
                'guest_playHistory', 'guest_searchHistory', 'guest_theme',
                'guest_wyPageSize', 'guest_biliPageSize', 'guest_qqPageSize',
                'guest_yunzhi_token', 'guest_navbarShowText', 'guest_defaultPage',
                'totalPlayTime'  // 注意 totalPlayTime 无前缀，也需要迁移
            ];
            let needMigrate = false;
            for (let key of oldKeys) {
                if (localStorage.getItem(key) !== null) {
                    needMigrate = true;
                    break;
                }
            }
            if (!needMigrate) return;

            // 读取旧数据
            const oldPlayHistory = JSON.parse(localStorage.getItem('guest_playHistory') || '[]');
            const oldSearchHistory = JSON.parse(localStorage.getItem('guest_searchHistory') || '[]');
            const oldTheme = localStorage.getItem('guest_theme') || 'dark';
            const oldWyPageSize = parseInt(localStorage.getItem('guest_wyPageSize') || '20');
            const oldBiliPageSize = parseInt(localStorage.getItem('guest_biliPageSize') || '20');
            const oldQqPageSize = parseInt(localStorage.getItem('guest_qqPageSize') || '20');
            const oldYunzhiToken = localStorage.getItem('guest_yunzhi_token') || '';
            const oldNavbarShowText = localStorage.getItem('guest_navbarShowText') !== 'false';
            const oldDefaultPage = localStorage.getItem('guest_defaultPage') || 'home';
            const oldTotalPlayTime = parseInt(localStorage.getItem('totalPlayTime') || '0');

            // 组装新 settings
            const newSettings = {
                theme: oldTheme,
                wyPageSize: oldWyPageSize,
                biliPageSize: oldBiliPageSize,
                qqPageSize: oldQqPageSize,
                yunzhiToken: oldYunzhiToken,
                navbarShowText: oldNavbarShowText,
                defaultPage: oldDefaultPage,
                plays: {
                    totalPlayTime: oldTotalPlayTime,
                    playHistory: oldPlayHistory,
                    searchHistory: oldSearchHistory
                }
            };

            // 存储为 guest_settings
            localStorage.setItem('guest_settings', JSON.stringify(newSettings));

            // 删除旧键
            for (let key of oldKeys) {
                localStorage.removeItem(key);
            }
            console.log('Migrated old guest data to guest_settings');
        }
        
        // ── 数据隔离功能 ──
        // 获取隔离的localStorage键名
        function getStorageKey(key) {
            const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true';
            return isLoggedIn ? key : `guest_${key}`;
        }
        
        // 安全的localStorage操作
        function getStorageItem(key, defaultValue = null) {
            try {
                return getSetting(key, defaultValue);
            } catch (e) {
                return defaultValue;
            }
        }
        
        function setStorageItem(key, value) {
            try {
                setSetting(key, value);
            } catch (e) {
                console.error('localStorage设置失败:', e);
            }
        }
        
        // ── 原有功能 ──
        let currentPlatform = 'wy';
        let yunzhiToken = getSetting('yunzhiToken') || '';
        let tokenSource = getSetting('tokenSource') || 'personal'; // personal 或 vip
        // 会话令牌（单点登录）
        let sessionToken = localStorage.getItem('sessionToken') || '';
        let searchHistory = getSetting('searchHistory', []) || [];
        let searchResults = {
            qq: [],
            wy: [],
            bili: []
        };
        let searchPageNum = 1;
        let hasNextPage = true; // 是否有更多页面可加载
        let wySearchPageNum = 1;
        let wyHasNextPage = true;
        let wyLoadMoreAttempts = 0; // 网易云加载更多尝试次数（当返回数量不足时）
        const MAX_WY_LOAD_MORE_ATTEMPTS = 2; // 最大尝试次数
        let isSearching = false; // 防止重复搜索请求
        let wyPageSize = getSetting('wyPageSize') || 20;
        let biliPageSize = getSetting('biliPageSize') || 20;
        let biliSearchPageNum = 1;
        let biliHasNextPage = true;
        let qqPageSize = getSetting('qqPageSize') || 20;
        let qqSearchPageNum = 1;
        let qqHasNextPage = true;
        let playlist = [];
        let playHistory = getSetting('playHistory', []) || [];
        let myPlaylists = JSON.parse(localStorage.getItem('myPlaylists') || '[]');
        let songDetailsCache = JSON.parse(localStorage.getItem('songDetailsCache') || '{}');
        let currentTheme = getSetting('theme') || 'dark';
        let defaultPage = getSetting('defaultPage') || 'home';
        
        // 页面加载时执行数据迁移
        migrateOldGuestData();
        
        // 数据同步防抖
        let syncDebounceTimer = null;
        let isSyncing = false;

        function triggerSync(immediate = false) {
            const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true';
            if (!isLoggedIn) return;
            
            if (immediate) {
                if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
                syncUserData(false);
                return;
            }
            if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
            syncDebounceTimer = setTimeout(() => {
                syncUserData(false);
                syncDebounceTimer = null;
            }, 2000);
        }
        
        // API速率限制器
        const rateLimiter = {
            // 存储API调用时间戳
            callTimes: new Map(),
            // 配置不同API的速率限制
            limits: {
                'bili': {
                    maxCalls: 5,
                    timeWindow: 3000 // 3秒
                }
            },
            
            // 检查是否可以调用API
            async checkLimit(apiKey) {
                const limit = this.limits[apiKey];
                if (!limit) return true; // 没有限制的API直接通过
                
                const now = Date.now();
                const calls = this.callTimes.get(apiKey) || [];
                
                // 过滤掉时间窗口外的调用记录
                const recentCalls = calls.filter(time => now - time < limit.timeWindow);
                
                if (recentCalls.length >= limit.maxCalls) {
                        // 计算需要等待的时间
                        const oldestCall = recentCalls[0];
                        const waitTime = limit.timeWindow - (now - oldestCall);
                        if (waitTime > 0) {
                            await new Promise(resolve => setTimeout(resolve, waitTime));
                        }
                    }
                
                // 更新调用记录
                recentCalls.push(Date.now());
                this.callTimes.set(apiKey, recentCalls);
                return true;
            }
        };
        
        // ---------- 下载功能 ----------
        let downloadController = null;
        let isDownloading = false;
        
        // 清理文件名
        function cleanFileName(str) {
            return String(str).replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim();
        }
        
        // 显示/隐藏下载面板
        function showDownloadPanel() {
            const panel = document.getElementById('downloadPanel');
            const overlay = document.getElementById('modalOverlay');
            if (panel && overlay) {
                overlay.classList.add('show');
                panel.classList.add('show');
                document.body.style.pointerEvents = 'none';
                panel.style.pointerEvents = 'auto';
                overlay.style.pointerEvents = 'auto';
                panel.focus();
            }
        }
        
        function hideDownloadPanel() {
            const panel = document.getElementById('downloadPanel');
            const overlay = document.getElementById('modalOverlay');
            if (panel && overlay) {
                overlay.classList.remove('show');
                panel.classList.remove('show');
                document.body.style.pointerEvents = 'auto';
            }
        }
        
        // 显示下载选项面板
        function showDownloadOptionsPanel(song) {
            const panel = document.getElementById('downloadOptionsPanel');
            const overlay = document.getElementById('modalOverlay');
            const selectAllBtn = document.getElementById('selectAllBtn');
            if (panel && overlay) {
                document.getElementById('downloadOptionsSongName').textContent = song.name || '未知歌曲';
                document.getElementById('downloadOptionsSongArtist').textContent = song.artist || '未知艺术家';
                document.getElementById('downloadSongCheckbox').checked = true;
                document.getElementById('downloadLyricsCheckbox').checked = true;
                document.getElementById('downloadCoverCheckbox').checked = true;
                updateSelectAllButtonText();
                overlay.classList.add('show');
                panel.classList.add('show');
                document.body.style.pointerEvents = 'none';
                panel.style.pointerEvents = 'auto';
                overlay.style.pointerEvents = 'auto';
                panel.focus();
            }
        }
        
        function hideDownloadOptionsPanel() {
            const panel = document.getElementById('downloadOptionsPanel');
            const overlay = document.getElementById('modalOverlay');
            if (panel && overlay) {
                overlay.classList.remove('show');
                panel.classList.remove('show');
                document.body.style.pointerEvents = 'auto';
            }
        }
        
        function updateSelectAllButtonText() {
            const selectAllBtn = document.getElementById('selectAllBtn');
            const songCheckbox = document.getElementById('downloadSongCheckbox');
            const lyricsCheckbox = document.getElementById('downloadLyricsCheckbox');
            const coverCheckbox = document.getElementById('downloadCoverCheckbox');
            if (selectAllBtn && songCheckbox && lyricsCheckbox && coverCheckbox) {
                const allSelected = songCheckbox.checked && lyricsCheckbox.checked && coverCheckbox.checked;
                if (allSelected) {
                    selectAllBtn.innerHTML = '<i class="fas fa-times"></i> 取消全选';
                } else {
                    selectAllBtn.innerHTML = '<i class="fas fa-check-double"></i> 全选';
                }
            }
        }
        
        // 进度下载核心函数
        function startDownloadWithProgress(url, fileName, retryCount = 0) {
            downloadController = new AbortController();
            const signal = downloadController.signal;
            let startTime = Date.now();
            let downloadedBytes = 0;
            let totalBytes = 0;
            let lastUpdateTime = 0;
            let lastDownloadedBytes = 0;
            let updatedFileName = fileName;
            const chunks = [];
            
            function updateProgress(bytesRead, totalBytesLength) {
                downloadedBytes = bytesRead;
                totalBytes = totalBytesLength;
                const now = Date.now();
                const elapsedTime = now - startTime;
                const currentSpeed = ((downloadedBytes - lastDownloadedBytes) / (now - lastUpdateTime)) * 1000;
                if (!window.downloadSpeedHistory) window.downloadSpeedHistory = [];
                window.downloadSpeedHistory.push(currentSpeed);
                if (window.downloadSpeedHistory.length > 5) window.downloadSpeedHistory.shift();
                const avgSpeed = window.downloadSpeedHistory.reduce((a, b) => a + b, 0) / window.downloadSpeedHistory.length;
                if (now - lastUpdateTime > 1000) {
                    lastUpdateTime = now;
                    lastDownloadedBytes = downloadedBytes;
                }
                const percentage = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
                const formatSize = (bytes) => {
                    if (bytes < 1024) return bytes + ' B';
                    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
                    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
                };
                const formatSpeed = (bytesPerSecond) => {
                    if (bytesPerSecond < 1024) return bytesPerSecond.toFixed(2) + ' B/s';
                    if (bytesPerSecond < 1024 * 1024) return (bytesPerSecond / 1024).toFixed(2) + ' KB/s';
                    return (bytesPerSecond / (1024 * 1024)).toFixed(2) + ' MB/s';
                };
                document.getElementById('downloadPercentage').textContent = percentage + '%';
                document.getElementById('downloadSpeed').textContent = formatSpeed(avgSpeed);
                document.getElementById('downloadSize').textContent = `${formatSize(downloadedBytes)} / ${formatSize(totalBytes)}`;
                document.getElementById('downloadProgressBar').style.width = percentage + '%';
                document.getElementById('downloadStatus').textContent = '下载中...';
            }
            
            const headers = { 'Range': 'bytes=0-' };
            return fetch(url, { signal, headers })
                .then(response => {
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    totalBytes = parseInt(response.headers.get('content-length') || '0');
                    let detectedFileType = 'audio/mpeg';
                    let detectedExtension = 'mp3';
                    const contentType = response.headers.get('content-type');
                    if (contentType) {
                        detectedFileType = contentType;
                        const mimeToExtension = {
                            'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg',
                            'audio/wav': 'wav', 'audio/flac': 'flac', 'audio/aac': 'aac'
                        };
                        if (mimeToExtension[contentType]) detectedExtension = mimeToExtension[contentType];
                    }
                    const baseFileName = fileName.substring(0, fileName.lastIndexOf('.'));
                    updatedFileName = `${baseFileName}.${detectedExtension}`;
                    const reader = response.body.getReader();
                    function read() {
                        return reader.read().then(({ done, value }) => {
                            if (done) {
                                const blob = new Blob(chunks, { type: detectedFileType });
                                saveBlobAsFile(blob, updatedFileName);
                                return;
                            }
                            chunks.push(value);
                            downloadedBytes += value.length;
                            updateProgress(downloadedBytes, totalBytes);
                            return read();
                        });
                    }
                    return read();
                })
                .then(() => {
                    document.getElementById('downloadStatus').textContent = '下载完成';
                    showToast(`下载完成: ${updatedFileName}`, 'success');
                    setTimeout(hideDownloadPanel, 3000);
                })
                .catch(error => {
                    if (error.name === 'AbortError') {
                        // 取消下载
                    } else {
                        document.getElementById('downloadStatus').textContent = '下载失败';
                        showToast('下载失败: ' + error.message, 'error');
                        if (retryCount < 3) {
                            setTimeout(() => {
                                showToast(`正在重试下载 (${retryCount + 1}/3)...`, 'info');
                                startDownloadWithProgress(url, fileName, retryCount + 1);
                            }, 2000);
                        } else {
                            setTimeout(hideDownloadPanel, 2000);
                        }
                    }
                });
        }
        
        function saveBlobAsFile(blob, fileName) {
            try {
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = fileName;
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => window.URL.revokeObjectURL(url), 100);
            } catch (error) {
                showToast('保存文件失败，请重试', 'error');
            }
        }
        
        function cancelDownload() {
            if (downloadController) {
                downloadController.abort();
                downloadController = null;
            }
            isDownloading = false;
            hideDownloadPanel();
            showToast('下载已取消', 'info');
        }
        
        function initDownloadPanel() {
            const closeBtn = document.getElementById('closeDownloadPanel');
            const cancelBtn = document.getElementById('cancelDownloadBtn');
            if (closeBtn) closeBtn.addEventListener('click', hideDownloadPanel);
            if (cancelBtn) cancelBtn.addEventListener('click', cancelDownload);
        }
        
        function initDownloadOptionsPanel() {
            const closeBtn = document.getElementById('closeDownloadOptionsPanel');
            const cancelBtn = document.getElementById('cancelDownloadOptionsBtn');
            const confirmBtn = document.getElementById('confirmDownloadBtn');
            const selectAllBtn = document.getElementById('selectAllBtn');
            const songCheckbox = document.getElementById('downloadSongCheckbox');
            const lyricsCheckbox = document.getElementById('downloadLyricsCheckbox');
            const coverCheckbox = document.getElementById('downloadCoverCheckbox');
            const packageDownloadBtnPanel = document.getElementById('packageDownloadBtnPanel');
            
            if (closeBtn) closeBtn.addEventListener('click', hideDownloadOptionsPanel);
            if (cancelBtn) cancelBtn.addEventListener('click', hideDownloadOptionsPanel);
            if (confirmBtn) confirmBtn.addEventListener('click', startSelectedDownloads);
            if (packageDownloadBtnPanel) {
                packageDownloadBtnPanel.addEventListener('click', async function() {
                    const currentSong = getCurrentPlayingSong();
                    if (!currentSong) {
                        showToast('请先选择一首歌曲', 'warning');
                        hideDownloadOptionsPanel();
                        return;
                    }
                    
                    // 获取当前勾选状态
                    const downloadSong = document.getElementById('downloadSongCheckbox').checked;
                    const downloadLyrics = document.getElementById('downloadLyricsCheckbox').checked;
                    const downloadCover = document.getElementById('downloadCoverCheckbox').checked;
                    
                    if (!downloadSong && !downloadLyrics && !downloadCover) {
                        showToast('请至少选择一项下载内容', 'warning');
                        return;
                    }
                    
                    hideDownloadOptionsPanel();
                    // 调用改进后的打包函数
                    await downloadAsPackage(currentSong, {
                        downloadSong: downloadSong,
                        downloadLyrics: downloadLyrics,
                        downloadCover: downloadCover
                    });
                });
            }
            if (selectAllBtn) {
                selectAllBtn.addEventListener('click', function() {
                    const allSelected = songCheckbox.checked && lyricsCheckbox.checked && coverCheckbox.checked;
                    if (allSelected) {
                        songCheckbox.checked = false;
                        lyricsCheckbox.checked = false;
                        coverCheckbox.checked = false;
                    } else {
                        songCheckbox.checked = true;
                        lyricsCheckbox.checked = true;
                        coverCheckbox.checked = true;
                    }
                    updateSelectAllButtonText();
                });
            }
            [songCheckbox, lyricsCheckbox, coverCheckbox].forEach(checkbox => {
                if (checkbox) checkbox.addEventListener('change', updateSelectAllButtonText);
            });
        }
        
        async function startSelectedDownloads() {
            const downloadSong = document.getElementById('downloadSongCheckbox').checked;
            const downloadLyrics = document.getElementById('downloadLyricsCheckbox').checked;
            const downloadCover = document.getElementById('downloadCoverCheckbox').checked;
            if (!downloadSong && !downloadLyrics && !downloadCover) {
                showToast('请至少选择一项下载内容', 'warning');
                return;
            }
            const currentSong = getCurrentPlayingSong();
            if (!currentSong) {
                showToast('无法获取歌曲信息', 'error');
                return;
            }
            hideDownloadOptionsPanel();

            // 串行下载，避免浏览器拦截多个弹窗
            const tasks = [];
            if (downloadSong) tasks.push(() => downloadAudioFile(currentSong));
            if (downloadLyrics) tasks.push(() => downloadLyricsFile(currentSong));
            if (downloadCover) tasks.push(() => downloadCoverFile(currentSong));

            for (let i = 0; i < tasks.length; i++) {
                try {
                    await tasks[i]();
                    if (i < tasks.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (error) {
                    showToast(`下载失败: ${error.message}`, 'error');
                }
            }
        }
        
        // 辅助函数：获取歌曲的音频 Blob（带重试和刷新链接）
        async function fetchAudioBlobWithRetry(song, retries = 2) {
            // 对于 B 站，直接返回错误，不支持下载
            if (song.platform === 'bili') {
                throw new Error('Bilibil音乐不支持下载');
            }
            
            let currentUrl = player.audioElement?.src;
            if (!currentUrl || currentUrl === '') {
                currentUrl = song.url;
            }
            if (!currentUrl) {
                throw new Error('无法获取歌曲链接');
            }

            const fetchOptions = {
                method: 'GET',
                mode: 'cors',
                credentials: 'omit',
                referrerPolicy: 'strict-origin-when-cross-origin'
            };

            const tryFetch = async (url) => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000);
                try {
                    const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const blob = await res.blob();
                    const contentType = res.headers.get('content-type');
                    // 直接实现文件扩展名推断逻辑
                    let ext = 'mp3';
                    if (contentType) {
                        const typeMap = {
                            'audio/mpeg': 'mp3',
                            'audio/mp3': 'mp3',
                            'audio/x-mp3': 'mp3',
                            'audio/mp4': 'm4a',
                            'audio/x-m4a': 'm4a',
                            'audio/aac': 'aac',
                            'audio/ogg': 'ogg',
                            'audio/wav': 'wav',
                            'audio/flac': 'flac'
                        };
                        const mappedExt = typeMap[contentType.toLowerCase()];
                        if (mappedExt) ext = mappedExt;
                    }
                    // 从 URL 中提取扩展名
                    if (url) {
                        const match = url.match(/\.([a-z0-9]+)(\?|$)/i);
                        if (match && ['mp3', 'm4a', 'aac', 'ogg', 'wav', 'flac', 'mp4'].includes(match[1].toLowerCase())) {
                            ext = match[1].toLowerCase();
                        }
                    }
                    return { blob, ext };
                } finally {
                    clearTimeout(timeoutId);
                }
            };

            for (let attempt = 0; attempt <= retries; attempt++) {
                try {
                    return await tryFetch(currentUrl);
                } catch (err) {
                    if (attempt === retries) throw err;
                    // 尝试刷新链接
                    const freshResult = await getSongDetail(song.id, song.platform, true);
                    if ((freshResult.code === 1 || freshResult.code === 200) && freshResult.data?.url) {
                        currentUrl = freshResult.data.url;
                        song.url = currentUrl;
                    } else {
                        throw new Error('刷新音频链接失败');
                    }
                }
            }
            throw new Error('多次重试后仍无法下载音频');
        }

        // 辅助函数：获取歌词文本（优先使用 song.lrc，否则用 player.currentLyrics 转换）
        function getLyricsText(song) {
            let lrcString = null;
            if (song.lrc && typeof song.lrc === 'string') {
                lrcString = song.lrc;
            } else if (player.currentLyrics && player.currentLyrics.length) {
                // 将当前歌词数组转换为 LRC 格式
                lrcString = player.currentLyrics.map(line => {
                    if (line.time >= 0) {
                        const minutes = Math.floor(line.time / 60);
                        const seconds = Math.floor(line.time % 60);
                        const milliseconds = Math.floor((line.time % 1) * 100);
                        const timeStr = `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(2, '0')}]`;
                        return `${timeStr}${line.text}`;
                    } else {
                        return line.text;
                    }
                }).join('\n');
            }
            return lrcString;
        }

        // 辅助函数：获取封面 Blob
        async function fetchCoverBlob(song) {
            let coverUrl = song.pic;
            if (!coverUrl) {
                const coverImg = document.querySelector('.player-cover img');
                coverUrl = coverImg ? coverImg.src : '';
            }
            if (!coverUrl) return null;
            
            // 处理URL
            if (coverUrl.startsWith('//')) coverUrl = 'https:' + coverUrl;
            if (coverUrl.startsWith('http://')) coverUrl = coverUrl.replace('http://', 'https://');
            
            // 检查是否是QQ音乐图片域名
            const isQQPic = coverUrl.includes('y.gtimg.cn');
            
            if (isQQPic) {
                // QQ音乐图片因CORS限制无法下载，直接返回null
                console.warn('QQ音乐封面因CORS限制无法下载，跳过封面');
                return null;
            } else {
                // 对于其他图片，使用fetch API
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);
                try {
                    const response = await fetch(coverUrl, { signal: controller.signal });
                    clearTimeout(timeoutId);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    return await response.blob();
                } catch (err) {
                    clearTimeout(timeoutId);
                    console.warn('封面获取失败:', err);
                    return null;
                }
            }
        }

        // 改进后的打包下载函数 - 支持队列显示、完整性校验、仅打包勾选项
        async function downloadAsPackage(currentSong, options) {
            if (isDownloading) {
                showToast('下载任务正在进行中，请稍候', 'warning');
                return;
            }
            isDownloading = true;

            // 立即显示下载面板，优化响应速度
            showDownloadPanel();
            
            // 更新面板头部信息
            const songName = cleanFileName(currentSong.name || '未知歌曲');
            const artist = cleanFileName(currentSong.artist || '未知艺术家');
            const baseName = `${songName} - ${artist}`;
            document.getElementById('downloadFileName').textContent = `准备打包: ${baseName}.zip`;
            document.getElementById('downloadStatus').textContent = '初始化队列...';
            document.getElementById('downloadPercentage').textContent = '0%';
            document.getElementById('downloadProgressBar').style.width = '0%';
            
            // 队列状态管理
            const queueItems = [
                { id: 'song', label: '<i class="fas fa-music"></i> 歌曲文件', selected: options.downloadSong, status: 'pending', error: null, blob: null, ext: 'mp3' },
                { id: 'lyrics', label: '<i class="fas fa-file-alt"></i> 歌词文件', selected: options.downloadLyrics, status: 'pending', error: null, content: null },
                { id: 'cover', label: '<i class="fas fa-image"></i> 封面图片', selected: options.downloadCover, status: 'pending', error: null, blob: null, ext: 'jpg' }
            ];
            
            // 更新队列显示
            function updateQueueDisplay() {
                const queueContainer = document.getElementById('queueItems');
                if (!queueContainer) return;
                queueContainer.innerHTML = queueItems.filter(item => item.selected).map(item => `
                    <div class="queue-item ${item.status}" data-id="${item.id}">
                        <span>${item.label}</span>
                        <span class="status">
                            ${item.status === 'pending' ? '<i class="fas fa-clock"></i> 等待中' : 
                              item.status === 'downloading' ? '<i class="fas fa-download"></i> 下载中' :
                              item.status === 'success' ? '<i class="fas fa-check"></i> 完成' :
                              item.status === 'error' ? `<i class="fas fa-times"></i> 失败: ${item.error || '未知错误'}` : '⚪ 未选择'}
                        </span>
                    </div>
                `).join('');
            }
            
            // 更新整体进度
            function updateOverallProgress() {
                const selectedItems = queueItems.filter(i => i.selected);
                const completedItems = selectedItems.filter(i => i.status === 'success');
                const percent = selectedItems.length ? Math.round((completedItems.length / selectedItems.length) * 100) : 0;
                document.getElementById('downloadPercentage').textContent = `${percent}%`;
                document.getElementById('downloadProgressBar').style.width = `${percent}%`;
                document.getElementById('downloadStatus').textContent = `打包中... ${completedItems.length}/${selectedItems.length} 项完成`;
            }
            
            updateQueueDisplay();
            
            const zip = new JSZip();
            
            // 1. 下载歌曲文件（仅网易云，Bilibil跳过）
            const songItem = queueItems.find(i => i.id === 'song');
            if (songItem.selected) {
                if (currentSong.platform === 'bili') {
                    songItem.status = 'error';
                    songItem.error = 'Bilibil音频需单独下载（打包不支持）';
                    showToast('Bilibil音频无法打包，将只打包歌词和封面', 'warning');
                } else {
                    songItem.status = 'downloading';
                    updateQueueDisplay();
                    try {
                        const { blob, ext } = await fetchAudioBlobWithRetry(currentSong);
                        songItem.blob = blob;
                        songItem.ext = ext || 'mp3';
                        songItem.status = 'success';
                    } catch (err) {
                        songItem.status = 'error';
                        songItem.error = err.message;
                        console.error('歌曲下载失败:', err);
                    }
                }
                updateQueueDisplay();
                updateOverallProgress();
            }
            
            // 2. 获取歌词
            const lyricsItem = queueItems.find(i => i.id === 'lyrics');
            if (lyricsItem.selected) {
                lyricsItem.status = 'downloading';
                updateQueueDisplay();
                try {
                    const lrc = getLyricsText(currentSong);
                    if (lrc) {
                        lyricsItem.content = lrc;
                        lyricsItem.status = 'success';
                    } else {
                        throw new Error('无可用歌词');
                    }
                } catch (err) {
                    lyricsItem.status = 'error';
                    lyricsItem.error = err.message;
                }
                updateQueueDisplay();
                updateOverallProgress();
            }
            
            // 3. 获取封面
            const coverItem = queueItems.find(i => i.id === 'cover');
            if (coverItem.selected) {
                coverItem.status = 'downloading';
                updateQueueDisplay();
                try {
                    const coverBlob = await fetchCoverBlob(currentSong);
                    if (coverBlob) {
                        coverItem.blob = coverBlob;
                        // 根据MIME类型确定扩展名
                        let ext = 'jpg';
                        if (coverBlob.type === 'image/png') ext = 'png';
                        else if (coverBlob.type === 'image/webp') ext = 'webp';
                        coverItem.ext = ext;
                        coverItem.status = 'success';
                    } else {
                        throw new Error('无法获取封面');
                    }
                } catch (err) {
                    coverItem.status = 'error';
                    coverItem.error = err.message;
                }
                updateQueueDisplay();
                updateOverallProgress();
            }
            
            // 校验：至少有一项成功
            const successItems = queueItems.filter(i => i.selected && i.status === 'success');
            if (successItems.length === 0) {
                document.getElementById('downloadStatus').textContent = '打包失败';
                showToast('所有文件获取失败，无法打包', 'error');
                setTimeout(() => hideDownloadPanel(), 2000);
                isDownloading = false;
                return;
            }
            
            // 添加成功获取的文件到 ZIP
            if (songItem.status === 'success' && songItem.blob) {
                zip.file(`${baseName}.${songItem.ext || 'mp3'}`, songItem.blob);
            }
            if (lyricsItem.status === 'success' && lyricsItem.content) {
                zip.file(`${baseName}.lrc`, lyricsItem.content, { binary: false });
            }
            if (coverItem.status === 'success' && coverItem.blob) {
                zip.file(`${baseName}.${coverItem.ext || 'jpg'}`, coverItem.blob);
            }
            
            document.getElementById('downloadStatus').textContent = `打包中... 正在生成ZIP文件`;
            
            try {
                const blob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
                    const percent = Math.round(metadata.percent);
                    document.getElementById('downloadPercentage').textContent = `${percent}%`;
                    document.getElementById('downloadProgressBar').style.width = `${percent}%`;
                    document.getElementById('downloadStatus').textContent = percent === 100 ? '打包完成，准备下载...' : `压缩中 ${percent}%`;
                });
                
                const zipFileName = `${baseName}.zip`;
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = zipFileName;
                link.click();
                URL.revokeObjectURL(url);
                
                const successNames = successItems.map(i => i.label.split(' ')[1]).join('、');
                showToast(`打包完成: ${zipFileName} (包含 ${successNames})`, 'success');
                
                // 如果歌曲下载成功，增加下载计数
                if (songItem.status === 'success') incrementDownloadCount();
                
                setTimeout(() => hideDownloadPanel(), 3000);
            } catch (err) {
                showToast('打包失败: ' + err.message, 'error');
                hideDownloadPanel();
            } finally {
                isDownloading = false;
            }
        }
        
        function incrementDownloadCount() {
            let count = parseInt(localStorage.getItem('downloadCount') || 0);
            count++;
            localStorage.setItem('downloadCount', count);
        }
        
        async function downloadAudioFile(song) {
            if (isDownloading) {
                showToast('下载已在进行中，请稍候', 'warning');
                return Promise.reject(new Error('下载已在进行中'));
            }
            isDownloading = true;

            try {
                // 对于 B 站，直接返回错误，不支持下载
                if (song.platform === 'bili') {
                    showToast('Bilibil音乐不支持下载', 'warning');
                    isDownloading = false;
                    return Promise.reject(new Error('Bilibil音乐不支持下载'));
                }

                // 网易云等其他平台：使用 fetch 获取 Blob 并保存
                const { blob, ext } = await fetchAudioBlobWithRetry(song);
                const songName = cleanFileName(song.name || '未知歌曲');
                const artist = cleanFileName(song.artist || '未知艺术家');
                const fileName = `${songName} - ${artist}.${ext}`;
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = fileName;
                link.click();
                URL.revokeObjectURL(url);
                showToast(`下载完成: ${fileName}`, 'success');
                incrementDownloadCount();
                isDownloading = false;
            } catch (error) {
                showToast(`下载失败: ${error.message}`, 'error');
                isDownloading = false;
                return Promise.reject(error);
            }
        }
        
        function downloadLyricsFile(song) {
            return new Promise((resolve, reject) => {
                if (isDownloading) {
                    showToast('下载已在进行中，请稍候', 'warning');
                    reject(new Error('下载已在进行中'));
                    return;
                }
                isDownloading = true;
                const lyrics = player.currentLyrics;
                if (!lyrics || lyrics.length === 0) {
                    showToast('没有可用的歌词', 'warning');
                    isDownloading = false;
                    reject(new Error('没有可用的歌词'));
                    return;
                }
                const songName = cleanFileName(song.name || '未知歌曲');
                const artist = cleanFileName(song.artist || '未知艺术家');
                const sourceName = '原始歌词';
                const fileName = `${sourceName}-${songName} - ${artist}.lrc`;
                const lrcContent = lyrics.map(line => {
                    if (line.time >= 0) {
                        const minutes = Math.floor(line.time / 60);
                        const seconds = Math.floor(line.time % 60);
                        const milliseconds = Math.floor((line.time % 1) * 100);
                        const timeStr = `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(2, '0')}]`;
                        return `${timeStr}${line.text}`;
                    } else {
                        return line.text;
                    }
                }).join('\n');
                const blob = new Blob([lrcContent], { type: 'text/plain;charset=utf-8' });
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = fileName;
                link.click();
                URL.revokeObjectURL(url);
                showToast(`歌词下载完成: ${fileName}`, 'success');
                isDownloading = false;
                resolve();
            });
        }
        
        function downloadCoverFile(song) {
            return new Promise((resolve, reject) => {
                if (isDownloading) {
                    showToast('下载已在进行中，请稍候', 'warning');
                    reject(new Error('下载已在进行中'));
                    return;
                }
                isDownloading = true;
                let coverUrl = song.pic;
                if (!coverUrl) {
                    const coverImg = document.querySelector('.player-cover img');
                    coverUrl = coverImg ? coverImg.src : '';
                }
                if (!coverUrl || coverUrl === '') {
                    showToast('没有可用的封面', 'warning');
                    isDownloading = false;
                    reject(new Error('没有可用的封面'));
                    return;
                }
                const songName = cleanFileName(song.name || '未知歌曲');
                const artist = cleanFileName(song.artist || '未知艺术家');
                const fileName = `${songName} - ${artist}.jpg`;
                fetch(coverUrl)
                    .then(response => { if (!response.ok) throw new Error('封面下载失败'); return response.blob(); })
                    .then(blob => {
                        const url = window.URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = fileName;
                        link.click();
                        URL.revokeObjectURL(url);
                        showToast(`封面下载完成: ${fileName}`, 'success');
                        resolve();
                    })
                    .catch(error => { showToast('下载封面失败', 'error'); reject(error); })
                    .finally(() => { isDownloading = false; });
            });
        }
        
        // 获取当前正在播放的歌曲信息（从 Player 类中获取）
        function getCurrentPlayingSong() {
            if (!player.currentSongId) return null;
            const song = playlist.find(s => String(s.id) === String(player.currentSongId));
            if (song) return song;
            for (let platform of ['wy', 'bili']) {
                const found = searchResults[platform].find(s => String(s.id) === String(player.currentSongId));
                if (found) return found;
            }
            return null;
        }
        
        // 播放器类
        class Player {
            constructor() {
                this.currentSongId = null;
                this._isPlaying = false;
                this.lastUpdateTime = null;
                this.lastStorageUpdate = 0;
                this.updateInterval = 1000; // 1秒更新一次localStorage
                this.audioElement = document.getElementById('audioPlayer');
                this.playerElement = document.getElementById('player');
                this.playBtn = document.getElementById('playBtn');
                this.prevBtn = document.getElementById('prevBtn');
                this.nextBtn = document.getElementById('nextBtn');
                this.progressBar = document.getElementById('progressBar');
                this.progressFill = document.getElementById('progressFill');
                this.playerTitle = document.getElementById('playerTitle');
                this.playerArtist = document.getElementById('playerArtist');
                this.timeDisplay = document.getElementById('timeDisplay');
                this.volumeSlider = document.getElementById('volumeSlider');
                this.volumeSliderFill = document.getElementById('volumeSliderFill');
                this.volumeIcon = document.getElementById('volumeIcon');
                
                // 新增属性
                this.playbackRate = 1.0;          // 当前倍速
                this.playMode = 'order';           // 'order', 'random', 'loop'
                this.currentLyrics = [];           // 解析后的歌词数组 [{time, text}]
                this.lyricsUpdateTimer = null;     // 歌词刷新定时器
                
                // 重试相关属性
                this.retryCount = 0;      // 当前重试次数
                this.maxRetries = 3;      // 最大重试次数
                this.retryDelay = 1500;   // 重试间隔(ms)
                
                // 歌词自动滚动相关
                this.lyricsAutoScrollTimer = null;   // 自动滚动计时器
                this.userScrolledLyrics = false;     // 用户是否主动滚动过歌词
                
                // Bilibil音频加载相关
                this._autoPlayEnabled = true;   // 是否允许自动播放
                this._playAttempted = false;    // 是否已尝试播放
                this._isBiliSong = false;       // 是否为Bilibil歌曲
                this.onBiliProgress = null;     // Bilibil音频缓冲进度监听函数
                this.onCanPlay = null;          // Bilibil音频可播放监听函数
                this.onCanPlayThrough = null;   // Bilibil音频可流畅播放监听函数
                
                // 可视化相关属性
                this.visualizerEnabled = false;
                this.audioCtx = null;
                this.analyser = null;
                this.visualizerSource = null;
                this.visualizerAnimationId = null;
                this.visualizerCanvas = document.getElementById('visualizerCanvas');
                this.visualizerCtx = this.visualizerCanvas?.getContext('2d');
                this.toggleVisualizerBtn = document.getElementById('toggleVisualizerBtn');
                
                this.init();
            }
            
            init() {
                // 设置默认音量
                this.audioElement.volume = 0.8;
                this.volumeSliderFill.style.width = '80%';
                
                // 绑定事件监听器
                this.bindEvents();
            }
            
            bindEvents() {
                // 播放/暂停按钮
                this.playBtn.addEventListener('click', () => this.togglePlay());
                
                // 上一曲/下一曲按钮
                this.prevBtn.addEventListener('click', () => this.playPrev());
                this.nextBtn.addEventListener('click', () => this.playNext());
                
                // 音频元素事件
                this.audioElement.addEventListener('play', () => this.onPlay());
                this.audioElement.addEventListener('pause', () => this.onPause());
                this.audioElement.addEventListener('timeupdate', () => this.onTimeUpdate());
                this.audioElement.addEventListener('ended', () => this.playNext());
                this.audioElement.addEventListener('error', (e) => this.onError(e));
                
                // 进度条点击事件
                this.progressBar.addEventListener('click', (e) => this.onProgressClick(e));
                
                // 音量控制
                this.volumeSlider.addEventListener('click', (e) => this.onVolumeClick(e));
                
                // 播放器封面点击事件
                const playerCover = this.playerElement.querySelector('.player-cover');
                if (playerCover) {
                    playerCover.addEventListener('click', () => this.openFullscreenPlayer());
                }
                
                // 监听 canplay 和 play 事件，确保倍速设置生效
                this.audioElement.addEventListener('canplay', () => {
                    this.applyPlaybackRate();
                });
                this.audioElement.addEventListener('play', () => {
                    this.applyPlaybackRate();
                });
                
                // 全屏播放器事件
                this.bindFullscreenEvents();
            }
            
            bindFullscreenEvents() {
                // 关闭按钮
                const closeBtn = document.getElementById('fullscreenPlayerClose');
                if (closeBtn) {
                    closeBtn.addEventListener('click', () => this.closeFullscreenPlayer());
                }
                
                // 全屏播放器控制按钮
                const fullscreenPlayBtn = document.getElementById('fullscreenPlayerPlay');
                if (fullscreenPlayBtn) {
                    fullscreenPlayBtn.addEventListener('click', () => this.togglePlay());
                }
                
                const fullscreenPrevBtn = document.getElementById('fullscreenPlayerPrev');
                if (fullscreenPrevBtn) {
                    fullscreenPrevBtn.addEventListener('click', () => this.playPrev());
                }
                
                const fullscreenNextBtn = document.getElementById('fullscreenPlayerNext');
                if (fullscreenNextBtn) {
                    fullscreenNextBtn.addEventListener('click', () => this.playNext());
                }
                
                // 下载按钮
                const fullscreenDownloadBtn = document.getElementById('fullscreenPlayerDownload');
                if (fullscreenDownloadBtn) {
                    fullscreenDownloadBtn.addEventListener('click', () => {
                        const currentSong = getCurrentPlayingSong();
                        if (!currentSong) {
                            showToast('没有正在播放的歌曲', 'warning');
                            return;
                        }
                        showDownloadOptionsPanel(currentSong);
                    });
                }
                
                // 可视化按钮
                if (this.toggleVisualizerBtn) {
                    this.toggleVisualizerBtn.addEventListener('click', () => this.toggleVisualizer());
                }
                
                // 全屏播放器进度条
                const fullscreenProgress = document.getElementById('fullscreenPlayerProgress');
                if (fullscreenProgress) {
                    fullscreenProgress.addEventListener('click', (e) => this.onFullscreenProgressClick(e));
                }
                
                // 倍速下拉菜单
                const speedTrigger = document.getElementById('speedDropdownTrigger');
                const speedMenu = document.getElementById('speedDropdownMenu');
                const currentSpeedLabel = document.getElementById('currentSpeedLabel');
                if (speedTrigger && speedMenu) {
                    speedTrigger.addEventListener('click', (e) => {
                        e.stopPropagation();
                        speedMenu.classList.toggle('show');
                        if (modeMenu) modeMenu.classList.remove('show');
                    });
                    speedMenu.querySelectorAll('.speed-item').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const speed = parseFloat(btn.dataset.speed);
                            if (!isNaN(speed)) {
                                this.setPlaybackRate(speed);
                                currentSpeedLabel.textContent = speed + 'x';
                                speedMenu.querySelectorAll('.speed-item').forEach(item => item.classList.remove('active'));
                                btn.classList.add('active');
                            }
                            speedMenu.classList.remove('show');
                        });
                    });
                }

                // 模式下拉菜单
                const modeTrigger = document.getElementById('modeDropdownTrigger');
                const modeMenu = document.getElementById('modeDropdownMenu');
                const currentModeLabel = document.getElementById('currentModeLabel');
                if (modeTrigger && modeMenu) {
                    modeTrigger.addEventListener('click', (e) => {
                        e.stopPropagation();
                        modeMenu.classList.toggle('show');
                        if (speedMenu) speedMenu.classList.remove('show');
                    });
                    modeMenu.querySelectorAll('.mode-item').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const mode = btn.dataset.mode;
                            if (mode) {
                                this.setPlayMode(mode);
                                const modeText = { order: '顺序', random: '随机', loop: '单曲' }[mode];
                                currentModeLabel.textContent = modeText;
                                modeMenu.querySelectorAll('.mode-item').forEach(item => item.classList.remove('active'));
                                btn.classList.add('active');
                            }
                            modeMenu.classList.remove('show');
                        });
                    });
                }

                // 点击页面其他区域关闭菜单
                document.addEventListener('click', () => {
                    if (speedMenu) speedMenu.classList.remove('show');
                    if (modeMenu) modeMenu.classList.remove('show');
                });

                // 歌词容器滚动监听（检测用户主动滚动）
                const lyricsContainer = document.getElementById('fullscreenLyrics');
                if (lyricsContainer) {
                    const handleUserScroll = () => {
                        if (!this.userScrolledLyrics) {
                            this.userScrolledLyrics = true;
                        }
                        this.resetLyricsAutoScrollTimer();
                    };
                    lyricsContainer.addEventListener('scroll', handleUserScroll);
                    lyricsContainer.addEventListener('wheel', handleUserScroll);
                    lyricsContainer.addEventListener('touchmove', handleUserScroll);
                    // 保存以便清理（可选，在类中添加清理方法）
                    this.lyricsScrollHandler = handleUserScroll;
                }
            }
            
            // 下载当前歌曲
            downloadCurrentSong() {
                const audioSrc = this.audioElement.src;
                if (!audioSrc || audioSrc === '') {
                    showToast('没有正在播放的歌曲', 'warning');
                    return;
                }

                // 获取歌曲名称和艺术家（从播放器界面元素读取）
                const songTitle = document.getElementById('playerTitle')?.innerText || '未知歌曲';
                const songArtist = document.getElementById('playerArtist')?.innerText || '未知艺术家';
                
                // 清理文件名中的非法字符
                const cleanName = (str) => str.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim();
                const fileName = `${cleanName(songTitle)} - ${cleanName(songArtist)}.mp3`;

                // 方法一：直接使用 a 标签下载（适用于同源或支持 CORS 的链接）
                try {
                    const link = document.createElement('a');
                    link.href = audioSrc;
                    link.download = fileName;
                    link.style.display = 'none';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    showToast(`开始下载: ${fileName}`, 'success');
                } catch (error) {
                    // 备选方案：使用 fetch 获取 blob 下载（解决部分跨域限制）
                    showToast('正在获取文件...', 'info');
                    fetch(audioSrc)
                        .then(res => {
                            if (!res.ok) throw new Error('下载失败');
                            return res.blob();
                        })
                        .then(blob => {
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = fileName;
                            link.click();
                            URL.revokeObjectURL(url);
                            showToast(`下载完成: ${fileName}`, 'success');
                        })
                        .catch(err => {
                            showNetworkError(err, '下载');
                        });
                }
            }
            
            openFullscreenPlayer() {
                const fullscreenPlayer = document.getElementById('fullscreenPlayer');
                if (fullscreenPlayer) {
                    fullscreenPlayer.classList.add('show');
                    // 禁止背景滚动
                    document.documentElement.style.overflow = 'hidden';
                    document.body.style.overflow = 'hidden';
                    this.updateFullscreenPlayer();
                    
                    // 同步当前倍速显示
                    const currentSpeed = this.playbackRate;
                    const speedLabel = document.getElementById('currentSpeedLabel');
                    if (speedLabel) speedLabel.textContent = currentSpeed + 'x';
                    const speedItems = document.querySelectorAll('.speed-item');
                    speedItems.forEach(item => {
                        if (Math.abs(parseFloat(item.dataset.speed) - currentSpeed) < 0.01) {
                            item.classList.add('active');
                        } else {
                            item.classList.remove('active');
                        }
                    });

                    // 同步当前模式显示
                    const modeTextMap = { order: '顺序', random: '随机', loop: '单曲' };
                    const modeLabel = document.getElementById('currentModeLabel');
                    if (modeLabel) modeLabel.textContent = modeTextMap[this.playMode] || '顺序';
                    const modeItems = document.querySelectorAll('.mode-item');
                    modeItems.forEach(item => {
                        if (item.dataset.mode === this.playMode) {
                            item.classList.add('active');
                        } else {
                            item.classList.remove('active');
                        }
                    });
                    
                    // 同步模式图标
                    const modeIcon = document.getElementById('modeIcon');
                    if (modeIcon) {
                        if (this.playMode === 'order') modeIcon.className = 'fas fa-list';
                        else if (this.playMode === 'random') modeIcon.className = 'fas fa-random';
                        else if (this.playMode === 'loop') modeIcon.className = 'fas fa-repeat';
                    }
                    
                    // 如果已经有歌词，重启同步
                    if(this.isPlaying) this.startLyricsSync();
                }
            }
            
            closeFullscreenPlayer() {
                const fullscreenPlayer = document.getElementById('fullscreenPlayer');
                if (fullscreenPlayer) {
                    fullscreenPlayer.classList.remove('show');
                    // 恢复背景滚动
                    document.documentElement.style.overflow = '';
                    document.body.style.overflow = '';
                }
                // 清理自动滚动计时器
                this.stopLyricsAutoScrollTimer();
            }
            
            updateFullscreenPlayer() {
                const currentSong = playlist.find(s => String(s.id) === String(this.currentSongId));
                if (!currentSong) return;
                
                // 更新封面
                const fullscreenCover = document.getElementById('fullscreenPlayerCover');
                if (fullscreenCover) {
                    if (currentSong.pic) {
                        let finalCoverUrl = currentSong.pic;
                        if (finalCoverUrl.startsWith('//')) {
                            finalCoverUrl = 'https:' + finalCoverUrl;
                        } else if (!finalCoverUrl.startsWith('http')) {
                            finalCoverUrl = 'https://via.placeholder.com/300x300?text=Music';
                        } else if (finalCoverUrl.startsWith('http://')) {
                            finalCoverUrl = finalCoverUrl.replace('http://', 'https://');
                        }
                        
                        // 判断是否为Bilibil图片
                        const isBiliPic = finalCoverUrl.includes('hdslb.com') || finalCoverUrl.includes('bilibili.com');
                        const referrerAttr = isBiliPic ? ' referrerpolicy="no-referrer"' : '';
                        
                        fullscreenCover.innerHTML = `<img src="${finalCoverUrl}" alt=""${referrerAttr} onerror="this.parentElement.innerHTML='&lt;i class=&quot;fas fa-music&quot;&gt;&lt;/i&gt;'">`;
                    } else {
                        fullscreenCover.innerHTML = '<i class="fas fa-music"></i>';
                    }
                }
                
                // 更新歌曲信息
                const fullscreenTitle = document.getElementById('fullscreenPlayerTitle');
                if (fullscreenTitle) {
                    fullscreenTitle.textContent = currentSong.name;
                    fullscreenTitle.setAttribute('data-text', currentSong.name);
                }
                
                const fullscreenArtist = document.getElementById('fullscreenPlayerArtist');
                if (fullscreenArtist) {
                    fullscreenArtist.textContent = currentSong.artist;
                    fullscreenArtist.setAttribute('data-text', currentSong.artist);
                }
                
                // 更新播放状态
                const fullscreenPlayBtn = document.getElementById('fullscreenPlayerPlay');
                if (fullscreenPlayBtn) {
                    fullscreenPlayBtn.innerHTML = this.isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
                }
                
                // 更新进度条
                this.updateFullscreenProgress();
                
                // 控制下载按钮显示
                const downloadBtn = document.getElementById('fullscreenPlayerDownload');
                if (downloadBtn) {
                    if (currentSong && currentSong.platform === 'bili') {
                        downloadBtn.style.display = 'none';
                    } else {
                        downloadBtn.style.display = 'flex';
                    }
                }
                
                // 检测文本是否过长，添加滚动效果
                function checkScrollText(element) {
                    if (element) {
                        if (element.scrollWidth > element.clientWidth) {
                            initFullscreenMarquee(element);
                        } else {
                            stopFullscreenMarquee(element);
                        }
                    }
                }
                
                // 为全屏播放器标题和艺术家名称设置无缝滚动效果
                function initFullscreenMarquee(element) {
                    if (element._marqueeActive) return;
                    
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
                    
                    // 获取容器可用宽度
                    const containerWidth = element.clientWidth;
                    
                    // 如果文本未超出容器，不启用滚动
                    if (textWidth <= containerWidth) {
                        element._marqueeActive = true;
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
                        if (!element._marqueeActive) return;
                        scrollPos += step;
                        if (scrollPos >= contentWidth) {
                            scrollPos = 0;
                        }
                        container.style.transform = `translateX(-${scrollPos}px)`;
                        requestAnimationFrame(animate);
                    }

                    element._marqueeActive = true;
                    requestAnimationFrame(animate);
                }
                
                // 停止全屏播放器滚动动画
                function stopFullscreenMarquee(element) {
                    if (element._marqueeActive) {
                        element._marqueeActive = false;
                        // 恢复原始文本
                        const originalText = element.getAttribute('data-text');
                        if (originalText) {
                            element.innerHTML = originalText;
                        }
                    }
                }
                
                const titleElement = document.getElementById('fullscreenPlayerTitle');
                const artistElement = document.getElementById('fullscreenPlayerArtist');
                
                // 延迟检查，确保文本已更新
                setTimeout(() => {
                    checkScrollText(titleElement);
                    checkScrollText(artistElement);
                }, 100);
                
                // 监听窗口大小变化，重新检查滚动效果
                window.addEventListener('resize', () => {
                    checkScrollText(titleElement);
                    checkScrollText(artistElement);
                });
            }
            
            updateFullscreenProgress() {
                if (this.audioElement.duration) {
                    const progress = (this.audioElement.currentTime / this.audioElement.duration) * 100;
                    const fullscreenProgressBar = document.getElementById('fullscreenPlayerProgressBar');
                    if (fullscreenProgressBar) {
                        fullscreenProgressBar.style.width = `${progress}%`;
                    }
                    
                    const currentTime = document.getElementById('fullscreenPlayerCurrentTime');
                    if (currentTime) {
                        currentTime.textContent = formatTime(this.audioElement.currentTime);
                    }
                    
                    const duration = document.getElementById('fullscreenPlayerDuration');
                    if (duration) {
                        duration.textContent = formatTime(this.audioElement.duration);
                    }
                }
            }
            
            onFullscreenProgressClick(e) {
                if (!this.audioElement.duration) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const percent = (e.clientX - rect.left) / rect.width;
                this.audioElement.currentTime = percent * this.audioElement.duration;
            }
            
            togglePlay() {
                if (this.audioElement.src && this.audioElement.readyState > 0) {
                    if (this.isPlaying) {
                        this.audioElement.pause();
                    } else {
                        this.audioElement.play().catch(() => {
                            showToast('播放失败: 不支持的音频格式或无法加载资源', 'error');
                        });
                    }
                } else if (this.audioElement.src) {
                    // 音频元素已设置src但未准备好，尝试加载
                    this.audioElement.load();
                    setTimeout(() => {
                        if (this.audioElement.readyState > 0) {
                            this.audioElement.play().catch(() => {
                                showToast('播放失败: 不支持的音频格式或无法加载资源', 'error');
                            });
                        } else {
                            showToast('播放失败: 音频资源无法加载', 'error');
                        }
                    }, 500);
                }
            }
            
            onPlay() {
                // 确保 AudioContext 运行（避免因自动播放策略挂起导致无声）
                if (this.visualizerEnabled && this.audioCtx) {
                    if (this.audioCtx.state === 'suspended') {
                        this.audioCtx.resume().catch(e => console.warn('resume失败', e));
                    }
                }
                
                this.retryCount = 0;   // 播放成功时重置重试计数
                
                this.isPlaying = true;
                this.playBtn.innerHTML = '<i class="fas fa-pause"></i>';
                
                // 更新全屏播放器播放按钮
                const fullscreenPlayBtn = document.getElementById('fullscreenPlayerPlay');
                if (fullscreenPlayBtn) {
                    fullscreenPlayBtn.innerHTML = '<i class="fas fa-pause"></i>';
                }
                
                // 开始听歌时长计时
                startListeningTimer();
                
                // 记录播放开始时间
                this.lastUpdateTime = Date.now();
                this.lastStorageUpdate = Date.now();
                
                // 启动歌词同步
                this.startLyricsSync();
            }
            
            onPause() {
                // 计算播放时长并更新（总是存储，UI更新按需）
                if (this.lastUpdateTime !== null) {
                    const now = Date.now();
                    const delta = now - this.lastUpdateTime;
                    if (delta > 0) {
                        const totalPlayTime = getSetting('totalPlayTime', 0) + delta;
                        setSetting('totalPlayTime', totalPlayTime);
                        // 仅当个人页面可见时才刷新UI
                        if (profilePage.style.display === 'block') {
                            updateProfileStats();
                        }
                    }
                    this.lastUpdateTime = null;
                }
                this.isPlaying = false;
                // 停止听歌时长计时
                stopListeningTimer();
                this.playBtn.innerHTML = '<i class="fas fa-play"></i>';
                
                // 更新全屏播放器播放按钮
                const fullscreenPlayBtn = document.getElementById('fullscreenPlayerPlay');
                if (fullscreenPlayBtn) {
                    fullscreenPlayBtn.innerHTML = '<i class="fas fa-play"></i>';
                }
                
                // 停止歌词同步
                this.stopLyricsSync();
            }
            
            onTimeUpdate() {
                if (this.audioElement.duration) {
                    const progress = (this.audioElement.currentTime / this.audioElement.duration) * 100;
                    this.progressFill.style.width = `${progress}%`;
                    this.timeDisplay.textContent = `${formatTime(this.audioElement.currentTime)} / ${formatTime(this.audioElement.duration)}`;
                    
                    // 更新全屏播放器进度条
                    this.updateFullscreenProgress();
                }
                
                // 无论当前页面，都实时更新播放时长（仅更新存储，UI更新按需）
                if (this.lastUpdateTime !== null) {
                    const now = Date.now();
                    const delta = now - this.lastUpdateTime;
                    
                    // 每1秒更新一次localStorage，避免频繁写入
                    if (now - this.lastStorageUpdate >= this.updateInterval) {
                        if (delta > 0) {
                            const totalPlayTime = getSetting('totalPlayTime', 0) + delta;
                            setSetting('totalPlayTime', totalPlayTime);
                            this.lastStorageUpdate = now;
                            
                            // 仅当个人页面可见时才刷新UI，减少不必要操作
                            if (profilePage.style.display === 'block') {
                                updateProfileStats();
                            }
                            
                            triggerSync();
                        }
                        this.lastUpdateTime = now;
                    }
                }
            }
            
            onProgressClick(e) {
                if (!this.audioElement.duration) return;
                const rect = this.progressBar.getBoundingClientRect();
                const percent = (e.clientX - rect.left) / rect.width;
                this.audioElement.currentTime = percent * this.audioElement.duration;
            }
            
            onVolumeClick(e) {
                const rect = this.volumeSlider.getBoundingClientRect();
                const percent = (e.clientX - rect.left) / rect.width;
                const volume = Math.max(0, Math.min(1, percent));
                this.audioElement.volume = volume;
                this.volumeSliderFill.style.width = `${volume * 100}%`;
                
                // 更新音量图标
                if (volume === 0) {
                    this.volumeIcon.innerHTML = '<i class="fas fa-volume-mute"></i>';
                } else if (volume < 0.5) {
                    this.volumeIcon.innerHTML = '<i class="fas fa-volume-down"></i>';
                } else {
                    this.volumeIcon.innerHTML = '<i class="fas fa-volume-up"></i>';
                }
            }
            
            onError(e) {
                const currentSong = playlist.find(s => String(s.id) === String(this.currentSongId));
                if (!currentSong) return;
                if (currentSong.platform === 'bili') {
                    if (this.retryCount >= this.maxRetries) {
                        showToast('音频加载失败，请检查网络或重新搜索', 'error');
                        this.retryCount = 0;
                        return;
                    }
                    this.retryCount++;
                    showToast(`Bilibil音频加载中，重试 (${this.retryCount}/${this.maxRetries})...`, 'warning');
                    setTimeout(async () => {
                        await refreshAndPlaySong(currentSong.id, 'bili');
                    }, this.retryDelay);
                    return;
                }

                // 已达最大重试次数，停止重试
                if (this.retryCount >= this.maxRetries) {
                    showToast('播放失败次数过多，请检查网络连接或稍后再试', 'error');
                    this.retryCount = 0;
                    return;
                }

                let errorMessage = '播放失败';
                const isNetEase = currentSong.url?.includes('music.126.net');
                const isExpired = (this.audioElement.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) || isNetEase;

                if (isExpired || this.audioElement.error?.code === MediaError.MEDIA_ERR_NETWORK) {
                    this.retryCount++;
                    showToast(`播放失败，正在重试 (${this.retryCount}/${this.maxRetries})...`, 'warning');

                    // 清除缓存
                    const cacheKey = `${currentSong.platform}_${currentSong.id}`;
                    delete songDetailsCache[cacheKey];
                    localStorage.setItem('songDetailsCache', JSON.stringify(songDetailsCache));
                    if (typeof ApiCache !== 'undefined') ApiCache.clear();

                    // 延迟后重新获取链接
                    setTimeout(async () => {
                        try {
                            const result = await getSongDetail(currentSong.id, currentSong.platform, true);
                            if ((result.code === 1 || result.code === 200) && result.data?.url) {
                                // 更新内存中的 url
                                currentSong.url = result.data.url;
                                if (result.data.lrc) currentSong.lrc = result.data.lrc;
                                const idx = playlist.findIndex(s => String(s.id) === String(currentSong.id));
                                if (idx !== -1) playlist[idx].url = result.data.url;
                                const histIdx = playHistory.findIndex(s => String(s.id) === String(currentSong.id));
                                if (histIdx !== -1) playHistory[histIdx].url = result.data.url;
                                setSetting('playHistory', playHistory);

                                this.audioElement.src = proxyAudioUrl(result.data.url);
                                this.audioElement.load();
                                this.audioElement.play().catch(err => this.onError(err));
                            } else {
                                this.onError(new Error('获取新链接失败'));
                            }
                        } catch (err) {
                            this.onError(err);
                        }
                    }, this.retryDelay);
                } else {
                    // 其他错误类型
                    switch (this.audioElement.error?.code) {
                        case MediaError.MEDIA_ERR_ABORTED: errorMessage = '加载被中止'; break;
                        case MediaError.MEDIA_ERR_NETWORK: errorMessage = '网络错误'; break;
                        case MediaError.MEDIA_ERR_DECODE: errorMessage = '解码错误'; break;
                        default: errorMessage = '不支持的格式或资源无效';
                    }
                    showToast(`播放失败: ${errorMessage}`, 'error');
                    this.retryCount = 0;
                }
            }
            
            playNext() {
                // 先更新当前歌曲的播放时长
                if (this.lastUpdateTime !== null) {
                    const now = Date.now();
                    const delta = now - this.lastUpdateTime;
                    if (delta > 0) {
                        const totalPlayTime = getSetting('totalPlayTime', 0) + delta;
                        setSetting('totalPlayTime', totalPlayTime);
                        // 如果当前在个人页面，更新显示
                        if (profilePage.style.display === 'block') {
                            updateProfileStats();
                        }
                    }
                    this.lastUpdateTime = null;
                }
                
                if (playlist.length === 0) return;
                let nextIndex;
                if(this.playMode === 'random') {
                    let newIndex;
                    do {
                        newIndex = Math.floor(Math.random() * playlist.length);
                    } while(playlist.length > 1 && newIndex === playlist.findIndex(s => String(s.id) === String(this.currentSongId)));
                    nextIndex = newIndex;
                } else if(this.playMode === 'loop') {
                    // 单曲循环：继续播放同一首，不切换歌曲，只需重新播放
                    const currentSong = playlist.find(s => String(s.id) === String(this.currentSongId));
                    if(currentSong) {
                        this.audioElement.currentTime = 0;
                        this.audioElement.play().catch(e=>console.warn);
                        return;
                    } else {
                        nextIndex = 0;
                    }
                } else {
                    // 顺序播放
                    const currentIndex = playlist.findIndex(s => String(s.id) === String(this.currentSongId));
                    nextIndex = (currentIndex + 1) % playlist.length;
                }
                const nextSong = playlist[nextIndex];
                playSong(nextSong.id, nextSong.platform, nextSong);
            }
            
            playPrev() {
                // 先更新当前歌曲的播放时长
                if (this.lastUpdateTime !== null) {
                    const now = Date.now();
                    const delta = now - this.lastUpdateTime;
                    if (delta > 0) {
                        const totalPlayTime = getSetting('totalPlayTime', 0) + delta;
                        setSetting('totalPlayTime', totalPlayTime);
                        // 如果当前在个人页面，更新显示
                        if (profilePage.style.display === 'block') {
                            updateProfileStats();
                        }
                    }
                    this.lastUpdateTime = null;
                }
                
                if (playlist.length === 0) return;
                if(this.playMode === 'random') {
                    let newIndex;
                    do {
                        newIndex = Math.floor(Math.random() * playlist.length);
                    } while(playlist.length > 1 && newIndex === playlist.findIndex(s => String(s.id) === String(this.currentSongId)));
                    const prevSong = playlist[newIndex];
                    playSong(prevSong.id, prevSong.platform, prevSong);
                } else if(this.playMode === 'loop') {
                    const currentSong = playlist.find(s => String(s.id) === String(this.currentSongId));
                    if(currentSong) {
                        this.audioElement.currentTime = 0;
                        this.audioElement.play().catch(e=>console.warn);
                        return;
                    }
                } else {
                    const currentIndex = playlist.findIndex(s => String(s.id) === String(this.currentSongId));
                    const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
                    const prevSong = playlist[prevIndex];
                    playSong(prevSong.id, prevSong.platform, prevSong);
                }
            }
            
            setSong(song, retryCount = 0) {
                // 根据平台设置跨域属性
                // Bilibili音乐不支持CORS，即使开启可视化也不要设置crossOrigin
                if (song.platform !== 'bili') {
                    this.audioElement.crossOrigin = "anonymous";
                } else {
                    this.audioElement.crossOrigin = null;
                }
                
                // 先更新当前歌曲的播放时长
                if (this.lastUpdateTime !== null) {
                    const now = Date.now();
                    const delta = now - this.lastUpdateTime;
                    if (delta > 0) {
                        const totalPlayTime = getSetting('totalPlayTime', 0) + delta;
                        setSetting('totalPlayTime', totalPlayTime);
                        // 如果当前在个人页面，更新显示
                        if (profilePage.style.display === 'block') {
                            updateProfileStats();
                        }
                    }
                    this.lastUpdateTime = null;
                }
                
                // 检查音频URL是否有效
                if (!song.url) {
                    showToast('播放失败: 无效的音频URL', 'error');
                    return;
                }
                
                this.currentSongId = song.id;
                this.currentSong = song; // 保存当前歌曲对象
                this.audioElement.src = proxyAudioUrl(song.url);
                this.applyPlaybackRate();  // 应用倍速设置
                this.audioElement.preload = 'auto';
                this.audioElement.load();

                // 移除旧的事件监听，避免重复
                this.audioElement.removeEventListener('progress', this.onBiliProgress);
                this.audioElement.removeEventListener('canplay', this.onCanPlay);
                this.audioElement.removeEventListener('canplaythrough', this.onCanPlayThrough);

                if (song.platform === 'bili') {
                    this._isBiliSong = true;
                    this._playAttempted = false;

                    // 缓冲进度监听
                    this.onBiliProgress = () => {
                        const buffered = this.audioElement.buffered;
                        if (buffered.length > 0) {
                            const bufferedEnd = buffered.end(buffered.length - 1);
                            const duration = this.audioElement.duration;
                            if (duration > 0) {
                                const bufferPercent = (bufferedEnd / duration) * 100;
                                if (bufferPercent >= 5 && !this._playAttempted && !this.isPlaying) {
                                    this._playAttempted = true;
                                    this.audioElement.play().catch(e => console.warn);
                                }
                                this.updateBufferProgress(bufferPercent);
                            }
                        }
                    };

                    // 可播放时自动开始
                    this.onCanPlay = () => {
                        if (!this._playAttempted && !this.isPlaying) {
                            this._playAttempted = true;
                            this.audioElement.play().catch(e => console.warn);
                        }
                    };

                    // 可流畅播放时确保开始
                    this.onCanPlayThrough = () => {
                        if (!this.isPlaying && this._playAttempted) {
                            this.audioElement.play().catch(e => console.warn);
                        }
                    };

                    this.audioElement.addEventListener('progress', this.onBiliProgress);
                    this.audioElement.addEventListener('canplay', this.onCanPlay);
                    this.audioElement.addEventListener('canplaythrough', this.onCanPlayThrough);
                } else {
                    // 非 B 站音乐使用原有播放逻辑
                    const playAudio = () => {
                        this.audioElement.play().catch((err) => {
                            const isNetEase = song.url.includes('music.126.net') || song.url.includes('126.net');
                            if ((isNetEase || err.name === 'NotSupportedError' || err.message.includes('403')) && retryCount < 3) {
                                showToast('音频链接过期，重新获取中...', 'warning');
                                // 清除该歌曲的缓存，并强制刷新 API 结果
                                const cacheKey = `${song.platform}_${song.id}`;
                                delete songDetailsCache[cacheKey];
                                localStorage.setItem('songDetailsCache', JSON.stringify(songDetailsCache));
                                // 直接重试，不等待，传入 forceRefresh 参数
                                playSong(song.id, song.platform);
                            } else {
                                showToast('播放失败: ' + (err.message || '无法加载音频'), 'error');
                            }
                        });
                    };
                    if (this.audioElement.readyState >= 2) playAudio();
                    else this.audioElement.addEventListener('canplay', () => { playAudio(); }, { once: true });
                }
                
                this.playerTitle.textContent = song.name;
                this.playerArtist.textContent = song.artist;
                
                const playerCover = this.playerElement.querySelector('.player-cover');
                if (song.pic) {
                    let finalCoverUrl = song.pic;
                    if (finalCoverUrl.startsWith('//')) {
                        finalCoverUrl = 'https:' + finalCoverUrl;
                    } else if (!finalCoverUrl.startsWith('http')) {
                        finalCoverUrl = 'https://via.placeholder.com/100x100?text=Music';
                    } else if (finalCoverUrl.startsWith('http://')) {
                        finalCoverUrl = finalCoverUrl.replace('http://', 'https://');
                    }
                    const isBiliPic = finalCoverUrl.includes('hdslb.com') || finalCoverUrl.includes('bilibili.com');
                    const referrerAttr = isBiliPic ? ' referrerpolicy="no-referrer"' : '';
                    playerCover.innerHTML = `<img src="${finalCoverUrl}" alt=""${referrerAttr} onerror="this.parentElement.innerHTML='&lt;i class=&quot;fas fa-music&quot;&gt;&lt;/i&gt;'">`;
                } else {
                    playerCover.innerHTML = '<i class="fas fa-music"></i>';
                }
                
                this.playerElement.classList.add('visible');
                this.playerElement.classList.remove('hidden');
                
                // 重置播放状态
                this.isPlaying = false;
                this.playBtn.innerHTML = '<i class="fas fa-play"></i>';
                
                // 重置进度条
                this.progressFill.style.width = '0%';
                this.timeDisplay.textContent = '0:00 / 0:00';
                
                // 刷新滚动效果
                refreshMarquee();
                
                // 更新歌曲列表中的活动样式
                document.querySelectorAll('.song-item').forEach(item => {
                    item.classList.toggle('active', item.dataset.id === String(this.currentSongId));
                });
                
                // 更新全屏播放器
                this.updateFullscreenPlayer();
                
                // 加载歌词（从song对象中获取lrc字段，该字段由 getSongDetail 填充）
                if(song.lrc) {
                    this.loadLyrics(song.lrc);
                } else {
                    this.loadLyrics(null);
                }
                // 不再恢复保存的倍速和播放模式，使用默认值（已在构造函数中定义）
                // 构造函数中已设置 this.playbackRate = 1.0; this.playMode = 'order';
            }
            
            get isPlaying() {
                return this._isPlaying || false;
            }
            
            set isPlaying(value) {
                this._isPlaying = value;
            }
            
            // 设置播放倍速
            setPlaybackRate(rate, silent = false) {
                this.playbackRate = rate;
                this.applyPlaybackRate();
                if (!silent) {
                    showToast(`播放速度 ${rate}x`, 'success');
                }
            }
            
            // 切换播放模式
            setPlayMode(mode, silent = false) {
                this.playMode = mode;
                
                // 更新模式触发器图标
                const modeIcon = document.getElementById('modeIcon');
                if (modeIcon) {
                    if (mode === 'order') modeIcon.className = 'fas fa-list';
                    else if (mode === 'random') modeIcon.className = 'fas fa-random';
                    else if (mode === 'loop') modeIcon.className = 'fas fa-repeat';
                }
                
                // 更新下拉菜单中的高亮
                document.querySelectorAll('.mode-item').forEach(btn => {
                    if(btn.dataset.mode === mode) btn.classList.add('active');
                    else btn.classList.remove('active');
                });
                
                if (!silent) {
                    const modeName = { order:'顺序播放', random:'随机播放', loop:'单曲循环' }[mode];
                    showToast(modeName, 'info');
                }
            }
            
            // 统一应用倍速设置
            applyPlaybackRate() {
                if (this.audioElement && this.playbackRate) {
                    this.audioElement.playbackRate = this.playbackRate;
                }
            }
            
            // 更新缓冲进度条
            updateBufferProgress(percent) {
                const bufferFill = document.getElementById('playerBufferFill');
                if (bufferFill) {
                    bufferFill.style.width = `${percent}%`;
                }
            }
            
            // 新增：Bilibil音乐缓冲进度显示（可选）
            onBiliProgress() {
                const buffered = this.audioElement.buffered;
                if (buffered.length > 0) {
                    const bufferedEnd = buffered.end(buffered.length - 1);
                    const duration = this.audioElement.duration;
                    if (duration > 0) {
                        const percent = (bufferedEnd / duration) * 100;
                        // 可显示缓冲进度条，此处仅用于优化加载策略
                        if (percent > 20 && !this._playAttempted) {
                            // 缓冲足够时自动播放
                            this._playAttempted = true;
                            this.audioElement.play().catch(e => console.warn);
                        }
                    }
                }
            }
            
            // 解析 LRC 字符串为数组 [{time:秒数, text}]
            parseLrc(lrcText) {
                if(!lrcText) return [];
                const lines = lrcText.split(/\r?\n/);
                const parsed = [];
                const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
                for(let line of lines) {
                    const match = timeRegex.exec(line);
                    if(match) {
                        const minutes = parseInt(match[1]);
                        const seconds = parseInt(match[2]);
                        const millis = parseInt(match[3].padEnd(3,'0'));
                        const time = minutes * 60 + seconds + millis / 1000;
                        const text = line.replace(timeRegex, '').trim();
                        if(text) parsed.push({ time, text });
                    } else if(line.trim() && !line.includes('[')) {
                        // 没有时间戳的纯文本（如标题）暂不处理
                    }
                }
                // 按时间排序
                parsed.sort((a,b) => a.time - b.time);
                return parsed;
            }
            
            // 加载并显示歌词（从歌曲详情 data.lrc）
            loadLyrics(lrcString) {
                const lyricsContainer = document.getElementById('fullscreenLyrics');
                if(!lyricsContainer) return;
                if(!lrcString) {
                    lyricsContainer.innerHTML = '<div class="lyrics-placeholder"><i class="fas fa-music"></i> 纯音乐 / 暂无歌词</div>';
                    this.currentLyrics = [];
                    return;
                }
                this.currentLyrics = this.parseLrc(lrcString);
                if(this.currentLyrics.length === 0) {
                    lyricsContainer.innerHTML = '<div class="lyrics-placeholder"><i class="fas fa-exclamation-circle"></i> 歌词解析失败，但音乐无界</div>';
                    return;
                }
                // 渲染所有歌词行
                let html = '<div class="lyrics-wrapper">';
                this.currentLyrics.forEach((item, idx) => {
                    html += `<div class="lyrics-line" data-time="${item.time}">${escapeHTML(item.text)}</div>`;
                });
                html += '</div>';
                lyricsContainer.innerHTML = html;
                // 重置用户滚动标志并启动自动滚动计时器
                this.userScrolledLyrics = false;
                this.stopLyricsAutoScrollTimer();
                this.startLyricsAutoScrollTimer();
                // 启动歌词同步（如果正在播放）
                if(this.isPlaying) this.startLyricsSync();
            }
            
            // 开始歌词同步（每隔100ms检测一次）
            startLyricsSync() {
                if(this.lyricsUpdateTimer) clearInterval(this.lyricsUpdateTimer);
                if(!this.currentLyrics.length) return;
                const lyricsContainer = document.getElementById('fullscreenLyrics');
                if(!lyricsContainer) return;
                this.lyricsUpdateTimer = setInterval(() => {
                    const currentTime = this.audioElement.currentTime;
                    let activeIndex = -1;
                    for(let i = 0; i < this.currentLyrics.length; i++) {
                        if(currentTime >= this.currentLyrics[i].time) {
                            activeIndex = i;
                        } else {
                            break;
                        }
                    }
                    // 高亮当前行
                    const lines = lyricsContainer.querySelectorAll('.lyrics-line');
                    lines.forEach((line, idx) => {
                        if(idx === activeIndex) {
                            line.classList.add('active-line');
                            // 如果用户没有主动滚动，则自动滚动到当前行
                            if (!this.userScrolledLyrics) {
                                line.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        } else {
                            line.classList.remove('active-line');
                        }
                    });
                }, 150);
            }
            
            stopLyricsSync() {
                if(this.lyricsUpdateTimer) {
                    clearInterval(this.lyricsUpdateTimer);
                    this.lyricsUpdateTimer = null;
                }
            }

            // 停止自动滚动计时器
            stopLyricsAutoScrollTimer() {
                if (this.lyricsAutoScrollTimer) {
                    clearTimeout(this.lyricsAutoScrollTimer);
                    this.lyricsAutoScrollTimer = null;
                }
            }

            // 启动自动滚动计时器（3秒后自动回正）
            startLyricsAutoScrollTimer() {
                this.stopLyricsAutoScrollTimer();
                this.lyricsAutoScrollTimer = setTimeout(() => {
                    if (this.userScrolledLyrics) {
                        this.userScrolledLyrics = false;
                        // 手动滚动到当前歌词行并居中
                        this.scrollToCurrentLyricsLine();
                    }
                }, 3000);
            }

            // 重置自动滚动计时器（用户操作时调用）
            resetLyricsAutoScrollTimer() {
                if (!this.userScrolledLyrics) {
                    this.userScrolledLyrics = true;
                }
                this.startLyricsAutoScrollTimer();
            }

            // 滚动到当前激活的歌词行（居中显示）
            scrollToCurrentLyricsLine() {
                const lyricsContainer = document.getElementById('fullscreenLyrics');
                if (!lyricsContainer) return;
                const activeLine = lyricsContainer.querySelector('.lyrics-line.active-line');
                if (activeLine) {
                    activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
            
            /**
             * 初始化音频上下文（必须在用户手势内调用）
             */
            async initAudioContext() {
                if (this.audioCtx) {
                    if (this.audioCtx.state === 'suspended') {
                        await this.audioCtx.resume().catch(e => console.warn('恢复AudioContext失败', e));
                    }
                    return true;
                }
                try {
                    // Bilibili音乐不支持CORS，即使开启可视化也不要设置crossOrigin
                    if (this.currentSong && this.currentSong.platform !== 'bili') {
                        this.audioElement.crossOrigin = "anonymous";
                    }
                    
                    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    this.analyser = this.audioCtx.createAnalyser();
                    this.analyser.fftSize = 256;
                    this.analyser.smoothingTimeConstant = 0.8;
                    
                    // 对于非Bilibili音乐，使用MediaElementSource获取真实音频数据
                    if (this.currentSong && this.currentSong.platform !== 'bili') {
                        // 避免重复创建 source（每个 audio 只能创建一个）
                        if (!this.visualizerSource) {
                            this.visualizerSource = this.audioCtx.createMediaElementSource(this.audioElement);
                        }
                        this.visualizerSource.connect(this.analyser);
                        this.analyser.connect(this.audioCtx.destination);
                    }
                    // 对于Bilibili音乐，不使用MediaElementSource，直接使用模拟数据
                    
                    // 如果 AudioContext 因自动播放策略挂起，等待用户手势恢复
                    if (this.audioCtx.state === 'suspended') {
                        console.log('AudioContext 挂起，等待播放手势恢复');
                    }
                    return true;
                } catch (e) {
                    console.warn('Web Audio 初始化失败', e);
                    if (e.message.includes('already connected')) {
                        showToast('音频通道被占用，请刷新页面', 'error');
                    } else {
                        showToast('可视化初始化失败', 'error');
                    }
                    return false;
                }
            }

            /**
             * 开始绘制可视化频谱
             */
            startVisualizer() {
                if (!this.visualizerCanvas || !this.visualizerCtx) return;
                
                const canvas = this.visualizerCanvas;
                const ctx = this.visualizerCtx;
                const isBiliMusic = this.currentSong && this.currentSong.platform === 'bili';
                
                // 尺寸自适应（每次绘制前更新）
                const resizeCanvas = () => {
                    canvas.width = window.innerWidth;
                    canvas.height = window.innerHeight;
                };
                resizeCanvas();
                window.addEventListener('resize', resizeCanvas);
                
                // 初始化变量
                let bufferLength = 128; // 默认使用128个频谱条
                if (!isBiliMusic && this.analyser) {
                    bufferLength = this.analyser.frequencyBinCount;
                }
                const dataArray = new Uint8Array(bufferLength);
                
                // 暂停动画相关变量
                let pauseAnimationValue = 1; // 动画进度，1表示最大高度，0表示完全消失
                let isPausing = false; // 是否正在执行暂停动画
                const pauseAnimationDuration = 300; // 动画持续时间（毫秒）
                let pauseAnimationStartTime = 0; // 动画开始时间
                
                // 为Bilibili音乐生成波浪数据的函数
                let waveOffset = 0; // 波浪滚动偏移量
                const generateWaveData = (length) => {
                    const data = new Uint8Array(length);
                    const time = Date.now() * 0.001;
                    
                    for (let i = 0; i < length; i++) {
                        // 生成平滑的波浪数据，使用多个正弦波叠加
                        const wave1 = Math.sin(time * 2 + (i + waveOffset) * 0.05) * 40;
                        const wave2 = Math.sin(time * 1.5 + (i + waveOffset) * 0.07) * 20;
                        const wave3 = Math.sin(time * 3 + (i + waveOffset) * 0.03) * 10;
                        const baseValue = 100 + wave1 + wave2 + wave3;
                        data[i] = Math.min(255, Math.max(0, baseValue));
                    }
                    
                    // 增加偏移量，实现平滑滚动效果
                    waveOffset += 0.2;
                    // 不需要重置，因为正弦函数是周期性的，会自动循环
                    
                    return data;
                };
                
                // 为Bilibili音乐生成静态波浪数据的函数（暂停时使用）
                const generateStaticWaveData = (length) => {
                    const data = new Uint8Array(length);
                    
                    if (isPausing) {
                        // 计算动画进度
                        const elapsed = Date.now() - pauseAnimationStartTime;
                        const progress = Math.max(0, 1 - elapsed / pauseAnimationDuration);
                        
                        if (progress <= 0) {
                            // 动画结束
                            isPausing = false;
                            pauseAnimationValue = 0;
                        } else {
                            pauseAnimationValue = progress;
                        }
                    }
                    
                    for (let i = 0; i < length; i++) {
                        // 根据动画进度生成渐变小的数据
                        const wave = Math.sin((i) * 0.1) * 10 * pauseAnimationValue;
                        const baseValue = 50 * pauseAnimationValue + wave;
                        data[i] = Math.min(255, Math.max(0, baseValue));
                    }
                    
                    return data;
                };
                
                let lastPlayingState = this.isPlaying; // 记录上一帧的播放状态
                
                const draw = () => {
                    if (!this.visualizerEnabled) return;

                    this.visualizerAnimationId = requestAnimationFrame(draw);
                    
                    // 检测播放状态变化
                    if (lastPlayingState && !this.isPlaying) {
                        // 从播放变为暂停，启动下落动画
                        isPausing = true;
                        pauseAnimationStartTime = Date.now();
                        pauseAnimationValue = 1;
                    } else if (!lastPlayingState && this.isPlaying) {
                        // 从暂停变为播放，重置动画状态
                        isPausing = false;
                        pauseAnimationValue = 1;
                    }
                    lastPlayingState = this.isPlaying;

                    // 获取数据（真实音频数据或模拟数据）
                    if (!isBiliMusic && this.analyser) {
                        this.analyser.getByteFrequencyData(dataArray);
                    } else {
                        // 为Bilibili音乐生成波浪数据
                        if (this.isPlaying) {
                            // 播放时生成动态波浪
                            const waveData = generateWaveData(bufferLength);
                            dataArray.set(waveData);
                        } else {
                            // 暂停时生成静态波浪
                            const staticWaveData = generateStaticWaveData(bufferLength);
                            dataArray.set(staticWaveData);
                        }
                    }

                    const W = canvas.width;
                    const H = canvas.height;

                    // 清除为完全透明，让背景透出深色底色
                    ctx.clearRect(0, 0, W, H);

                    // 绘制一层极淡的黑色渐变作为衬底
                    const gradient = ctx.createLinearGradient(0, 0, 0, H);
                    gradient.addColorStop(0, 'rgba(10, 15, 30, 0.3)');
                    gradient.addColorStop(1, 'rgba(5, 8, 20, 0.7)');
                    ctx.fillStyle = gradient;
                    ctx.fillRect(0, 0, W, H);

                    // 计算频谱条宽度，确保所有条都能完整显示
                    const totalBars = Math.floor(bufferLength * 0.9); // 只显示80%的频谱条（移除高频部分）
                    const barWidth = W / totalBars;
                    let x = 0;

                    for (let i = 0; i < totalBars; i++) {
                        const value = dataArray[i];
                        const percent = value / 255;
                        // 获取设置的频谱条高度百分比
                        const visualizerHeightPercent = getSetting('visualizerHeightPercent', 80);
                        const barHeight = Math.max(2, percent * H * (visualizerHeightPercent / 100));

                        // 从左到右的渐变彩色
                        const hue = (i / totalBars) * 360; // 0-360度渐变
                        const saturation = 80 + (i / totalBars) * 20; // 80-100%渐变
                        const lightness = 50 + percent * 30; // 随强度变化
                        ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${0.6 + percent * 0.4})`;

                        // 发光效果
                        ctx.shadowColor = `hsl(${hue}, 90%, 70%)`;
                        ctx.shadowBlur = 15 * percent;

                        // 绘制频谱条，确保不超出画布
                        const actualBarWidth = Math.min(barWidth - 1, W - x);
                        if (actualBarWidth > 0) {
                            ctx.fillRect(x, H - barHeight, actualBarWidth, barHeight);
                        }
                        x += barWidth;
                        if (x >= W) break;
                    }
                    ctx.shadowBlur = 0;
                };
                
                draw();
                
                // 清理 resize 监听器（在 stopVisualizer 中）
                this._visualizerResizeHandler = resizeCanvas;
            }

            /**
             * 停止可视化绘制
             */
            stopVisualizer() {
                if (this.visualizerAnimationId) {
                    cancelAnimationFrame(this.visualizerAnimationId);
                    this.visualizerAnimationId = null;
                }
                if (this._visualizerResizeHandler) {
                    window.removeEventListener('resize', this._visualizerResizeHandler);
                    this._visualizerResizeHandler = null;
                }
                if (this.visualizerCtx && this.visualizerCanvas) {
                    this.visualizerCtx.clearRect(0, 0, this.visualizerCanvas.width, this.visualizerCanvas.height);
                }
            }

            /**
             * 切换可视化开关
             */
            async toggleVisualizer() {
                if (!this.visualizerCanvas) return;
                
                if (!this.visualizerEnabled) {
                    // 保存当前播放时间和播放状态
                    const currentTime = this.audioElement.currentTime;
                    const wasPlaying = this.isPlaying;
                    
                    // 初始化音频上下文
                    const audioCtxReady = await this.initAudioContext();
                    if (!audioCtxReady) return;
                    
                    // 关键：若 AudioContext 挂起，必须等待用户手势（通过播放按钮）恢复
                    if (this.audioCtx.state === 'suspended') {
                        // 尝试恢复（若在用户手势内则会成功）
                        await this.audioCtx.resume().catch(() => {
                            showToast('请先点击播放按钮激活音频', 'warning');
                        });
                    }
                    
                    // 只有非Bilibili音乐才需要刷新音频源以应用跨域设置
                    if (this.currentSong && this.currentSong.platform !== 'bili') {
                        this.audioElement.src = proxyAudioUrl(this.currentSong.url);
                        this.audioElement.load();
                        
                        // 恢复播放位置
                        if (currentTime > 0) {
                            this.audioElement.currentTime = currentTime;
                        }
                        
                        // 恢复播放状态
                        if (wasPlaying) {
                            this.audioElement.play().catch(err => console.warn('恢复播放失败:', err));
                        }
                    }
                    
                    this.visualizerEnabled = true;
                    this.visualizerCanvas.classList.add('show');
                    this.startVisualizer();
                    
                    // 对于所有音乐，都显示相同的提示
                    showToast('音频可视化已开启', 'success');
                    if (!this.isPlaying) {
                        this.drawStaticGrid();
                    }
                } else {
                    // 保存当前播放时间和播放状态
                    const currentTime = this.audioElement.currentTime;
                    const wasPlaying = this.isPlaying;
                    
                    this.visualizerEnabled = false;
                    this.stopVisualizer();
                    this.visualizerCanvas.classList.remove('show');
                    
                    // 刷新音频源以移除跨域设置（针对Bilibili）
                    if (this.currentSong && this.currentSong.platform === 'bili') {
                        this.audioElement.crossOrigin = null;
                        this.audioElement.src = proxyAudioUrl(this.currentSong.url);
                        this.audioElement.load();
                        
                        // 恢复播放位置
                        if (currentTime > 0) {
                            this.audioElement.currentTime = currentTime;
                        }
                        
                        // 恢复播放状态
                        if (wasPlaying) {
                            this.audioElement.play().catch(err => console.warn('恢复播放失败:', err));
                        }
                    }
                    
                    showToast('音频可视化已关闭', 'info');
                }
            }

            /**
             * 绘制静态网格（无音频数据时）
             */
            drawStaticGrid() {
                if (!this.visualizerCtx || !this.visualizerCanvas) return;
                const ctx = this.visualizerCtx;
                const W = this.visualizerCanvas.width;
                const H = this.visualizerCanvas.height;
                ctx.clearRect(0, 0, W, H);
                ctx.fillStyle = '#0f172a';
                ctx.fillRect(0, 0, W, H);
                ctx.font = '12px "Segoe UI"';
                ctx.fillStyle = '#64748b';
                ctx.textAlign = 'center';
                ctx.fillText('等待音频播放...', W/2, H/2);
            }

            /**
             * 清理可视化资源（在播放器销毁或页面卸载时调用）
             */
            cleanupVisualizer() {
                this.stopVisualizer();
                if (this.audioCtx && this.audioCtx.state !== 'closed') {
                    this.audioCtx.close();
                    this.audioCtx = null;
                    this.analyser = null;
                    this.visualizerSource = null;
                }
                this.visualizerEnabled = false;
            }
        }
        
        // 创建播放器实例
        const player = new Player();

        // 清空播放器状态
        function clearPlayer() {
            if (!player || !player.audioElement) return;
            
            // 暂停播放
            player.audioElement.pause();
            
            // 清空音频源
            player.audioElement.src = '';
            
            // 重置播放器状态
            player.currentSongId = null;
            player._isPlaying = false;
            player.playMode = 'order';
            player.currentLyrics = [];
            player.lastUpdateTime = null;
            player.retryCount = 0;
            
            // 停止定时器
            if (player.lyricsUpdateTimer) {
                clearInterval(player.lyricsUpdateTimer);
                player.lyricsUpdateTimer = null;
            }
            if (player.lyricsAutoScrollTimer) {
                clearInterval(player.lyricsAutoScrollTimer);
                player.lyricsAutoScrollTimer = null;
            }
            
            // 更新UI
            player.playBtn.innerHTML = '<i class="fas fa-play"></i>';
            player.playerTitle.textContent = '';
            player.playerArtist.textContent = '';
            player.timeDisplay.textContent = '0:00 / 0:00';
            player.progressFill.style.width = '0%';
            
            // 隐藏播放器
            player.playerElement.classList.add('hidden');
            player.playerElement.classList.remove('visible');
        }


        // 网易云搜索元素
        const wySearchInput = document.getElementById('wySearchInput');
        const wySearchBtn = document.getElementById('wySearchBtn');
        const wySearchClear = document.getElementById('wySearchClear');
        const wySongList = document.getElementById('wySongList');
        const wyEmptyState = document.getElementById('wyEmptyState');
        const wyLoadMoreContainer = document.getElementById('wyLoadMoreContainer');
        const wyLoadMoreBtn = document.getElementById('wyLoadMoreBtn');
        const wyHistorySection = document.getElementById('wyHistorySection');
        const wyHistoryList = document.getElementById('wyHistoryList');
        const wyClearHistoryBtn = document.getElementById('wyClearHistoryBtn');
        const wyResultsCount = document.getElementById('wyResultsCount');
        const wyPlaylistBtn = document.getElementById('wyPlaylistBtn');
        
        // Bilibil搜索元素
        const biliSearchInput = document.getElementById('biliSearchInput');
        const biliSearchBtn = document.getElementById('biliSearchBtn');
        const biliSearchClear = document.getElementById('biliSearchClear');
        const biliSongList = document.getElementById('biliSongList');
        const biliEmptyState = document.getElementById('biliEmptyState');
        const biliLoadMoreContainer = document.getElementById('biliLoadMoreContainer');
        const biliLoadMoreBtn = document.getElementById('biliLoadMoreBtn');
        const biliHistorySection = document.getElementById('biliHistorySection');
        const biliHistoryList = document.getElementById('biliHistoryList');
        const biliClearHistoryBtn = document.getElementById('biliClearHistoryBtn');
        const biliResultsCount = document.getElementById('biliResultsCount');
        const biliPlaylistBtn = document.getElementById('biliPlaylistBtn');
        
        // QQ音乐搜索元素
        const qqSearchInput = document.getElementById('qqSearchInput');
        const qqSearchBtn = document.getElementById('qqSearchBtn');
        const qqSearchClear = document.getElementById('qqSearchClear');
        const qqSongList = document.getElementById('qqSongList');
        const qqEmptyState = document.getElementById('qqEmptyState');
        const qqLoadMoreContainer = document.getElementById('qqLoadMoreContainer');
        const qqLoadMoreBtn = document.getElementById('qqLoadMoreBtn');
        const qqHistorySection = document.getElementById('qqHistorySection');
        const qqHistoryList = document.getElementById('qqHistoryList');
        const qqClearHistoryBtn = document.getElementById('qqClearHistoryBtn');
        const qqPlaylistBtn = document.getElementById('qqPlaylistBtn');
        
        // 通用元素
        const tokenInput = document.getElementById('tokenInput');
        const wyPageSizeInput = document.getElementById('wyPageSizeInput');
        const biliPageSizeInput = document.getElementById('biliPageSizeInput');
        const qqPageSizeInput = document.getElementById('qqPageSizeInput');
        const modalQQPageSizeInput = document.getElementById('modalQQPageSizeInput');
        const modalOverlay = document.getElementById('modalOverlay');
        const playlistContent = document.getElementById('playlistContent');
        
        // 页面元素
        const homePage = document.getElementById('homePage');
        const wyPage = document.getElementById('wyPage');
        const biliPage = document.getElementById('biliPage');
        const qqPage = document.getElementById('qqPage');
        const profilePage = document.getElementById('profilePage');
        const settingsPage = document.getElementById('settingsPage');
        const navHome = document.getElementById('navHome');
        const navWy = document.getElementById('navWy');
        const navBili = document.getElementById('navBili');
        const navQQ = document.getElementById('navQQ');
        const navProfile = document.getElementById('navProfile');
        const navSettings = document.getElementById('navSettings');
        
        // 跟踪当前页面
        let currentPageId = 'home';

        function escapeHTML(str) {
            if (!str) return '';
            return String(str).replace(/[&<>"]/g, m => {
                if (m === '&') return '&amp;';
                if (m === '<') return '<';
                if (m === '>') return '>';
                if (m === '"') return '&quot;';
                return m;
            });
        }

        function formatTime(seconds) {
            if (!seconds || isNaN(seconds)) return '00:00';
            const hours = Math.floor(seconds / 3600);
            const mins = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            if (hours > 0) {
                return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            } else {
                return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
        }

        function formatNumber(num) {
            if (num >= 100000000) {
                return (num / 100000000).toFixed(1) + '亿';
            } else if (num >= 10000) {
                return (num / 10000).toFixed(1) + 'w';
            } else if (num >= 1000) {
                return (num / 1000).toFixed(1) + 'k';
            } else {
                return num.toString();
            }
        }

        // 多弹窗提示系统
        class ToastManager {
            constructor() {
                this.container = document.getElementById('toastContainer');
                if (!this.container) {
                    console.error('Toast container not found');
                    return;
                }
                this.queue = [];
                this.activeToasts = [];
                this.maxToasts = 3;
                this.isProcessing = false;
            }

            // 显示弹窗
            show(options) {
                const defaultOptions = {
                    title: '',
                    message: '',
                    type: 'info',
                    duration: 5000,
                    actions: [],
                    onClose: null
                };

                const toastOptions = { ...defaultOptions, ...options };
                this.queue.push(toastOptions);
                this.processQueue();
            }

            // 处理队列
            processQueue() {
                if (this.isProcessing || this.queue.length === 0) return;

                this.isProcessing = true;

                if (this.activeToasts.length >= this.maxToasts) {
                    // 关闭最旧的弹窗（数组末尾的元素）
                    this.closeToast(this.activeToasts[this.activeToasts.length - 1]);
                    
                    // 等待消失动画完成后再创建新弹窗
                    setTimeout(() => {
                        // 创建并显示新弹窗
                        const options = this.queue.shift();
                        this.createToast(options);

                        this.isProcessing = false;
                        // 继续处理队列
                        if (this.queue.length > 0) {
                            setTimeout(() => this.processQueue(), 100);
                        }
                    }, 500); // 等待500ms，与动画时间一致
                } else {
                    // 创建并显示新弹窗
                    const options = this.queue.shift();
                    this.createToast(options);

                    this.isProcessing = false;
                    // 继续处理队列
                    if (this.queue.length > 0) {
                        setTimeout(() => this.processQueue(), 100);
                    }
                }
            }

            // 创建弹窗
            createToast(options) {
                const { title, message, type, duration, actions, onClose } = options;

                const toastElement = document.createElement('div');
                toastElement.className = `toast-item ${type}`;

                const icons = {
                    success: 'circle-check',
                    error: 'circle-exclamation',
                    warning: 'triangle-exclamation',
                    info: 'info-circle'
                };

                let actionsHtml = '';
                if (actions && actions.length > 0) {
                    actionsHtml = `
                        <div class="toast-item-actions">
                            ${actions.map(action => `
                                <button class="toast-item-btn" data-action="${action.id}">
                                    ${action.text}
                                </button>
                            `).join('')}
                        </div>
                    `;
                }

                toastElement.innerHTML = `
                    <div class="toast-item-icon">
                        <i class="fas fa-${icons[type]}"></i>
                    </div>
                    <div class="toast-item-content">
                        ${title ? `<div class="toast-item-title">${title}</div>` : ''}
                        <div class="toast-item-message">${message}</div>
                        ${actionsHtml}
                    </div>
                    <button class="toast-item-close">
                        <i class="fas fa-times"></i>
                    </button>
                `;

                // 将新弹窗添加到容器顶部
                if (this.container.firstChild) {
                    this.container.insertBefore(toastElement, this.container.firstChild);
                } else {
                    this.container.appendChild(toastElement);
                }
                
                // 优化：添加will-change属性，提示浏览器提前准备动画
                toastElement.style.willChange = 'transform, opacity';
                // 使用transform: translateZ(0)触发GPU加速
                toastElement.style.transform = 'translateZ(0)';

                // 添加到活跃弹窗列表（添加到开头）
                const toast = {
                    element: toastElement,
                    options,
                    timer: null
                };
                this.activeToasts.unshift(toast);

                // 显示弹窗
                setTimeout(() => {
                    toastElement.classList.add('show');
                }, 10);

                // 设置自动关闭
                if (duration > 0) {
                    toast.timer = setTimeout(() => {
                        this.closeToast(toast);
                    }, duration);

                    // 鼠标悬停时暂停计时
                    toastElement.addEventListener('mouseenter', () => {
                        if (toast.timer) {
                            clearTimeout(toast.timer);
                            toast.timer = null;
                        }
                    });

                    // 鼠标离开时恢复计时
                    toastElement.addEventListener('mouseleave', () => {
                        if (!toast.timer) {
                            toast.timer = setTimeout(() => {
                                this.closeToast(toast);
                            }, duration);
                        }
                    });
                }

                // 关闭按钮事件
                toastElement.querySelector('.toast-item-close').addEventListener('click', () => {
                    this.closeToast(toast);
                });

                // 操作按钮事件
                if (actions && actions.length > 0) {
                    actions.forEach(action => {
                        const btn = toastElement.querySelector(`[data-action="${action.id}"]`);
                        if (btn) {
                            btn.addEventListener('click', () => {
                                if (action.callback) {
                                    action.callback();
                                }
                                this.closeToast(toast);
                            });
                        }
                    });
                }

                return toast;
            }

            // 关闭弹窗
            closeToast(toast) {
                if (!toast || !toast.element) return;

                // 清除计时器
                if (toast.timer) {
                    clearTimeout(toast.timer);
                    toast.timer = null;
                }

                // 随机决定方向（左或右）
                const direction = Math.random() > 0.5 ? 'left' : 'right';
                
                // 添加关闭动画
                toast.element.classList.add('hide');
                toast.element.style.transform = `translateX(${direction === 'left' ? '-100%' : '100%'}) translateY(-30px) scale(0.9)`;

                // 动画结束后移除元素
                setTimeout(() => {
                    if (toast.element && toast.element.parentNode) {
                        toast.element.parentNode.removeChild(toast.element);
                    }

                    // 从活跃列表中移除
                    const index = this.activeToasts.indexOf(toast);
                    if (index > -1) {
                        this.activeToasts.splice(index, 1);
                    }

                    // 调用关闭回调
                    if (toast.options.onClose) {
                        toast.options.onClose();
                    }

                    // 处理队列中的下一个弹窗
                    this.processQueue();
                }, 500);
            }

            // 关闭所有弹窗
            closeAll() {
                while (this.activeToasts.length > 0) {
                    this.closeToast(this.activeToasts[0]);
                }
                this.queue = [];
            }
        }

        // 初始化ToastManager
        let toastManager;
        
        // 封面加载队列
        let coverLoadQueue = [];
        let currentLoads = 0;
        const MAX_CONCURRENT_LOADS = 3;

        // 保留原有showToast函数以保持向后兼容
        function showToast(message, type = 'success') {
            if (!toastManager) {
                toastManager = new ToastManager();
            }
            toastManager.show({
                message,
                type,
                duration: 3800
            });
        }

        // ========== 网络错误统一处理 ==========
        // 检测网络连接状态
        function isOnline() {
            return navigator.onLine !== false;
        }

        // 将原始错误转换为用户友好的提示文案
        function getNetworkErrorMessage(error, context = '') {
            const msg = (error?.message || String(error)).toLowerCase();
            const prefix = context ? context + '：' : '';

            // 网络完全断开
            if (!isOnline()) {
                return `${prefix}无法连接至网络，请检查网络连接后重试`;
            }
            // 超时
            if (error?.name === 'AbortError' || msg.includes('timeout') || msg.includes('超时') || msg.includes('aborted')) {
                return `${prefix}网络连接超时，请稍后再试`;
            }
            // DNS 解析失败
            if (msg.includes('err_name_not_resolved') || msg.includes('dns') || msg.includes('failed to fetch')) {
                return `${prefix}无法连接到服务器，请检查网络连接或稍后再试`;
            }
            // 连接被拒绝 / 网络变更
            if (msg.includes('err_connection') || msg.includes('networkerror') || msg.includes('network request failed')) {
                return `${prefix}网络连接异常，请检查网络后重试`;
            }
            // CORS
            if (msg.includes('cors') || msg.includes('blocked')) {
                return `${prefix}请求被拒绝，请稍后再试`;
            }
            // HTTP 状态码错误
            if (msg.includes('http 4')) {
                return `${prefix}请求参数错误 (${error.message.match(/HTTP \d+/)?.[0] || '4xx'})`;
            }
            if (msg.includes('http 5') || msg.includes('502') || msg.includes('503')) {
                return `${prefix}服务器繁忙，请稍后再试`;
            }
            // Supabase 特定
            if (msg.includes('supabase') || msg.includes('fetching')) {
                return `${prefix}数据同步服务暂时不可用，请稍后再试`;
            }
            // 默认：返回原始信息或通用提示
            if (error?.message && error.message.length < 50 && !error.message.includes('Error') && !error.message.includes('Object')) {
                return `${prefix}${error.message}`;
            }
            return `${prefix}操作失败，请检查网络连接后重试`;
        }

        // 网络错误 Toast 快捷方法
        function showNetworkError(error, context = '') {
            showToast(getNetworkErrorMessage(error, context), 'error');
        }

        // 网络状态监听：离线/上线提示
        window.addEventListener('offline', () => {
            showToast('网络连接已断开，请检查网络设置', 'error');
        });
        window.addEventListener('online', () => {
            showToast('网络已恢复连接', 'success');
        });

        // 新的API接口
        function showNotification(options) {
            if (!toastManager) {
                toastManager = new ToastManager();
            }
            toastManager.show(options);
        }

        function openModal(modalId) {
            modalOverlay.classList.add('show');
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.classList.add('show');
                
                // 打开更换头像模态框时允许个人页面滚动
                if (modalId === 'editAvatarModal') {
                    document.body.style.pointerEvents = 'none';
                    document.body.style.overflow = 'auto';
                } else {
                    // 其他模态框禁用页面滚动
                    document.body.style.pointerEvents = 'none';
                    document.body.style.overflow = 'hidden';
                }
                modal.style.pointerEvents = 'auto';
                modalOverlay.style.pointerEvents = 'auto';
                modal.focus();
                
                // 打开更换头像模态框时加载头像历史
                if (modalId === 'editAvatarModal') {
                    loadAvatarHistory();
                }
            }
        }

        function closeModal(modalId) {
            modalOverlay.classList.remove('show');
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.classList.remove('show');
                // 恢复页面操作和滚动
                document.body.style.pointerEvents = 'auto';
                document.body.style.overflow = 'auto';
            }
        }

        // 自定义确认弹窗
        let confirmCallback = null;
        
        function showConfirm(message, onConfirm) {
            const confirmModal = document.getElementById('confirmModal');
            const confirmMessage = document.getElementById('confirmMessage');
            const confirmBtn = document.getElementById('confirmBtn');
            
            confirmMessage.textContent = message;
            confirmCallback = onConfirm;
            
            // 移除旧的事件监听器并添加新的
            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
            
            newConfirmBtn.addEventListener('click', () => {
                closeModal('confirmModal');
                if (confirmCallback) {
                    confirmCallback();
                    confirmCallback = null;
                }
            });
            
            openModal('confirmModal');
        }

        // 简单的提示弹窗（只有一个确定按钮）
        function showAlert(message, onClose) {
            const confirmModal = document.getElementById('confirmModal');
            const confirmMessage = document.getElementById('confirmMessage');
            const confirmBtn = document.getElementById('confirmBtn');
            const cancelBtn = confirmModal.querySelector('.modal-btn-cancel');
            const modalTitle = confirmModal.querySelector('.modal-title');
            const closeBtn = confirmModal.querySelector('.modal-close');
            
            confirmMessage.textContent = message;
            modalTitle.textContent = '提示';
            
            // 隐藏取消按钮
            if (cancelBtn) {
                cancelBtn.style.display = 'none';
            }
            
            // 禁用点击空白处关闭弹窗的功能
            modalOverlay.style.pointerEvents = 'none';
            confirmModal.style.pointerEvents = 'auto';
            
            // 移除旧的事件监听器并添加新的
            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
            
            // 处理关闭按钮点击事件
            const newCloseBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
            newCloseBtn.addEventListener('click', () => {
                closeModal('confirmModal');
                // 恢复取消按钮显示
                if (cancelBtn) {
                    cancelBtn.style.display = '';
                }
                // 恢复点击空白处关闭弹窗的功能
                modalOverlay.style.pointerEvents = '';
                confirmModal.style.pointerEvents = '';
                modalTitle.textContent = '确认操作';
                if (onClose) {
                    onClose();
                }
            });
            
            newConfirmBtn.textContent = '确定';
            newConfirmBtn.addEventListener('click', () => {
                closeModal('confirmModal');
                // 恢复取消按钮显示
                if (cancelBtn) {
                    cancelBtn.style.display = '';
                }
                // 恢复点击空白处关闭弹窗的功能
                modalOverlay.style.pointerEvents = '';
                confirmModal.style.pointerEvents = '';
                modalTitle.textContent = '确认操作';
                if (onClose) {
                    onClose();
                }
            });
            
            openModal('confirmModal');
        }

        modalOverlay.addEventListener('click', () => {
            const sessionExpiredModal = document.getElementById('sessionExpiredModal');
            if (sessionExpiredModal && sessionExpiredModal.classList.contains('show')) {
                closeSessionExpiredModal();
            } else {
                document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
                modalOverlay.classList.remove('show');
            }
        });

        tokenInput.value = yunzhiToken;
        tokenInput.addEventListener('change', function() {
            yunzhiToken = this.value.trim();
            if (yunzhiToken) {
                setSetting('yunzhiToken', yunzhiToken);
            } else {
                setSetting('yunzhiToken', '');
            }
            showToast('设置已保存', 'success');
            triggerSync();
        });

        // Token来源选择器初始化和事件监听
        const tokenSourceRadios = document.querySelectorAll('input[name="tokenSource"]');
        tokenSourceRadios.forEach(radio => {
            radio.checked = radio.value === tokenSource;
            radio.addEventListener('change', async function() {
                const user = getCurrentUser();
                if (this.value === 'vip' && !user?.is_member) {
                    showToast('请先成为会员才能使用会员Token', 'error');
                    this.checked = false;
                    document.querySelector('input[name="tokenSource"][value="personal"]').checked = true;
                    return;
                }
                
                tokenSource = this.value;
                setSetting('tokenSource', tokenSource);
                
                if (tokenSource === 'vip') {
                    tokenInput.disabled = true;
                    tokenInput.placeholder = '会员Token由系统提供';
                    document.getElementById('tokenSourceHint').textContent = '使用会员专属Token，由系统自动管理';
                    // 尝试获取会员Token
                    await fetchVipToken();
                } else {
                    tokenInput.disabled = false;
                    tokenInput.placeholder = '输入云智API Token';
                    document.getElementById('tokenSourceHint').textContent = '使用您自己的云智API Token';
                }
                showToast('Token来源设置已保存', 'success');
            });
        });

        // 更新会员Token选项状态
        async function updateVipTokenOption() {
            const vipOption = document.getElementById('vipTokenOption');
            const radio = vipOption?.querySelector('input');
            if (!vipOption || !radio) return;
            
            const user = getCurrentUser();
            if (user?.is_member) {
                radio.disabled = false;
                vipOption.style.opacity = '1';
            } else {
                radio.disabled = true;
                vipOption.style.opacity = '0.5';
                if (tokenSource === 'vip') {
                    tokenSource = 'personal';
                    setSetting('tokenSource', 'personal');
                    document.querySelector('input[name="tokenSource"][value="personal"]').checked = true;
                }
            }
        }

        // 获取会员Token（从 vip_tokens 表获取并记录调用）
        async function fetchVipToken() {
            const user = getCurrentUser();
            if (!user || !user.id || tokenSource !== 'vip') return;
            
            try {
                await initSupabase();
                const data = await authRpcCall('assign_vip_token_to_member', {
                    _user_id: user.id,
                    _session_token: sessionToken
                });
                
                if (data && data.success && data.token) {
                    // 会员Token只在内存中使用，不持久化到设置中
                    yunzhiToken = data.token;
                    showToast('已切换到会员Token', 'success');
                } else {
                    throw new Error(data?.error || '无可用会员Token');
                }
            } catch (error) {
                console.error('获取会员Token失败:', error);
                showToast('获取会员Token失败: ' + error.message, 'error');
            }
        }

        wyPageSizeInput.value = wyPageSize;
        wyPageSizeInput.addEventListener('change', function() {
            let value = parseInt(this.value);
            if (isNaN(value) || value < 1) value = 1;
            if (value > 20) value = 20;
            this.value = value;
            wyPageSize = value;
            setSetting('wyPageSize', value);
            showToast('网易云搜索数量设置已保存', 'success');
            triggerSync();
        });

        biliPageSizeInput.value = biliPageSize;
        biliPageSizeInput.addEventListener('change', function() {
            let value = parseInt(this.value);
            if (isNaN(value) || value < 1) value = 1;
            if (value > 50) value = 50;
            this.value = value;
            biliPageSize = value;
            setSetting('biliPageSize', value);
            showToast('Bilibil搜索数量设置已保存', 'success');
            triggerSync();
        });

        qqPageSizeInput.value = qqPageSize;
        qqPageSizeInput.addEventListener('change', function() {
            let value = parseInt(this.value);
            if (isNaN(value) || value < 1) value = 1;
            if (value > 50) value = 50;
            this.value = value;
            qqPageSize = value;
            setSetting('qqPageSize', value);
            showToast('QQ音乐搜索数量设置已保存', 'success');
            triggerSync();
        });

        // 频谱条高度百分比设置
        const visualizerHeightInput = document.getElementById('visualizerHeightInput');
        if (visualizerHeightInput) {
            visualizerHeightInput.value = getSetting('visualizerHeightPercent', 80);
            visualizerHeightInput.addEventListener('change', function() {
                let value = parseInt(this.value);
                if (isNaN(value) || value < 10) value = 10;
                if (value > 100) value = 100;
                this.value = value;
                setSetting('visualizerHeightPercent', value);
                showToast('频谱条高度百分比设置已保存', 'success');
            });
        }

        // 网易云页面按钮事件
wyPlaylistBtn.addEventListener('click', () => {
    renderPlaylist();
    openModal('playlistModal');
});

// Bilibil页面按钮事件
biliPlaylistBtn.addEventListener('click', () => {
    renderPlaylist();
    openModal('playlistModal');
});

// QQ音乐页面按钮事件
qqPlaylistBtn.addEventListener('click', () => {
    renderPlaylist();
    openModal('playlistModal');
});

        // 页面切换函数
        // 修改 switchPage 函数，在页面显示后刷新该页面的滚动效果
        function switchPage(pageId) {
            // 更新当前页面ID
            currentPageId = pageId;
            
            // 隐藏所有页面
            homePage.style.display = 'none';
            wyPage.style.display = 'none';
            biliPage.style.display = 'none';
            qqPage.style.display = 'none';
            profilePage.style.display = 'none';
            settingsPage.style.display = 'none';
            
            let activePage;
            if (pageId === 'home') {
                homePage.style.display = 'block';
                activePage = homePage;
                loadAnnouncement();           // 加载公告列表
                bindAnnouncementRefresh();    // 绑定刷新按钮
            } else if (pageId === 'wy') {
                wyPage.style.display = 'block';
                activePage = wyPage;
            } else if (pageId === 'bili') {
                biliPage.style.display = 'block';
                activePage = biliPage;
            } else if (pageId === 'qq') {
                qqPage.style.display = 'block';
                activePage = qqPage;
            } else if (pageId === 'profile') {
                profilePage.style.display = 'block';
                activePage = profilePage;
                updateProfileStats();
                loadRecentPlays();
                loadMyPlaylists();
                loadPoints();

                // 更新显示统计
                updateUserStatsDisplay();

            } else if (pageId === 'settings') {
                settingsPage.style.display = 'block';
                activePage = settingsPage;
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => updateThemeToggleButtons());
                });
            }
            
            // 更新导航栏状态
            navHome.classList.remove('active');
            navWy.classList.remove('active');
            navBili.classList.remove('active');
            navQQ.classList.remove('active');
            navProfile.classList.remove('active');
            navSettings.classList.remove('active');
            
            let activeItem;
            if (pageId === 'home') {
                navHome.classList.add('active');
                activeItem = navHome;
            } else if (pageId === 'wy') {
                navWy.classList.add('active');
                activeItem = navWy;
            } else if (pageId === 'bili') {
                navBili.classList.add('active');
                activeItem = navBili;
            } else if (pageId === 'qq') {
                navQQ.classList.add('active');
                activeItem = navQQ;
            } else if (pageId === 'profile') {
                navProfile.classList.add('active');
                activeItem = navProfile;
            } else if (pageId === 'settings') {
                navSettings.classList.add('active');
                activeItem = navSettings;
            }
            
            // 更新胶囊滑块位置
            if (activeItem) {
                moveNavbarPill(activeItem);
                // 个人页面不自动滚动导航栏，保持用户当前视野
                if (pageId !== 'profile') {
                    scrollNavItemIntoView(activeItem);
                }
            }
            
            // 页面显示后，刷新该页面内的滚动效果
            if (activePage) {
                // 使用 requestAnimationFrame 确保 DOM 渲染完成
                requestAnimationFrame(() => {
                    refreshMarqueeInContainer(activePage);
                });
            }
        }
        
        // 胶囊滑块移动函数
        function moveNavbarPill(item, animate = true) {
            const navbarPill = document.getElementById('navbarPill');
            if (!navbarPill || !item) return;
            
            if (!animate) {
                navbarPill.style.transition = 'none';
            }
            navbarPill.style.left = item.offsetLeft + 'px';
            navbarPill.style.width = item.offsetWidth + 'px';
            if (!animate) {
                navbarPill.offsetWidth; 
                navbarPill.style.transition = '';
            }
        }
        
        // 初始化胶囊滑块位置
        function initNavbarPill() {
            const activeItem = document.querySelector('.navbar-item.active');
            if (activeItem) {
                moveNavbarPill(activeItem, false);
                // 个人页面按钮不滚动
                if (activeItem.id !== 'navProfile') {
                    scrollNavItemIntoView(activeItem);
                }
            }
            
            // 页面初始化时尝试刷新公告（受10分钟间隔限制）
            loadAnnouncement(false);
        }
        
        // 窗口大小改变时更新胶囊滑块位置
        new ResizeObserver(() => {
            const activeItem = document.querySelector('.navbar-item.active');
            if (activeItem) {
                moveNavbarPill(activeItem, false);
            }
        }).observe(document.getElementById('navbar'));

        // 导航栏点击事件
        navHome.addEventListener('click', () => {
            switchPage('home');
        });

        navWy.addEventListener('click', () => {
            switchPage('wy');
        });

        navBili.addEventListener('click', () => {
            switchPage('bili');
        });

        navQQ.addEventListener('click', () => {
            switchPage('qq');
        });

        navSettings.addEventListener('click', () => {
            switchPage('settings');
        });

        navProfile.addEventListener('click', () => {
            switchPage('profile');
        });

        // 个人页面设置链接
        const goSettingsBtn = document.getElementById('goSettings');
        if (goSettingsBtn) {
            goSettingsBtn.addEventListener('click', () => {
                switchPage('settings');
            });
        }

        // 个人页面右上角设置按钮
        const profileSettingsBtn = document.getElementById('profileSettingsBtn');
        if (profileSettingsBtn) {
            profileSettingsBtn.addEventListener('click', () => {
                switchPage('settings');
            });
        }



        // 网易云搜索相关事件
wySearchInput.addEventListener('input', function() {
    wySearchClear.classList.toggle('show', this.value.length > 0);
});

wySearchClear.addEventListener('click', () => {
    wySearchInput.value = '';
    wySearchClear.classList.remove('show');
    wySearchInput.focus();
});

wySearchBtn.addEventListener('click', () => {
    currentPlatform = 'wy';
    searchPageNum = 1;
    performSearch('wy');
});

wySearchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        currentPlatform = 'wy';
        searchPageNum = 1;
        performSearch('wy');
    }
});

// Bilibil搜索相关事件
biliSearchInput.addEventListener('input', function() {
    biliSearchClear.classList.toggle('show', this.value.length > 0);
});

biliSearchClear.addEventListener('click', () => {
    biliSearchInput.value = '';
    biliSearchClear.classList.remove('show');
    biliSearchInput.focus();
});

biliSearchBtn.addEventListener('click', () => {
    currentPlatform = 'bili';
    searchPageNum = 1;
    performSearch('bili');
});

biliSearchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        currentPlatform = 'bili';
        searchPageNum = 1;
        performSearch('bili');
    }
});

// QQ音乐搜索相关事件
qqSearchInput.addEventListener('input', function() {
    qqSearchClear.classList.toggle('show', this.value.length > 0);
});

qqSearchClear.addEventListener('click', () => {
    qqSearchInput.value = '';
    qqSearchClear.classList.remove('show');
    qqSearchInput.focus();
});

qqSearchBtn.addEventListener('click', () => {
    currentPlatform = 'qq';
    qqSearchPageNum = 1;
    performSearch('qq');
});

qqSearchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        currentPlatform = 'qq';
        qqSearchPageNum = 1;
        performSearch('qq');
    }
});

// 加载搜索历史 - 两个页面共用同一个历史记录
function loadSearchHistory(platform) {
    // 使用统一的历史记录key
    const historyKey = 'searchHistory';
    const searchHistory = getSetting(historyKey, []) || [];
    let historySection, historyList, searchInput;
    
    if (platform === 'wy') {
        historySection = wyHistorySection;
        historyList = wyHistoryList;
        searchInput = wySearchInput;
    } else if (platform === 'bili') {
        historySection = biliHistorySection;
        historyList = biliHistoryList;
        searchInput = biliSearchInput;
    } else if (platform === 'qq') {
        historySection = qqHistorySection;
        historyList = qqHistoryList;
        searchInput = qqSearchInput;
    }
    
    if (searchHistory.length > 0) {
        historySection.classList.add('show');
        historyList.innerHTML = searchHistory.map(item => 
            `<span class="history-item" data-platform="${platform}">${escapeHTML(item)}</span>`
        ).join('');
        
        // 只绑定当前平台的历史记录项
        historyList.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', function() {
                searchInput.value = this.textContent;
                currentPlatform = platform;
                performSearch(platform);
            });
        });
    } else {
        historySection.classList.remove('show');
    }
}

// 添加搜索历史 - 两个页面共用同一个历史记录
function addSearchHistory(keyword, platform) {
    // 使用统一的历史记录key
    const historyKey = 'searchHistory';
    let searchHistory = getSetting(historyKey, []) || [];
    
    const index = searchHistory.indexOf(keyword);
    if (index > -1) searchHistory.splice(index, 1);
    searchHistory.unshift(keyword);
    if (searchHistory.length > 10) searchHistory.pop();
    setSetting(historyKey, searchHistory);
    // 刷新三个平台的历史记录显示
    loadSearchHistory('wy');
    loadSearchHistory('bili');
    loadSearchHistory('qq');
    triggerSync();
}

// 清空搜索历史
wyClearHistoryBtn.addEventListener('click', function() {
    showConfirm('确定要清空搜索历史吗？', function() {
        setSetting('searchHistory', []);
        loadSearchHistory('wy');
        loadSearchHistory('bili');
        showToast('历史记录已清空', 'success');
    });
});

biliClearHistoryBtn.addEventListener('click', function() {
    showConfirm('确定要清空搜索历史吗？', function() {
        setSetting('searchHistory', []);
        loadSearchHistory('wy');
        loadSearchHistory('bili');
        loadSearchHistory('qq');
        showToast('历史记录已清空', 'success');
    });
});

// QQ音乐清空历史记录
qqClearHistoryBtn.addEventListener('click', function() {
    showConfirm('确定要清空搜索历史吗？', function() {
        setSetting('searchHistory', []);
        loadSearchHistory('wy');
        loadSearchHistory('bili');
        loadSearchHistory('qq');
        showToast('历史记录已清空', 'success');
    });
});

// 初始化搜索历史
loadSearchHistory('wy');
loadSearchHistory('bili');
loadSearchHistory('qq');

// 加载更多按钮事件
// 网易云加载更多 - 使用Promise和错误恢复机制
wyLoadMoreBtn.addEventListener('click', () => {
    if (!wyHasNextPage) {
        showToast('没有更多歌曲了', 'info');
        return;
    }
    
    wySearchPageNum++;
    wyLoadMoreBtn.disabled = true;
    wyLoadMoreBtn.innerHTML = '加载中 <i class="fas fa-spinner fa-spin"></i>';
    
    performSearch('wy', wySearchPageNum).then(() => {
        wyLoadMoreBtn.disabled = false;
        wyLoadMoreBtn.innerHTML = '加载更多 <i class="fas fa-chevron-down"></i>';
    }).catch(() => {
        wyLoadMoreBtn.disabled = false;
        wyLoadMoreBtn.innerHTML = '加载更多 <i class="fas fa-chevron-down"></i>';
        // 加载失败时恢复页码
        wySearchPageNum--;
    });
});

// Bilibil加载更多 - 保持原有逻辑不变
biliLoadMoreBtn.addEventListener('click', () => {
    searchPageNum++;
    performSearch('bili', searchPageNum);
});

// QQ音乐加载更多
qqLoadMoreBtn.addEventListener('click', () => {
    if (!qqHasNextPage) {
        showToast('没有更多歌曲了', 'info');
        return;
    }
    
    qqSearchPageNum++;
    qqLoadMoreBtn.disabled = true;
    qqLoadMoreBtn.innerHTML = '加载中 <i class="fas fa-spinner fa-spin"></i>';
    
    performSearch('qq', qqSearchPageNum).then(() => {
        qqLoadMoreBtn.disabled = false;
        qqLoadMoreBtn.innerHTML = '加载更多 <i class="fas fa-chevron-down"></i>';
    }).catch(() => {
        qqLoadMoreBtn.disabled = false;
        qqLoadMoreBtn.innerHTML = '加载更多 <i class="fas fa-chevron-down"></i>';
        // 加载失败时恢复页码
        qqSearchPageNum--;
    });
});
        
        // 登录相关变量
        let isAutoSyncingLocked = false;   // 自动同步锁，防止登录过程中上传旧数据
        let isSessionExpiredHandling = false;   // 防止重复处理会话过期
        let sessionExpiredNotified = false;     // 防止重复弹窗
        let pointsRealtimeChannel = null;   // 积分实时订阅频道
        // 自动同步定时器ID
        let autoSyncInterval = null;
        let lastUploadDataHash = null;
        
        // 全局加载遮罩
        let globalLoadingOverlay = null;
        
        function showGlobalLoading(message = '正在同步数据...') {
            if (!globalLoadingOverlay) {
                globalLoadingOverlay = document.createElement('div');
                globalLoadingOverlay.id = 'globalLoadingOverlay';
                globalLoadingOverlay.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(4px);
                    z-index: 10000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-direction: column;
                    gap: 16px;
                    font-family: 'DM Sans', sans-serif;
                    color: white;
                `;
                globalLoadingOverlay.innerHTML = `
                    <div class="spinner" style="width: 48px; height: 48px; border-width: 4px;"></div>
                    <span id="globalLoadingMessage" style="font-size: 14px;">正在同步数据...</span>
                `;
                document.body.appendChild(globalLoadingOverlay);
            }
            const msgSpan = globalLoadingOverlay.querySelector('#globalLoadingMessage');
            if (msgSpan) msgSpan.textContent = message;
            globalLoadingOverlay.style.display = 'flex';
        }
        
        function hideGlobalLoading() {
            if (globalLoadingOverlay) {
                globalLoadingOverlay.style.display = 'none';
            }
        }

        // 星空主题变量
        let starCtx, starCanvas, starW, starH;
        let starBgStars = [], starTime = 0, starShootingStars = [];
        let starAnimationId = null, starEnabled = false;

        function getCurrentDataHash() {
            const user = getCurrentUser();
            if (!user || !user.id) return null;
            
            const data = {
                playHistory: playHistory,
                searchHistory: searchHistory,
                totalPlayTime: getSetting('totalPlayTime', 0),
                wyPageSize: wyPageSize,
                biliPageSize: biliPageSize,
                yunzhiToken: yunzhiToken,
                theme: currentTheme,
                navbarShowText: getSetting('navbarShowText', true),
                defaultPage: defaultPage
            };
            return JSON.stringify(data);
        }

        // 初始化主题
        function initTheme() {
            let savedTheme = getSetting('theme');
            if (!savedTheme) savedTheme = 'dark0';
            
            // 兼容旧版 'star' 主题（含带索引的 star0/star1 等）
            if (savedTheme === 'star' || savedTheme.startsWith('star')) {
                savedTheme = 'star';
                setSetting('theme', savedTheme);
            }
            // 兼容旧版 'light' / 'dark' 无数字后缀
            if (savedTheme === 'light') {
                savedTheme = 'light0';
                setSetting('theme', savedTheme);
            } else if (savedTheme === 'dark') {
                savedTheme = 'dark0';
                setSetting('theme', savedTheme);
            }
            
            currentTheme = savedTheme;
            
            const parsed = parseThemeString(savedTheme);
            
            if (parsed.mode === 'star') {
                document.documentElement.classList.add('dark-theme');
                applyStarBg(true);
            } else if (parsed.mode === 'dark') {
                document.documentElement.classList.add('dark-theme');
                applyStarBg(false);
                currentColorSchemeId.dark = parsed.schemeId;
                applyColorScheme('dark');
            } else {
                document.documentElement.classList.remove('dark-theme');
                applyStarBg(false);
                currentColorSchemeId.light = parsed.schemeId;
                applyColorScheme('light');
            }
            
            updateThemeToggleButtons();
            toggleColorSchemeGroup(parsed.mode);
            // 同步下拉菜单显示
            if (parsed.mode === 'light' || parsed.mode === 'dark') {
                updateColorSchemeDropdown(parsed.mode);
            }
            
            // 确保 currentColorSchemeId 与 currentTheme 同步
            const parsedForSync = parseThemeString(currentTheme);
            if (parsedForSync.mode === 'light') {
                currentColorSchemeId.light = parsedForSync.schemeId;
            } else if (parsedForSync.mode === 'dark') {
                currentColorSchemeId.dark = parsedForSync.schemeId;
            }
        }
        
        // 更新主题切换按钮状态
        function updateThemeToggleButtons() {
            const themeTogglePill = document.getElementById('themeTogglePill');
            const themeToggleBtns = document.querySelectorAll('.theme-toggle-btn');
            
            if (!themeTogglePill || themeToggleBtns.length === 0) return;

            const parsed = parseThemeString(currentTheme);
            let activeBtn = null;
            
            themeToggleBtns.forEach(btn => {
                btn.classList.remove('active');
                const btnTheme = btn.dataset.theme;
                if (btnTheme === 'star' && parsed.mode === 'star') {
                    btn.classList.add('active');
                    activeBtn = btn;
                } else if (btnTheme === 'light' && parsed.mode === 'light') {
                    btn.classList.add('active');
                    activeBtn = btn;
                } else if (btnTheme === 'dark' && parsed.mode === 'dark') {
                    btn.classList.add('active');
                    activeBtn = btn;
                }
            });

            if (activeBtn) {
                const rect = activeBtn.getBoundingClientRect();
                const parentRect = activeBtn.parentElement.getBoundingClientRect();
                if (rect.width > 0 && parentRect.width > 0) {
                    themeTogglePill.style.left = (rect.left - parentRect.left) + 'px';
                    themeTogglePill.style.width = rect.width + 'px';
                } else {
                    setTimeout(() => updateThemeToggleButtons(), 100);
                }
            }
        }
        
        // 切换主题
        function switchTheme(theme, button) {
            // 防止重复点击同一主题
            let targetMode = theme;
            if (theme === 'star') targetMode = 'star';
            const currentParsed = parseThemeString(currentTheme);
            if (currentParsed.mode === targetMode && targetMode !== 'star') {
                return; // 同一模式不重复切换
            }
            
            // 创建波纹效果
            if (button) {
                const ripple = document.createElement('div');
                const rect = button.getBoundingClientRect();
                const size = Math.max(rect.width, rect.height);
                const x = event.clientX - rect.left - size / 2;
                const y = event.clientY - rect.top - size / 2;
                ripple.style.width = ripple.style.height = size + 'px';
                ripple.style.left = x + 'px';
                ripple.style.top = y + 'px';
                ripple.style.position = 'absolute';
                ripple.style.borderRadius = '50%';
                ripple.style.background = 'rgba(255, 255, 255, 0.5)';
                ripple.style.transform = 'scale(0)';
                ripple.style.animation = 'ripple 0.6s linear';
                ripple.style.pointerEvents = 'none';
                button.style.position = 'relative';
                button.style.overflow = 'hidden';
                button.appendChild(ripple);
                setTimeout(() => ripple.remove(), 600);
            }
            
            // 确定新的主题字符串
            let newThemeStr;
            if (theme === 'star') {
                newThemeStr = 'star';
            } else {
                const schemeId = currentColorSchemeId[theme] || 'default';
                newThemeStr = buildThemeString(theme, schemeId);
            }
            
            document.documentElement.classList.add('theme-transition');
            
            setTimeout(() => {
                // 应用样式
                if (newThemeStr === 'star') {
                    document.documentElement.classList.add('dark-theme');
                    applyStarBg(true);
                    showToast('星空主题已启用', 'success');
                } else if (newThemeStr.startsWith('dark')) {
                    document.documentElement.classList.add('dark-theme');
                    applyStarBg(false);
                    const parsed = parseThemeString(newThemeStr);
                    currentColorSchemeId.dark = parsed.schemeId;
                    applyColorScheme('dark');
                    showToast('深色主题已启用', 'success');
                } else {
                    document.documentElement.classList.remove('dark-theme');
                    applyStarBg(false);
                    const parsed = parseThemeString(newThemeStr);
                    currentColorSchemeId.light = parsed.schemeId;
                    applyColorScheme('light');
                    showToast('浅色主题已启用', 'success');
                }
                
                currentTheme = newThemeStr;
                setSetting('theme', newThemeStr);
                updateThemeToggleButtons();
                toggleColorSchemeGroup(newThemeStr.startsWith('star') ? 'star' : (newThemeStr.startsWith('dark') ? 'dark' : 'light'));
                if (!newThemeStr.startsWith('star')) {
                    updateColorSchemeDropdown(newThemeStr.startsWith('dark') ? 'dark' : 'light');
                }
                
                setTimeout(() => {
                    document.documentElement.classList.remove('theme-transition');
                }, 600);
                
                triggerSync();
            }, 20);
        }
        
        // 防抖函数 - 优化高频事件处理
        function debounce(func, wait, immediate = false) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    timeout = null;
                    if (!immediate) func.apply(this, args);
                };
                const callNow = immediate && !timeout;
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
                if (callNow) func.apply(this, args);
            };
        }
        
        // ---------- 配色方案管理 ----------
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
        };
        
        // ---------- 主题标识解析：light0 → { mode: 'light', schemeId: 'default' } ----------
        function parseThemeString(themeStr) {
            if (!themeStr) return { mode: 'dark', schemeId: 'default' };
            if (themeStr === 'star' || themeStr.startsWith('star')) {
                return { mode: 'star', schemeId: null };
            }
            const match = themeStr.match(/^(light|dark)(\d+)$/);
            if (match) {
                const mode = match[1];
                const schemeIndex = parseInt(match[2]);
                const schemes = colorSchemes[mode];
                const scheme = schemes[schemeIndex] || schemes[0];
                return { mode, schemeId: scheme.id };
            }
            if (themeStr === 'light') return { mode: 'light', schemeId: 'default' };
            if (themeStr === 'dark') return { mode: 'dark', schemeId: 'default' };
            return { mode: 'dark', schemeId: 'default' };
        }
        
        function buildThemeString(mode, schemeId) {
            if (mode === 'star') {
                return 'star';
            }
            const schemes = colorSchemes[mode];
            const scheme = schemes.find(s => s.id === schemeId) || schemes[0];
            const index = schemes.indexOf(scheme);
            return `${mode}${index}`;
        }
        
        let currentColorSchemeId = {
            light: localStorage.getItem('colorScheme_light') || 'default',
            dark: localStorage.getItem('colorScheme_dark') || 'default'
        };
        
        function applyColorScheme(themeType) {
            const htmlEl = document.documentElement;
            
            // 1. 移除所有配色类（包括可能残留的旧类）
            const allSchemeClasses = [
                ...Object.values(colorSchemes.light).map(s => s.class),
                ...Object.values(colorSchemes.dark).map(s => s.class)
            ];
            htmlEl.classList.remove(...allSchemeClasses);

            // 2. 仅在浅色/深色主题下添加对应配色类
            if (themeType === 'light' || themeType === 'dark') {
                const schemeId = currentColorSchemeId[themeType];
                const scheme = colorSchemes[themeType].find(s => s.id === schemeId) || colorSchemes[themeType][0];
                if (scheme) {
                    htmlEl.classList.add(scheme.class);
                }
            }
        }
        
        function updateColorSchemeDropdown(themeType) {
            // 先同步 currentColorSchemeId 为最新值
            const parsed = parseThemeString(currentTheme);
            if (themeType === 'light') {
                currentColorSchemeId.light = parsed.schemeId;
            } else if (themeType === 'dark') {
                currentColorSchemeId.dark = parsed.schemeId;
            }

            const content = document.getElementById('colorSchemeContent');
            const valueSpan = document.getElementById('colorSchemeValue');
            if (!content || !valueSpan) return;
            
            const schemes = colorSchemes[themeType] || [];
            const currentId = currentColorSchemeId[themeType] || 'default';
            
            // 清空并重建选项
            content.innerHTML = '';
            schemes.forEach(scheme => {
                const item = document.createElement('div');
                item.className = 'custom-select-item';
                if (scheme.id === currentId) item.classList.add('selected');
                item.dataset.value = scheme.id;
                item.textContent = scheme.name;
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // 更新选中状态
                    content.querySelectorAll('.custom-select-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                    valueSpan.textContent = scheme.name;
                    
                    const themeTypeForClick = (currentTheme.startsWith('dark') ? 'dark' : 'light');
                    currentColorSchemeId[themeTypeForClick] = scheme.id;
                    const newThemeStr = buildThemeString(themeTypeForClick, scheme.id);
                    currentTheme = newThemeStr;
                    setSetting('theme', newThemeStr);
                    applyColorScheme(themeTypeForClick);
                    showToast(`背景色已切换为 ${scheme.name}`, 'success');
                    content.classList.remove('show');
                    triggerSync();
                });
                content.appendChild(item);
            });
            
            const selectedScheme = schemes.find(s => s.id === currentId) || schemes[0];
            valueSpan.textContent = selectedScheme ? selectedScheme.name : '默认';
        }
        
        function toggleColorSchemeGroup(theme) {
            const group = document.getElementById('colorSchemeGroup');
            if (!group) return;
            if (theme === 'light' || theme === 'dark') {
                group.style.display = 'block';
                // 延迟确保 DOM 更新
                setTimeout(() => {
                    updateColorSchemeDropdown(theme);
                    applyColorScheme(theme);
                }, 10);
            } else {
                group.style.display = 'none';
                const htmlEl = document.documentElement;
                Object.values(colorSchemes.light).forEach(s => htmlEl.classList.remove(s.class));
                Object.values(colorSchemes.dark).forEach(s => htmlEl.classList.remove(s.class));
            }
        }
        
        function initColorScheme() {
            const savedTheme = getSetting('theme') || 'dark0';
            const parsed = parseThemeString(savedTheme);
            let baseTheme;
            if (parsed.mode === 'star') {
                baseTheme = 'star';
            } else {
                baseTheme = parsed.mode;
            }
            toggleColorSchemeGroup(baseTheme);
        }
        
        // 节流函数 - 优化滚动等连续事件
        function throttle(func, limit) {
            let inThrottle;
            return function executedFunction(...args) {
                if (!inThrottle) {
                    func.apply(this, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        }
        
        // 切换Token可见性
        function toggleTokenVisibility(inputId) {
            const input = document.getElementById(inputId);
            const button = input.nextElementSibling;
            const icon = button.querySelector('i');
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            } else {
                input.type = 'password';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            }
        }

        // 初始化默认页面选择
        const modalDefaultPageInput = document.getElementById('modalDefaultPageInput');
        const defaultPageInput = document.getElementById('defaultPageInput');
        
        function updateDefaultPageInputs(value) {
            if (modalDefaultPageInput) modalDefaultPageInput.value = value;
            if (defaultPageInput) defaultPageInput.value = value;
            
            // 更新自定义下拉选择组件
            const customSelect = document.getElementById('defaultPageSelect');
            if (customSelect) {
                const valueDisplay = customSelect.querySelector('.custom-select-value');
                const items = customSelect.querySelectorAll('.custom-select-item');
                
                items.forEach(item => {
                    if (item.dataset.value === value) {
                        valueDisplay.textContent = item.textContent;
                        item.classList.add('selected');
                    } else {
                        item.classList.remove('selected');
                    }
                });
            }
        }
        
        if (modalDefaultPageInput) {
            modalDefaultPageInput.value = defaultPage;
            modalDefaultPageInput.addEventListener('change', function() {
                defaultPage = this.value;
            setSetting('defaultPage', defaultPage);
                updateDefaultPageInputs(defaultPage);
                showToast('默认页面设置已保存', 'success');
                triggerSync();
            });
        }

        if (modalQQPageSizeInput) {
            modalQQPageSizeInput.value = qqPageSize;
            modalQQPageSizeInput.addEventListener('change', function() {
                let value = parseInt(this.value);
                if (isNaN(value) || value < 1) value = 1;
                if (value > 50) value = 50;
                this.value = value;
                qqPageSize = value;
                setSetting('qqPageSize', value);
                showToast('QQ音乐搜索数量设置已保存', 'success');
                triggerSync();
            });
        }
        
        // 初始化自定义下拉选择组件
        function initCustomSelects() {
            const customSelects = document.querySelectorAll('.custom-select');
            
            customSelects.forEach(select => {
                const trigger = select.querySelector('.custom-select-trigger');
                const content = select.querySelector('.custom-select-content');
                const items = select.querySelectorAll('.custom-select-item');
                const valueDisplay = trigger.querySelector('.custom-select-value');
                
                // 点击触发器展开/收起
                trigger.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // 关闭其他已打开的下拉
                    document.querySelectorAll('.custom-select.open').forEach(s => {
                        if (s !== select) {
                            s.classList.remove('open');
                            s.querySelector('.custom-select-content')?.classList.remove('show');
                        }
                    });
                    content.classList.toggle('show');
                    select.classList.toggle('open', content.classList.contains('show'));
                    
                    // 自适应调节下拉选项高度
                    if (content.classList.contains('show')) {
                        adjustDropdownHeight(content);
                    }
                });
                
                // 点击选项选择值
                items.forEach(item => {
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const value = item.dataset.value;
                        const text = item.textContent;
                        
                        // 更新显示值
                        valueDisplay.textContent = text;
                        
                        // 移除所有选中状态
                        items.forEach(i => i.classList.remove('selected'));
                        
                        // 添加当前选中状态
                        item.classList.add('selected');
                        
                        // 收起下拉菜单
                        content.classList.remove('show');
                        select.classList.remove('open');

                        // 触发自定义事件
                        select.dispatchEvent(new CustomEvent('change', { detail: value }));
                    });
                });
            });
            
            // 点击外部关闭下拉菜单
            document.addEventListener('click', () => {
                document.querySelectorAll('.custom-select-content').forEach(content => {
                    content.classList.remove('show');
                });
                document.querySelectorAll('.custom-select.open').forEach(select => {
                    select.classList.remove('open');
                });
            });
        }

        // 初始化默认页面选择
        function initDefaultPageSelect() {
            const customSelect = document.getElementById('defaultPageSelect');
            if (customSelect) {
                customSelect.addEventListener('change', (e) => {
                    const value = e.detail;
                    defaultPage = value;
                    setSetting('defaultPage', defaultPage);
                    updateDefaultPageInputs(defaultPage);
                    showToast('默认页面设置已保存', 'success');
                });
                
                // 设置初始值
                const valueDisplay = customSelect.querySelector('.custom-select-value');
                const items = customSelect.querySelectorAll('.custom-select-item');
                
                items.forEach(item => {
                    if (item.dataset.value === defaultPage) {
                        valueDisplay.textContent = item.textContent;
                        item.classList.add('selected');
                    }
                });
            }
        }

        if (defaultPageInput) {
            defaultPageInput.value = defaultPage;
            defaultPageInput.addEventListener('change', function() {
                defaultPage = this.value;
                setSetting('defaultPage', defaultPage);
                updateDefaultPageInputs(defaultPage);
                showToast('默认页面设置已保存', 'success');
            });
        }

        // 初始化自定义下拉选择组件
        initCustomSelects();
        initDefaultPageSelect();

        // 初始化胶囊滑块
        setTimeout(() => {
            initNavbarPill();
            // 检查是否从用户中心跳转回来需要导航到指定页面
            const navigateTo = localStorage.getItem('navigateTo');
            if (navigateTo) {
                localStorage.removeItem('navigateTo');
                switchPage(navigateTo);
            } else {
                // 初始化页面显示
                switchPage(defaultPage);
            }
            // 初始化滚动效果
            initAllMarquee();
        }, 100);
        
        // 初始化主题（在DOM加载完成后立即执行）
        initTheme();
        
        // 确保下拉菜单显示正确
        setTimeout(() => {
            const parsedForDropdown = parseThemeString(currentTheme);
            if (parsedForDropdown.mode === 'light' || parsedForDropdown.mode === 'dark') {
                updateColorSchemeDropdown(parsedForDropdown.mode);
            }
        }, 50);
        
        // 主题切换按钮事件
        document.addEventListener('click', (e) => {
            const themeBtn = e.target.closest('.theme-toggle-btn');
            if (themeBtn) {
                switchTheme(themeBtn.dataset.theme, themeBtn);
            }
        });

        // 页面完全加载后再次更新主题按钮状态
        window.addEventListener('load', () => {
            updateThemeToggleButtons();
        });

        // 监听窗口大小变化，更新胶囊位置（仅当设置页面可见时）
        window.addEventListener('resize', () => {
            if (settingsPage.style.display === 'block') {
                updateThemeToggleButtons();
            }
        });

        async function makeApiRequest(url, params, useCache = true) {
            // 检查是否是BilibilAPI
            const isBiliApi = url.includes('cenguigui.cn/api/bilibili');
            if (isBiliApi) {
                // 检查速率限制
                await rateLimiter.checkLimit('bili');
            }
            
            // 手动构建查询字符串，确保空格被正确编码
            const queryParts = [];
            for (const [key, value] of Object.entries(params)) {
                // 使用encodeURIComponent确保空格等特殊字符被正确编码
                const encodedValue = encodeURIComponent(value);
                queryParts.push(`${key}=${encodedValue}`);
            }
            if (yunzhiToken) queryParts.push(`token=${encodeURIComponent(yunzhiToken)}`);
            
            const queryString = queryParts.join('&');
            
            // 添加CORS相关的请求头
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Referer': window.location.origin
            };
            
            try {
                const response = await fetch(`${url}?${queryString}`, {
                    method: 'GET',
                    headers: headers,
                    mode: 'cors',
                    credentials: 'omit',
                    referrerPolicy: 'strict-origin-when-cross-origin'
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`请求失败: ${response.status} ${errorText}`);
                }
                
                const data = await response.json();
                return data;
            } catch (error) {
                // 对于Bili API的特殊处理
                if (isBiliApi) {
                    console.error('Bilibili API调用失败:', error);
                    throw new Error(getNetworkErrorMessage(error, 'Bilibili API'));
                }
                throw error;
            }
        }

        async function searchMusic(keyword, page = 1, platform = currentPlatform) {
            // 去掉关键词中的空格
            const sanitizedKeyword = keyword.replace(/\s+/g, '');
            
            if (platform === 'bili') {
                return makeApiRequest('https://api.cenguigui.cn/api/bilibili/bilibili.php', {
                    action: 'search',
                    query: sanitizedKeyword,
                    page: page,
                    limit: biliPageSize
                });
            } else if (platform === 'qq') {
                // 检查是否设置了Token
                if (!yunzhiToken) {
                    throw new Error('未设置Token，请前往设置配置云智API Token，或切换到BilibilAPI使用');
                }
                return makeApiRequest(`${API_BASE}/hqyyid.php`, {
                    name: sanitizedKeyword,
                    type: 'qq',
                    page: page,
                    limit: qqPageSize
                });
            }
            // 检查是否设置了Token
            if (!yunzhiToken) {
                throw new Error('未设置Token，请前往设置配置云智API Token，或切换到BilibilAPI使用');
            }
            return makeApiRequest(`${API_BASE}/hqyyid.php`, {
                name: sanitizedKeyword,
                type: platform,
                page: page,
                limit: wyPageSize
            });
        }

        async function getSongDetail(songId, platform = null, skipCache = false) {
            // 使用传入的平台或当前平台
            const targetPlatform = platform || currentPlatform;
            
            let result;
            if (targetPlatform === 'bili') {
                // 先尝试使用bvid搜索
                result = await makeApiRequest('https://api.cenguigui.cn/api/bilibili/bilibili.php', {
                    action: 'media',
                    bvid: songId
                }, false); // 不使用缓存
                
                // 如果bvid搜索失败，尝试使用aid搜索
                if (!((result.code === 1 || result.code === 200) && result.data)) {
                    result = await makeApiRequest('https://api.cenguigui.cn/api/bilibili/bilibili.php', {
                        action: 'media',
                        aid: songId
                    }, false); // 不使用缓存
                }
                // 增强：确保返回的音频URL是完整的https链接，且添加参数支持预加载
                if (result.data && result.data.url) {
                    let audioUrl = result.data.url;
                    if (audioUrl.startsWith('//')) audioUrl = 'https:' + audioUrl;
                    if (!audioUrl.includes('?') && !audioUrl.includes('.mp3') && !audioUrl.includes('.m4a')) {
                        // 某些Bilibil音频需要添加参数才能直接播放
                        audioUrl = audioUrl + '?platform=web&otype=json';
                    }
                    result.data.url = audioUrl;
                }
            } else if (targetPlatform === 'qq') {
                // 检查是否设置了Token
                if (!yunzhiToken) {
                    throw new Error('未设置Token，请前往设置配置云智API Token，或切换到BilibilAPI使用');
                }
                result = await makeApiRequest(`${API_BASE}/yyjhss.php`, {
                    id: songId,
                    type: 'qq'
                }, !skipCache); // 如果跳过缓存，也不使用API缓存
            } else {
                // 检查是否设置了Token
                if (!yunzhiToken) {
                    throw new Error('未设置Token，请前往设置配置云智API Token，或切换到BilibilAPI使用');
                }
                result = await makeApiRequest(`${API_BASE}/yyjhss.php`, {
                    id: songId,
                    type: targetPlatform
                }, !skipCache); // 如果跳过缓存，也不使用API缓存
            }
            
            return result;
        }

        async function performSearch(platform, page = 1) {
            // 防重复请求
            if (isSearching) return;
            isSearching = true;

            let searchInput, searchBtn, emptyState, songList, loadMoreContainer, resultsCount, loadingOverlay;
            if (platform === 'wy') {
                searchInput = wySearchInput;
                searchBtn = wySearchBtn;
                emptyState = wyEmptyState;
                songList = wySongList;
                loadMoreContainer = wyLoadMoreContainer;
                resultsCount = wyResultsCount;
                loadingOverlay = document.getElementById('wyLoadingOverlay');
            } else if (platform === 'bili') {
                searchInput = biliSearchInput;
                searchBtn = biliSearchBtn;
                emptyState = biliEmptyState;
                songList = biliSongList;
                loadMoreContainer = biliLoadMoreContainer;
                resultsCount = biliResultsCount;
                loadingOverlay = document.getElementById('biliLoadingOverlay');
            } else if (platform === 'qq') {
                searchInput = qqSearchInput;
                searchBtn = qqSearchBtn;
                emptyState = qqEmptyState;
                songList = qqSongList;
                loadMoreContainer = qqLoadMoreContainer;
                loadingOverlay = document.getElementById('qqLoadingOverlay');
            }

            const keyword = searchInput.value.trim();
            if (!keyword) {
                showToast('请输入搜索关键词', 'warning');
                isSearching = false;
                return Promise.reject(new Error('请输入搜索关键词'));
            }

            searchBtn.disabled = true;
            // 显示覆盖层，隐藏空状态
            if (loadingOverlay) loadingOverlay.style.display = 'flex';
            emptyState.style.display = 'none';
            
            // 显示搜索加载提示
            showToast('正在搜索歌曲...', 'info');

            // 首次搜索时清空列表
            if (page === 1) {
                songList.innerHTML = '';
                searchResults[platform] = [];
            }

            try {
                currentPlatform = platform;
                const result = await searchMusic(keyword, page, platform);

                // 检查result是否为null或undefined
                if (!result) {
                    throw new Error('搜索失败：API返回空结果');
                }

                if ((result.code === 1 || result.code === 200 || result.code === 0 || !result.code) && result.data) {
                    // 1. 尝试从 result.data 中提取真正的歌曲数组
                    let rawSongList = [];
                    if (Array.isArray(result.data)) {
                        rawSongList = result.data;
                    } else if (result.data && typeof result.data === 'object') {
                        // 兼容常见的包装格式，如 { list: [], items: [], videos: [] }
                        rawSongList = result.data.list || result.data.items || result.data.videos || result.data.songs || [];
                    }

                    // 网易云API专用逻辑
                    if (platform === 'wy') {
                        const pageSize = wyPageSize;
                        const hasData = rawSongList.length > 0;

                        if (page > 1 && rawSongList.length === 0) {
                            // 加载更多时返回空数据 → 无更多页
                            wyHasNextPage = false;
                            wyLoadMoreAttempts++;
                            if (wyLoadMoreAttempts >= MAX_WY_LOAD_MORE_ATTEMPTS) {
                                loadMoreContainer.style.display = 'none';
                                showToast('已经没有更多歌曲了', 'info');
                            } else {
                                // 回滚页码，允许重试（但不再显示加载更多按钮）
                                wySearchPageNum--;
                                loadMoreContainer.style.display = 'none';
                            }
                            return Promise.resolve();
                        } else if (rawSongList.length > 0) {
                            wyLoadMoreAttempts = 0;
                            // 判断是否还有下一页：返回数量小于期望数量则无更多
                            wyHasNextPage = rawSongList.length >= pageSize;
                        } else if (page === 1 && rawSongList.length === 0) {
                            wyHasNextPage = false;
                        }

                        // 根据 wyHasNextPage 控制“加载更多”按钮显示
                        if (loadMoreContainer) {
                            loadMoreContainer.style.display = wyHasNextPage ? 'block' : 'none';
                        }
                    } else if (platform === 'qq') {
                        const pageSize = qqPageSize;
                        const hasData = rawSongList.length > 0;

                        if (page > 1 && rawSongList.length === 0) {
                            // 加载更多时返回空数据 → 无更多页
                            qqHasNextPage = false;
                            loadMoreContainer.style.display = 'none';
                            showToast('已经没有更多歌曲了', 'info');
                            return Promise.resolve();
                        } else if (rawSongList.length > 0) {
                            // 判断是否还有下一页：返回数量小于期望数量则无更多
                            qqHasNextPage = rawSongList.length >= pageSize;
                        } else if (page === 1 && rawSongList.length === 0) {
                            qqHasNextPage = false;
                        }

                        // 根据 qqHasNextPage 控制“加载更多”按钮显示
                        if (loadMoreContainer) {
                            loadMoreContainer.style.display = qqHasNextPage ? 'block' : 'none';
                        }
                    }

                    // 2. 如果提取到的数组为空，且是第一页，则视为无结果（不抛出异常）
                    if (rawSongList.length === 0 && page === 1) {
                        emptyState.innerHTML = `
                            <div class="empty-icon"><i class="fas fa-search"></i></div>
                            <p class="empty-title">未找到相关歌曲</p>
                            <p class="empty-desc">试试其他关键词</p>
                        `;
                        emptyState.style.display = 'block';
                        if (resultsCount) resultsCount.textContent = '';
                        // 网易云和BilibilAPI都永久显示加载更多按钮
                        loadMoreContainer.style.display = 'block';
                        // 重置尝试次数
                        if (platform === 'wy') {
                            hasNextPage = true;
                            wyLoadMoreAttempts = 0;
                        }
                    } else if (rawSongList.length > 0) {
                        if (page === 1) {
                            addSearchHistory(keyword, platform);
                            // 网易云平台：重置hasNextPage和尝试次数
                            if (platform === 'wy') {
                                hasNextPage = true;
                                wyLoadMoreAttempts = 0;
                            }
                        }

                        // 统一字段名，确保BilibilAPI返回的字段被正确处理
                        const normalizedData = rawSongList.map(item => ({
                            ...item,
                            name: item.name || item.title || item.song_name || '未知歌曲',
                            artist: item.artist || item.owner || item.up || item.author || item.uploader || item.singer || '未知艺术家',
                            // 统一封面字段
                            pic: item.pic || item.cover || item.albumPic || item.album_pic || item.picUrl || item.pic_url || item.thumbnail || item.image || item.img,
                            // 添加平台信息
                            platform: platform
                        }));

                        // 根据平台使用不同的搜索数量限制
                        let pageSize;
                        if (platform === 'bili') {
                            pageSize = biliPageSize;
                        } else if (platform === 'qq') {
                            pageSize = qqPageSize;
                        } else {
                            pageSize = wyPageSize;
                        }

                        // 限制每次加载的歌曲数量
                        const limitedData = normalizedData.slice(0, pageSize);

                        // 去重，避免重复加载相同的歌曲
                        const existingIds = new Set(searchResults[platform].map(song => song.id));
                        const uniqueData = limitedData.filter(item => !existingIds.has(item.id));

                        searchResults[platform] = searchResults[platform].concat(uniqueData);
                        renderSongList(uniqueData, page === 1 ? 0 : searchResults[platform].length - uniqueData.length, platform);

                        emptyState.style.display = 'none';
                        // 网易云和BilibilAPI都永久显示加载更多按钮
                        loadMoreContainer.style.display = 'block';
                        // 重置尝试次数
                        if (platform === 'wy') {
                            wyLoadMoreAttempts = 0;
                            hasNextPage = true;
                        }
                        if (resultsCount) {
                            resultsCount.textContent = `${searchResults[platform].length} 首`;
                        }

                        showToast(`找到 ${uniqueData.length} 首歌曲`, 'success');
                    }
                } else {
                    if (page === 1) {
                        emptyState.innerHTML = `
                            <div class="empty-icon"><i class="fas fa-search"></i></div>
                            <p class="empty-title">未找到相关歌曲</p>
                            <p class="empty-desc">试试其他关键词</p>
                        `;
                        emptyState.style.display = 'block';
                        songList.innerHTML = '';
                        if (resultsCount) {
                            resultsCount.textContent = '';
                        }
                        // 网易云和BilibilAPI都永久显示加载更多按钮
                        loadMoreContainer.style.display = 'block';
                        // 重置尝试次数
                        if (platform === 'wy') {
                            hasNextPage = true;
                            wyLoadMoreAttempts = 0;
                        }
                    } else {
                        // 加载更多时返回空白
                        if (platform === 'wy') {
                            // 网易云API：当页码数等于搜索数量时可能返回空数据，表示已经没有更多数据
                            hasNextPage = false;
                            loadMoreContainer.style.display = 'none';
                            showToast('已经到底了', 'info');
                        } else {
                            // BilibilAPI：可能是速率限制，不隐藏加载更多按钮
                            emptyState.style.display = 'none';
                            loadMoreContainer.style.display = 'block';
                            showToast('可能达到API速率限制，请稍后再试', 'warning');
                        }
                    }
                }

                return Promise.resolve();
            } catch (error) {
                // 根据错误类型显示不同的提示
                const errorMessage = error.message || '';
                if (errorMessage.includes('未设置Token')) {
                    showToast('未设置Token，请前往设置配置或切换到BilibilAPI', 'warning');
                } else {
                    showNetworkError(error, '搜索');
                }
                if (page === 1) {
                    emptyState.innerHTML = `
                        <div class="empty-icon"><i class="fas fa-exclamation-circle"></i></div>
                        <p class="empty-title">搜索失败</p>
                        <p class="empty-desc">${error.message}</p>
                    `;
                    emptyState.style.display = 'block';
                    loadMoreContainer.style.display = 'none';
                    // 网易云平台：重置hasNextPage
                    if (platform === 'wy') {
                        hasNextPage = true;
                    }
                } else {
                    // 加载更多时失败，保持加载更多按钮可见，让用户可以重试
                    emptyState.style.display = 'none';
                    loadMoreContainer.style.display = 'block';
                }

                // 不再返回reject，避免控制台显示Uncaught (in promise)错误
                return Promise.resolve();
            } finally {
                // 隐藏覆盖层
                if (loadingOverlay) loadingOverlay.style.display = 'none';
                searchBtn.disabled = false;
                isSearching = false;
            }
        }

        function loadAndCacheCover(imgElement, coverUrl, placeholder) {
            if (!coverUrl) {
                if (placeholder) {
                    placeholder.style.display = 'flex';
                    placeholder.innerHTML = '<i class="fas fa-music"></i>';
                }
                return;
            }

            // 将加载任务加入队列
            coverLoadQueue.push({
                imgElement,
                coverUrl,
                placeholder
            });

            processCoverQueue();
        }

        function processCoverQueue() {
            if (currentLoads < MAX_CONCURRENT_LOADS && coverLoadQueue.length > 0) {
                const task = coverLoadQueue.shift();
                currentLoads++;

                loadCoverWithRetry(task.imgElement, task.coverUrl, task.placeholder);
            }
        }

        function loadCoverWithRetry(imgElement, coverUrl, placeholder) {
            imgElement.dataset.retryCount = '0';
            imgElement.dataset.originalSrc = coverUrl;
            imgElement.style.display = 'block';
            if (placeholder) placeholder.style.display = 'none';

            // 处理URL，确保在HTTPS环境下使用HTTPS
            let processedUrl = coverUrl;
            if (processedUrl.startsWith('//')) {
                processedUrl = 'https:' + processedUrl;
            } else if (processedUrl.startsWith('http://')) {
                // 尝试将HTTP转换为HTTPS
                processedUrl = processedUrl.replace('http://', 'https://');
            }

            // 检查是否是Bilibil图片域名
            const isBiliPic = processedUrl.includes('hdslb.com') || processedUrl.includes('bilibili.com');
            // 检查是否是QQ音乐图片域名
            const isQQPic = processedUrl.includes('y.gtimg.cn');

            // 使用Image对象预加载
            const img = new Image();
            
            // 对非Bilibil和非QQ音乐图片尝试跨域加载
            if (!isBiliPic && !isQQPic) {
                img.crossOrigin = 'anonymous';
            }
            
            img.onload = function() {
                // 加载成功后设置到实际元素
                imgElement.src = processedUrl;
                currentLoads--;
                processCoverQueue(); // 继续处理队列
            };
            
            img.onerror = function() {
                const retryCount = parseInt(imgElement.dataset.retryCount) || 0;
                if (retryCount < 2 && imgElement.dataset.originalSrc) {
                    imgElement.dataset.retryCount = retryCount + 1;
                    setTimeout(() => {
                        // 重试时使用原始URL，尝试不同的处理方式
                        let retryUrl = coverUrl;
                        if (retryCount === 0 && coverUrl.startsWith('http://')) {
                            // 第一次重试：尝试使用HTTP（如果HTTPS失败）
                            retryUrl = coverUrl;
                        } else if (retryCount === 1) {
                            // 第二次重试：添加时间戳避免缓存
                            retryUrl = coverUrl + (coverUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
                        }
                        loadCoverWithRetry(imgElement, retryUrl, placeholder);
                    }, 1000);
                } else {
                    // 所有重试都失败，显示占位符
                    imgElement.style.display = 'none';
                    if (placeholder) {
                        placeholder.style.display = 'flex';
                        placeholder.innerHTML = '<i class="fas fa-music"></i>';
                    }
                    currentLoads--;
                    processCoverQueue(); // 继续处理队列
                }
            };
            
            // 对于Bilibil和QQ音乐图片，尝试通过添加referrerPolicy来解决403问题
            if (isBiliPic || isQQPic) {
                img.referrerPolicy = 'no-referrer';
            }
            
            img.src = processedUrl;
        }

        function renderSongList(songs, startIndex = 0, platform = currentPlatform) {
            let songList;
            if (platform === 'wy') {
                songList = wySongList;
            } else if (platform === 'bili') {
                songList = biliSongList;
            } else if (platform === 'qq') {
                songList = qqSongList;
            }
            
            songs.forEach((song, index) => {
                const li = document.createElement('li');
                li.className = 'song-item';
                li.dataset.id = song.id;
                li.dataset.index = startIndex + index;
                
                // 处理BilibilAPI返回的字段名差异
                const songName = song.name || song.title || '未知歌曲';
                const songArtist = song.artist || '未知艺术家';
                
                // 创建封面容器
                const coverDiv = document.createElement('div');
                coverDiv.className = 'song-cover';
                
                // 创建占位符
                const placeholder = document.createElement('div');
                placeholder.className = 'cover-placeholder';
                placeholder.innerHTML = '<i class="fas fa-music"></i>';
                
                // 创建图片元素
                const img = document.createElement('img');
                img.alt = '';
                img.style.display = 'none';
                
                // 添加到封面容器
                coverDiv.appendChild(placeholder);
                coverDiv.appendChild(img);
                
                // 暂时不加载封面，等待懒加载
                
                li.innerHTML = `
                    <div class="song-info">
                        <div class="song-title">${escapeHTML(songName)}</div>
                        <div class="song-artist">${escapeHTML(songArtist)}</div>
                    </div>
                    <div class="song-actions">
                        <button class="song-action-btn add-btn" title="添加到列表"><i class="fas fa-plus"></i></button>
                        <button class="song-action-btn primary play-btn" title="播放"><i class="fas fa-play"></i></button>
                    </div>
                `;
                
                // 插入封面容器到歌曲项
                li.insertBefore(coverDiv, li.firstChild);
                
                li.querySelector('.play-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    playSong(song.id, song.platform || platform);
                });
                
                li.querySelector('.add-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    addToPlaylist(song.id, song.platform || platform);
                });
                
                li.addEventListener('click', () => playSong(song.id, song.platform || platform));
                songList.appendChild(li);
                
                // 立即加载封面（解决 B 站封面在 GitHub Pages 上不自动加载的问题）
                loadCoverForLazyLoading(li, song.id, platform);
            });
            
            // 初始化懒加载
            initLazyLoading();
            
            // 刷新滚动效果
            refreshMarquee();
        }

        // 图片懒加载优化 - 使用更高效的观察器配置
        const lazyLoadObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const songItem = entry.target;
                    const songId = songItem.dataset.id;
                    
                    // 使用 requestIdleCallback 在浏览器空闲时加载
                    if ('requestIdleCallback' in window) {
                        requestIdleCallback(() => {
                            loadSongDetailForLazyLoading(songId);
                            loadCoverForLazyLoading(songItem, songId);
                        }, { timeout: 200 });
                    } else {
                        // 降级方案
                        setTimeout(() => {
                            loadSongDetailForLazyLoading(songId);
                            loadCoverForLazyLoading(songItem, songId);
                        }, 0);
                    }
                    
                    // 停止观察
                    lazyLoadObserver.unobserve(songItem);
                }
            });
        }, { 
            threshold: 0.1,
            rootMargin: '50px 0px' // 提前50px开始加载
        });
        
        function initLazyLoading() {
            // 观察所有歌曲项
            document.querySelectorAll('.song-item').forEach(item => {
                lazyLoadObserver.observe(item);
            });
        }

        function loadCoverForLazyLoading(songItem, songId, platform = currentPlatform) {
            // 从搜索结果中获取封面URL
            // 尝试从指定平台的搜索结果中查找
            let songData = searchResults[platform].find(s => String(s.id) === String(songId));
            
            // 如果没找到，尝试从其他平台的搜索结果中查找
            if (!songData) {
                if (platform === 'wy') {
                    songData = searchResults.bili.find(s => String(s.id) === String(songId));
                    if (!songData) {
                        songData = searchResults.qq.find(s => String(s.id) === String(songId));
                    }
                } else if (platform === 'bili') {
                    songData = searchResults.wy.find(s => String(s.id) === String(songId));
                    if (!songData) {
                        songData = searchResults.qq.find(s => String(s.id) === String(songId));
                    }
                } else if (platform === 'qq') {
                    songData = searchResults.wy.find(s => String(s.id) === String(songId));
                    if (!songData) {
                        songData = searchResults.bili.find(s => String(s.id) === String(songId));
                    }
                }
            }
            
            if (songData && songData.pic) {
                const img = songItem.querySelector('img');
                const placeholder = songItem.querySelector('.cover-placeholder');
                if (img && placeholder) {
                    let coverUrl = songData.pic;
                    // 处理协议相对URL
                    if (coverUrl && coverUrl.startsWith('//')) {
                        coverUrl = 'https:' + coverUrl;
                    }
                    // 处理相对路径
                    else if (coverUrl && !coverUrl.startsWith('http')) {
                        // 如果是相对路径，使用一个默认的图片服务或占位符
                        // 这里使用一个通用的音乐封面占位符
                        coverUrl = 'https://via.placeholder.com/100x100?text=Music';
                    }
                    // 确保使用HTTPS
                    else if (coverUrl && coverUrl.startsWith('http://')) {
                        coverUrl = coverUrl.replace('http://', 'https://');
                    }
                    loadAndCacheCover(img, coverUrl, placeholder);
                }
            }
        }

        async function loadSongDetailForLazyLoading(songId) {
            try {
                // 检查缓存中是否有歌曲详情
                const cacheKey = `${currentPlatform}_${songId}`;
                let result;
                
                if (songDetailsCache[cacheKey]) {
                    result = {
                        code: 1,
                        data: songDetailsCache[cacheKey]
                    };
                } else {
                    result = await getSongDetail(songId, currentPlatform);
                }
                
                if ((result.code === 1 || result.code === 200) && result.data) {
                    // 更新歌曲数据
                    // 尝试从当前平台的搜索结果中查找
                    let songData = searchResults[currentPlatform].find(s => String(s.id) === String(songId));
                    
                    // 如果没找到，尝试从另一个平台的搜索结果中查找
                    if (!songData) {
                        const otherPlatform = currentPlatform === 'wy' ? 'bili' : 'wy';
                        songData = searchResults[otherPlatform].find(s => String(s.id) === String(songId));
                    }
                    
                    if (songData) {
                        // 获取音频URL（支持多个可能的字段名）
                        songData.url = result.data.url || result.data.audio || result.data.play_url || result.data.stream_url;
                        songData.album = result.data.album;
                        // 支持多个可能的字段名（包括BilibilAPI可能的字段名）
                        if (result.data.name || result.data.title) songData.name = result.data.name || result.data.title;
                        if (result.data.artist || result.data.owner || result.data.up || result.data.author || result.data.uploader) {
                            songData.artist = result.data.artist || result.data.owner || result.data.up || result.data.author || result.data.uploader;
                        }
                        if (result.data.pic || result.data.cover || result.data.thumbnail || result.data.image || result.data.img) {
                            songData.pic = result.data.pic || result.data.cover || result.data.thumbnail || result.data.image || result.data.img;
                        }
                    }
                    
                    // 更新封面
                    const songItem = document.querySelector(`.song-item[data-id="${songId}"]`);
                    if (songItem) {
                        const img = songItem.querySelector('img');
                        const placeholder = songItem.querySelector('.cover-placeholder');
                        let coverUrl = null;
                        if (result.data) {
                            // 支持多个可能的封面字段名（包括BilibilAPI可能的字段名）
                            coverUrl = result.data.pic || result.data.cover || result.data.thumbnail || result.data.image || result.data.img || result.data.albumPic || result.data.album_pic || result.data.picUrl || result.data.pic_url;
                        }
                        
                        if (coverUrl && coverUrl.startsWith('//')) {
                            coverUrl = 'https:' + coverUrl;
                        }
                        
                        if (coverUrl && img) {
                            loadAndCacheCover(img, coverUrl, placeholder);
                        }
                    }
                }
            } catch (error) {
            }
        }

        function updateSongItem(songId, data) {
            const item = document.querySelector(`.song-item[data-id="${songId}"]`);
            if (!item) return;
            
            // 更新歌曲名称和艺术家
            const songTitle = item.querySelector('.song-title');
            const songArtist = item.querySelector('.song-artist');
            // 支持多个可能的字段名（包括BilibilAPI可能的字段名）
            if (data.name || data.title) {
                songTitle.textContent = escapeHTML(data.name || data.title);
            }
            if (data.artist || data.owner || data.up || data.author || data.uploader) {
                songArtist.textContent = escapeHTML(data.artist || data.owner || data.up || data.author || data.uploader);
            }
            
            // 更新封面
            const img = item.querySelector('img');
            const placeholder = item.querySelector('.cover-placeholder');
            let coverUrl = null;
            if (data) {
                // 支持多个可能的封面字段名（包括BilibilAPI可能的字段名）
                coverUrl = data.pic || data.cover || data.thumbnail || data.image || data.img || data.albumPic || data.album_pic || data.picUrl || data.pic_url;
            }
            
            if (coverUrl && coverUrl.startsWith('//')) {
                coverUrl = 'https:' + coverUrl;
            }
            
            if (coverUrl && img) {
                loadAndCacheCover(img, coverUrl, placeholder);
            }
            
            // 尝试从当前平台的搜索结果中查找
            let songData = searchResults[currentPlatform].find(s => String(s.id) === String(songId));
            
            // 如果没找到，尝试从另一个平台的搜索结果中查找
            if (!songData) {
                const otherPlatform = currentPlatform === 'wy' ? 'bili' : 'wy';
                songData = searchResults[otherPlatform].find(s => String(s.id) === String(songId));
            }
            
            if (songData) {
                songData.url = data.url;
                songData.pic = data.pic;
                songData.album = data.album;
                if (data.name) songData.name = data.name;
                if (data.artist) songData.artist = data.artist;
            }
        }

        async function playSong(songId, platform = null, songInfo = null) {
            try {
                // 更新播放时长（原有逻辑保留）
                if (player.lastUpdateTime !== null) {
                    const now = Date.now();
                    const delta = now - player.lastUpdateTime;
                    if (delta > 0) {
                        const totalPlayTime = getSetting('totalPlayTime', 0) + delta;
                        setSetting('totalPlayTime', totalPlayTime);
                        if (profilePage.style.display === 'block') updateProfileStats();
                    }
                    player.lastUpdateTime = null;
                }

                let song;
                // 如果传入了完整的 songInfo 且包含 url
                if (songInfo && songInfo.url) {
                    song = {
                        id: songId,
                        name: songInfo.name || '未知歌曲',
                        artist: songInfo.artist || '未知艺术家',
                        pic: songInfo.pic || '',
                        url: songInfo.url,
                        platform: platform || songInfo.platform || currentPlatform,
                        lrc: songInfo.lrc || null
                    };
                    if (!playlist.find(s => String(s.id) === String(songId))) {
                        playlist.push(song);
                    }
                    // 先检查是否为新歌并添加积分，再添加到播放历史
                    addPlayPoints(song.id, song.name);
                    addToPlayHistory({ ...song, playedAt: new Date().toISOString() });
                    
                    // 对于Bilibil音乐，显示加载提示
                    if (song.platform === 'bili') {
                        showToast('正在加载Bilibil音频，请稍候...', 'info');
                    }
                    
                    // 尝试播放，若失败则刷新链接
                    try {
                        player.setSong(song);
                        showToast(`正在播放: ${song.name}`, 'success');
                    } catch (e) {
                        console.warn('播放失败，尝试刷新链接', e);
                        await refreshAndPlaySong(songId, platform || song.platform);
                    }
                    return;
                }

                // 没有 songInfo 或没有 url，则从搜索结果或 API 获取
                let searchResult = songInfo;
                if (!searchResult) {
                    if (platform) {
                        searchResult = searchResults[platform]?.find(s => String(s.id) === String(songId));
                    } else {
                        searchResult = searchResults[currentPlatform]?.find(s => String(s.id) === String(songId));
                        if (!searchResult) {
                            const otherPlatform = currentPlatform === 'wy' ? 'bili' : 'wy';
                            searchResult = searchResults[otherPlatform]?.find(s => String(s.id) === String(songId));
                        }
                    }
                }

                const result = await getSongDetail(songId, platform);
                if ((result.code === 1 || result.code === 200) && result.data && result.data.url) {
                    const songName = searchResult?.name || result.data.name || result.data.title || '未知歌曲';
                    const songArtist = searchResult?.artist || result.data.artist || result.data.owner || result.data.up || result.data.author || result.data.uploader || '未知艺术家';
                    const coverUrl = searchResult?.pic || result.data.pic || result.data.cover || result.data.thumbnail || result.data.image || result.data.img;
                    const lrcText = result.data.lrc || null;

                    song = {
                        id: songId,
                        name: songName,
                        artist: songArtist,
                        pic: coverUrl,
                        url: result.data.url,
                        platform: platform || currentPlatform,
                        lrc: lrcText
                    };
                    if (!playlist.find(s => String(s.id) === String(songId))) {
                        playlist.push(song);
                    }
                    // 先检查是否为新歌并添加积分，再添加到播放历史
                    addPlayPoints(song.id, song.name);
                    addToPlayHistory({ ...song, playedAt: new Date().toISOString() });
                    
                    // 对于Bilibil音乐，显示加载提示
                    if (platform === 'bili') {
                        showToast('正在加载Bilibil音频...', 'info');
                    }
                    
                    player.setSong(song);
                    showToast(`正在播放: ${song.name}`, 'success');
                } else {
                    showNetworkError(error, '获取播放链接');
                }
            } catch (error) {
                console.error('播放失败', error);
                showNetworkError(error, '播放');
            }
        }

        async function refreshAndPlaySong(songId, platform) {
            try {
                const result = await getSongDetail(songId, platform, true); // 跳过缓存强制刷新
                if ((result.code === 1 || result.code === 200) && result.data && result.data.url) {
                    // 更新 playlist 中的对应歌曲 url
                    const existingIndex = playlist.findIndex(s => String(s.id) === String(songId));
                    if (existingIndex !== -1) {
                        playlist[existingIndex].url = result.data.url;
                        if (result.data.lrc) playlist[existingIndex].lrc = result.data.lrc;
                    }
                    // 更新历史记录中的 url
                    const historyIndex = playHistory.findIndex(s => String(s.id) === String(songId));
                    if (historyIndex !== -1) {
                        playHistory[historyIndex].url = result.data.url;
                        if (result.data.lrc) playHistory[historyIndex].lrc = result.data.lrc;
                        setSetting('playHistory', playHistory);
                    }
                    // 构造新歌曲对象并播放
                    const song = {
                        id: songId,
                        name: playlist[existingIndex]?.name || result.data.name,
                        artist: playlist[existingIndex]?.artist || result.data.artist,
                        pic: playlist[existingIndex]?.pic || result.data.pic,
                        url: result.data.url,
                        platform: platform,
                        lrc: result.data.lrc
                    };
                    player.setSong(song);
                    showToast(`链接已刷新，继续播放`, 'success');
                } else {
                    // 尝试备用域名或其他格式
                    if (platform === 'bili') {
                        showToast('Bilibil音频链接失效，请尝试重新搜索', 'error');
                    } else {
                        showToast('获取播放链接失败', 'error');
                    }
                }
            } catch (err) {
                console.error(err);
                showToast('刷新链接失败', 'error');
            }
        }

        async function addToPlaylist(songId, platform = null) {
            if (playlist.find(s => String(s.id) === String(songId))) {
                showToast('歌曲已在播放列表中', 'warning');
                return;
            }
            
            // 首先从搜索结果中获取歌曲信息
            let searchResult = null;
            
            // 尝试从指定平台的搜索结果中查找
            if (platform) {
                searchResult = searchResults[platform].find(s => String(s.id) === String(songId));
            } else {
                // 尝试从当前平台的搜索结果中查找
                searchResult = searchResults[currentPlatform].find(s => String(s.id) === String(songId));
                
                // 如果没找到，尝试从另一个平台的搜索结果中查找
                if (!searchResult) {
                    const otherPlatform = currentPlatform === 'wy' ? 'bili' : 'wy';
                    searchResult = searchResults[otherPlatform].find(s => String(s.id) === String(songId));
                }
            }
            
            try {
                const result = await getSongDetail(songId, platform);
                // 获取音频URL（支持多个可能的字段名）
                const audioUrl = result.data?.url || result.data?.audio || result.data?.play_url || result.data?.stream_url;
                
                if ((result.code === 1 || result.code === 200) && result.data && audioUrl) {
                    // 优先使用搜索结果中的数据，如果没有则使用详情API返回的数据
                    const songName = searchResult?.name || result.data.name || result.data.title || result.data.song_name || result.data.bvid || '未知歌曲';
                    const songArtist = searchResult?.artist || result.data.artist || result.data.owner || result.data.up || result.data.author || result.data.uploader || result.data.singer || '未知艺术家';
                    const coverUrl = searchResult?.pic || result.data.pic || result.data.cover || result.data.thumbnail || result.data.image || result.data.img || result.data.albumPic || result.data.album_pic || result.data.picUrl || result.data.pic_url;
                    
                    playlist.push({
                        id: songId,
                        name: songName,
                        artist: songArtist,
                        pic: coverUrl,
                        url: audioUrl,
                        platform: platform || currentPlatform
                    });
                    showToast(`已添加: ${songName}`, 'success');
                    triggerSync();
                } else {
                    showToast('无法获取播放链接', 'error');
                }
            } catch (error) {
                showToast('添加失败', 'error');
            }
        }

        function renderPlaylist() {
            if (playlist.length === 0) {
                playlistContent.innerHTML = `
                    <div class="playlist-empty">
                        <i class="fas fa-music"></i>
                        <p>播放列表为空</p>
                    </div>
                `;
                return;
            }

            playlistContent.innerHTML = playlist.map(song => `
                <div class="playlist-item ${String(song.id) === String(player.currentSongId) ? 'active' : ''}" data-id="${song.id}" data-platform="${song.platform || 'wy'}">
                    <div class="playlist-item-cover">
                        ${song.pic ? `<img src="${song.pic.startsWith('http') ? (song.pic.startsWith('https') ? song.pic : song.pic.replace('http://', 'https://')) : 'https://via.placeholder.com/100x100?text=Music'}" alt="" onerror="this.onerror=null;this.parentElement.innerHTML='&lt;i class=&quot;fas fa-music&quot;&gt;&lt;/i&gt;';">` : '<i class="fas fa-music"></i>'}
                    </div>
                    <div class="playlist-item-info">
                        <div class="playlist-item-title">${escapeHTML(song.name)}</div>
                        <div class="playlist-item-artist">${escapeHTML(song.artist)}</div>
                    </div>
                    <button class="playlist-item-remove" data-id="${song.id}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `).join('');

            document.querySelectorAll('.playlist-item').forEach(item => {
                item.addEventListener('click', function(e) {
                    if (e.target.closest('.playlist-item-remove')) return;
                    const songId = this.dataset.id;
                    const platform = this.dataset.platform;
                    playSong(songId, platform);
                    closeModal('playlistModal');
                });
            });

            document.querySelectorAll('.playlist-item-remove').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const songId = this.dataset.id;
                    playlist = playlist.filter(s => String(s.id) !== String(songId));
                    renderPlaylist();
                    showToast('已从列表移除', 'success');
                    triggerSync();
                });
            });
            
            // 刷新滚动效果
            refreshMarquee();
        }







        // 播放历史相关函数
        function addToPlayHistory(song) {
            // 移除重复的歌曲
            playHistory = playHistory.filter(item => String(item.id) !== String(song.id));
            // 添加到历史记录开头
            playHistory.unshift(song);
            // 限制历史记录数量
            if (playHistory.length > 50) {
                playHistory = playHistory.slice(0, 50);
            }
            // 保存到本地存储
            setSetting('playHistory', playHistory);
            triggerSync();
        }

        // 从服务器获取用户登录统计
        async function loadUserLoginStats() {
            const user = getCurrentUser();
            if (!user || !user.id) {
                // 未登录时显示默认值
                document.getElementById('openCountDisplay').textContent = '0';
                document.getElementById('lastOpenDisplay').textContent = '登录后可见';
                return;
            }
            try {
                await initSupabase();
                const data = await authRpcCall('get_user_login_stats', { _user_id: user.id });
                if (data && data.length > 0) {
                    document.getElementById('openCountDisplay').textContent = data[0].total_logins || '0';
                    const lastLogin = data[0].last_login;
                    if (lastLogin) {
                        const date = new Date(lastLogin);
                        document.getElementById('lastOpenDisplay').textContent = date.toLocaleString();
                    } else {
                        document.getElementById('lastOpenDisplay').textContent = '首次登录';
                    }
                } else {
                    document.getElementById('openCountDisplay').textContent = '0';
                    document.getElementById('lastOpenDisplay').textContent = '暂无记录';
                }
            } catch (err) {
                console.error('获取登录统计失败', err);
                document.getElementById('openCountDisplay').textContent = '加载失败';
                document.getElementById('lastOpenDisplay').textContent = '--';
            }
        }

        // 新增函数：更新个人页面的统计显示
        async function updateUserStatsDisplay() {
            const user = getCurrentUser();
            if (!user || !user.id) {
                const loginCountEl = document.getElementById('loginCountDisplay');
                const lastLoginEl = document.getElementById('lastLoginDisplay');
                const totalPointsEl = document.getElementById('totalPointsValue');
                const vipPointsEl = document.getElementById('vipPointsValue');
                if (loginCountEl) loginCountEl.textContent = '0';
                if (lastLoginEl) lastLoginEl.textContent = '登录后可见';
                if (totalPointsEl) totalPointsEl.textContent = '0';
                if (vipPointsEl) vipPointsEl.textContent = '0';
                return;
            }

            try {
                await initSupabase();
                const data = await authRpcCall('get_user_stats', { _user_id: user.id });
                const stats = data;
                if (stats && stats.success !== false) {
                    const loginCountEl = document.getElementById('loginCountDisplay');
                    const totalPointsEl = document.getElementById('totalPointsValue');
                    const vipPointsEl = document.getElementById('vipPointsValue');
                    const lastLoginEl = document.getElementById('lastLoginDisplay');
                    if (loginCountEl) loginCountEl.textContent = stats.login_count || '0';
                    if (totalPointsEl) totalPointsEl.textContent = stats.points || '0';
                    if (vipPointsEl) vipPointsEl.textContent = stats.vip_points || '0';
                    if (lastLoginEl) {
                        if (stats.last_login_time) {
                            const date = new Date(stats.last_login_time);
                            lastLoginEl.textContent = date.toLocaleString();
                        } else {
                            lastLoginEl.textContent = '首次登录';
                        }
                    }
                } else {
                    const loginCountEl = document.getElementById('loginCountDisplay');
                    const lastLoginEl = document.getElementById('lastLoginDisplay');
                    const totalPointsEl = document.getElementById('totalPointsValue');
                    const vipPointsEl = document.getElementById('vipPointsValue');
                    if (loginCountEl) loginCountEl.textContent = '0';
                    if (lastLoginEl) lastLoginEl.textContent = '首次登录';
                    if (totalPointsEl) totalPointsEl.textContent = '0';
                    if (vipPointsEl) vipPointsEl.textContent = '0';
                }
            } catch (err) {
                console.error('获取用户统计失败', err);
                const loginCountEl = document.getElementById('loginCountDisplay');
                const lastLoginEl = document.getElementById('lastLoginDisplay');
                const totalPointsEl = document.getElementById('totalPointsValue');
                const vipPointsEl = document.getElementById('vipPointsValue');
                if (loginCountEl) loginCountEl.textContent = '0';
                if (lastLoginEl) lastLoginEl.textContent = '--';
                if (totalPointsEl) totalPointsEl.textContent = '0';
                if (vipPointsEl) vipPointsEl.textContent = '0';
            }
        }

        // 更新个人页面统计信息
        function updateProfileStats() {
            // 计算总播放次数
            const totalPlays = playHistory.length;
            // 计算创建歌单数量
            const totalPlaylists = myPlaylists.length;
            // 计算总播放时长
            const totalPlayTimeMs = getSetting('totalPlayTime', 0);
            const totalHours = Math.floor(totalPlayTimeMs / 3600000);
            const totalMinutes = Math.floor((totalPlayTimeMs % 3600000) / 60000);
            const totalSeconds = Math.floor((totalPlayTimeMs % 60000) / 1000);
            let totalPlayTime;
            if (totalHours > 0) {
                totalPlayTime = `${totalHours}小时${totalMinutes}分${totalSeconds}秒`;
            } else if (totalMinutes > 0) {
                totalPlayTime = `${totalMinutes}分${totalSeconds}秒`;
            } else {
                totalPlayTime = `${totalSeconds}秒`;
            }

            // 更新个人页面DOM
            const totalPlaysEl = document.getElementById('totalPlays');
            const totalPlayTimeEl = document.getElementById('totalPlayTime');
            const totalPlaylistsEl = document.getElementById('totalPlaylists');
            if (totalPlaysEl) totalPlaysEl.textContent = totalPlays;
            if (totalPlayTimeEl) totalPlayTimeEl.textContent = totalPlayTime;
            if (totalPlaylistsEl) totalPlaylistsEl.textContent = totalPlaylists;

            // 更新登录和个人页访问统计
            updateUserStatsDisplay();
        }

        // 积分密钥兑换
        async function redeemCode() {
            const codeInput = document.getElementById('redeemCodeInput');
            const code = codeInput ? codeInput.value.trim() : '';

            if (!code) {
                showRedeemMessage('请输入积分密钥', 'error');
                return;
            }

            const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true';
            if (!isLoggedIn) {
                showRedeemMessage('请先登录账号', 'error');
                return;
            }

            try {
                await initSupabase();
                const data = await authRpcCall('redeem_code', { _code: code });

                if (data && data.success) {
                    const pointType = data.point_type === 'vip' ? '会员积分' : '普通积分';
                    showRedeemMessage(`兑换成功！获得 ${data.points} ${pointType}`, 'success');
                    if (codeInput) codeInput.value = '';
                    updateUserStatsDisplay();
                    if (typeof fetchUserData === 'function') fetchUserData();
                } else {
                    const errorMsg = {
                        'INVALID_CODE': '无效的密钥',
                        'CODE_EXHAUSTED': '密钥已用完',
                        'ALREADY_REDEEMED': '您已兑换过此密钥',
                        'SESSION_EXPIRED': '请重新登录'
                    }[data.error] || data.error || '兑换失败';
                    showRedeemMessage(errorMsg, 'error');
                }
            } catch (err) {
                console.error('兑换失败', err);
                showRedeemMessage('兑换失败：' + err.message, 'error');
            }
        }

        function openRedeemModal() {
            const modal = document.getElementById('redeemModal');
            const loginPrompt = document.getElementById('redeemLoginPrompt');
            const formContainer = document.getElementById('redeemFormContainer');
            
            const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true';
            
            if (isLoggedIn) {
                loginPrompt.style.display = 'none';
                formContainer.style.display = 'block';
            } else {
                loginPrompt.style.display = 'block';
                formContainer.style.display = 'none';
            }
            
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }

        function closeRedeemModal() {
            const modal = document.getElementById('redeemModal');
            modal.style.display = 'none';
            document.body.style.overflow = '';
            const msgEl = document.getElementById('redeemMessage');
            if (msgEl) msgEl.style.display = 'none';
            const codeInput = document.getElementById('redeemCodeInput');
            if (codeInput) codeInput.value = '';
        }

        function togglePointsSection() {
            const content = document.getElementById('pointsCollapsibleContent');
            const toggleBtn = document.getElementById('pointsCollapseToggle');
            
            if (content && toggleBtn) {
                const isCollapsed = content.classList.contains('collapsed');
                if (isCollapsed) {
                    content.classList.remove('collapsed');
                    toggleBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
                } else {
                    content.classList.add('collapsed');
                    toggleBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
                }
            }
        }

        function showRedeemMessage(text, type) {
            const messageEl = document.getElementById('redeemMessage');

            const bgColor = type === 'error' ? '#fff1f0' : '#f6ffed';
            const borderColor = type === 'error' ? '#ffccc7' : '#b7eb8f';
            const textColor = type === 'error' ? '#ff4d4f' : '#52c41a';

            if (messageEl) {
                messageEl.textContent = text;
                messageEl.style.display = 'block';
                messageEl.style.backgroundColor = bgColor;
                messageEl.style.border = `1px solid ${borderColor}`;
                messageEl.style.color = textColor;
                setTimeout(() => { messageEl.style.display = 'none'; }, 3000);
            }
        }

        // 加载最近播放
        function loadRecentPlays() {
            const recentList = document.getElementById('recentList');

            if (!recentList) return;

            const emptyHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i class="fas fa-history"></i>
                    </div>
                    <p class="empty-title">暂无播放记录</p>
                    <p class="empty-desc">播放歌曲后会显示在这里</p>
                </div>
            `;

            if (playHistory.length === 0) {
                if (recentList) recentList.innerHTML = emptyHTML;
                return;
            }

            // 显示最近的5首歌曲
            const recentSongs = playHistory.slice(0, 5);
            const itemsHTML = recentSongs.map((song, index) => `
                <div class="recent-item" data-id="${song.id}" data-platform="${song.platform || 'wy'}" data-index="${index}">
                    <div class="recent-cover">
                        ${song.pic ? `<img src="${song.pic.startsWith('http') ? (song.pic.startsWith('https') ? song.pic : song.pic.replace('http://', 'https://')) : 'https://via.placeholder.com/100x100?text=Music'}" alt="" onerror="this.onerror=null;this.parentElement.innerHTML='&lt;i class=&quot;fas fa-music&quot;&gt;&lt;/i&gt;';">` : '<i class="fas fa-music"></i>'}
                    </div>
                    <div class="recent-info">
                        <div class="recent-title">${escapeHTML(song.name)}</div>
                        <div class="recent-artist">${escapeHTML(song.artist)}</div>
                    </div>
                </div>
            `).join('');

            if (recentList) recentList.innerHTML = itemsHTML;

            // 添加点击事件
            if (recentList) {
                document.querySelectorAll('#recentList .recent-item').forEach(item => {
                    item.addEventListener('click', function() {
                        const songId = this.dataset.id;
                        const platform = this.dataset.platform;
                        const index = parseInt(this.dataset.index);
                        const songInfo = recentSongs[index];
                        playSong(songId, platform, songInfo);
                    });
                });
            }

            // 刷新滚动效果
            refreshMarquee();
        }

        // 加载我的歌单
        function loadMyPlaylists() {
            const playlistList = document.getElementById('myPlaylistList');
            
            // 如果歌单列表元素不存在，直接返回
            if (!playlistList) {
                return;
            }
            
            if (myPlaylists.length === 0) {
                playlistList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">
                            <i class="fas fa-music"></i>
                        </div>
                        <p class="empty-title">暂无歌单</p>
                        <p class="empty-desc">创建歌单后会显示在这里</p>
                    </div>
                `;
                return;
            }

            playlistList.innerHTML = myPlaylists.map(playlist => `
                <div class="my-playlist-item" data-id="${playlist.id}">
                    <div class="playlist-cover">
                        ${playlist.cover ? `<img src="${playlist.cover.startsWith('http') ? (playlist.cover.startsWith('https') ? playlist.cover : playlist.cover.replace('http://', 'https://')) : 'https://via.placeholder.com/100x100?text=Playlist'}" alt="" onerror="this.onerror=null;this.parentElement.innerHTML='&lt;i class=&quot;fas fa-playlist&quot;&gt;&lt;/i&gt;';">` : '<i class="fas fa-playlist"></i>'}
                    </div>
                    <div class="playlist-info">
                        <div class="playlist-title">${escapeHTML(playlist.name)}</div>
                        <div class="playlist-desc">${playlist.song.length} 首歌曲</div>
                    </div>
                </div>
            `).join('');

            // 添加点击事件
            document.querySelectorAll('.my-playlist-item').forEach(item => {
                item.addEventListener('click', function() {
                    // 这里可以添加歌单详情页面的逻辑
                    showToast('歌单功能开发中', 'info');
                });
            });
        }

        // 加载头像历史记录
        async function loadAvatarHistory() {
            const avatarHistoryList = document.getElementById('avatarHistoryList');
            
            // 如果头像历史列表元素不存在，直接返回
            if (!avatarHistoryList) {
                return;
            }
            
            const user = getCurrentUser();
            if (!user || !user.id) {
                avatarHistoryList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-image"></i>
                        <p>暂无头像历史记录</p>
                    </div>
                `;
                return;
            }
            
            try {
                await initSupabase();
                const data = await authRpcCall('get_user_avatar_history', {
                    _user_id: user.id
                });
                
                if (data && data.success && data.data) {
                    const avatarHistory = data.data;
                    
                    // 保存到本地存储
                    saveCurrentAvatarHistory(avatarHistory);
                    
                    if (!avatarHistory || avatarHistory.length === 0) {
                        avatarHistoryList.innerHTML = `
                            <div class="empty-state">
                                <i class="fas fa-image"></i>
                                <p>暂无头像历史记录</p>
                            </div>
                        `;
                        return;
                    }
                    
                    avatarHistoryList.innerHTML = avatarHistory.map(item => {
                        const date = new Date(item.created_at);
                        const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                        const isGif = item.avatar_url.toLowerCase().endsWith('.gif');
                        
                        return `
                            <div class="avatar-history-item" style="cursor: pointer; transition: all 0.2s ease;" onclick="selectHistoryAvatar('${item.avatar_url}')">
                                <img src="${item.avatar_url}" alt="Avatar" class="avatar-history-img" loading="lazy" decoding="async" ${isGif ? '' : 'referrerpolicy="no-referrer"'}>
                                <div class="avatar-history-date">${formattedDate}</div>
                            </div>
                        `;
                    }).join('');
                } else {
                    console.warn('后端返回数据格式不正确:', data);
                    // 尝试从本地存储加载
                    const localAvatarHistory = getCurrentAvatarHistory();
                    if (localAvatarHistory && localAvatarHistory.length > 0) {
                        console.log('从本地存储加载头像历史:', localAvatarHistory);
                        avatarHistoryList.innerHTML = localAvatarHistory.map(item => {
                            const date = new Date(item.created_at);
                            const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                            const isGif = item.avatar_url.toLowerCase().endsWith('.gif');
                            
                            return `
                                <div class="avatar-history-item" style="cursor: pointer; transition: all 0.2s ease;" onclick="selectHistoryAvatar('${item.avatar_url}')">
                                    <img src="${item.avatar_url}" alt="Avatar" class="avatar-history-img" loading="lazy" decoding="async" ${isGif ? '' : 'referrerpolicy="no-referrer"'}>
                                    <div class="avatar-history-date">${formattedDate}</div>
                                </div>
                            `;
                        }).join('');
                    } else {
                        console.warn('本地存储也没有头像历史数据');
                        avatarHistoryList.innerHTML = `
                            <div class="empty-state">
                                <i class="fas fa-image"></i>
                                <p>暂无头像历史记录</p>
                            </div>
                        `;
                    }
                }
            } catch (error) {
                console.error('加载头像历史失败:', error);
                // 尝试从本地存储加载
                const localAvatarHistory = getCurrentAvatarHistory();
                if (localAvatarHistory && localAvatarHistory.length > 0) {
                    console.log('从本地存储加载头像历史:', localAvatarHistory);
                    avatarHistoryList.innerHTML = localAvatarHistory.map(item => {
                        const date = new Date(item.created_at);
                        const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                        
                        return `
                            <div class="avatar-history-item" style="cursor: pointer; transition: all 0.2s ease;" onclick="selectHistoryAvatar('${item.avatar_url}')">
                                <img src="${item.avatar_url}" alt="Avatar" class="avatar-history-img" style="transition: all 0.2s ease;">
                                <div class="avatar-history-date">${formattedDate}</div>
                            </div>
                        `;
                    }).join('');
                } else {
                    console.warn('本地存储也没有头像历史数据');
                    avatarHistoryList.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-image"></i>
                            <p>暂无头像历史记录</p>
                        </div>
                    `;
                }
            }
        }
        
        // 选择历史头像
        function selectHistoryAvatar(avatarUrl) {
            const avatarUrlInput = document.getElementById('avatarUrlInput');
            if (avatarUrlInput) {
                avatarUrlInput.value = avatarUrl;
                // 标记选择了历史头像，不消耗积分
                isHistoryAvatarSelected = true;
                // 清空本地文件选择
                selectedAvatarFile = null;
                // 为选中的头像添加视觉反馈
                const avatarHistoryItems = document.querySelectorAll('.avatar-history-item');
                avatarHistoryItems.forEach(item => {
                    item.style.border = '2px solid transparent';
                });
                // 找到并高亮当前选中的头像（使用标准化URL比对）
                const normalizedInputUrl = decodeURIComponent(avatarUrl).trim();
                avatarHistoryItems.forEach(item => {
                    const img = item.querySelector('img');
                    if (img) {
                        const normalizedImgSrc = decodeURIComponent(img.src).trim();
                        if (normalizedImgSrc === normalizedInputUrl) {
                            item.style.border = '2px solid var(--primary)';
                            item.style.borderRadius = '8px';
                        }
                    }
                });
            }
        }

        // 积分相关变量
        let lastPointsSongId = null;
        let lastPointsTime = 0;
        let lastListeningCheckTime = 0;
        let accumulatedListeningSeconds = 0;
        let listeningIntervalId = null;

        // 加载积分信息
        // 仅刷新积分历史记录（不重新获取总积分，因为已经实时更新）
        async function loadPointsHistoryOnly() {
            const user = getCurrentUser();
            if (!user || !user.id) return;
            try {
                await initSupabase();
                const data = await authRpcCall('get_user_points', {
                    _user_id: user.id
                });
                if (data && data.success && data.history) {
                    loadPointsHistory(data.history);
                    
                    // 更新本地存储的积分历史
                    const pointsData = {
                        totalPoints: data.total_points || 0,
                        history: data.history || []
                    };
                    saveCurrentPoints(pointsData);
                } else {
                    // 尝试从本地存储加载
                    const localPoints = getCurrentPoints();
                    loadPointsHistory(localPoints.history || []);
                }
            } catch (err) {
                console.error('刷新积分历史失败', err);
                // 尝试从本地存储加载
                const localPoints = getCurrentPoints();
                loadPointsHistory(localPoints.history || []);
            }
        }

        async function loadPoints() {
            const user = getCurrentUser();
            if (!user || !user.id) {
                document.getElementById('totalPointsValue').textContent = '0';
                return;
            }

            try {
                await initSupabase();
                const data = await authRpcCall('get_user_points', {
                    _user_id: user.id
                });

                if (data && data.success) {
                    document.getElementById('totalPointsValue').textContent = data.total_points || 0;
                    loadPointsHistory(data.history || []);

                    // 更新本地存储的积分数据
                    const pointsData = {
                        totalPoints: data.total_points || 0,
                        history: data.history || []
                    };
                    saveCurrentPoints(pointsData);
                } else {
                    // 尝试从本地存储加载
                    const localPoints = getCurrentPoints();
                    document.getElementById('totalPointsValue').textContent = localPoints.totalPoints || 0;
                    loadPointsHistory(localPoints.history || []);
                }
            } catch (error) {
                console.error('加载积分失败:', error);
                // 尝试从本地存储加载
                const localPoints = getCurrentPoints();
                document.getElementById('totalPointsValue').textContent = localPoints.totalPoints || 0;
                loadPointsHistory(localPoints.history || []);
            }
        }

        // 加载积分记录（按时间从新到旧排序，合并相同类型的记录）
        function loadPointsHistory(history) {
            const pointsHistoryList = document.getElementById('pointsHistoryList');

            if (!pointsHistoryList) return;

            const emptyHTML = `
                <div class="empty-state">
                    <i class="fas fa-coins"></i>
                    <p>暂无积分记录</p>
                </div>
            `;

            if (history.length === 0) {
                if (pointsHistoryList) pointsHistoryList.innerHTML = emptyHTML;
                return;
            }

            // 按时间从新到旧排序
            const sortedHistory = [...history].sort((a, b) => {
                const dateA = new Date(a.created_at);
                const dateB = new Date(b.created_at);
                return dateB - dateA;
            });

            // 只显示最近20条记录
            const displayHistory = sortedHistory.slice(0, 20);

            const historyHTML = displayHistory.map(item => {
                const date = new Date(item.created_at);
                const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                const pointsSign = item.points > 0 ? '+' : '';

                return `
                    <div class="points-history-item">
                        <div>
                            <div class="points-history-reason">${item.reason}</div>
                            <div class="points-history-time">${formattedDate}</div>
                        </div>
                        <div class="points-history-points">${pointsSign}${item.points}</div>
                    </div>
                `;
            }).join('');

            if (pointsHistoryList) pointsHistoryList.innerHTML = historyHTML;
        }

        // 检查会员状态
        async function checkMembershipStatus() {
            const user = getCurrentUser();
            if (!user || !user.id) return;
            
            try {
                await initSupabase();
                if (!supabaseClient) {
                    console.warn('Supabase 未初始化，跳过会员状态检查');
                    return;
                }
                
                const data = await authRpcCall('check_membership_status', {
                    _user_id: user.id
                });
                
                console.log('会员状态检查结果:', data);
                
                if (data && data.is_member === true) {
                    user.is_member = true;
                    user.is_permanent_member = data.is_permanent || false;
                    user.member_end_time = data.end_time || null;
                    user.member_days_remaining = data.days_remaining || (data.is_permanent ? -1 : 0);
                    
                    const statusElement = document.getElementById('currentMembershipStatus');
                    if (statusElement) {
                        if (data.is_permanent) {
                            statusElement.innerHTML = '<i class="fas fa-crown"></i> <strong style="color: #f59e0b;">永久会员</strong> - 享受全部会员特权';
                            statusElement.style.background = '#fef3c7';
                            statusElement.style.color = '#92400e';
                        } else if (data.days_remaining !== undefined) {
                            statusElement.innerHTML = `<i class="fas fa-crown"></i> <strong style="color: #f59e0b;">会员</strong> - 剩余 ${data.days_remaining} 天`;
                            statusElement.style.background = '#fef3c7';
                            statusElement.style.color = '#92400e';
                        } else {
                            statusElement.innerHTML = '<i class="fas fa-crown"></i> <strong style="color: #f59e0b;">会员</strong>';
                            statusElement.style.background = '#fef3c7';
                            statusElement.style.color = '#92400e';
                        }
                    }
                } else {
                    user.is_member = false;
                    user.is_permanent_member = false;
                    user.member_end_time = null;
                    user.member_days_remaining = 0;
                    
                    const statusElement = document.getElementById('currentMembershipStatus');
                    if (statusElement) {
                        statusElement.innerHTML = '<i class="fas fa-info-circle"></i> 当前不是会员，点击下方按钮使用积分兑换会员时长';
                        statusElement.style.background = '#eff6ff';
                        statusElement.style.color = '#1e40af';
                    }
                }
                
                // 保存会员状态到 localStorage
                saveUser(user);
                console.log('会员状态已保存:', user);
                
                // 更新会员Token选项状态
                updateVipTokenOption();
            } catch (error) {
                console.error('检查会员状态失败:', error);
            }
        }

        // 兑换会员
        async function redeemMembership(days, pointType) {
            const user = getCurrentUser();
            if (!user || !user.id) {
                showToast('请先登录', 'error');
                return;
            }
            
            const requiredPoints = pointType === 'vip' ? Math.floor(days * 0.8 * (days === 7 ? 100/7 : days === 30 ? 350/30 : days === 90 ? 900/90 : 3000/365)) : 
                                 (days === 7 ? 100 : days === 30 ? 350 : days === 90 ? 900 : 3000);
            
            try {
                await initSupabase();
                const data = await authRpcCall('user_redeem_membership', {
                    _user_id: user.id,
                    _days: days,
                    _point_type: pointType
                });
                
                if (data && data.success) {
                    showToast(`成功兑换 ${days} 天会员！`, 'success');
                    loadPoints();
                    checkMembershipStatus();
                    updateLoginStatus();
                } else {
                    const errorMsg = data.error === 'INSUFFICIENT_POINTS' ? '积分不足' : 
                                     data.error === 'INSUFFICIENT_VIP_POINTS' ? '会员积分不足' : 
                                     data.error || '兑换失败';
                    showToast(errorMsg, 'error');
                }
            } catch (error) {
                console.error('兑换会员失败:', error);
                showToast('兑换失败，请稍后重试', 'error');
            }
        }

        // 添加积分（播放歌曲，新歌5积分，重复播放不给积分）
        async function addPlayPoints(songId, songName) {
            const user = getCurrentUser();
            if (!user || !user.id) return;
            
            // 避免重复积分（同一首歌短时间不重复积分检查）
            const now = Date.now();
            if (songId === lastPointsSongId && now - lastPointsTime < 60000) {
                return;
            }
            lastPointsSongId = songId;
            lastPointsTime = now;
            
            // 检查播放历史，判断是否为新歌
            const isNewSong = !playHistory.some(item => String(item.id) === String(songId));
            
            if (!isNewSong) {
                return;
            }
            
            try {
                await initSupabase();
                const data = await authRpcCall('add_points', {
                    _user_id: user.id,
                    _points: 5,
                    _reason: `播放新歌：${songName}`,
                    _song_id: songId
                });
                
                if (data && data.success) {
                    const pointsElement = document.getElementById('totalPointsValue');
                    if (pointsElement) pointsElement.textContent = data.total_points;
                    // 刷新积分记录（合并显示）
                    loadPointsHistory(data.history || []);
                }
            } catch (error) {
                console.error('添加积分失败:', error);
            }
        }

        // 添加积分（听歌时长，每分钟）
        async function addListeningPoints() {
            const user = getCurrentUser();
            if (!user || !user.id) return;

            try {
                await initSupabase();
                const data = await authRpcCall('add_points', {
                    _user_id: user.id,
                    _points: 1,
                    _reason: '累计听歌1分钟'
                });

                if (data && data.success) {
                    const pointsElement = document.getElementById('totalPointsValue');
                    if (pointsElement) pointsElement.textContent = data.total_points;
                    // 刷新积分记录
                    loadPointsHistory(data.history || []);
                }
            } catch (error) {
                console.error('添加积分失败:', error);
            }
        }

        // 开始听歌时长计时
        function startListeningTimer() {
            if (listeningIntervalId) return;
            lastListeningCheckTime = Date.now();
            listeningIntervalId = setInterval(() => {
                const now = Date.now();
                const elapsed = now - lastListeningCheckTime;
                // 每分钟增加1积分
                if (elapsed >= 60000) {
                    lastListeningCheckTime = now;
                    addListeningPoints();
                }
            }, 1000);
        }

        // 停止听歌时长计时
        function stopListeningTimer() {
            if (listeningIntervalId) {
                clearInterval(listeningIntervalId);
                listeningIntervalId = null;
            }
        }

        // 音量控制
        const volumeSlider = document.getElementById('volumeSlider');
        const volumeSliderFill = document.getElementById('volumeSliderFill');
        const volumeIcon = document.getElementById('volumeIcon');

        // 设置默认音量
        audioPlayer.volume = 0.8;
        volumeSliderFill.style.width = '80%';

        volumeSlider.addEventListener('click', (e) => {
            const rect = volumeSlider.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            const volume = Math.max(0, Math.min(1, percent));
            audioPlayer.volume = volume;
            volumeSliderFill.style.width = `${volume * 100}%`;
            
            // 更新音量图标
            if (volume === 0) {
                volumeIcon.innerHTML = '<i class="fas fa-volume-mute"></i>';
            } else if (volume < 0.5) {
                volumeIcon.innerHTML = '<i class="fas fa-volume-down"></i>';
            } else {
                volumeIcon.innerHTML = '<i class="fas fa-volume-up"></i>';
            }
        });

        // ==================== 星空主题核心动画 ====================

        function initStarCanvas() {
            starCanvas = document.getElementById('starCanvas');
            if (!starCanvas) return;
            starCtx = starCanvas.getContext('2d');
            resizeStarCanvas();
            window.addEventListener('resize', () => { resizeStarCanvas(); regenerateStarBgStars(); });
            generateStarBgStars();
            // starEnabled is now determined by the theme, not localStorage
        }

        // 禁用全局右键
        function disableRightClick() {
            document.addEventListener('contextmenu', (e) => {
                e.preventDefault();
            });
        }

        // 禁用全局拖动
        function disableDragging() {
            document.addEventListener('dragstart', (e) => {
                e.preventDefault();
            });
            
            document.addEventListener('selectstart', (e) => {
                e.preventDefault();
            });
        }

        // 滚动导航栏项到可视区域
        function scrollNavItemIntoView(item) {
            if (!item) return;
            
            // 个人页面按钮不滚动
            if (item.id === 'navProfile') {
                return;
            }
            
            // 其他按钮居中显示
            item.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'center'
            });
        }

        function resizeStarCanvas() {
            if (!starCanvas) return;
            starCanvas.width = window.innerWidth;
            starCanvas.height = window.innerHeight;
            starW = starCanvas.width;
            starH = starCanvas.height;
        }

        function generateStarBgStars() {
            starBgStars = [];
            for (let i = 0; i < 180; i++) {
                starBgStars.push({
                    x: Math.random() * starW, y: Math.random() * starH,
                    size: Math.random() * 1.5 + 0.5,
                    alpha: Math.random() * 0.5 + 0.2,
                    speed: Math.random() * 0.02 + 0.005,
                    phase: Math.random() * Math.PI * 2
                });
            }
        }
        function regenerateStarBgStars() {
            if (!starW || !starH) return;
            starBgStars.forEach(s => { s.x = Math.random() * starW; s.y = Math.random() * starH; });
        }

        function drawStarBackground() {
            if (!starCtx) return;
            starCtx.clearRect(0, 0, starW, starH);
            starCtx.fillStyle = '#070b1a';
            starCtx.fillRect(0, 0, starW, starH);
            starBgStars.forEach(s => {
                let twinkle = Math.sin(starTime * s.speed + s.phase);
                let alpha = s.alpha * (0.5 + twinkle * 0.5);
                starCtx.beginPath();
                starCtx.arc(s.x, s.y, s.size, 0, Math.PI*2);
                starCtx.fillStyle = `rgba(255,255,255,${alpha})`;
                starCtx.fill();
            });
        }

        function updateStarShootingStars() {
            if (!starCtx) return;
            if (Math.random() < 0.005) {
                starShootingStars.push({ x: Math.random() * starW, y: 0, vx: (Math.random()-0.3)*8, vy: Math.random()*6+4, life: 1, len: Math.random()*60+40 });
            }
            starShootingStars = starShootingStars.filter(s => {
                s.x += s.vx; s.y += s.vy; s.life -= 0.015;
                if (s.life > 0) {
                    let tailX = s.x - s.vx * (s.len/8);
                    let tailY = s.y - s.vy * (s.len/8);
                    let grad = starCtx.createLinearGradient(tailX, tailY, s.x, s.y);
                    grad.addColorStop(0, 'rgba(255,255,255,0)');
                    grad.addColorStop(1, `rgba(255,255,255,${s.life*0.6})`);
                    starCtx.beginPath();
                    starCtx.moveTo(tailX, tailY);
                    starCtx.lineTo(s.x, s.y);
                    starCtx.strokeStyle = grad;
                    starCtx.lineWidth = 1.5;
                    starCtx.stroke();
                    // 流星头部
                    starCtx.beginPath();
                    starCtx.arc(s.x, s.y, 2, 0, Math.PI*2);
                    starCtx.fillStyle = `rgba(255,255,255,${s.life})`;
                    starCtx.fill();
                }
                return s.life > 0;
            });
        }

        function starAnimate() {
            if (!starEnabled || !starCtx) {
                if (starAnimationId) cancelAnimationFrame(starAnimationId);
                starAnimationId = null;
                return;
            }
            starTime++;
            drawStarBackground();
            updateStarShootingStars();
            starAnimationId = requestAnimationFrame(starAnimate);
        }

        function startStarAnimation() {
            if (starAnimationId) cancelAnimationFrame(starAnimationId);
            starTime = 0;
            starAnimationId = requestAnimationFrame(starAnimate);
        }

        function stopStarAnimation() {
            if (starAnimationId) { cancelAnimationFrame(starAnimationId); starAnimationId = null; }
            if (starCtx) { starCtx.clearRect(0,0,starW,starH); }
        }

        function applyStarBg(enable) {
            if (enable) {
                document.documentElement.classList.add('star-bg-active');
                if (!starCtx) initStarCanvas();
                else { resizeStarCanvas(); regenerateStarBgStars(); }
                starEnabled = true;
                startStarAnimation();
            } else {
                document.documentElement.classList.remove('star-bg-active');
                starEnabled = false;
                stopStarAnimation();
                if (starCtx) starCtx.clearRect(0,0,starW,starH);
            }
        }

        // 初始化星空画布
        // 加载并显示公告列表（支持多条、自定义时间、空时间不显示、自定义图标）
        async function loadAnnouncement(forceRefresh = false) {
            const announcementList = document.getElementById('announcementList');
            if (!announcementList) return;

            // 检查是否在刷新限制期内
            const lastRefreshTime = localStorage.getItem('announcementLastRefresh');
            const currentTime = Date.now();
            const refreshInterval = 10 * 60 * 1000; // 10分钟

            if (!forceRefresh && lastRefreshTime) {
                const timeSinceLastRefresh = currentTime - parseInt(lastRefreshTime);
                if (timeSinceLastRefresh < refreshInterval) {
                    // 尝试从localStorage加载
                    const storedAnnouncements = localStorage.getItem('announcements');
                    if (storedAnnouncements) {
                        try {
                            const data = JSON.parse(storedAnnouncements);
                            renderAnnouncements(data);
                            return;
                        } catch (error) {
                            // 解析失败，继续从服务器获取
                        }
                    }
                }
            }

            // 显示加载状态
            announcementList.innerHTML = '<div class="announcement-loading"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';

            try {
                await initSupabase();
                if (!supabaseClient) {
                    // 尝试从localStorage加载
                    const storedAnnouncements = localStorage.getItem('announcements');
                    if (storedAnnouncements) {
                        try {
                            const data = JSON.parse(storedAnnouncements);
                            renderAnnouncements(data);
                            return;
                        } catch (error) {
                            // 解析失败
                        }
                    }
                    announcementList.innerHTML = '<div class="announcement-empty"><i class="fas fa-exclamation-circle"></i> 公告加载失败</div>';
                    return;
                }

                // 获取所有有效公告，按排序序号升序，再按自定义时间倒序，最后按创建时间倒序
                const { data, error } = await supabaseClient
                    .from('announcements')
                    .select('id, title, content, display_time, created_at, icon, sort_order')
                    .eq('is_active', true)
                    .order('sort_order', { ascending: true, nullsFirst: false })
                    .order('display_time', { ascending: false, nullsLast: true })
                    .order('created_at', { ascending: false })
                    .limit(10);

                if (error) throw error;

                // 保存到localStorage
                if (data) {
                    localStorage.setItem('announcements', JSON.stringify(data));
                    localStorage.setItem('announcementLastRefresh', currentTime.toString());
                }

                renderAnnouncements(data);
            } catch (error) {
                console.error('加载公告失败:', error);
                // 尝试从localStorage加载
                const storedAnnouncements = localStorage.getItem('announcements');
                if (storedAnnouncements) {
                    try {
                        const data = JSON.parse(storedAnnouncements);
                        renderAnnouncements(data);
                        return;
                    } catch (parseError) {
                        // 解析失败
                    }
                }
                announcementList.innerHTML = '<div class="announcement-empty"><i class="fas fa-exclamation-circle"></i> 公告加载失败</div>';
            }
        }

        function renderAnnouncements(data) {
            const announcementList = document.getElementById('announcementList');
            if (!announcementList) return;

            if (data && data.length > 0) {
                let html = '';
                for (const item of data) {
                    // 处理自定义显示时间（若为空则不显示）
                    let displayTimeStr = '';
                    if (item.display_time) {
                        // 处理不同格式的时间字符串，包括CSV文件中的格式
                        let date;
                        if (typeof item.display_time === 'string') {
                            // 处理CSV格式：2026-04-05 20:51:00+00
                            if (item.display_time.includes(' ')) {
                                // 将空格替换为'T'以符合ISO格式
                                const isoTime = item.display_time.replace(' ', 'T');
                                date = new Date(isoTime);
                            } else {
                                date = new Date(item.display_time);
                            }
                        } else {
                            date = new Date(item.display_time);
                        }
                        
                        if (!isNaN(date.getTime())) {
                            displayTimeStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
                        }
                    }
                    
                    // 获取图标类名，默认为 fa-bullhorn
                    const iconClass = item.icon && item.icon.trim() !== '' ? item.icon : 'fa-bullhorn';

                    // 处理公告内容中的图标占位符和链接
                    function renderContentWithIcons(content) {
                        if (!content) return '';
                        // 转义 HTML 特殊字符，避免 XSS
                        let escaped = escapeHTML(content);
                        // 保留行首的空格，将其转换为 &nbsp;
                        escaped = escaped.replace(/^\s+/gm, (match) => {
                            return match.replace(/ /g, '&nbsp;');
                        });
                        // 将 {icon:xxx} 替换为 Font Awesome 图标
                        escaped = escaped.replace(/\{icon:([a-zA-Z0-9\-]+)\}/g, (match, iconName) => {
                            return `<i class="fas fa-${iconName}" style="margin:0 2px;"></i>`;
                        });
                        // 识别并处理链接
                        escaped = escaped.replace(/(https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=.]+)/g, (match, url) => {
                            return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; text-decoration: underline;">${url}</a>`;
                        });
                        // 将换行转为 <br>
                        return escaped.replace(/\n/g, '<br>');
                    }
                    
                    const timeHtml = displayTimeStr ? `<span class="announcement-date"><i class="far fa-clock"></i> ${displayTimeStr}</span>` : '';
                    
                    html += `
                        <div class="announcement-item" data-id="${item.id}">
                            <div class="announcement-title">
                                <i class="fas ${iconClass}"></i>
                                <span>${renderContentWithIcons(item.title)}</span>
                                ${timeHtml}
                            </div>
                            ${item.content && item.content.trim() !== '' ? `<div class="announcement-content">${renderContentWithIcons(item.content)}</div>` : ''}
                        </div>
                    `;
                }
                announcementList.innerHTML = html;
            } else {
                announcementList.innerHTML = '<div class="announcement-empty"><i class="fas fa-info-circle"></i> 暂无公告</div>';
            }
        }

        // 绑定公告刷新按钮
        function bindAnnouncementRefresh() {
            const refreshBtn = document.getElementById('refreshAnnouncementBtn');
            if (refreshBtn && !refreshBtn.dataset.bound) {
                refreshBtn.dataset.bound = 'true';
                refreshBtn.addEventListener('click', () => {
                    // 检查刷新限制
                    const lastRefreshTime = localStorage.getItem('announcementLastRefresh');
                    const currentTime = Date.now();
                    const refreshInterval = 10 * 60 * 1000; // 10分钟

                    if (lastRefreshTime) {
                        const timeSinceLastRefresh = currentTime - parseInt(lastRefreshTime);
                        if (timeSinceLastRefresh < refreshInterval) {
                            const remainingTime = Math.ceil((refreshInterval - timeSinceLastRefresh) / 1000);
                            showToast(`请${remainingTime}秒后再刷新公告`, 'warning');
                            return;
                        }
                    }
                    
                    loadAnnouncement(true);
                    showToast('公告已刷新', 'success');
                });
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            // 账号登录校验：如果未登录且没有会话令牌，清空所有用户数据
            // 注意：保留已有的 sessionToken，由 autoLogin() 负责验证有效性
            const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true';
            const hasSessionToken = localStorage.getItem('sessionToken');
            
            if (!isLoggedIn && !hasSessionToken) {
                // 只有当既未登录也没有会话令牌时才清空数据
                localStorage.removeItem('vipUser');
                localStorage.removeItem('username');
                localStorage.removeItem('userAvatar');
                localStorage.removeItem('user_setting');
                localStorage.removeItem('user_plays');
                localStorage.removeItem('user_points');
                localStorage.removeItem('user_avatar_history');
                localStorage.removeItem('user_settings'); // 旧的用户设置
            }
            
            initStarCanvas();
            // 初始化配色方案
            initColorScheme();
            // 初始化加载公告
            loadAnnouncement();
            bindAnnouncementRefresh();
            // 初始化鼠标操控
    
            // 禁用全局右键
            disableRightClick();
            // 禁用全局拖动
            disableDragging();
        });
        
        // 监听存储变化，同步配色方案
        window.addEventListener('storage', (e) => {
            if (e.key === 'theme' || e.key === 'guest_theme') {
                const newTheme = localStorage.getItem(e.key) || 'dark0';
                currentTheme = newTheme;
                const parsed = parseThemeString(newTheme);
                if (parsed.mode === 'star') {
                    toggleColorSchemeGroup('star');
                } else {
                    toggleColorSchemeGroup(parsed.mode);
                    updateColorSchemeDropdown(parsed.mode);
                }
                updateThemeToggleButtons();
            }
        });

        // 将需要的函数暴露到 window 对象，供 React 组件调用
        window.openLoginPage = openLoginPage;
        window.closeLoginPage = closeLoginPage;
        window.handleLogin = handleLogin;
        window.handleRegister = handleRegister;
        window.showToast = showToast;
        window.closeModal = closeModal;
        window.confirmLogout = confirmLogout;
        window.toggleCollapsible = toggleCollapsible;
        window.togglePointsSection = togglePointsSection;
        window.toggleTokenVisibility = toggleTokenVisibility;
        window.updateSiteVisitCount = updateSiteVisitCount;
        window.handleAvatarFileSelect = handleAvatarFileSelect;
        window.confirmAvatarUpdate = confirmAvatarUpdate;
        window.selectHistoryAvatar = selectHistoryAvatar;
        window.redeemCode = redeemCode;
        window.redeemMembership = redeemMembership;
        window.closeSessionExpiredModal = closeSessionExpiredModal;
    