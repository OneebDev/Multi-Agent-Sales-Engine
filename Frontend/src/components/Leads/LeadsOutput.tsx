import { Users, MapPin, Tag, CheckCircle, TrendingUp } from 'lucide-react'
import { LeadsResponse } from '../../types'
import { LeadCard } from './LeadCard'

interface Props {
  data: LeadsResponse
}

export function LeadsOutput({ data }: Props) {
  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-brand-400" />
          <h3 className="font-semibold text-white text-sm">Lead Generation Results</h3>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          <Stat icon={<Tag className="w-3 h-3" />} label="Domain" value={data.domain} />
          <Stat icon={<Users className="w-3 h-3" />} label="Sector" value={data.sector} />
          <Stat icon={<MapPin className="w-3 h-3" />} label="Location" value={data.location} />
          <Stat icon={<CheckCircle className="w-3 h-3 text-green-400" />} label="Qualified Leads" value={`${data.totalFound}`} color="green" />
        </div>

        {/* Overall strategy */}
        {data.overallStrategy && (
          <div className="mt-3 pt-3 border-t border-gray-700">
            <p className="text-xs text-gray-500 font-medium mb-1.5 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Sales Strategy
            </p>
            <p className="text-xs text-gray-400 leading-relaxed">{data.overallStrategy}</p>
          </div>
        )}

        {/* Processing notes */}
        {data.processingNotes.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-700">
            <p className="text-xs text-gray-600 font-medium mb-1">Processing Log</p>
            <ul className="space-y-0.5">
              {data.processingNotes.map((note, i) => (
                <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-600 flex-shrink-0" />
                  {note}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Lead cards */}
      {data.leads.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No qualified leads found. Try adjusting your domain, sector, or location.
        </div>
      ) : (
        <div className="space-y-3">
          {data.leads.map((lead, i) => (
            <LeadCard key={`${lead.website}-${i}`} lead={lead} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ icon, label, value, color = 'default' }: { icon: React.ReactNode; label: string; value: string; color?: 'default' | 'green' }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-gray-500">{icon}</span>
      <span className="text-gray-500">{label}:</span>
      <span className={color === 'green' ? 'text-green-400 font-semibold' : 'text-gray-300 font-medium'}>{value}</span>
    </div>
  )
}
