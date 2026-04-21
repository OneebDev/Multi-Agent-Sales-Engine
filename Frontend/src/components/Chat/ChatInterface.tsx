import { useEffect, useRef, useState, useCallback } from 'react'
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'
import { useStore } from '../../store/useStore'
import { MessageBubble } from './MessageBubble'
import { InputBar } from './InputBar'
import { sendChat } from '../../services/api'
import { OrchestratorOutput } from '../../types'
import { Zap } from 'lucide-react'

export function ChatInterface() {
  const { 
    mode, 
    sessionId, 
    leadsForm, 
    addUserMessage, 
    addLoadingMessage, 
    resolveMessage, 
    setMessageError, 
    setLoading, 
    getMessagesForMode,
    setActiveVersion,
    queueRequest
  } = useStore()
  
  const visibleMessages = getMessagesForMode(mode)
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const [injectedQuery, setInjectedQuery] = useState('')

  // Handle version switching
  useEffect(() => {
    const handler = (e: CustomEvent<{ parentId: string, versionIndex: number }>) => {
        setActiveVersion(e.detail.parentId, e.detail.versionIndex)
    }
    document.addEventListener('switch-version', handler as EventListener)
    return () => document.removeEventListener('switch-version', handler as EventListener)
  }, [setActiveVersion])

  // Handle suggestion clicks
  useEffect(() => {
    const handler = (e: CustomEvent<string>) => setInjectedQuery(e.detail)
    document.addEventListener('inject-query', handler as EventListener)
    return () => document.removeEventListener('inject-query', handler as EventListener)
  }, [])

  const handleSubmit = useCallback(async (query: string, parentMessageId?: string, versionIndex?: number) => {
    const currentController = new AbortController()

    addUserMessage(query, parentMessageId, versionIndex)
    const loadingId = addLoadingMessage(currentController, parentMessageId, versionIndex)
    
    // If it's a new version, immediately set it as active
    if (parentMessageId && versionIndex) {
        setActiveVersion(parentMessageId, versionIndex)
    }

    setLoading(true)

    // Parallel Queue Integration
    queueRequest(async () => {
        try {
          const result: OrchestratorOutput = await sendChat({
            sessionId,
            query,
            mode,
            ...(mode === 'leads' ? {
              domain: leadsForm.domain || undefined,
              sector: leadsForm.sector || undefined,
              country: leadsForm.country || undefined,
              city: leadsForm.city || undefined,
              count: leadsForm.count
            } : {})
          }, currentController.signal)
    
          resolveMessage(loadingId, result)
        } catch (err: any) {
          if (err.name === 'AbortError') return
          const msg = err instanceof Error ? err.message : 'Request failed. Please try again.'
          setMessageError(loadingId, msg)
        } finally {
          if (Object.keys(useStore.getState().abortControllers).length === 0) {
              setLoading(false)
          }
        }
    })
  }, [mode, sessionId, leadsForm, addUserMessage, addLoadingMessage, setLoading, resolveMessage, setMessageError, setActiveVersion, queueRequest])

  // Handle edit message events
  useEffect(() => {
    const handler = (e: CustomEvent<{ content: string, parentMessageId: string, versionIndex: number }>) => {
        handleSubmit(e.detail.content, e.detail.parentMessageId, e.detail.versionIndex)
    }
    document.addEventListener('edit-message', handler as EventListener)
    return () => document.removeEventListener('edit-message', handler as EventListener)
  }, [handleSubmit])

  // Scroll to bottom on new messages
  useEffect(() => {
    if (visibleMessages.length > 0) {
      virtuosoRef.current?.scrollToIndex({
        index: visibleMessages.length - 1,
        behavior: 'smooth'
      })
    }
  }, [visibleMessages.length])

  return (
    <div className="flex flex-col h-full bg-gray-950">
      <div className="flex-1 min-h-0">
        <Virtuoso
          ref={virtuosoRef}
          data={visibleMessages}
          initialTopMostItemIndex={visibleMessages.length - 1}
          components={{
            Header: () => visibleMessages.length === 0 ? <EmptyState /> : <div className="h-6" />,
            Footer: () => <div className="h-6" />,
          }}
          itemContent={(_, msg) => (
            <div className="px-6 py-3">
               <MessageBubble message={msg} />
            </div>
          )}
        />
      </div>

      <div className="p-4 border-t border-gray-800/50 bg-gray-900/30 backdrop-blur-sm">
        <InputBar 
          onSubmit={handleSubmit} 
          injectedQuery={injectedQuery} 
          onInjectedConsumed={() => setInjectedQuery('')} 
        />
      </div>
    </div>
  )
}

const MODE_META = {
  chat: {
    title: 'General Chat',
    description: 'Casual conversation and direct answers.',
    suggestions: ['Hello! How are you?', 'What can you help me with?', 'Help me write a professional email']
  },
  learning: {
    title: 'Research & Learning',
    description: 'Deep explanations, papers, and educational resources.',
    suggestions: ['Explain Quantum Computing', 'How do neural networks learn?', 'Latest news in Space exploration']
  },
  leads: {
    title: 'Lead Intelligence',
    description: 'B2B lead generation and market scouting.',
    suggestions: ['Find tech companies in Berlin', 'Real estate agencies in Dubai', 'Medical clinics in USA']
  },
  auto: {
    title: 'Omni-Assistant (Auto)',
    description: 'Intelligent routing across all modules.',
    suggestions: ['Find React jobs', 'Explain RAG in AI', 'Find CRM leads for doctors']
  },
  'job-hunter': {
    title: 'Career & Jobs',
    description: 'Verified job discovery and career intelligence.',
    suggestions: ['Find Remote React jobs', 'Senior Backend Engineer salary', 'Review my career goals']
  }
}

function EmptyState() {
  const { mode } = useStore()
  const meta = MODE_META[mode] || MODE_META.chat

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-12 text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-brand-600/10 border border-brand-600/20 flex items-center justify-center mb-6">
        <Zap className="w-8 h-8 text-brand-400" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">{meta.title}</h2>
      <p className="text-gray-400 text-sm max-w-sm mb-10 leading-relaxed">{meta.description}</p>

      <div className="grid gap-3 w-full max-w-md">
        {meta.suggestions.map((s: string) => (
          <button key={s}
            onClick={() => document.dispatchEvent(new CustomEvent('inject-query', { detail: s }))}
            className="text-left px-5 py-3 rounded-xl bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-brand-600/50 text-sm text-gray-400 hover:text-white transition-all">
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
