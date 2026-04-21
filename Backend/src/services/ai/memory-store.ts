/**
 * Bridges the in-memory session store with MongoDB for durability.
 * Writes are async fire-and-forget to avoid blocking the response path.
 */
import ChatSessionModel from '../../models/chat-history.model'
import LeadsJobModel from '../../models/leads-history.model'
import { LeadsResponse } from '../pipelines/leads.pipeline'
import logger from '../../handlers/logger'

export async function persistChatMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    mode: 'learning' | 'leads' | 'chat' | 'mixed' | 'market-intel' | 'job-hunter' | 'auto' = 'chat'
): Promise<void> {
    try {
        await ChatSessionModel.findOneAndUpdate(
            { sessionId },
            {
                $push: {
                    messages: { role, content, mode, timestamp: new Date() }
                },
                $set: { lastActiveAt: new Date() }
            },
            { upsert: true, new: true }
        )
    } catch (err) {
        // Non-blocking — log but don't throw
        logger.warn('Failed to persist chat message to MongoDB', { meta: { sessionId, err } })
    }
}

export async function persistLeadsContext(
    sessionId: string,
    ctx: { domain?: string; sector?: string; country?: string; city?: string }
): Promise<void> {
    try {
        await ChatSessionModel.findOneAndUpdate(
            { sessionId },
            { $set: { leadsContext: ctx, lastActiveAt: new Date() } },
            { upsert: true }
        )
    } catch (err) {
        logger.warn('Failed to persist leads context to MongoDB', { meta: { sessionId, err } })
    }
}

export async function persistLeadsJob(sessionId: string, result: LeadsResponse): Promise<void> {
    try {
        await LeadsJobModel.create({
            sessionId,
            domain: result.domain,
            sector: result.sector,
            location: result.location,
            requestedCount: result.requestedCount,
            leads: result.leads.map((l) => ({
                companyName: l.companyName,
                website: l.website,
                sector: l.sector,
                country: l.country,
                city: l.city,
                decisionMaker: l.decisionMaker,
                email: l.email,
                phone: l.phone,
                currentSystem: l.currentSystem,
                businessGap: l.businessGap,
                whatToSell: l.whatToSell,
                useCase: l.useCase,
                salesStrategy: l.salesStrategy,
                outreachMessage: l.outreachMessage,
                revenuePotential: l.revenuePotential,
                techStack: l.techStack,
                confidenceScore: l.confidenceScore,
                justification: l.justification,
                scrapedAt: new Date(l.scrapedAt),
                verificationStatus: l.verificationStatus
            })),
            overallStrategy: result.overallStrategy,
            processingNotes: result.processingNotes,
            status: result.leads.length > 0 ? 'completed' : 'partial'
        })
    } catch (err) {
        logger.warn('Failed to persist leads job to MongoDB', { meta: { sessionId, err } })
    }
}

export async function getChatHistory(sessionId: string): Promise<{ messages: unknown[]; leadsContext: unknown } | null> {
    try {
        const session = await ChatSessionModel.findOne({ sessionId }).lean()
        if (!session) return null
        return { messages: session.messages, leadsContext: session.leadsContext }
    } catch (err) {
        logger.warn('Failed to load chat history from MongoDB', { meta: { sessionId, err } })
        return null
    }
}

export async function getLeadsHistory(sessionId: string): Promise<unknown[]> {
    try {
        const jobs = await LeadsJobModel.find({ sessionId }).sort({ createdAt: -1 }).limit(10).lean()
        return jobs
    } catch (err) {
        logger.warn('Failed to load leads history from MongoDB', { meta: { sessionId, err } })
        return []
    }
}
