import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store/useStore'
import { MessageBubble } from './MessageBubble'
import { InputBar } from './InputBar'
import { sendChat } from '../../services/api'
import { OrchestratorOutput } from '../../types'
import { Zap } from 'lucide-react'

export function ChatInterface() {
  const { mode, sessionId, leadsForm, addUserMessage, addLoadingMessage, resolveMessage, setMessageError, isLoading, setLoading, getMessagesForMode } = useStore()
  const visibleMessages = getMessagesForMode(mode)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [injectedQuery, setInjectedQuery] = useState('')

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [visibleMessages])

  // Handle suggestion clicks
  useEffect(() => {
    const handler = (e: CustomEvent<string>) => setInjectedQuery(e.detail)
    document.addEventListener('inject-query', handler as EventListener)
    return () => document.removeEventListener('inject-query', handler as EventListener)
  }, [])

  const handleSubmit = async (query: string) => {
    if (isLoading) return

    addUserMessage(query)
    const loadingId = addLoadingMessage()
    setLoading(true)

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
      })

      resolveMessage(loadingId, result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed. Check your API keys and try again.'
      setMessageError(loadingId, msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {visibleMessages.length === 0 && <EmptyState />}
        {visibleMessages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <InputBar onSubmit={handleSubmit} disabled={isLoading} injectedQuery={injectedQuery} onInjectedConsumed={() => setInjectedQuery('')} />
    </div>
  )
}

const MODE_META = {
  chat: {
    title: 'Chat',
    description: 'Have a normal conversation. Ask anything, get direct answers.',
    suggestions: ['Hello! How are you?', 'What can you help me with?', 'Tell me something interesting about AI']
  },
  learning: {
    title: 'Research & Learning Engine',
    description: 'Deep research on any topic — explanations, examples, papers, videos, and news all in one response.',
    suggestions: ['Explain how transformers work in AI', 'What is retrieval augmented generation?', 'How does blockchain consensus work?']
  },
  leads: {
    title: 'Lead Intelligence Engine',
    description: 'Find qualified business leads, extract contact info, detect gaps, and generate personalized outreach.',
    suggestions: ['Find restaurant owners in Dubai who need AI tools', 'Healthcare clinics in USA needing CRM software', 'E-commerce stores in UK without SEO services']
  },
  auto: {
    title: 'AI Platform',
    description: "Type anything — I'll detect if you want to chat, learn, or find leads and route automatically.",
    suggestions: ['Hello, how are you?', 'Explain machine learning in simple terms', 'Find fintech leads in UAE']
  }
}

function EmptyState() {
  const { mode } = useStore()
  const meta = MODE_META[mode]

  return (
    <div className="flex flex-col items-center justify-center h-full py-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-brand-600/20 border border-brand-600/30 flex items-center justify-center mb-4">
        <Zap className="w-7 h-7 text-brand-400" />
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">{meta.title}</h2>
      <p className="text-gray-500 text-sm max-w-md mb-8">{meta.description}</p>

      <div className="grid gap-2 w-full max-w-lg">
        {meta.suggestions.map((s) => (
          <button key={s}
            onClick={() => document.dispatchEvent(new CustomEvent('inject-query', { detail: s }))}
            className="text-left px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-brand-600 text-sm text-gray-400 hover:text-white transition-all">
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
