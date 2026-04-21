import { GroqMessage } from '../tools/groq.tool'

export interface SessionMessage {
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp: string
    mode?: 'learning' | 'leads' | 'mixed'
}

export interface MarketIntelContext {
    topic: string
    domain?: string
    sector?: string
    country?: string
    keyFindings: string[]   // brief summary of what was found
    timestamp: string
}

export interface Session {
    id: string
    messages: SessionMessage[]
    leadsContext?: {
        domain?: string
        sector?: string
        country?: string
        city?: string
    }
    marketIntelHistory: MarketIntelContext[]  // last 5 intel results for cross-query comparison
    createdAt: string
    lastActive: string
}

const MAX_MESSAGES = 20
const SESSION_TTL_MS = 60 * 60 * 1000 // 1 hour

const sessions = new Map<string, Session>()

export function getOrCreateSession(sessionId: string): Session {
    const now = new Date().toISOString()
    if (!sessions.has(sessionId)) {
        sessions.set(sessionId, {
            id: sessionId,
            messages: [],
            marketIntelHistory: [],
            createdAt: now,
            lastActive: now
        })
    }
    const session = sessions.get(sessionId)!
    session.lastActive = now
    return session
}

export function addMessage(sessionId: string, role: SessionMessage['role'], content: string, mode?: SessionMessage['mode']): void {
    const session = getOrCreateSession(sessionId)
    session.messages.push({ role, content, timestamp: new Date().toISOString(), mode })

    // Sliding window — keep only last N messages
    if (session.messages.length > MAX_MESSAGES) {
        session.messages = session.messages.slice(-MAX_MESSAGES)
    }
}

export function getGroqHistory(sessionId: string, systemPrompt: string): GroqMessage[] {
    const session = sessions.get(sessionId)
    const history: GroqMessage[] = [{ role: 'system', content: systemPrompt }]

    if (session) {
        for (const msg of session.messages.slice(-10)) {
            if (msg.role === 'user' || msg.role === 'assistant') {
                history.push({ role: msg.role, content: msg.content })
            }
        }
    }

    return history
}

export function updateLeadsContext(sessionId: string, updates: Partial<Session['leadsContext']>): void {
    const session = getOrCreateSession(sessionId)
    session.leadsContext = { ...session.leadsContext, ...updates }
}

export function getLeadsContext(sessionId: string): Session['leadsContext'] {
    return sessions.get(sessionId)?.leadsContext || {}
}

export function addMarketIntelContext(sessionId: string, ctx: MarketIntelContext): void {
    const session = getOrCreateSession(sessionId)
    session.marketIntelHistory.push(ctx)
    if (session.marketIntelHistory.length > 5) session.marketIntelHistory.shift()
}

export function getMarketIntelHistory(sessionId: string): MarketIntelContext[] {
    return sessions.get(sessionId)?.marketIntelHistory ?? []
}

export function clearSession(sessionId: string): void {
    sessions.delete(sessionId)
}

export function getSessionSummary(sessionId: string): { messageCount: number; lastActive: string } | null {
    const session = sessions.get(sessionId)
    if (!session) return null
    return { messageCount: session.messages.length, lastActive: session.lastActive }
}

// Periodic cleanup of expired sessions
setInterval(() => {
    const now = Date.now()
    for (const [id, session] of sessions.entries()) {
        if (now - new Date(session.lastActive).getTime() > SESSION_TTL_MS) {
            sessions.delete(id)
        }
    }
}, 15 * 60 * 1000)
