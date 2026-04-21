import { groqComplete } from '../tools/groq.tool'
import { webSearch, newsSearch, SerperResult } from '../tools/serper.tool'
import { detectLanguage, getResponseLanguageInstruction } from './language-detector'
import { indexSearchResults } from '../rag/rag.service'
import { MarketIntelContext } from './session-memory'
import logger from '../../handlers/logger'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MarketIntelReference {
    title: string
    source: string
    link: string
    summary: string
    justification: string
}

export interface SectorIntel {
    rank: number
    name: string
    demandLevel: 'Very High' | 'High' | 'Medium' | 'Low'
    reasoning: string
    topCompanyTypes: string[]
}

export interface ServiceIntel {
    rank: number
    name: string
    demandLevel: 'Very High' | 'High' | 'Medium' | 'Low'
    reasoning: string
    targetSectors: string[]
    avgDealSize: string
}

export interface LocationIntel {
    rank: number
    name: string
    opportunity: 'Very High' | 'High' | 'Medium' | 'Low'
    reasoning: string
    topCities: string[]
}

export interface MarketIntelResponse {
    query: string
    topic: string
    bestSectors: SectorIntel[]
    bestServices: ServiceIntel[]
    bestCountries: LocationIntel[]
    bestCities: LocationIntel[]
    keyInsights: string[]
    justification: string
    recommendation: string
    wantsList: boolean
    references: MarketIntelReference[]
    language: string
    timestamp: string
}

// ─── Market intelligence query detector ──────────────────────────────────────

const MARKET_INTEL_PATTERNS = [
    /best\s+(country|city|sector|market|region|industry|place|services?|products?)/i,
    /which\s+(country|city|sector|market|region|industry|services?|products?|solutions?)/i,
    /where\s+(to\s+sell|should\s+i|is\s+the\s+best)/i,
    /compare\s+(markets?|countries|cities|sectors|industries)/i,
    /market\s+(comparison|analysis|research|opportunity|potential|trend)/i,
    /top\s+(?:countries|cities|markets|sectors|services?|products?)\s+for/i,
    /(demand|opportunity)\s+in\s+(which|what)/i,
    /most\s+(profitable|lucrative|promising|popular|demanded?|in.demand)\s+(market|sector|region|country|services?|products?)/i,
    /(\w+)\s+vs\s+(\w+)\s+(?:for|market|leads|sales)/i,
    /(?:most|highest|biggest)\s+demand(?:ed)?\s+(?:in|for)/i,
    /(?:in\s+demand|trending|growing)\s+(?:in|for)\s+\w+/i,
    /what\s+(?:services?|products?|solutions?)\s+(?:is|are)\s+(?:most\s+)?(?:in\s+)?demand/i,
    /which\s+(?:services?|products?|solutions?)\s+(?:is|are)\s+(?:most\s+)?(?:in\s+)?demand/i,
    /market\s+(?:size|share|growth|forecast|outlook)/i,
    /(?:industry|sector)\s+(?:trend|analysis|overview|insight)/i,
    /best\s+\w[\w\s]{0,20}(?:for|in)\s+(?:my\s+)?\w/i,
    /what\s+(?:should|can)\s+i\s+sell\s+in/i,
    /konsi?\s+(?:service|sector|market|country|city)/i,
    /best\s+(?:service|sector|market|country|city)\s+(?:for|in|hai|hain|kya)/i,
    /(?:kaun\s*si|kaun\s*sa)\s+(?:service|sector|market|country|city)/i,
    /provide\s+(?:me\s+)?(?:a\s+)?list/i,
    /give\s+(?:me\s+)?(?:a\s+)?list/i
]

export function isMarketIntelQuery(query: string): boolean {
    return MARKET_INTEL_PATTERNS.some((p) => p.test(query))
}

function wantsListFormat(query: string): boolean {
    const lower = query.toLowerCase()
    return (
        /(?:give|provide|show|list|tell)\s+(?:me\s+)?(?:a\s+)?list/i.test(lower) ||
        /not\s+sources?/i.test(lower) ||
        /no\s+sources?/i.test(lower) ||
        /without\s+sources?/i.test(lower) ||
        /sources\s+nahi/i.test(lower) ||
        /list\s+chahiye/i.test(lower)
    )
}

// ─── Main service ─────────────────────────────────────────────────────────────

