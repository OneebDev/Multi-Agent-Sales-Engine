import { addMessage, getOrCreateSession, updateLeadsContext, getLeadsContext, addMarketIntelContext, getMarketIntelHistory, getUnifiedHistory, SessionMessage, updateGlobalContext, getGlobalContext } from './session-memory'
import { runLearningPipeline, LearningResponse } from '../pipelines/learning.pipeline'
import { runLeadsPipeline, LeadsResponse } from '../pipelines/leads.pipeline'
import { runNormalChat, NormalChatResponse } from './normal-chat.service'
import { runMarketIntel, isMarketIntelQuery, MarketIntelResponse } from './market-intel.service'
import { getDomainSector, normalizeSector } from './sector-mapper'
import { detectLanguage } from './language-detector'
import { sanitizeInput } from '../utils/sanitizer'
import logger from '../../handlers/logger'

export type OrchestratorMode = 'learning' | 'leads' | 'chat' | 'auto' | 'job-hunter'

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
    mode: OrchestratorMode | 'market-intel'
    success: boolean
    category: string
    language: 'en' | 'ur' | 'roman-ur'
    response: LearningResponse | LeadsResponse | NormalChatResponse | MarketIntelResponse | any
    data?: any
    insights?: string[]
    needsMoreInfo?: { fields: string[]; message: string }
    detectedLanguage?: string
    timestamp: string
    metadata?: {
        intent?: string
        confidence?: number
        reasoning?: string
        routed_to?: OrchestratorMode
    }
}

const REQUIRED_LEADS_FIELDS = ['domain', 'sector', 'country'] as const

