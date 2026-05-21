import React, { createContext, useContext, useState, useEffect } from 'react'

const SupabaseContext = createContext()

// Supabase配置
const SUPABASE_URL = "https://yeogthpysbqgehjkayaf.supabase.co"
const SUPABASE_ANON_KEY = "sb_publishable_WoO50Mbz0Rhfy0nPugE3vA_5UP__SYX"

export function SupabaseProvider({ children }) {
  const [supabaseClient, setSupabaseClient] = useState(null)
  const [isInitialized, setIsInitialized] = useState(false)

  // 初始化Supabase客户端（使用CDN全局变量）
  const initSupabase = async () => {
    if (supabaseClient) return supabaseClient

    try {
      // 使用CDN加载的全局supabase对象
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

      setSupabaseClient(client)
      setIsInitialized(true)
      return client
    } catch (error) {
      console.error('Failed to initialize Supabase:', error)
      return null
    }
  }

  // 调用RPC函数
  const callRPC = async (functionName, params = {}) => {
    const client = await initSupabase()
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

  // 初始化时加载Supabase
  useEffect(() => {
    initSupabase()
  }, [])

  const value = {
    supabaseClient,
    isInitialized,
    initSupabase,
    callRPC
  }

  return (
    <SupabaseContext.Provider value={value}>
      {children}
    </SupabaseContext.Provider>
  )
}

export function useSupabase() {
  const context = useContext(SupabaseContext)
  if (!context) {
    throw new Error('useSupabase must be used within a SupabaseProvider')
  }
  return context
}

export default SupabaseContext