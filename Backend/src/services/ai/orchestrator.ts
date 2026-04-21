import { detectIntent } from '../tools/groq.tool'
import { addMessage, getOrCreateSession, updateLeadsContext, getLeadsContext, addMarketIntelContext, getMarketIntelHistory } from './session-memory'
import { runLearningPipeline, LearningResponse } from '../pipelines/learning.pipeline'
import { runLeadsPipeline, LeadsResponse } from '../pipelines/leads.pipeline'
import { runNormalChat, NormalChatResponse } from './normal-chat.service'
import { runMarketIntel, isMarketIntelQuery, MarketIntelResponse } from './market-intel.service'
import { getDomainSector, normalizeSector } from './sector-mapper'
import { detectLanguage } from './language-detector'
import logger from '../../handlers/logger'

export type OrchestratorMode = 'learning' | 'leads' | 'chat' | 'auto'

export interface OrchestratorInput {
    sessionId: string
    query: string
    mode: OrchestratorMode
    domain?: string
    sector?: string
    country?: string
    city?: string
    count?: number
}

export interface OrchestratorOutput {
    sessionId: string
    mode: 'learning' | 'leads' | 'chat' | 'market-intel'
    response: LearningResponse | LeadsResponse | NormalChatResponse | MarketIntelResponse
    needsMoreInfo?: { fields: string[]; message: string }
    detectedLanguage?: string
    timestamp: string
}

const REQUIRED_LEADS_FIELDS = ['domain', 'sector', 'country'] as const

