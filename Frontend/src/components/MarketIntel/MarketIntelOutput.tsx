import { BarChart2, CheckCircle, ExternalLink, Lightbulb, MapPin, Quote, Target, TrendingUp, Briefcase, Globe } from 'lucide-react'
import { clsx } from 'clsx'
import { MarketIntelResponse, SectorIntel, ServiceIntel, LocationIntel, MarketIntelReference } from '../../types'

interface Props {
  data: MarketIntelResponse
}

const DEMAND_COLOR = {
  'Very High': 'bg-green-900/40 border-green-700 text-green-400',
  'High':      'bg-emerald-900/40 border-emerald-700 text-emerald-400',
  'Medium':    'bg-yellow-900/40 border-yellow-700 text-yellow-400',
  'Low':       'bg-gray-800 border-gray-600 text-gray-400',
}

const OPPORTUNITY_COLOR = {
  'Very High': 'bg-green-900/40 border-green-700 text-green-400',
  'High':      'bg-emerald-900/40 border-emerald-700 text-emerald-400',
  'Medium':    'bg-yellow-900/40 border-yellow-700 text-yellow-400',
  'Low':       'bg-gray-800 border-gray-600 text-gray-400',
}

export function MarketIntelOutput({ data }: Props) {
  const hasSectors   = data.bestSectors?.length > 0
  const hasServices  = data.bestServices?.length > 0
  const hasCountries = data.bestCountries?.length > 0
  const hasCities    = data.bestCities?.length > 0

  return (
    <div className="space-y-6 text-sm">
      {/* Topic header */}
      <div className="flex items-center gap-2">
        <BarChart2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
        <h2 className="text-white font-semibold text-base leading-tight">{data.topic}</h2>
      </div>

      {/* Best Sectors */}
      {hasSectors && (
        <ListSection icon={<Briefcase className="w-4 h-4 text-blue-400" />} title="Best Sectors">
          {data.bestSectors.map((s, i) => <SectorCard key={i} item={s} />)}
        </ListSection>
      )}

      {/* Best Services */}
      {hasServices && (
        <ListSection icon={<TrendingUp className="w-4 h-4 text-purple-400" />} title="Best Services to Sell">
          {data.bestServices.map((s, i) => <ServiceCard key={i} item={s} />)}
        </ListSection>
      )}

      {/* Best Countries */}
      {hasCountries && (
        <ListSection icon={<Globe className="w-4 h-4 text-emerald-400" />} title="Best Countries">
          {data.bestCountries.map((c, i) => <LocationCard key={i} item={c} type="country" />)}
        </ListSection>
      )}

      {/* Best Cities */}
      {hasCities && (
        <ListSection icon={<MapPin className="w-4 h-4 text-orange-400" />} title="Best Cities">
          {data.bestCities.map((c, i) => <LocationCard key={i} item={c} type="city" />)}
        </ListSection>
      )}

      {/* Key Insights */}
      {data.keyInsights?.length > 0 && (
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-yellow-400" />
            <h3 className="font-semibold text-white text-sm">Key Insights</h3>
          </div>
          <ul className="space-y-2">
            {data.keyInsights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span className="text-gray-300 text-xs leading-relaxed">{insight}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Justification */}
      {data.justification && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-emerald-900/15 border border-emerald-800/30">
          <Quote className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
          <p className="text-emerald-400/80 text-xs leading-relaxed">{data.justification}</p>
        </div>
      )}

      {/* Recommendation */}
      {data.recommendation && (
        <div className="bg-brand-900/20 rounded-xl p-4 border border-brand-800/40">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-brand-400" />
            <h3 className="font-semibold text-white text-sm">Recommendation</h3>
          </div>
          <p className="text-gray-300 text-xs leading-relaxed">{data.recommendation}</p>
        </div>
      )}

      {/* Sources — only shown if user didn't ask for list-only */}
      {!data.wantsList && data.references?.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
            <h4 className="font-medium text-gray-400 text-xs uppercase tracking-wider">
              Sources ({data.references.length})
            </h4>
          </div>
          <div className="space-y-2">
            {data.references.map((item, i) => <ReferenceCard key={i} item={item} />)}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ListSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        {icon}
        <h3 className="font-semibold text-white text-sm">{title}</h3>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function SectorCard({ item }: { item: SectorIntel }) {
  return (
    <div className="p-3 rounded-xl bg-gray-800/60 border border-gray-700 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-gray-600 text-xs font-mono">#{item.rank}</span>
          <span className="text-white text-xs font-semibold">{item.name}</span>
        </div>
        <DemandBadge level={item.demandLevel} />
      </div>
      <p className="text-gray-400 text-xs leading-relaxed">{item.reasoning}</p>
      {item.topCompanyTypes?.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {item.topCompanyTypes.map((t, i) => (
            <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-blue-900/30 border border-blue-800/40 text-blue-400">{t}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function ServiceCard({ item }: { item: ServiceIntel }) {
  return (
    <div className="p-3 rounded-xl bg-gray-800/60 border border-gray-700 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-gray-600 text-xs font-mono">#{item.rank}</span>
          <span className="text-white text-xs font-semibold">{item.name}</span>
        </div>
        <DemandBadge level={item.demandLevel} />
      </div>
      <p className="text-gray-400 text-xs leading-relaxed">{item.reasoning}</p>
      <div className="flex items-center justify-between flex-wrap gap-2 pt-0.5">
        {item.targetSectors?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.targetSectors.map((s, i) => (
              <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-purple-900/30 border border-purple-800/40 text-purple-400">{s}</span>
            ))}
          </div>
        )}
        {item.avgDealSize && (
          <span className="text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-800/30 px-2 py-0.5 rounded-full">
            {item.avgDealSize}
          </span>
        )}
      </div>
    </div>
  )
}

function LocationCard({ item, type }: { item: LocationIntel; type: 'country' | 'city' }) {
  const badgeColor = type === 'country' ? OPPORTUNITY_COLOR : OPPORTUNITY_COLOR
  return (
    <div className="p-3 rounded-xl bg-gray-800/60 border border-gray-700 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-gray-600 text-xs font-mono">#{item.rank}</span>
          <span className="text-white text-xs font-semibold">{item.name}</span>
        </div>
        <span className={clsx('text-xs px-2 py-0.5 rounded-full border font-medium', badgeColor[item.opportunity])}>
          {item.opportunity}
        </span>
      </div>
      <p className="text-gray-400 text-xs leading-relaxed">{item.reasoning}</p>
      {type === 'country' && item.topCities?.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {item.topCities.map((c, i) => (
            <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-gray-700 border border-gray-600 text-gray-300">{c}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function DemandBadge({ level }: { level: string }) {
  const color = DEMAND_COLOR[level as keyof typeof DEMAND_COLOR] ?? DEMAND_COLOR['Low']
  return (
    <span className={clsx('text-xs px-2 py-0.5 rounded-full border font-medium flex-shrink-0', color)}>
      {level}
    </span>
  )
}

function ReferenceCard({ item }: { item: MarketIntelReference }) {
  return (
    <a href={item.link} target="_blank" rel="noopener noreferrer"
      className="block p-3 rounded-lg bg-gray-800 border border-gray-700 hover:border-emerald-600 transition-all group">
      <p className="text-white text-xs font-medium group-hover:text-emerald-400 transition-colors line-clamp-2">{item.title}</p>
      <p className="text-emerald-600 text-xs mt-0.5">{item.source}</p>
      <p className="text-gray-500 text-xs mt-1 line-clamp-2">{item.summary}</p>
      {item.justification && (
        <div className="flex items-start gap-1.5 mt-2 px-2 py-1.5 rounded-md bg-emerald-900/15 border border-emerald-800/25">
          <Quote className="w-3 h-3 text-emerald-500 flex-shrink-0 mt-0.5" />
          <p className="text-emerald-400/75 text-xs leading-relaxed">{item.justification}</p>
        </div>
      )}
    </a>
  )
}
