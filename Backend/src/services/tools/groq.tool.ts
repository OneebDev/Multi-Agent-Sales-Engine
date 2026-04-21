import Groq from 'groq-sdk'
import config from '../../config/config'
import logger from '../../handlers/logger'

export interface GroqMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

export interface GroqResponse {
    content: string
    usage: { promptTokens: number; completionTokens: number }
    model: string
}

// ─── Key rotation pool ────────────────────────────────────────────────────────

const UTILITY_MODEL = 'llama-3.1-8b-instant'

// Tracks which keys are rate-limited and when they reset
interface KeyState {
    key: string
    rateLimitedUntil: number  // epoch ms, 0 = available
}

let _keyPool: KeyState[] | null = null
let _clients: Map<string, Groq> = new Map()
let _currentKeyIndex = 0

function getKeyPool(): KeyState[] {
    if (_keyPool) return _keyPool
    const keys = [
        config.AI.GROQ_API_KEY,
        config.AI.GROQ_API_KEY_2,
        config.AI.GROQ_API_KEY_3,
        config.AI.GROQ_API_KEY_4
    ].filter(Boolean)
    if (keys.length === 0) throw new Error('No GROQ_API_KEY configured')
    _keyPool = keys.map((key) => ({ key, rateLimitedUntil: 0 }))
    logger.info(`Groq key pool initialized with ${_keyPool.length} key(s)`)
    return _keyPool
}

function getClientForKey(key: string): Groq {
    if (!_clients.has(key)) {
        _clients.set(key, new Groq({ apiKey: key }))
    }
    return _clients.get(key)!
}

function pickAvailableKey(): KeyState | null {
    const pool = getKeyPool()
    const now = Date.now()

    // Try round-robin starting from current index
    for (let i = 0; i < pool.length; i++) {
        const idx = (_currentKeyIndex + i) % pool.length
        const state = pool[idx]
        if (state.rateLimitedUntil === 0 || now >= state.rateLimitedUntil) {
            state.rateLimitedUntil = 0  // clear expired limit
            _currentKeyIndex = (idx + 1) % pool.length  // advance for next call
            return state
        }
    }
    return null  // all keys exhausted
}

function markKeyRateLimited(key: string, waitMs: number): void {
    const pool = getKeyPool()
    const state = pool.find((k) => k.key === key)
    if (state) {
        state.rateLimitedUntil = Date.now() + waitMs
        logger.warn(`Groq key ...${key.slice(-6)} rate-limited for ${Math.round(waitMs / 1000)}s — rotating to next key`)
    }
}

function parseWaitMs(errMsg: string): number {
    // "try again in 13m41.664s"
    const m = errMsg.match(/try again in (?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?/)
    if (m) {
        const mins = parseInt(m[1] || '0')
        const secs = parseFloat(m[2] || '0')
        return (mins * 60 + secs) * 1000 + 5000  // +5s buffer
    }
    return 15 * 60 * 1000  // default 15 min if not parseable
}

// ─── Core chat function with auto key rotation ────────────────────────────────

export async function groqChat(
    messages: GroqMessage[], 
    options: { temperature?: number; maxTokens?: number; model?: string } = {}
): Promise<GroqMessage> {
    const targetModels = options.model 
        ? [options.model] 
        : [config.AI.GROQ_MODEL, ...config.AI.GROQ_FALLBACK_MODELS, UTILITY_MODEL]
    const pool = getKeyPool()
    const poolSize = pool.length

    // Nested Rotation: For each model, try all available keys round-robin
    for (const targetModel of targetModels) {
        logger.info(`Groq: Attempting with model ${targetModel}`)

        for (let attempt = 0; attempt < poolSize; attempt++) {
            const keyState = pickAvailableKey()

            if (!keyState) {
                // Smart Staggered Backoff (v10): 
                // Incremental wait to avoid hammering while maintaining speed
                const backoff = attempt === 0 ? 100 : attempt === 1 ? 300 : 800
                const jitter = Math.random() * 200
                await new Promise(r => setTimeout(r, backoff + jitter))
                continue
            }

            const client = getClientForKey(keyState.key)

            try {
                const completion = await client.chat.completions.create({
                    model: targetModel,
                    messages,
                    temperature: options.temperature ?? 0.7,
                    max_tokens: options.maxTokens ?? 1024
                })

                const choice = completion.choices[0]
                return {
                    role: 'assistant',
                    content: choice.message.content || ''
                }
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err)
                const isRateLimit = errMsg.includes('429') || errMsg.includes('rate_limit_exceeded')

                if (isRateLimit) {
                    const waitMs = parseWaitMs(errMsg)
                    markKeyRateLimited(keyState.key, waitMs)
                    logger.warn(`Groq: Key rotation fallback from ...${keyState.key.slice(-6)} on ${targetModel} due to rate limit.`)
                    continue
                }

                logger.error('Groq chat failed (non-rate-limit)', { meta: err })
                throw err
            }
        }
    }

    // If we reached here, ALL models and ALL keys failed
    logger.error('GroqPool: TOTAL EXHAUSTION. All models and keys rate-limited.', { meta: { messagesCount: messages.length } })
    
    // Final desperate retry with utility model - shorter wait to avoid 504
    await new Promise(r => setTimeout(r, 1000))
    try {
        const apiKeys = pool.map(p => p.key)
        const groq = new Groq({ apiKey: apiKeys[0] })
        const res = await groq.chat.completions.create({
            model: UTILITY_MODEL,
            messages,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens ?? 1024
        })
        const content = res.choices[0]?.message?.content || ''
        return { role: 'assistant', content }
    } catch {
        throw new Error('AI Engine is currently at maximum capacity. Please wait 30-60 seconds and try again (Prevents Gateway Timeout).')
    }
}

