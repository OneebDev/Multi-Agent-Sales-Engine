import { orchestrate, OrchestratorInput } from '../../services/ai/orchestrator'
import { clearSession, getSessionSummary } from '../../services/ai/session-memory'
import { persistChatMessage, persistLeadsJob, getChatHistory, getLeadsHistory } from '../../services/ai/memory-store'
import { enqueueScraperJob, getJobStatus } from '../../services/queue/scraper.queue'
import { getDocumentCount } from '../../services/rag/vector-store'
import { LeadsResponse } from '../../services/pipelines/leads.pipeline'
import { ChatRequest } from './ai.types'

export async function chat(req: ChatRequest) {
    const input: OrchestratorInput = {
        sessionId: req.sessionId,
        query: req.query,
        mode: req.mode,
        domain: req.domain,
        sector: req.sector,
        country: req.country,
        city: req.city,
        count: req.count
    }

    const result = await orchestrate(input)

    // Fire-and-forget DB persistence — never blocks the response
    void persistChatMessage(req.sessionId, 'user', req.query, result.mode)

    if (result.category === 'Lead Intelligence' && !result.needsMoreInfo) {
        const leadData = result.data as LeadsResponse
        if (leadData) {
            void persistLeadsJob(req.sessionId, leadData)
            void persistChatMessage(req.sessionId, 'assistant', `Generated ${leadData.leads?.length ?? 0} leads`, 'leads')
        }
    } else if (result.category === 'Chat' || result.mode === 'chat') {
        void persistChatMessage(req.sessionId, 'assistant', result.response, 'chat')
    } else if (result.category === 'Deep Research' || result.mode === 'learning') {
        void persistChatMessage(req.sessionId, 'assistant', result.response.slice(0, 500), 'learning')
    } else if (result.category === 'Market Intelligence' || result.mode === 'market-intel') {
        void persistChatMessage(req.sessionId, 'assistant', result.response, 'market-intel')
    }

    return result
}

export function deleteSession(sessionId: string): { cleared: boolean } {
    clearSession(sessionId)
    return { cleared: true }
}

export function getSession(sessionId: string) {
    const summary = getSessionSummary(sessionId)
    return summary || { messageCount: 0, lastActive: null }
}

export async function getSessionHistory(sessionId: string) {
    return getChatHistory(sessionId)
}

export async function getSessionLeads(sessionId: string) {
    return getLeadsHistory(sessionId)
}

export async function queueScrapeJob(url: string, sessionId?: string) {
    const jobId = await enqueueScraperJob(url, sessionId)
    return { jobId, status: 'queued' }
}

export async function checkScrapeJob(jobId: string) {
    const status = await getJobStatus(jobId)
    if (!status) return { error: 'Job not found' }
    return status
}

export function getRagStats() {
    return { documentCount: getDocumentCount() }
}
