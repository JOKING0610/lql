// Supabase配置
export const SUPABASE_URL = "https://yeogthpysbqgehjkayaf.supabase.co"
export const SUPABASE_ANON_KEY = "sb_publishable_WoO50Mbz0Rhfy0nPugE3vA_5UP__SYX"

// 存储键名
export const STORAGE_KEY = "vipUser"

// 初始化Supabase客户端（使用CDN全局变量）
export async function initSupabaseClient() {
  try {
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('Supabase CDN not loaded')
    }
    const { createClient } = window.supabase

    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {}
        },
        autoRefreshToken: false,
        persistSession: false
      },
      global: {
        headers: {
          'X-Client-Info': 'zero-seven-zero-music',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    })

    return client
  } catch (error) {
    console.error('Failed to initialize Supabase:', error)
    return null
  }
}

// 调用RPC函数
export async function callSupabaseRPC(client, functionName, params = {}) {
  if (!client) {
    throw new Error('Supabase client not initialized')
  }

  try {
    const { data, error } = await client.rpc(functionName, params, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    })

    if (error) {
      throw error
    }

    return data
  } catch (error) {
    console.error(`RPC call failed for ${functionName}:`, error)
    throw error
  }
}