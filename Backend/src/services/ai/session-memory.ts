import { GroqMessage } from '../tools/groq.tool'
import logger from '../../handlers/logger'

export type SessionMode = 'learning' | 'leads' | 'chat' | 'job-hunter' | 'auto'

export interface SessionMessage {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp: string
    metadata?: {
        routed_to?: SessionMode
        intent?: string
        confidence?: number
        reasoning?: string
    }
}

export interface MarketIntelContext {
    topic: string
    domain?: string
    sector?: string
    country?: string
    keyFindings: string[]   // brief summary of what was found
    timestamp: string
}

export interface UserProfile {
    skills: string[]
    interests: string[]
    careerGoals: string[]
    preferences: Record<string, any>
    behaviorSummary: string
    intentPatterns: string[]
    usageFrequency: Record<string, number>
}

export interface Session {
    id: string
    // Segmented History (Strictly Isolated)
    history: {
        learning: SessionMessage[]
        leads: SessionMessage[]
        chat: SessionMessage[]
        'job-hunter': SessionMessage[]
        auto: SessionMessage[]
    }
    version: number // Schema version for future migrations
    userProfile: UserProfile
    leadsContext?: {
        domain?: string
        sector?: string
        country?: string
        city?: string
        requestedSources?: { source: 'google' | 'linkedin' | 'facebook' | 'instagram' | 'twitter' | 'other'; count?: number }[]
    }
    marketIntelHistory: MarketIntelContext[]  // last 5 intel results for cross-query comparison
    globalContext: {
        domain?: string
        sector?: string
        country?: string
        city?: string
    }
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
            history: {
                learning: [],
                leads: [],
                chat: [],
                'job-hunter': [],
                auto: []
            },
            version: 1,
            userProfile: { 
                skills: [], 
                interests: [], 
                careerGoals: [],
                preferences: {},
                behaviorSummary: '',
                intentPatterns: [],
                usageFrequency: {}
            },
            marketIntelHistory: [],
            globalContext: {},
            createdAt: now,
            lastActive: now
        })
    }
    const session = sessions.get(sessionId)!
    session.lastActive = now
    return session
}

import { v4 as uuid } from 'uuid'

export function addMessage(
    sessionId: string, 
    role: SessionMessage['role'], 
    content: string, 
    mode: SessionMode = 'chat',
    metadata?: SessionMessage['metadata']
): void {
    const session = getOrCreateSession(sessionId)
    const targetHistory = session.history[mode]
    
    targetHistory.push({ 
        id: uuid(),
        role, 
        content, 
        timestamp: new Date().toISOString(),
        metadata
    })

    // Update usage frequency for intelligence layer
    session.userProfile.usageFrequency[mode] = (session.userProfile.usageFrequency[mode] || 0) + 1

    // Sliding window — keep only last N messages per segment
    if (targetHistory.length > MAX_MESSAGES) {
        session.history[mode] = targetHistory.slice(-MAX_MESSAGES)
    }

    // Trigger debounced persistence (placeholder for FS/DB write)
    persistSessionDebounced(session)
}

// Persistence logic (Hardening)
const saveTimeouts = new Map<string, NodeJS.Timeout>()
function persistSessionDebounced(session: Session) {
    if (saveTimeouts.has(session.id)) {
        clearTimeout(saveTimeouts.get(session.id))
    }
    const timeout = setTimeout(() => {
        // In a real production app, this would write to MongoDB/PostgreSQL
        // For now, we simulate persistence hardening with a logger
        logger.info(`Session persisted: ${session.id}`, { meta: { version: session.version, modeMessages: Object.fromEntries(Object.entries(session.history).map(([k,v]) => [k, v.length])) } })
        saveTimeouts.delete(session.id)
    }, 500)
    saveTimeouts.set(session.id, timeout)
}

export function getGroqHistory(
    sessionId: string, 
    systemPrompt: string, 
    mode: SessionMode = 'chat',
    options: { includeUnified?: boolean; limit?: number } = {}
): GroqMessage[] {
    const session = sessions.get(sessionId)
    const history: GroqMessage[] = [{ role: 'system', content: systemPrompt }]

    if (session) {
        // 1. Contextual Inheritance for Job Hunter
        if (mode === 'job-hunter') {
            const profile = session.userProfile
            const contextStr = `[USER PROFILE CONTEXT]
Skills: ${profile.skills.join(', ') || 'None stated'}
Interests: ${profile.interests.join(', ') || 'None stated'}
Career Goals: ${profile.careerGoals.join(', ') || 'None stated'}`
            
            history.push({ role: 'system', content: contextStr })
            
            const jobHistory = session.history['job-hunter'].slice(-8)
            for (const msg of jobHistory) {
                history.push({ role: msg.role, content: msg.content })
            }
        } 
        // 2. Specialized Logic: If mode-specific history is thin (< 2 messages) but we want unified context
        else if (options.includeUnified || session.history[mode].length < 2) {
            const unified = getUnifiedHistory(sessionId, options.limit || 8)
            // Filter out system messages from unified to avoid duplicate system prompts
            for (const msg of unified.filter(m => m.role !== 'system')) {
                history.push({ role: msg.role as 'user' | 'assistant', content: msg.content })
            }
        }
        else {
            // Standard mode fallback
            const segmentHistory = session.history[mode].slice(-(options.limit || 6))
            for (const msg of segmentHistory) {
                history.push({ role: msg.role as 'user' | 'assistant', content: msg.content })
            }
        }
    }

    return history
}

export function getUnifiedHistory(sessionId: string, limit: number = 10): SessionMessage[] {
    const session = sessions.get(sessionId)
    if (!session) return []

    // Collect all messages from all segments
    const allMessages: SessionMessage[] = []
    Object.values(session.history).forEach(segment => {
        allMessages.push(...segment)
    })

    // Sort by timestamp and take the last N
    return allMessages
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .slice(-limit)
}

export function updateUserProfile(sessionId: string, updates: Partial<UserProfile>): void {
    const session = getOrCreateSession(sessionId)
    session.userProfile = { ...session.userProfile, ...updates }
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

export function updateGlobalContext(sessionId: string, updates: Partial<Session['globalContext']>): void {
    const session = getOrCreateSession(sessionId)
    session.globalContext = { ...session.globalContext, ...updates }
    // Sync to leadsContext if it's there for backward compatibility
    if (session.leadsContext) {
        session.leadsContext = { ...session.leadsContext, ...updates }
    }
}

export function getGlobalContext(sessionId: string): Session['globalContext'] {
    return sessions.get(sessionId)?.globalContext || {}
}

export function clearSession(sessionId: string): void {
    sessions.delete(sessionId)
}

export function getSessionSummary(sessionId: string): { messageCount: number; lastActive: string } | null {
    const session = sessions.get(sessionId)
    if (!session) return null
    const totalCount = Object.values(session.history).reduce((acc, h) => acc + h.length, 0)
    return { messageCount: totalCount, lastActive: session.lastActive }
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
