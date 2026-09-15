'use client'

import { createContext, useContext } from 'react'

export interface AppContextType {
  user: any | null
  session: any | null
  refreshUser: () => Promise<void>
}

export const AppContext = createContext<AppContextType>({
  user: null,
  session: null,
  refreshUser: async () => {},
})

export const useApp = () => useContext(AppContext)
