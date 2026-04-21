import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'
import { AppMode, ChatMessage, OrchestratorOutput, LearningResponse, LeadsResponse, NormalChatResponse, MarketIntelResponse } from '../types'

interface LeadsFormState {
  domain: string
  sector: string
  country: string
  city: string
  count: number
}

interface AppState {
  // Session
  sessionId: string

  // Mode
  mode: AppMode
  setMode: (mode: AppMode) => void

  // Messages — all modes share one array; filter by mode for per-mode views
  messages: ChatMessage[]
  addUserMessage: (content: string) => string
  addLoadingMessage: () => string
  resolveMessage: (id: string, output: OrchestratorOutput) => void
  setMessageError: (id: string, error: string) => void
  clearMessages: () => void

  // Per-mode message selector
  getMessagesForMode: (mode: AppMode) => ChatMessage[]

  // Leads form state (persisted across mode switches)
  leadsForm: LeadsFormState
  setLeadsForm: (updates: Partial<LeadsFormState>) => void

  // Global loading
  isLoading: boolean
  setLoading: (v: boolean) => void
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      sessionId: uuid(),

      mode: 'auto',
      setMode: (mode) => set({ mode }),

      messages: [],

      addUserMessage: (content) => {
        const id = uuid()
        const msg: ChatMessage = {
          id,
          role: 'user',
          content,
          mode: get().mode,
          timestamp: new Date().toISOString()
        }
        set((s) => ({ messages: [...s.messages, msg] }))
        return id
      },

      addLoadingMessage: () => {
        const id = uuid()
        const msg: ChatMessage = {
          id,
          role: 'assistant',
          content: '',
          mode: get().mode,
          timestamp: new Date().toISOString(),
          isLoading: true
        }
        set((s) => ({ messages: [...s.messages, msg] }))
        return id
      },

      resolveMessage: (id, output) => {
        set((s) => ({
          messages: s.messages.map((m) => {
            if (m.id !== id) return m
            const isLearning = output.mode === 'learning'
            const isLeads = output.mode === 'leads'
            const isChat = output.mode === 'chat'
            const isMarketIntel = output.mode === 'market-intel'
            const needsInfo = output.needsMoreInfo

            let content = ''
            if (needsInfo) content = needsInfo.message
            else if (isChat) content = (output.response as NormalChatResponse).reply
            else if (isLearning) content = (output.response as LearningResponse).simpleExplanation
            else if (isMarketIntel) content = (output.response as MarketIntelResponse).recommendation
            else content = `Generated ${(output.response as LeadsResponse).leads?.length ?? 0} leads`

            const resolved: ChatMessage = {
              ...m,
              isLoading: false,
              mode: (isMarketIntel ? 'leads' : output.mode) as AppMode,
              content,
              learningData: isLearning ? (output.response as LearningResponse) : undefined,
              leadsData: isLeads && !needsInfo ? (output.response as LeadsResponse) : undefined,
              marketIntelData: isMarketIntel ? (output.response as MarketIntelResponse) : undefined,
              needsMoreInfo: needsInfo
            }
            return resolved
          })
        }))
      },

      setMessageError: (id, error) => {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, isLoading: false, error, content: `Error: ${error}` } : m
          )
        }))
      },

      clearMessages: () => set({ messages: [], sessionId: uuid() }),

      getMessagesForMode: (mode) => {
        const all = get().messages
        if (mode === 'auto') return all
        // 'leads' mode shows both leads and market-intel messages
        if (mode === 'leads') return all.filter((m) => m.mode === 'leads' || m.marketIntelData)
        return all.filter((m) => m.mode === mode)
      },

      leadsForm: { domain: '', sector: '', country: '', city: '', count: 10 },
      setLeadsForm: (updates) =>
        set((s) => ({ leadsForm: { ...s.leadsForm, ...updates } })),

      isLoading: false,
      setLoading: (v) => set({ isLoading: v })
    }),
    {
      name: 'ai-agent-store',
      // Only persist the data fields, not functions
      partialize: (state) => ({
        sessionId: state.sessionId,
        messages: state.messages.filter((m) => !m.isLoading), // don't persist loading states
        leadsForm: state.leadsForm,
        mode: state.mode,
      }),
    }
  )
)
