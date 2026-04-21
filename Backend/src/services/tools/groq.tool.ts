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
        config.AI.GROQ_API_KEY_3
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

export async function groqChat(messages: GroqMessage[], opts: { temperature?: number; maxTokens?: number } = {}): Promise<GroqResponse> {
    const { temperature = 0.7, maxTokens = 4096 } = opts

    const MAX_ATTEMPTS = getKeyPool().length

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const keyState = pickAvailableKey()

        if (!keyState) {
            // All keys exhausted — find the one that resets soonest
            const pool = getKeyPool()
            const soonest = pool.reduce((a, b) => a.rateLimitedUntil < b.rateLimitedUntil ? a : b)
            const waitSec = Math.ceil((soonest.rateLimitedUntil - Date.now()) / 1000)
            const mins = Math.floor(waitSec / 60)
            const secs = waitSec % 60
            const waitStr = mins > 0 ? `${mins}m${secs}s` : `${secs}s`
            throw new Error(`All API keys are rate-limited — please try again in ${waitStr}.`)
        }

        const client = getClientForKey(keyState.key)

        try {
            const completion = await client.chat.completions.create({
                model: config.AI.GROQ_MODEL,
                messages,
                temperature,
                max_tokens: maxTokens
            })

            const choice = completion.choices[0]
            return {
                content: choice.message.content || '',
                usage: {
                    promptTokens: completion.usage?.prompt_tokens || 0,
                    completionTokens: completion.usage?.completion_tokens || 0
                },
                model: completion.model
            }
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err)
            const isRateLimit = errMsg.includes('429') || errMsg.includes('rate_limit_exceeded')

            if (isRateLimit) {
                const waitMs = parseWaitMs(errMsg)
                markKeyRateLimited(keyState.key, waitMs)
                // Loop continues — tries next available key
                continue
            }

            logger.error('Groq chat failed (non-rate-limit)', { meta: err })
            throw err
        }
    }

    // Should not reach here, but satisfy TypeScript
    throw new Error('All API keys are rate-limited — please try again later.')
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

export async function detectIntent(query: string): Promise<{ mode: 'learning' | 'leads' | 'chat' | 'mixed'; confidence: number; reasoning: string }> {
    const prompt = `Classify this user query. Understand all languages including English, Urdu, Roman Urdu, and mixed. Respond with ONLY valid JSON.

Query: "${query}"

Rules:
- "learning": asking to learn, explain, research, understand, find information, aik topic samjhao, research karo
- "leads": asking to find companies, businesses, generate leads, find clients, sales prospects, leads chahiye, companies dhundho
- "chat": casual conversation, greetings, small talk, general questions without research need, normal baat cheet
- "mixed": combination of learning and leads

JSON format: {"mode": "learning|leads|chat|mixed", "confidence": 0.0-1.0, "reasoning": "brief reason"}`

    try {
        const raw = await groqComplete('You are an intent classifier. Respond with ONLY valid JSON.', prompt, { temperature: 0.2, maxTokens: 150 })
        const match = raw.match(/\{[\s\S]*?\}/)
        if (match) {
            return JSON.parse(match[0]) as { mode: 'learning' | 'leads' | 'chat' | 'mixed'; confidence: number; reasoning: string }
        }
    } catch {
        // default
    }
    return { mode: 'chat', confidence: 0.5, reasoning: 'Could not classify, defaulting to chat' }
}