export async function runMarketIntel(
    query: string,
    domain?: string,
    sector?: string,
    previousHistory?: MarketIntelContext[]
): Promise<MarketIntelResponse> {
    logger.info('MarketIntel: starting', { meta: { query: query.slice(0, 80), domain, sector } })

    const lang = detectLanguage(query)
    const langInstruction = getResponseLanguageInstruction(lang)
    const wantsList = wantsListFormat(query)

    // Build contextual search queries
    const contextSuffix = [domain, sector].filter(Boolean).join(' ')
    const searchQueries = [
        `${query} ${contextSuffix}`.trim(),
        `best sectors services ${contextSuffix} market ${currentYear()}`,
        `top countries cities for ${contextSuffix} business opportunities`,
        `${contextSuffix} industry demand trends market size`
    ]

    const [primary, ...secondary] = await Promise.allSettled(
        searchQueries.map((q) => webSearch(q, 8))
    )

    const allResults: SerperResult[] = []
    if (primary.status === 'fulfilled') allResults.push(...primary.value)
    for (const r of secondary) {
        if (r.status === 'fulfilled') allResults.push(...r.value)
    }

    const newsResults = await newsSearch(`${contextSuffix} market demand 2024 2025`, 6).catch(() => [])

    const seen = new Set<string>()
    const uniqueResults = allResults.filter((r) => {
        if (seen.has(r.link)) return false
        seen.add(r.link)
        return true
    })

    indexSearchResults(uniqueResults.slice(0, 10).map((r) => ({ title: r.title, snippet: r.snippet, link: r.link })))

    const searchContext = uniqueResults
        .slice(0, 10)
        .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\nURL: ${r.link}`)
        .join('\n\n')

    const newsContext = newsResults
        .slice(0, 4)
        .map((n) => `• ${n.title}: ${n.snippet}`)
        .join('\n')

    // Build previous context summary for comparison
    const prevContextStr = previousHistory && previousHistory.length > 0
        ? `\n\nPREVIOUS QUERIES IN THIS SESSION:\n${previousHistory.map((h, i) =>
            `${i + 1}. "${h.topic}"${h.domain ? ` (domain: ${h.domain})` : ''}${h.sector ? ` (sector: ${h.sector})` : ''}\n   Key findings: ${h.keyFindings.slice(0, 2).join('; ')}`
        ).join('\n')}\n\nIf relevant, compare or build upon the above previous findings.`
        : ''

    const prompt = `You are a B2B market intelligence analyst with deep knowledge of global markets.

USER QUERY: "${query}"
${domain ? `Domain/Product being sold: ${domain}` : ''}
${sector ? `Sector context: ${sector}` : ''}
LANGUAGE INSTRUCTION: ${langInstruction}
${prevContextStr}

SEARCH EVIDENCE:
${searchContext}

RECENT NEWS:
${newsContext}

Analyze the query thoroughly. The user ${wantsList ? 'WANTS A STRUCTURED LIST (no source references needed, focus on the lists)' : 'wants full analysis with sources'}.

Respond with EXACTLY this JSON structure:
{
  "topic": "Clear title describing what was analyzed",
  "bestSectors": [
    {
      "rank": 1,
      "name": "Sector name",
      "demandLevel": "Very High",
      "reasoning": "Why this sector needs the domain product/service (evidence-based)",
      "topCompanyTypes": ["Company type 1", "Company type 2", "Company type 3"]
    }
  ],
  "bestServices": [
    {
      "rank": 1,
      "name": "Service/product name",
      "demandLevel": "Very High",
      "reasoning": "Why this service is in demand right now",
      "targetSectors": ["Sector 1", "Sector 2"],
      "avgDealSize": "$X,000–$Y,000/year"
    }
  ],
  "bestCountries": [
    {
      "rank": 1,
      "name": "Country name",
      "opportunity": "Very High",
      "reasoning": "Why this country is best for this domain",
      "topCities": ["City 1", "City 2", "City 3"]
    }
  ],
  "bestCities": [
    {
      "rank": 1,
      "name": "City, Country",
      "opportunity": "Very High",
      "reasoning": "Why this city specifically",
      "topCities": []
    }
  ],
  "keyInsights": [
    "Insight 1 with specific data",
    "Insight 2 with specific data",
    "Insight 3 with specific data",
    "Insight 4 with specific data",
    "Insight 5 with specific data"
  ],
  "justification": "Why these findings are reliable (1-2 sentences referencing the search evidence)",
  "recommendation": "Specific actionable recommendation (2-3 sentences)"
}

Rules:
- Provide 3-5 items in bestSectors, bestServices, bestCountries, bestCities
- All text in user's language
- Base everything on the search evidence above
- If comparing with previous queries, explicitly mention differences`

    let topic = query
    let bestSectors: SectorIntel[] = []
    let bestServices: ServiceIntel[] = []
    let bestCountries: LocationIntel[] = []
    let bestCities: LocationIntel[] = []
    let keyInsights: string[] = []
    let justification = ''
    let recommendation = ''

    try {
        const raw = await groqComplete(
            'You are a B2B market intelligence analyst. Respond ONLY with valid JSON.',
            prompt,
            { temperature: 0.4, maxTokens: 3500 }
        )
        const match = raw.match(/\{[\s\S]*/)
        if (match) {
            let jsonStr = match[0]
            // Close truncated JSON gracefully
            if (!jsonStr.trimEnd().endsWith('}')) {
                // Count open braces/brackets to close them
                const opens = (jsonStr.match(/\{|\[/g) || []).length
                const closes = (jsonStr.match(/\}|\]/g) || []).length
                const diff = opens - closes
                // Strip trailing incomplete line then close
                jsonStr = jsonStr.replace(/,?\s*"[^"]*"?\s*:?\s*[^,}\]]*$/, '')
                for (let i = 0; i < diff; i++) {
                    jsonStr += (jsonStr.trimEnd().slice(-1) === '{' || jsonStr.trimEnd().slice(-1) === '[') ? '}' : (i === 0 ? '}' : ']')
                }
                if (!jsonStr.trimEnd().endsWith('}')) jsonStr += '}'
            }
            try {
                const parsed = JSON.parse(jsonStr) as Partial<MarketIntelResponse>
                topic = parsed.topic || query
                bestSectors = Array.isArray(parsed.bestSectors) ? parsed.bestSectors : []
                bestServices = Array.isArray(parsed.bestServices) ? parsed.bestServices : []
                bestCountries = Array.isArray(parsed.bestCountries) ? parsed.bestCountries : []
                bestCities = Array.isArray(parsed.bestCities) ? parsed.bestCities : []
                keyInsights = Array.isArray(parsed.keyInsights) ? parsed.keyInsights : []
                justification = parsed.justification || ''
                recommendation = parsed.recommendation || ''
            } catch {
                // Try extracting individual fields with targeted regex
                const topicM = raw.match(/"topic"\s*:\s*"([^"]+)"/)
                if (topicM) topic = topicM[1]
                const insightsM = raw.match(/"keyInsights"\s*:\s*\[([^\]]+)\]/)
                if (insightsM) {
                    try { keyInsights = JSON.parse(`[${insightsM[1]}]`) as string[] } catch { /* ignore */ }
                }
                const recM = raw.match(/"recommendation"\s*:\s*"([^"]+)"/)
                if (recM) recommendation = recM[1]
                const justM = raw.match(/"justification"\s*:\s*"([^"]+)"/)
                if (justM) justification = justM[1]
                if (keyInsights.length === 0) keyInsights = ['Analysis completed — structured data partially extracted.']
            }
        }
    } catch (err) {
        logger.error('MarketIntel: LLM analysis failed', { meta: err })
        const msg = err instanceof Error ? err.message : ''
        if (msg.includes('rate limit') || msg.includes('rate_limit')) throw err
        keyInsights = ['Analysis failed — please try again.']
    }

    const references = wantsList
        ? []
        : await buildReferencesWithJust(query, uniqueResults.slice(0, 6))

    logger.info('MarketIntel: complete', { meta: { sectorsCount: bestSectors.length, servicesCount: bestServices.length } })

    return {
        query,
        topic,
        bestSectors,
        bestServices,
        bestCountries,
        bestCities,
        keyInsights,
        justification,
        recommendation,
        wantsList,
        references,
        language: lang,
        timestamp: new Date().toISOString()
    }
}

async function buildReferencesWithJust(query: string, results: SerperResult[]): Promise<MarketIntelReference[]> {
    if (results.length === 0) return []

    const list = results.map((r, i) => `${i + 1}. "${r.title}"\n   ${r.snippet.slice(0, 100)}`).join('\n\n')
    const prompt = `Query: "${query}"\n\nFor each source, write ONE sentence justifying its relevance:\n${list}\n\nReturn ONLY a JSON array of ${results.length} strings.`

    let justifications: string[] = results.map(() => 'Relevant market intelligence source.')
    try {
        const raw = await groqComplete('Return ONLY a JSON array of strings.', prompt, { temperature: 0.2, maxTokens: 600 })
        const match = raw.match(/\[[\s\S]*\]/)
        if (match) {
            const parsed = JSON.parse(match[0]) as string[]
            if (parsed.length === results.length) justifications = parsed
        }
    } catch {}

    return results.map((r, i) => ({
        title: r.title,
        source: extractDomain(r.link),
        link: r.link,
        summary: r.snippet,
        justification: justifications[i] || ''
    }))
}

function extractDomain(url: string): string {
    try { return new URL(url).hostname.replace('www.', '') } catch { return url }
}

function currentYear(): string {
    return new Date().getFullYear().toString()
}