export async function orchestrate(input: OrchestratorInput): Promise<OrchestratorOutput> {
    const { sessionId, query } = input
    getOrCreateSession(sessionId)
    const ts = new Date().toISOString()

    logger.info('Orchestrator: received query', { meta: { sessionId, mode: input.mode, querySnippet: query.slice(0, 80) } })

    addMessage(sessionId, 'user', query)

    const detectedLang = detectLanguage(query)

    // ─── Determine effective mode ──────────────────────────────────────────────
    let effectiveMode: 'learning' | 'leads' | 'chat'

    if (input.mode === 'auto') {
        // Fast-path: short casual messages are always chat — skip LLM for speed
        const isCasual = query.trim().length < 60 && /^(hi|hello|hey|salam|salaam|helo|hii|howdy|good\s*(morning|evening|afternoon|night)|how\s+are\s+you|kya\s+haal|kaise\s+ho|what'?s\s+up|sup|yo|thanks|thank\s+you|shukriya|ok|okay|great|nice|cool|bye|goodbye|khuda\s+hafiz)/i.test(query.trim())
        if (isCasual) {
            effectiveMode = 'chat'
            logger.info('Orchestrator: fast-path casual chat detected', { meta: { query: query.slice(0, 40) } })
        } else {
            const intent = await detectIntent(query)
            effectiveMode = intent.mode === 'mixed' ? 'learning'
                : intent.mode === 'chat' ? 'chat'
                : (intent.mode as 'learning' | 'leads')
            logger.info('Orchestrator: intent detected', { meta: { intent, detectedLang } })
        }
    } else if (input.mode === 'chat') {
        effectiveMode = 'chat'
    } else if (input.mode === 'leads') {
        effectiveMode = 'leads'
    } else {
        effectiveMode = 'learning'
    }

    // ─── Chat mode ─────────────────────────────────────────────────────────────
    if (effectiveMode === 'chat') {
        try {
            const chatRes = await runNormalChat(sessionId, query)
            return { sessionId, mode: 'chat', response: chatRes, detectedLanguage: detectedLang, timestamp: ts }
        } catch (err) {
            throw new Error(err instanceof Error ? err.message : 'Chat failed. Please try again.')
        }
    }

    // ─── Leads mode ────────────────────────────────────────────────────────────
    if (effectiveMode === 'leads') {
        // Extract context from the query first (LLM, any language/format)
        const extracted = await extractLeadsContextFromQuery(query)

        // If a new domain is detected, reset sector/city so they don't stick from a previous request
        if (extracted.domain) {
            const prev = getLeadsContext(sessionId) ?? {}
            if (prev.domain && prev.domain.toLowerCase() !== extracted.domain.toLowerCase()) {
                updateLeadsContext(sessionId, { domain: extracted.domain, sector: extracted.sector, country: extracted.country, city: extracted.city })
            } else {
                updateLeadsContext(sessionId, { domain: extracted.domain })
                if (extracted.sector) updateLeadsContext(sessionId, { sector: extracted.sector })
                if (extracted.country) updateLeadsContext(sessionId, { country: extracted.country })
                if (extracted.city) updateLeadsContext(sessionId, { city: extracted.city })
            }
        } else {
            if (extracted.sector) updateLeadsContext(sessionId, { sector: extracted.sector })
            if (extracted.country) updateLeadsContext(sessionId, { country: extracted.country })
            if (extracted.city) updateLeadsContext(sessionId, { city: extracted.city })
        }

        // Explicit form fields always override
        if (input.domain) updateLeadsContext(sessionId, { domain: input.domain })
        if (input.sector) updateLeadsContext(sessionId, { sector: input.sector })
        if (input.country) updateLeadsContext(sessionId, { country: input.country })
        if (input.city) updateLeadsContext(sessionId, { city: input.city })

        // Count from query overrides input param
        const requestedCount = extracted.count ?? input.count ?? 10

        const ctx = getLeadsContext(sessionId) ?? {}

        // ── Market Intelligence sub-route (best country/sector/city etc.) ────────
        if (isMarketIntelQuery(query)) {
            logger.info('Orchestrator: market intel query detected', { meta: { sessionId } })
            const history = getMarketIntelHistory(sessionId)
            const marketRes = await runMarketIntel(query, ctx.domain, ctx.sector, history)
            // Save this query's findings to session history for future comparisons
            addMarketIntelContext(sessionId, {
                topic: marketRes.topic,
                domain: ctx.domain,
                sector: ctx.sector,
                keyFindings: marketRes.keyInsights.slice(0, 3),
                timestamp: ts
            })
            addMessage(sessionId, 'assistant', marketRes.recommendation, 'leads')
            return { sessionId, mode: 'market-intel', response: marketRes, detectedLanguage: detectedLang, timestamp: ts }
        }

        // ── Auto-fill sector from domain if domain is known but sector is not ────
        if (!ctx.sector && ctx.domain) {
            const autoSector = getDomainSector(ctx.domain)
            if (autoSector) {
                updateLeadsContext(sessionId, { sector: autoSector })
                logger.info('Orchestrator: auto-mapped sector from domain', { meta: { domain: ctx.domain, sector: autoSector } })
            }
        }

        // Normalize sector if present
        if (ctx.sector) {
            const normalized = normalizeSector(ctx.sector)
            if (normalized !== ctx.sector) updateLeadsContext(sessionId, { sector: normalized })
        }

        const refreshedCtx = getLeadsContext(sessionId) ?? {}

        // ── Standard leads ────────────────────────────────────────────────────────
        const missing = REQUIRED_LEADS_FIELDS.filter((f) => !refreshedCtx[f])

        if (missing.length > 0) {
            const clarificationMsg = buildClarificationMessage(missing, refreshedCtx, detectedLang)
            addMessage(sessionId, 'assistant', clarificationMsg, 'leads')
            return {
                sessionId,
                mode: 'leads',
                response: { type: 'clarification', message: clarificationMsg } as unknown as LeadsResponse,
                needsMoreInfo: { fields: Array.from(missing), message: clarificationMsg },
                detectedLanguage: detectedLang,
                timestamp: ts
            }
        }

        const leadsRes = await runLeadsPipeline({
            sessionId,
            query,
            domain: refreshedCtx.domain!,
            sector: refreshedCtx.sector!,
            country: refreshedCtx.country!,
            city: refreshedCtx.city,
            count: requestedCount
        })

        addMessage(sessionId, 'assistant', `Generated ${leadsRes.leads.length} leads for ${refreshedCtx.domain ?? ''} in ${refreshedCtx.sector ?? ''} (${refreshedCtx.country ?? ''})`, 'leads')
        return { sessionId, mode: 'leads', response: leadsRes, detectedLanguage: detectedLang, timestamp: ts }
    }

    // ─── Learning mode ─────────────────────────────────────────────────────────
    try {
        const learningRes = await runLearningPipeline({ sessionId, query })
        addMessage(sessionId, 'assistant', learningRes.simpleExplanation, 'learning')
        return { sessionId, mode: 'learning', response: learningRes, detectedLanguage: detectedLang, timestamp: ts }
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.'
        throw new Error(msg)
    }
}

// ─── Clarification message (multi-language) ───────────────────────────────────

function buildClarificationMessage(
    missing: readonly string[],
    existing: Record<string, string | undefined>,
    lang: string
): string {
    const isUrdu = lang === 'urdu'
    const isRomanUrdu = lang === 'roman-urdu' || lang === 'mixed'

    if (isUrdu) {
        const labels: Record<string, string> = {
            domain: 'آپ کیا بیچنا چاہتے ہیں؟ (مثلاً: AI chatbot, CRM سافٹ ویئر، SEO)',
            sector: 'کون سی انڈسٹری ہدف ہے؟ (مثلاً: ریستوران، صحت، رئیل اسٹیٹ)',
            country: 'کون سے ملک میں سرچ کروں؟',
            city: 'کوئی خاص شہر؟ (اختیاری)'
        }
        const questions = missing.map((f) => `• ${labels[f] || f}`).join('\n')
        return `بہترین leads ڈھونڈنے کے لیے مجھے کچھ معلومات چاہیے:\n\n${questions}`
    }

    if (isRomanUrdu) {
        const labels: Record<string, string> = {
            domain: 'Aap kya bechna chahte hain? (e.g. AI chatbot, CRM software, SEO services)',
            sector: 'Kaunsi industry target kar rahe hain? (e.g. restaurants, healthcare, real estate)',
            country: 'Kaun se country mein search karun?',
            city: 'Koi specific city? (optional)'
        }
        const questions = missing.map((f) => `• ${labels[f] || f}`).join('\n')
        const provided = Object.entries(existing).filter(([, v]) => v).map(([k, v]) => `${k}: ${v as string}`).join(', ')
        return `Mujhe kuch aur details chahiye best leads dhundne ke liye${provided ? ` (pehle se hai: ${provided})` : ''}:\n\n${questions}`
    }

    const fieldLabels: Record<string, string> = {
        domain: 'What product/service are you selling? (e.g. "AI chatbots", "CRM software", "SEO services")',
        sector: 'Which industry/sector are you targeting? (e.g. "restaurants", "healthcare", "real estate")',
        country: 'Which country should I search in?',
        city: 'Any specific city? (optional)'
    }
    const questions = missing.map((f) => `• ${fieldLabels[f] || f}`).join('\n')
    const provided = Object.entries(existing).filter(([, v]) => v).map(([k, v]) => `${k}: ${v as string}`).join(', ')
    return `I need a few more details${provided ? ` (already have: ${provided})` : ''}:\n\n${questions}`
}

// ─── Query context extractor (LLM-powered, any language) ─────────────────────

interface ExtractedLeadsContext {
    domain?: string
    sector?: string
    country?: string
    city?: string
    count?: number
}

export async function extractLeadsContextFromQuery(query: string): Promise<ExtractedLeadsContext> {
    try {
        const { groqComplete } = await import('../tools/groq.tool')
        const raw = await groqComplete(
            'You are a leads context extractor. Respond ONLY with valid JSON.',
            `Extract leads search context from this query (may be in any language — English, Urdu, Roman Urdu, mixed, etc.).

Query: "${query}"

Return ONLY this JSON (use null for fields not mentioned):
{
  "domain": "product or service being sold (e.g. 'AI chatbots', 'CRM software', 'Blockchain development') or null",
  "sector": "target industry/sector (e.g. 'fintech', 'healthcare', 'restaurants') or null",
  "country": "target country in English (e.g. 'Pakistan', 'USA', 'UAE') or null",
  "city": "specific city in English or null",
  "count": number of leads requested as integer or null
}`,
            { temperature: 0.1, maxTokens: 200 }
        )
        const match = raw.match(/\{[\s\S]*\}/)
        if (!match) return {}
        const parsed = JSON.parse(match[0]) as Record<string, string | number | null>
        const result: ExtractedLeadsContext = {}
        if (parsed.domain && parsed.domain !== 'null') result.domain = String(parsed.domain)
        if (parsed.sector && parsed.sector !== 'null') result.sector = String(parsed.sector)
        if (parsed.country && parsed.country !== 'null') result.country = String(parsed.country)
        if (parsed.city && parsed.city !== 'null') result.city = String(parsed.city)
        if (parsed.count && parsed.count !== null) result.count = Number(parsed.count)
        return result
    } catch {
        return {}
    }
}
