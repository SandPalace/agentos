'use client'
import { AgentOSContext, useAgentOSState } from '@/lib/useAgentOS'

export default function AgentOSProvider({ children }: { children: React.ReactNode }) {
  const state = useAgentOSState()
  return <AgentOSContext.Provider value={state}>{children}</AgentOSContext.Provider>
}
