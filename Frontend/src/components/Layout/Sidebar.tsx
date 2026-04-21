import { BookOpen, Briefcase, Zap, Trash2, MessageCircle } from 'lucide-react'
import { clsx } from 'clsx'
import { AppMode } from '../../types'
import { useStore } from '../../store/useStore'

const MODES: { id: AppMode; label: string; icon: React.ReactNode; description: string }[] = [
  {
    id: 'chat',
    label: 'Chat',
    icon: <MessageCircle className="w-5 h-5" />,
    description: 'Normal conversation'
  },
  {
    id: 'learning',
    label: 'Learning',
    icon: <BookOpen className="w-5 h-5" />,
    description: 'Research, explain & learn'
  },
  {
    id: 'leads',
    label: 'Leads',
    icon: <Briefcase className="w-5 h-5" />,
    description: 'Find & qualify prospects'
  },
  {
    id: 'auto',
    label: 'Auto',
    icon: <Zap className="w-5 h-5" />,
    description: 'AI decides the mode'
  },
  {
    id: 'job-hunter',
    label: 'Job Hunter',
    icon: <Briefcase className="w-5 h-5" />,
    description: 'Career intelligence advisor'
  }
]

export function Sidebar() {
  const { mode, setMode, clearMessages, deleteModeSession } = useStore()
  const activeModeMeta = MODES.find(m => m.id === mode)

  return (
    <aside className="w-64 bg-gray-950 border-r border-gray-800/40 flex flex-col h-full shadow-2xl">
      {/* Logo */}
      <div className="p-6 border-b border-gray-800/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-600 shadow-lg shadow-brand-600/30 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-white text-sm tracking-tight">AI PRO</h1>
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-widest">Multi-Agent OS</p>
          </div>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="p-4 flex flex-col gap-1.5 overflow-y-auto min-h-0">
        <p className="px-3 text-[10px] font-bold text-gray-600 uppercase tracking-[0.2em] mb-2 mt-2">Core Modules</p>
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={clsx(
              'w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all duration-200 group relative',
              mode === m.id
                ? 'bg-brand-600/10 text-white border border-brand-600/20'
                : 'text-gray-500 hover:bg-gray-800/40 hover:text-white border border-transparent'
            )}
          >
            <div className={clsx(
                'transition-colors',
                mode === m.id ? 'text-brand-400' : 'text-gray-600 group-hover:text-gray-300'
            )}>
                {m.icon}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate leading-none mb-1">{m.label}</p>
              <p className={clsx('text-[10px] truncate', mode === m.id ? 'text-brand-400/80' : 'text-gray-600 group-hover:text-gray-500')}>{m.description}</p>
            </div>
            {mode === m.id && (
                <div className="absolute left-0 w-1 h-5 bg-brand-600 rounded-r-full" />
            )}
          </button>
        ))}
      </div>

      {/* Settings / Footer Area */}
      <div className="mt-auto p-4 space-y-1 border-t border-gray-800/40">
        <button
          onClick={() => deleteModeSession(mode)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-500 hover:text-orange-400 hover:bg-orange-500/5 transition-all text-sm group"
        >
          <Trash2 className="w-4 h-4 transition-transform group-hover:rotate-12" />
          <span className="font-medium text-[12px]">Reset {activeModeMeta?.label}</span>
        </button>
        <button
          onClick={clearMessages}
          className="w-full flex items-center gap-3 px-3 py-1.5 rounded-xl text-gray-600 hover:text-red-400 hover:bg-red-500/5 transition-all text-[11px] group"
        >
          <span className="font-medium">Reset All Sessions</span>
        </button>
      </div>
    </aside>
  )
}
