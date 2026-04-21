import { memo, useState } from 'react'
import { clsx } from 'clsx'
import { BookOpen, Briefcase, AlertCircle, MessageCircle, BarChart2, Globe, Edit2, Copy, Check, X, ChevronLeft, ChevronRight } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChatMessage } from '../../types'
import { LearningOutput } from '../Learning/LearningOutput'
import { LeadsOutput } from '../Leads/LeadsOutput'
import { MarketIntelOutput } from '../MarketIntel/MarketIntelOutput'
import { JobCard } from '../shared/JobCard'
import { TypingDots } from '../shared/LoadingSpinner'
import { useStore } from '../../store/useStore'

interface Props {
  message: ChatMessage
}

export const MessageBubble = memo(({ message }: Props) => {
  const { messages, addUserMessage, setMode } = useStore()
  const isUser = message.role === 'user'
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const [isCopied, setIsCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  const handleEditSubmit = () => {
    if (editContent.trim() === message.content) {
      setIsEditing(false)
      return
    }
    
    // Find how many versions exist to set the next index
    const totalVersions = (message.totalVersions || 1) + 1
    
    // Logic for new request:
    // 1. Dispatch custom event for ChatInterface to handle the send
    document.dispatchEvent(new CustomEvent('edit-message', { 
        detail: { 
            content: editContent, 
            parentMessageId: message.parentMessageId || message.id,
            versionIndex: totalVersions
        } 
    }))
    setIsEditing(false)
  }

  const handleVersionChange = (dir: 'prev' | 'next') => {
      const parentId = message.parentMessageId || message.id
      const currentIdx = message.versionIndex || 1
      const nextIdx = dir === 'prev' ? currentIdx - 1 : currentIdx + 1
      
      const targetVersion = messages.find(m => m.parentMessageId === parentId && m.versionIndex === nextIdx) ||
                            (nextIdx === 1 ? messages.find(m => m.id === parentId) : null)
      
      if (targetVersion) {
          // This relies on the UI filtering messages to show only the active version
          document.dispatchEvent(new CustomEvent('switch-version', { detail: { parentId, versionIndex: nextIdx } }))
      }
  }

  if (isUser) {
    return (
      <div className="flex flex-col items-end mb-6 group">
        <div className="flex items-center gap-2 mb-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
           {message.totalVersions && message.totalVersions > 1 && (
               <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-md px-1.5 py-0.5 text-[10px] text-gray-500 mr-2">
                   <button onClick={() => handleVersionChange('prev')} disabled={(message.versionIndex || 1) === 1} className="hover:text-white disabled:opacity-30">
                       <ChevronLeft className="w-3 h-3" />
                   </button>
                   <span>{message.versionIndex || 1} / {message.totalVersions}</span>
                   <button onClick={() => handleVersionChange('next')} disabled={message.versionIndex === message.totalVersions} className="hover:text-white disabled:opacity-30">
                       <ChevronRight className="w-3 h-3" />
                   </button>
               </div>
           )}
           <button onClick={handleCopy} className="p-1 hover:text-brand-400 text-gray-500 transition-colors">
              {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
           </button>
           <button onClick={() => setIsEditing(true)} className="p-1 hover:text-brand-400 text-gray-500 transition-colors">
              <Edit2 className="w-3.5 h-3.5" />
           </button>
        </div>

        {isEditing ? (
            <div className="w-full max-w-[85%] bg-gray-900 border border-brand-500/50 rounded-2xl p-3 shadow-2xl">
                <textarea 
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full bg-transparent text-gray-200 text-sm focus:outline-none resize-none min-h-[80px]"
                    autoFocus
                />
                <div className="flex justify-end gap-2 mt-2">
                    <button onClick={() => setIsEditing(false)} className="px-3 py-1 text-xs text-gray-400 hover:text-white border border-gray-700 rounded-lg">
                        Cancel
                    </button>
                    <button onClick={handleEditSubmit} className="px-3 py-1 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-500">
                        Send
                    </button>
                </div>
            </div>
        ) : (
            <div className="max-w-[75%] bg-brand-600 shadow-lg shadow-brand-600/10 text-white rounded-2xl rounded-tr-sm px-5 py-3.5 text-sm leading-relaxed">
              {message.content}
            </div>
        )}
      </div>
    )
  }

  const hasRichContent = message.learningData || message.leadsData || message.marketIntelData || message.jobHunterData?.jobs
  
  // Use category from standardized output, fallback to badgeLabelMap
  const badgeLabelMap: Record<string, string> = {
    'market-intel': 'Market Intelligence',
    'leads': 'Lead Intelligence',
    'job-hunter': 'Career & Jobs',
    'chat': 'Chat',
    'learning': 'Deep Research',
    'auto': 'Omni-Assistant'
  }
  
  const displayCategory = message.category || badgeLabelMap[message.mode] || 'Assistant'

  const modeIconMap: Record<string, any> = {
    'market-intel': <BarChart2 className="w-4 h-4 text-emerald-400" />,
    'leads': <Briefcase className="w-4 h-4 text-purple-400" />,
    'job-hunter': <Briefcase className="w-4 h-4 text-orange-400" />,
    'chat': <MessageCircle className="w-4 h-4 text-brand-400" />,
    'learning': <BookOpen className="w-4 h-4 text-blue-400" />,
    'auto': <Globe className="w-4 h-4 text-indigo-400" />
  }

  const badgeStyles: Record<string, string> = {
    'Market Intelligence': 'bg-emerald-950/50 text-emerald-400 border-emerald-800/30',
    'Lead Intelligence': 'bg-purple-950/50 text-purple-400 border-purple-800/30',
    'Career & Jobs': 'bg-orange-950/50 text-orange-400 border-orange-800/30',
    'Chat': 'bg-gray-800/80 text-gray-400 border-gray-700/50',
    'Deep Research': 'bg-blue-950/50 text-blue-400 border-blue-800/30',
    'Omni-Assistant': 'bg-indigo-950/50 text-indigo-400 border-indigo-800/30'
  }

  const badgeClass = badgeStyles[displayCategory] || badgeStyles['Chat']
  const modeIcon = modeIconMap[message.mode] || <MessageCircle className="w-4 h-4 text-brand-400" />

  return (
    <div className="flex gap-4 items-start mb-8 group animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Avatar */}
      <div className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-gray-900 border border-gray-800 mt-1 transition-colors group-hover:border-gray-700">
        {modeIcon}
      </div>

      {/* Content Area */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-2.5">
          <span className={clsx('text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded border leading-none', badgeClass)}>
            {displayCategory}
          </span>
          {message.metadata?.intent && (
             <span className="text-[10px] text-gray-600 font-mono italic">
               Intent: {message.metadata.intent} ({Math.round(message.metadata.confidence! * 100)}%)
             </span>
          )}
        </div>

        {/* Loading State */}
        {message.isLoading && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-2xl rounded-tl-sm px-5 py-4 w-20">
            <TypingDots />
          </div>
        )}

        {/* Error State */}
        {message.error && (
          <div className="bg-red-950/20 border border-red-900/50 rounded-xl px-5 py-4 flex items-center gap-3 text-red-400 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{message.error}</p>
          </div>
        )}

        {/* Text content / Clarification */}
        {!message.isLoading && !message.error && message.content && (
          <div className={clsx(
            "rounded-2xl rounded-tl-sm px-5 py-4 text-sm leading-relaxed shadow-sm mb-4",
            isUser ? "bg-brand-600 text-white" : "bg-gray-900/40 border border-gray-800/50 text-gray-200"
          )}>
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
            
            {/* Insights List */}
            {message.insights && message.insights.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-800/50">
                <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2">Key Insights</p>
                <ul className="space-y-1.5">
                  {message.insights.map((insight, idx) => (
                    <li key={idx} className="flex gap-2 text-xs text-brand-300">
                      <span className="text-brand-500">•</span>
                      <span>{insight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Rich Modules */}
        <div className="space-y-6">
          {message.learningData && !message.isLoading && (
            <div className="bg-gray-900/20 rounded-2xl p-5 border border-gray-800/80 shadow-lg shadow-black/20">
              <LearningOutput data={message.learningData} />
            </div>
          )}

          {message.leadsData && !message.isLoading && (
            <div className="bg-gray-900/20 rounded-2xl p-5 border border-gray-800/80 shadow-lg shadow-black/20">
              <LeadsOutput data={message.leadsData} />
            </div>
          )}

          {message.marketIntelData && !message.isLoading && (
            <div className="bg-emerald-950/5 rounded-2xl p-5 border border-emerald-900/20 shadow-lg shadow-emerald-500/5">
              <MarketIntelOutput data={message.marketIntelData} />
            </div>
          )}

          {message.jobHunterData?.jobs && !message.isLoading && (
            <div className="grid grid-cols-1 gap-4">
               {message.jobHunterData.jobs.map((job, i) => (
                 <JobCard key={i} job={job} />
               ))}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center gap-3 mt-3 ml-1 opacity-40 group-hover:opacity-100 transition-opacity">
          <p className="text-[10px] text-gray-500">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          {message.metadata?.reasoning && (
             <p className="text-[10px] text-gray-600 italic font-mono truncate max-w-xs">
                {message.metadata.reasoning}
             </p>
          )}
        </div>
      </div>
    </div>
  )
})
