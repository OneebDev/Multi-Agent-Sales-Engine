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
  }
]

export function Sidebar() {
  const { mode, setMode, clearMessages } = useStore()

  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col h-full">
      {/* Logo */}
      <div className="p-6 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-white text-sm">AI Platform</h1>
            <p className="text-xs text-gray-500">Learn · Research · Leads</p>
          </div>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="p-4 flex flex-col gap-2">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Mode</p>
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={clsx(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all',
              mode === m.id
                ? 'bg-brand-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            )}
          >
            {m.icon}
            <div>
              <p className="text-sm font-medium">{m.label}</p>
              <p className={clsx('text-xs', mode === m.id ? 'text-brand-200' : 'text-gray-600')}>{m.description}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Clear Chat */}
      <div className="p-4 border-t border-gray-800">
        <button
          onClick={clearMessages}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-all text-sm"
        >
          <Trash2 className="w-4 h-4" />
          Clear conversation
        </button>
      </div>
    </aside>
  )
}
