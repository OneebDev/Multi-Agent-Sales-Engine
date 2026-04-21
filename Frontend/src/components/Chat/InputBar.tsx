import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { Send, Briefcase } from 'lucide-react'
import { clsx } from 'clsx'
import { useStore } from '../../store/useStore'
import { LoadingSpinner } from '../shared/LoadingSpinner'

interface Props {
  onSubmit: (query: string) => void
  disabled?: boolean
  injectedQuery?: string
  onInjectedConsumed?: () => void
}

export function InputBar({ onSubmit, disabled, injectedQuery, onInjectedConsumed }: Props) {
  const [value, setValue] = useState('')

  // Accept injected suggestion
  useEffect(() => {
    if (injectedQuery) {
      setValue(injectedQuery)
      onInjectedConsumed?.()
    }
  }, [injectedQuery, onInjectedConsumed])
  const { mode, leadsForm, setLeadsForm } = useStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showLeadsFields, setShowLeadsFields] = useState(false)

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSubmit(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInput = () => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`
    }
  }

  const isLeadsMode = mode === 'leads'

  return (
    <div className="border-t border-gray-800 bg-gray-950 p-4 space-y-3">
      {/* Leads context fields */}
      {isLeadsMode && (
        <div>
          <button
            onClick={() => setShowLeadsFields(!showLeadsFields)}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors mb-2"
          >
            <Briefcase className="w-3 h-3" />
            {showLeadsFields ? 'Hide' : 'Show'} leads filters
          </button>

          {showLeadsFields && (
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                type="text"
                placeholder="Domain (e.g. AI chatbots)"
                value={leadsForm.domain}
                onChange={(e) => setLeadsForm({ domain: e.target.value })}
                className="col-span-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-600"
              />
              <input
                type="text"
                placeholder="Sector (e.g. restaurants)"
                value={leadsForm.sector}
                onChange={(e) => setLeadsForm({ sector: e.target.value })}
                className="col-span-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-600"
              />
              <input
                type="text"
                placeholder="Country (required)"
                value={leadsForm.country}
                onChange={(e) => setLeadsForm({ country: e.target.value })}
                className="col-span-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-600"
              />
              <input
                type="text"
                placeholder="City (optional)"
                value={leadsForm.city}
                onChange={(e) => setLeadsForm({ city: e.target.value })}
                className="col-span-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-600"
              />
              <div className="col-span-2 flex items-center gap-3">
                <label className="text-xs text-gray-500 whitespace-nowrap">Leads count:</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={leadsForm.count}
                  onChange={(e) => setLeadsForm({ count: Math.max(1, Math.min(50, parseInt(e.target.value) || 10)) })}
                  className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-600"
                />
                <span className="text-xs text-gray-600">System fetches {leadsForm.count * 3}x internally, returns best {leadsForm.count}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main input */}
      <div className="flex items-end gap-3 bg-gray-800 rounded-xl border border-gray-700 focus-within:border-brand-600 transition-colors px-4 py-3">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => { setValue(e.target.value); handleInput() }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={
            isLeadsMode
              ? 'Describe what leads you need, or just press send with filters set above...'
              : 'Ask me anything — I\'ll research it thoroughly...'
          }
          rows={1}
          className="flex-1 bg-transparent text-white placeholder-gray-600 text-sm resize-none focus:outline-none min-h-[24px] max-h-[200px] leading-relaxed disabled:opacity-50"
        />
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || disabled}
          className={clsx(
            'flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all',
            value.trim() && !disabled
              ? 'bg-brand-600 hover:bg-brand-500 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          )}
        >
          {disabled ? <LoadingSpinner size="sm" /> : <Send className="w-4 h-4" />}
        </button>
      </div>

      <p className="text-xs text-gray-700 text-center">
        {isLeadsMode ? 'Leads mode active — fills filters then send' : 'Enter to send · Shift+Enter for new line'}
      </p>
    </div>
  )
}
