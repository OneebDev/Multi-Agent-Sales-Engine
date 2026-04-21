import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'
import { AppMode, ChatMessage, OrchestratorOutput, LearningResponse, LeadsResponse, NormalChatResponse, MarketIntelResponse, JobHunterResponse } from '../types'

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

  // Messages
  messages: ChatMessage[]
  addUserMessage: (content: string, parentMessageId?: string, versionIndex?: number) => string
  addLoadingMessage: (abortController: AbortController, parentMessageId?: string, versionIndex?: number) => string
  resolveMessage: (id: string, output: OrchestratorOutput) => void
  setMessageError: (id: string, error: string) => void
  clearMessages: () => void

  // Per-mode selector
  getMessagesForMode: (mode: AppMode) => ChatMessage[]
  deleteModeSession: (mode: AppMode) => void
  setActiveVersion: (parentId: string, index: number) => void

  // Request Control & Queuing
  abortControllers: Record<string, AbortController> // Keyed by assistant message id
  cancelRequest: (id: string) => void
  queueRequest: (request: () => Promise<void>) => void
  activeRequestCount: number

  // Leads form state
  leadsForm: LeadsFormState
  setLeadsForm: (updates: Partial<LeadsFormState>) => void

  // Draft Preservation
  drafts: Record<string, string>
  setDraft: (mode: AppMode, content: string) => void

  // Global loading
  isLoading: boolean
  setLoading: (v: boolean) => void
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      sessionId: uuid(),

      mode: 'auto',
      setMode: (mode) => {
        set({ mode })
      },

      messages: [],

      addUserMessage: (content, parentMessageId, versionIndex) => {
        const id = uuid()
        const msg: ChatMessage = {
          id,
          role: 'user',
          content,
          mode: get().mode,
          timestamp: new Date().toISOString(),
          parentMessageId,
          versionIndex
        }
        set((s) => ({ messages: [...s.messages, msg] }))
        return id
      },

      addLoadingMessage: (controller, parentMessageId, versionIndex) => {
        const id = uuid()
        const msg: ChatMessage = {
          id,
          role: 'assistant',
          content: '',
          mode: get().mode,
          timestamp: new Date().toISOString(),
          isLoading: true,
          parentMessageId,
          versionIndex
        }
        set((s) => ({ 
            messages: [...s.messages, msg],
            abortControllers: { ...s.abortControllers, [id]: controller }
        }))
        return id
      },

      resolveMessage: (id, output) => {
        set((s) => {
          const isLearning = output.category === 'Deep Research'
          const isLeads = output.category === 'Lead Intelligence' || output.category === 'Market Intelligence'
          const isJobHunter = output.category === 'Career & Jobs'
          const yieldsInfo = !!output.needsMoreInfo

          const newMessages = s.messages.map((m) => {
            if (m.id !== id) return m

            const resolved: ChatMessage = {
              ...m,
              isLoading: false,
              content: typeof output.response === 'string' ? output.response : m.content,
              
              // Standardised fields
              success: output.success,
              category: output.category,
              language: output.language,
              insights: output.insights,
              data: output.data,

              // Legacy rich data fields (for compatibility with existing modules)
              learningData: isLearning ? output.data : undefined,
              leadsData: isLeads && !yieldsInfo ? output.data : undefined,
              marketIntelData: output.category === 'Market Intelligence' ? output.data : undefined,
              jobHunterData: isJobHunter ? output.data : undefined,
              
              needsMoreInfo: output.needsMoreInfo,
              metadata: {
                  ...m.metadata,
                  ...output.metadata,
                  category: output.category
              }
            }
            return resolved
          })

          // Update totalVersions for all siblings if this was a versioned message
          const assistantMsg = newMessages.find(m => m.id === id)
          if (assistantMsg && assistantMsg.parentMessageId) {
              const total = newMessages.filter(m => m.parentMessageId === assistantMsg.parentMessageId).length
              newMessages.forEach(m => {
                  if (m.parentMessageId === assistantMsg.parentMessageId || m.id === assistantMsg.parentMessageId) {
                      m.totalVersions = total
                  }
              })
          }

          // NO SMART DUPLICATION (Removed as per v5 Overhaul)

          const { [id]: _, ...remainingControllers } = s.abortControllers
          return { messages: newMessages, abortControllers: remainingControllers }
        })
      },

      setMessageError: (id, error) => {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, isLoading: false, error, content: `Error: ${error}` } : m
          ),
          abortControllers: Object.fromEntries(
              Object.entries(s.abortControllers).filter(([k]) => k !== id)
          )
        }))
      },

      clearMessages: () => set({ messages: [], sessionId: uuid() }),

      deleteModeSession: (mode) => {
          set((s) => ({
              messages: s.messages.filter(m => m.mode !== mode)
          }))
      },

      abortControllers: {},
      activeRequestCount: 0,
      
      queueRequest: async (request: () => Promise<void>) => {
          // If the queue is stuck, we need a way to move forward
          // If 3 requests are active for > 30s, something is potentially wrong
          if (get().activeRequestCount >= 3) {
             console.warn('Queue: Max active requests reached. Waiting for slot...')
             // Wait for slot with 20s max wait time
             const start = Date.now()
             while (get().activeRequestCount >= 3 && Date.now() - start < 20000) {
                 await new Promise(r => setTimeout(r, 500))
             }
             // If still stuck after 20s, force clear one slot to keep system alive
             if (get().activeRequestCount >= 3) {
                 console.error('Queue: STUCK detected. Force-clearing a slot.')
                 set(s => ({ activeRequestCount: Math.max(0, s.activeRequestCount - 1) }))
             }
          }

          set(s => ({ activeRequestCount: s.activeRequestCount + 1 }))
          
          try {
              await request()
          } finally {
              set(s => ({ activeRequestCount: Math.max(0, s.activeRequestCount - 1) }))
          }
      },

      forceClearQueue: () => set({ activeRequestCount: 0, isLoading: false }),

      cancelRequest: (id) => {
        const controller = get().abortControllers[id]
        if (controller) {
          controller.abort()
          set((s) => {
              const { [id]: _, ...rest } = s.abortControllers
              return {
                  abortControllers: rest,
                  messages: s.messages.map(m => m.id === id ? { ...m, isLoading: false, error: 'Canceled' } : m)
              }
          })
        }
      },

      getMessagesForMode: (mode) => {
        const all = get().messages.filter((m) => m.mode === mode)
        // Group by parentId and only show the "active" version or the latest
        const roots: Record<string, ChatMessage> = {}
        
        all.forEach(m => {
            const key = m.parentMessageId || m.id
            const isActive = m.metadata?.isActiveVersion
            
            if (!roots[key] || (m.versionIndex || 1) > (roots[key].versionIndex || 1) || isActive) {
                if (isActive || !roots[key]?.metadata?.isActiveVersion) {
                    roots[key] = m
                }
            }
        })
        
        return all.filter(m => {
            const key = m.parentMessageId || m.id
            return roots[key].id === m.id || roots[key].parentMessageId === m.id
        })
      },

      setActiveVersion: (parentId, index) => {
          set((s) => ({
              messages: s.messages.map(m => {
                  const key = m.parentMessageId || m.id
                  if (key === parentId) {
                      return {
                          ...m,
                          metadata: { ...m.metadata, isActiveVersion: (m.versionIndex || 1) === index }
                      }
                  }
                  return m
              })
          }))
      },

      leadsForm: { domain: '', sector: '', country: '', city: '', count: 10 },
      setLeadsForm: (updates) =>
        set((s) => ({ leadsForm: { ...s.leadsForm, ...updates } })),

      drafts: {},
      setDraft: (mode, content) => set((s) => ({ drafts: { ...s.drafts, [mode]: content } })),

      isLoading: false,
      setLoading: (v) => set({ isLoading: v }),
    }),
    {
      name: 'ai-agent-production-store',
      partialize: (state) => ({
        sessionId: state.sessionId,
        messages: state.messages.filter((m) => !m.isLoading),
        leadsForm: state.leadsForm,
        mode: state.mode,
        drafts: state.drafts
      }),
    }
  )
)
