// oxlint-disable react/only-export-components -- provider and its hook share one context
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext } from 'react'
import { api, SessionExpiredError } from '../api/http'
import type { User } from '../api/types'

type AuthContextValue = {
  user: User | null
  loading: boolean
  signIn: (credential: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      try {
        return (await api<{ user: User }>('/api/auth/me')).user
      } catch (error) {
        if (error instanceof SessionExpiredError) return null
        throw error
      }
    },
    retry: false,
  })

  const signIn = async (credential: string) => {
    const result = await api<{ user: User }>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    })
    queryClient.setQueryData(['current-user'], result.user)
  }

  const signOut = async () => {
    await api<void>('/api/auth/logout', { method: 'POST' })
    queryClient.setQueryData(['current-user'], null)
    queryClient.removeQueries({ queryKey: ['overtime'] })
  }

  return (
    <AuthContext.Provider
      value={{
        user: query.data ?? null,
        loading: query.isPending,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider 안에서 사용해주세요')
  return value
}