export async function orchestrate(input: OrchestratorInput): Promise<OrchestratorOutput> {
    const { sessionId } = input
    const query = sanitizeInput(input.query)
    
    if (!query) {
        throw new Error('Please enter a valid query.')
    }

    getOrCreateSession(sessionId)
    const ts = new Date().toISOString()
    const detectedLang = detectLanguage(query)
    const languageCode: 'en' | 'ur' | 'roman-ur' = detectedLang === 'urdu' ? 'ur' : (detectedLang === 'roman-urdu' ? 'roman-ur' : 'en')

    logger.info('Orchestrator: received query', { meta: { sessionId, mode: input.mode, querySnippet: query.slice(0, 80) } })
    
    // ─── 0. Unified Context Fetching ──────────────────────────────────────────
    const prevContext = getGlobalContext(sessionId)

    // ─── 1. Intent & Extraction Pipeline (One-Call Contextual Router) ──────────────
    const unifiedHistory = getUnifiedHistory(sessionId, 5) 
    const routerResult = await runConsolidatedRouter(query, unifiedHistory)
    
    // ─── 2. Brain Upgrade: Context Inheritance & Merging ──────────────────────
    // Rule: merged_context = previous_context + new_input
    const mergedContext = {
        domain: routerResult.domain || prevContext.domain || input.domain,
        sector: routerResult.sector || prevContext.sector || input.sector,
        country: routerResult.country || prevContext.country || input.country,
        city: routerResult.city || prevContext.city || input.city
    }
    
    // Update both global and specific contexts
    updateGlobalContext(sessionId, mergedContext)
    updateLeadsContext(sessionId, mergedContext)

    const confidenceThreshold = 0.6
    
    let effectiveMode: OrchestratorMode
    
    if (input.mode === 'auto') {
        const isCasual = query.trim().length < 60 && /^(hi|hello|hey|salam|salaam|helo|hii|howdy|good\s*(morning|evening|afternoon|night)|how\s+are\s+you|kya\s+haal|kaise\s+ho|what'?s\s+up|sup|yo|thanks|thank\s+you|shukriya|ok|okay|great|nice|cool|bye|goodbye|khuda\s+hafiz|help|info|options)/i.test(query.trim())
        
        if (isCasual) {
            effectiveMode = 'chat'
        } else if (routerResult.confidence < confidenceThreshold) {
            effectiveMode = 'chat' 
        } else {
            effectiveMode = routerResult.mode === 'mixed' ? 'learning' : (routerResult.mode as OrchestratorMode)
        }
    } else {
        effectiveMode = input.mode
    }

    addMessage(sessionId, 'user', query, input.mode, {
        intent: routerResult.mode,
        confidence: routerResult.confidence,
        reasoning: routerResult.reasoning
    })

    const outputMetadata = {
        intent: routerResult.mode,
        confidence: routerResult.confidence,
        reasoning: routerResult.reasoning,
        routed_to: input.mode === 'auto' ? effectiveMode : undefined
    }

    // Category Mapping (For UI Headers)
    let category = 'Chat'
    if (effectiveMode === 'job-hunter') category = 'Career & Jobs'
    else if (effectiveMode === 'learning') category = 'Deep Research'
    else if (effectiveMode === 'leads') category = 'Lead Intelligence'

    // ─── Chat mode ─────────────────────────────────────────────────────────────
    if (effectiveMode === 'chat') {
        try {
            const chatRes = await runNormalChat(sessionId, query)
            addMessage(sessionId, 'assistant', chatRes.reply, effectiveMode, outputMetadata)
            return { 
                sessionId, 
                mode: input.mode, // Maintain user's screen context
                success: true,
                category,
                language: languageCode,
                response: chatRes.reply,
                data: chatRes,
                insights: [],
                timestamp: ts, 
                metadata: outputMetadata 
            }
        } catch (err) {
            throw new Error(err instanceof Error ? err.message : 'Chat failed. Please try again.')
        }
    }

    // ─── Leads mode ────────────────────────────────────────────────────────────
    if (effectiveMode === 'leads') {
        if (input.domain) updateLeadsContext(sessionId, { domain: input.domain })
        if (input.sector) updateLeadsContext(sessionId, { sector: input.sector })
        if (input.country) updateLeadsContext(sessionId, { country: input.country })
        if (input.city) updateLeadsContext(sessionId, { city: input.city })

        const requestedCount = routerResult.count ?? input.count ?? 10
        const ctx = getLeadsContext(sessionId) ?? {}

        // Market Intelligence Sub-Route
        if (isMarketIntelQuery(query)) {
            const history = getMarketIntelHistory(sessionId)
            const marketRes = await runMarketIntel(query, ctx.domain, ctx.sector, history)
            addMarketIntelContext(sessionId, {
                topic: marketRes.topic,
                domain: ctx.domain,
                sector: ctx.sector,
                keyFindings: marketRes.keyInsights.slice(0, 3),
                timestamp: ts
            })
            addMessage(sessionId, 'assistant', marketRes.recommendation, input.mode)
            return { 
                sessionId, 
                mode: input.mode, 
                success: true,
                category: 'Market Intelligence',
                language: languageCode,
                response: marketRes.recommendation,
                data: marketRes,
                insights: marketRes.keyInsights,
                timestamp: ts 
            }
        }

        if (!ctx.sector && ctx.domain) {
            const autoSector = getDomainSector(ctx.domain)
            if (autoSector) updateLeadsContext(sessionId, { sector: autoSector })
        }

        if (ctx.sector) {
            const normalized = normalizeSector(ctx.sector)
            if (normalized !== ctx.sector) updateLeadsContext(sessionId, { sector: normalized })
        }

        const refreshedCtx = getLeadsContext(sessionId) ?? {}
        const missing = REQUIRED_LEADS_FIELDS.filter((f) => !refreshedCtx[f])

        if (missing.length > 0) {
            const { requestedSources, ...primitiveCtx } = refreshedCtx
            const clarificationMsg = buildClarificationMessage(missing, primitiveCtx as Record<string, string | undefined>, detectedLang)
            addMessage(sessionId, 'assistant', clarificationMsg, input.mode)
            return {
                sessionId,
                mode: input.mode,
                success: false,
                category: 'Lead Intelligence',
                language: languageCode,
                response: clarificationMsg,
                needsMoreInfo: { fields: Array.from(missing), message: clarificationMsg },
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
            count: requestedCount,
            requestedSources: refreshedCtx.requestedSources
        })

        const summaryText = `Generated ${leadsRes.leads.length} leads for ${refreshedCtx.domain ?? ''} in ${refreshedCtx.sector ?? ''} (${refreshedCtx.country ?? ''}).`
        addMessage(sessionId, 'assistant', summaryText, input.mode, outputMetadata)
        return { 
            sessionId, 
            mode: input.mode, 
            success: true,
            category: 'Lead Intelligence',
            language: languageCode,
            response: summaryText,
            data: leadsRes,
            insights: leadsRes.processingNotes.slice(0, 5),
            timestamp: ts, 
            metadata: outputMetadata 
        }
    }

    // ─── Job Hunter mode ───────────────────────────────────────────────────────
    if (effectiveMode === 'job-hunter') {
        try {
            const { runJobHunterPipeline } = await import('../pipelines/job-hunter.pipeline')
            const jobRes = await runJobHunterPipeline({ 
                sessionId, 
                query, 
                detectedLanguage: detectedLang 
            })
            
            addMessage(sessionId, 'assistant', jobRes.content, input.mode, outputMetadata)
            
            return {
                sessionId,
                mode: input.mode,
                success: true,
                category: 'Career & Jobs',
                language: languageCode,
                response: jobRes.content,
                data: jobRes,
                insights: jobRes.jobs ? [`Found ${jobRes.jobs.length} matching roles`] : [],
                timestamp: ts,
                metadata: outputMetadata
            }
        } catch (err) {
            logger.error('Orchestrator: Job Hunter critical failure', { meta: { sessionId, err: err instanceof Error ? err.stack : err } })
            
            return {
                sessionId,
                mode: input.mode,
                success: false,
                category: 'Career & Jobs',
                language: languageCode,
                response: "I'm sorry, the Job Hunter experienced a technical difficulty. I've logged the error and will improve. For now, please try a simpler search or check back in a few minutes.",
                data: null,
                insights: ['System encountered a processing error'],
                timestamp: ts,
                metadata: outputMetadata
            }
        }
    }

    // ─── Learning mode ─────────────────────────────────────────────────────────
    try {
        const learningRes = await runLearningPipeline({ sessionId, query })
        addMessage(sessionId, 'assistant', learningRes.simpleExplanation, input.mode, outputMetadata)
        return { 
            sessionId, 
            mode: input.mode, 
            success: true,
            category: 'Deep Research',
            language: languageCode,
            response: learningRes.simpleExplanation,
            data: learningRes,
            insights: learningRes.notes,
            timestamp: ts, 
            metadata: outputMetadata 
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.'
        throw new Error(msg)
    }
}

// ─── Updated Consolidated Router (Context Aware) ─────────────────────────────

interface RouterResult extends ExtractedLeadsContext {
    mode: 'learning' | 'leads' | 'chat' | 'job-hunter' | 'mixed'
    confidence: number
    reasoning: string
}

async function runConsolidatedRouter(query: string, history: SessionMessage[] = []): Promise<RouterResult> {
    const { groqChatUtility } = await import('../tools/groq.tool')
    
    // Convert history to Groq format
    const historySnippet = history
        .map(h => `${h.role.toUpperCase()}: ${h.content.slice(0, 150)}`)
        .join('\n')

    const prompt = `You are the master router for an AI business engine. Analyze the query and history to determine user intent.
    
FEW-SHOT EXAMPLES:
1. "Leads nikaalo Solar ke liye Pakistan mein" -> { "mode": "leads", "domain": "Solar Panels", "country": "Pakistan" }
2. "How does photosynthesis work?" -> { "mode": "learning" }
3. "Theek hai, ab London mein nikaalo" + HISTORY(Solar Pakistan) -> { "mode": "leads", "domain": "Solar Panels", "country": "UK", "city": "London" }

CONTEXT HISTORY (USE THIS TO INHERIT DOMAIN/LOCATION IF MISSING):
${historySnippet || 'None'}

CURRENT QUERY: "${query}"

Return ONLY valid JSON:
{
  "mode": "learning" | "leads" | "chat" | "job-hunter" | "mixed",
  "confidence": 0-1,
  "reasoning": "brief why",
  "domain": "product being sold OR INHERITED VALUE or null",
  "sector": "industry OR INHERITED VALUE or null",
  "country": "country OR INHERITED VALUE or null",
  "city": "city OR INHERITED VALUE or null",
  "count": number or null
}`

    try {
        const res = await groqChatUtility([{ role: 'system', content: prompt }])
        const match = res.content.match(/\{[\s\S]*\}/)
        if (!match) throw new Error('Router parse failed')
        return JSON.parse(match[0]) as RouterResult
    } catch {
        return { mode: 'chat', confidence: 0.5, reasoning: 'fallback' }
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

interface LeadSourceConfig {
    source: 'google' | 'linkedin' | 'facebook' | 'instagram' | 'twitter' | 'other'
    count?: number
}

interface ExtractedLeadsContext {
    domain?: string
    sector?: string
    country?: string
    city?: string
    count?: number
    requestedSources?: LeadSourceConfig[]
}

export async function extractLeadsContextFromQuery(query: string): Promise<ExtractedLeadsContext> {
    try {
        const { groqComplete } = await import('../tools/groq.tool')
        const raw = await groqComplete(
            'You are a high-precision business lead extraction engine. Respond ONLY with valid JSON.',
            `Extract leads search context from this query (may be in English, Urdu, or Roman Urdu like "Solar bechna hai Dubai mein", "Hospital leads nikaalo", etc.).

Target Fields:
- "domain": The product/service the user is selling (e.g. "Solar panels", "SEO").
- "sector": The industry they are targeting (e.g. "Healthcare", "Real Estate").
- "country": Target country.
- "city": Target city.

Query: "${query}"

Return ONLY this JSON (use null for fields not mentioned):
{
  "domain": "product or service being sold or null",
  "sector": "target industry/sector or null",
  "country": "target country or null",
  "city": "specific city or null",
  "count": number of total leads requested or null,
  "requestedSources": [
    { "source": "google|linkedin|facebook|instagram|twitter", "count": number }
  ] or null
}`,
            { temperature: 0.1, maxTokens: 400 }
        )
        const match = raw.match(/\{[\s\S]*\}/)
        if (!match) return {}
        const parsed = JSON.parse(match[0]) as any
        const result: ExtractedLeadsContext = {}
        if (parsed.domain && parsed.domain !== 'null') result.domain = String(parsed.domain)
        if (parsed.sector && parsed.sector !== 'null') result.sector = String(parsed.sector)
        if (parsed.country && parsed.country !== 'null') result.country = String(parsed.country)
        if (parsed.city && parsed.city !== 'null') result.city = String(parsed.city)
        if (parsed.count && parsed.count !== null) result.count = Number(parsed.count)
        if (parsed.requestedSources && Array.isArray(parsed.requestedSources)) {
            result.requestedSources = parsed.requestedSources
        }
        return result
    } catch {
        return {}
    }
}
