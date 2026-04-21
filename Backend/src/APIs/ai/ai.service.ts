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

    if (result.mode === 'leads' && !result.needsMoreInfo) {
        void persistLeadsJob(req.sessionId, result.response as LeadsResponse)
        const assistant = `Generated ${(result.response as LeadsResponse).leads?.length ?? 0} leads`
        void persistChatMessage(req.sessionId, 'assistant', assistant, 'leads')
    } else if (result.mode === 'chat') {
        const chatReply = (result.response as { reply: string }).reply || ''
        void persistChatMessage(req.sessionId, 'assistant', chatReply, 'chat')
    } else if (result.mode === 'learning') {
        const summary = (result.response as { simpleExplanation: string }).simpleExplanation || ''
        void persistChatMessage(req.sessionId, 'assistant', summary.slice(0, 500), 'learning')
    } else if (result.mode === 'market-intel') {
        const rec = (result.response as { recommendation: string }).recommendation || ''
        void persistChatMessage(req.sessionId, 'assistant', rec, 'market-intel')
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