/**
 * Utility version of groqChat — uses 8b model by default for high RPM tasks (routing/intent)
 */
export async function groqChatUtility(
    messages: GroqMessage[],
    options: { temperature?: number; maxTokens?: number } = {}
): Promise<GroqMessage> {
    return groqChat(messages, { 
        ...options, 
        model: UTILITY_MODEL,
        maxTokens: options.maxTokens ?? 512 
    })
}

export async function groqComplete(systemPrompt: string, userPrompt: string, opts: { temperature?: number; maxTokens?: number } = {}): Promise<string> {
    const res = await groqChat(
        [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        opts
    )
    return res.content
}

export async function expandQuery(query: string): Promise<string[]> {
    const prompt = `You are a search query expansion expert. Given the user query below, generate 3 alternative, specific search queries that will find the most relevant information.

User query: "${query}"

Return ONLY a JSON array of 3 strings. No explanation. Example: ["query1", "query2", "query3"]`

    try {
        const raw = await groqComplete('You are a search query expansion expert.', prompt, { temperature: 0.5, maxTokens: 256 })
        const match = raw.match(/\[[\s\S]*?\]/)
        if (match) return JSON.parse(match[0]) as string[]
    } catch {
        // fall back to original query on parse error
    }
    return [query]
}

export interface IntentResult {
    mode: 'learning' | 'leads' | 'chat' | 'job-hunter' | 'auto' | 'mixed'
    confidence: number
    secondary_intent?: string
    reasoning: string
}

export async function detectIntent(query: string): Promise<IntentResult> {
    const prompt = `You are a high-precision Intent Engine. Analyze this user query (any language: English, Urdu, Roman Urdu like "kaise ho", "job dhundo", or Mixed).
Query: "${query}"

Categories:
- "learning": Research, explanations, educational papers, videos (e.g. "explain X", "what is Y", "samjhao").
- "leads": Finding companies, sales prospects, business profiles (e.g. "find tech companies", "hospital leads", "bizness dhundo").
- "chat": Casual conversation, greetings, small talk (e.g. "hi", "how are you", "kaise ho").
- "job-hunter": Job search, career advice, salary info, resume help (e.g. "software jobs", "salary in London", "career roadmap").
- "mixed": Multiple specific categories involved.

Return ONLY valid JSON:
{
  "mode": "learning|leads|chat|job-hunter|mixed",
  "confidence": number 0.0-1.0,
  "secondary_intent": "optional specific detail or null",
  "reasoning": "brief explanation (recognize Roman Urdu if present)"
}`

    try {
        const raw = await groqComplete('You are a production-grade Intent Engine. Respond with ONLY valid JSON.', prompt, { temperature: 0.1, maxTokens: 250 })
        const match = raw.match(/\{[\s\S]*?\}/)
        if (match) {
            const parsed = JSON.parse(match[0])
            return {
                mode: parsed.mode || 'chat',
                confidence: parsed.confidence || 0.5,
                secondary_intent: parsed.secondary_intent || undefined,
                reasoning: parsed.reasoning || 'No reasoning provided'
            }
        }
    } catch (err) {
        logger.error('Intent detection failed', { meta: err })
    }
    return { mode: 'chat', confidence: 0.5, reasoning: 'Defaulting to chat due to error' }
}
// ─── Consolidated Fast Router ────────────────────────────────────────────────
export interface RouterResult extends IntentResult {
    domain?: string
    sector?: string
    country?: string
    city?: string
    count?: number
}

export async function runConsolidatedRouter(query: string): Promise<RouterResult> {
    const prompt = `You are a high-precision Intent & Entity Engine. Analyze this user query.
Query: "${query}"

Categories:
- "learning": Research, explanations, papers, videos.
- "leads": Finding companies, sales prospects, business profiles.
- "chat": Casual conversation, greetings, small talk.
- "job-hunter": Job search, career advice, salary info.
- "mixed": Multiple specific categories.

If "leads", also extract (if present):
- "domain": Product/service they sell.
- "sector": Industry they target.
- "country": Target country.
- "city": Target city.

Return ONLY valid JSON:
{
  "mode": "learning|leads|chat|job-hunter|mixed",
  "confidence": number,
  "reasoning": "brief explanation",
  "domain": "string or null",
  "sector": "string or null",
  "country": "string or null",
  "city": "string or null",
  "count": number or null
}`

    try {
        const raw = await groqComplete('You are a production-grade router. Respond with ONLY valid JSON.', prompt, { temperature: 0.1, maxTokens: 500 })
        const match = raw.match(/\{[\s\S]*?\}/)
        if (match) return JSON.parse(match[0])
    } catch (err) {
        logger.error('Router failed', { meta: err })
    }
    return { mode: 'chat', confidence: 0.5, reasoning: 'Defaulting to chat due to error' }
}
