import { useState } from 'react'
import { Globe, Mail, Phone, ChevronDown, ChevronUp, Copy, Check, DollarSign, Target, Cpu, Info, CheckCircle2 } from 'lucide-react'
import { clsx } from 'clsx'
import { StructuredLead } from '../../types'

interface Props {
  lead: StructuredLead
  index: number
}

export function LeadCard({ lead, index }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyOutreach = async () => {
    await navigator.clipboard.writeText(lead.outreachMessage)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const scoreColor = lead.confidenceScore >= 80
    ? 'text-green-400 bg-green-900/30 border-green-800'
    : lead.confidenceScore >= 60
      ? 'text-yellow-400 bg-yellow-900/30 border-yellow-800'
      : 'text-orange-400 bg-orange-900/30 border-orange-800'

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-gray-500 text-xs">#{index + 1}</span>
              <h3 className="font-semibold text-white">{lead.companyName}</h3>
              <span className={clsx('text-xs px-2 py-0.5 rounded-full border font-medium', scoreColor)}>
                {lead.confidenceScore}% confidence
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {lead.website && (
                <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                  <Globe className="w-3 h-3" /> {safeHostname(lead.website)}
                </a>
              )}
              {lead.email && (
                <a href={`mailto:${lead.email}`}
                  className="text-xs text-gray-400 hover:text-white flex items-center gap-1">
                  <Mail className="w-3 h-3" /> {lead.email}
                </a>
              )}
              {lead.phone && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {lead.phone}
                </span>
              )}
            </div>
          </div>
          <button onClick={() => setExpanded(!expanded)}
            className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-all">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Key info chips */}
        <div className="flex flex-wrap gap-2 mt-3">
          {lead.sector && <Chip label={lead.sector} color="blue" />}
          {lead.country && <Chip label={`${lead.city ? lead.city + ', ' : ''}${lead.country}`} color="gray" />}
          {lead.decisionMaker && <Chip label={lead.decisionMaker} color="purple" />}
          {lead.revenuePotential && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-900/30 border border-green-800 text-green-400">
              <DollarSign className="w-3 h-3" /> {lead.revenuePotential}
            </span>
          )}
        </div>
      </div>

      {/* What to sell + gap summary (always visible) */}
      <div className="px-4 pb-3 flex gap-2 flex-wrap">
        {lead.whatToSell && (
          <div className="flex items-center gap-1.5 text-xs bg-brand-900/40 border border-brand-800 rounded-lg px-2.5 py-1.5">
            <Target className="w-3 h-3 text-brand-400" />
            <span className="text-brand-300 font-medium">Sell:</span>
            <span className="text-gray-300">{lead.whatToSell}</span>
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-700 p-4 space-y-4">

          {/* Justification block — mandatory per spec */}
          {lead.justification && (
            <div className="bg-blue-950/40 border border-blue-800/50 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" /> Why This Company Is Targeted
              </p>
              <p className="text-xs text-gray-300 leading-relaxed">{lead.justification.whyTargeted}</p>
              {lead.justification.gapBullets.length > 0 && (
                <ul className="space-y-1 mt-1">
                  {lead.justification.gapBullets.map((gap, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-gray-400">
                      <CheckCircle2 className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                      {gap}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {lead.businessGap && (
            <Detail label="Business Gap" value={lead.businessGap} />
          )}
          {lead.useCase && (
            <Detail label="Use Case" value={lead.useCase} />
          )}
          {lead.salesStrategy && (
            <Detail label="Sales Strategy" value={lead.salesStrategy} />
          )}
          {lead.currentSystem && lead.currentSystem !== 'Unknown' && (
            <Detail label="Current System" value={lead.currentSystem} />
          )}

          {/* Tech Stack */}
          {lead.techStack.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1.5 flex items-center gap-1">
                <Cpu className="w-3 h-3" /> Tech Stack
              </p>
              <div className="flex flex-wrap gap-1.5">
                {lead.techStack.map((t) => (
                  <span key={t} className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Outreach message */}
          {lead.outreachMessage && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Mail className="w-3 h-3" /> Outreach Message
                </p>
                <button onClick={copyOutreach}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-white transition-colors">
                  {copied ? <><Check className="w-3 h-3 text-green-400" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
              </div>
              <p className="text-xs text-gray-300 bg-gray-900 rounded-lg p-3 leading-relaxed whitespace-pre-wrap">{lead.outreachMessage}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-sm text-gray-300 leading-relaxed">{value}</p>
    </div>
  )
}

function safeHostname(url: string): string {
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace('www.', '') }
  catch { return url }
}

function Chip({ label, color }: { label: string; color: 'blue' | 'gray' | 'purple' }) {
  const colors = {
    blue: 'bg-blue-900/30 border-blue-800 text-blue-400',
    gray: 'bg-gray-700 border-gray-600 text-gray-400',
    purple: 'bg-purple-900/30 border-purple-800 text-purple-400'
  }
  return (
    <span className={clsx('text-xs px-2 py-0.5 rounded-full border', colors[color])}>{label}</span>
  )
}
