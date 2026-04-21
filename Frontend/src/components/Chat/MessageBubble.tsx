import { clsx } from 'clsx'
import { BookOpen, Briefcase, AlertCircle, MessageCircle, BarChart2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChatMessage } from '../../types'
import { LearningOutput } from '../Learning/LearningOutput'
import { LeadsOutput } from '../Leads/LeadsOutput'
import { MarketIntelOutput } from '../MarketIntel/MarketIntelOutput'
import { TypingDots } from '../shared/LoadingSpinner'

interface Props {
  message: ChatMessage
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-brand-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed">
          {message.content}
        </div>
      </div>
    )
  }

  const hasRichContent = message.learningData || message.leadsData || message.marketIntelData

  const modeIcon = message.marketIntelData
    ? <BarChart2 className="w-4 h-4 text-emerald-400" />
    : message.mode === 'leads'
      ? <Briefcase className="w-4 h-4 text-brand-400" />
      : message.mode === 'chat'
        ? <MessageCircle className="w-4 h-4 text-brand-400" />
        : <BookOpen className="w-4 h-4 text-brand-400" />

  const badgeClass = message.marketIntelData
    ? 'bg-emerald-900/50 text-emerald-400'
    : message.mode === 'leads'
      ? 'bg-purple-900/50 text-purple-400'
      : message.mode === 'chat'
        ? 'bg-gray-700 text-gray-400'
        : 'bg-brand-900/50 text-brand-400'

  const badgeLabel = message.marketIntelData
    ? 'Market Intelligence'
    : message.mode === 'leads'
      ? 'Leads Mode'
      : message.mode === 'chat'
        ? 'Chat'
        : 'Learning Mode'

  return (
    <div className="flex gap-3 items-start">
      {/* Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-gray-800 border border-gray-700 mt-0.5">
        {modeIcon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Mode badge */}
        <span className={clsx('inline-block text-xs px-2 py-0.5 rounded-full mb-2', badgeClass)}>
          {badgeLabel}
        </span>

        {/* Loading */}
        {message.isLoading && (
          <div className="bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3">
            <TypingDots />
          </div>
        )}

        {/* Error */}
        {message.error && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl px-4 py-3 flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {message.error}
          </div>
        )}

        {/* Normal chat / clarification text */}
        {!message.isLoading && !message.error && !hasRichContent && message.content && (
          <div className="bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-200 leading-relaxed">
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* Learning output */}
        {message.learningData && !message.isLoading && (
          <div className="bg-gray-800/30 rounded-2xl rounded-tl-sm p-4 border border-gray-700/50">
            <LearningOutput data={message.learningData} />
          </div>
        )}

        {/* Leads output */}
        {message.leadsData && !message.isLoading && (
          <div className="bg-gray-800/30 rounded-2xl rounded-tl-sm p-4 border border-gray-700/50">
            <LeadsOutput data={message.leadsData} />
          </div>
        )}

        {/* Market Intelligence output */}
        {message.marketIntelData && !message.isLoading && (
          <div className="bg-gray-800/30 rounded-2xl rounded-tl-sm p-4 border border-emerald-900/30">
            <MarketIntelOutput data={message.marketIntelData} />
          </div>
        )}

        {/* Timestamp */}
        <p className="text-xs text-gray-700 mt-1.5 ml-1">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}
