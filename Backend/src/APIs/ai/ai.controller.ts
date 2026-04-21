import { Request, Response, NextFunction } from 'express'
import httpResponse from '../../handlers/httpResponse'
import httpError from '../../handlers/errorHandler/httpError'
import asyncHandler from '../../handlers/async'
import * as aiService from './ai.service'
import { ChatRequest } from './ai.types'

export const chatController = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const body = req.body as ChatRequest

        if (!body.sessionId || !body.query || !body.mode) {
            return httpError(next, new Error('sessionId, query, and mode are required'), req, 400)
        }

        if (!['learning', 'leads', 'chat', 'auto', 'job-hunter'].includes(body.mode)) {
            return httpError(next, new Error('mode must be learning, leads, chat, auto, or job-hunter'), req, 400)
        }

        const result = await aiService.chat(body)
        httpResponse(res, req, 200, 'Query processed successfully', result)
    } catch (err) {
        const msg = err instanceof Error ? err.message : ''
        const status = msg.includes('rate limit') || msg.includes('rate_limit') ? 429 : 500
        httpError(next, err as Error, req, status)
    }
})

export const getSessionController = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { sessionId } = req.params
        if (!sessionId) return httpError(next, new Error('sessionId is required'), req, 400)

        const summary = aiService.getSession(sessionId)
        httpResponse(res, req, 200, 'Session retrieved', summary)
    } catch (err) {
        httpError(next, err as Error, req, 500)
    }
})

export const deleteSessionController = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { sessionId } = req.params
        if (!sessionId) return httpError(next, new Error('sessionId is required'), req, 400)

        const result = aiService.deleteSession(sessionId)
        httpResponse(res, req, 200, 'Session cleared', result)
    } catch (err) {
        httpError(next, err as Error, req, 500)
    }
})

export const enqueueScrapeController = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { url, sessionId } = req.body as { url: string; sessionId?: string }
        if (!url) return httpError(next, new Error('url is required'), req, 400)

        const result = await aiService.queueScrapeJob(url, sessionId)
        httpResponse(res, req, 202, 'Scrape job queued', result)
    } catch (err) {
        httpError(next, err as Error, req, 500)
    }
})

export const scrapeJobStatusController = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { jobId } = req.params
        const result = await aiService.checkScrapeJob(jobId)
        httpResponse(res, req, 200, 'Job status', result)
    } catch (err) {
        httpError(next, err as Error, req, 500)
    }
})

export const ragStatsController = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const stats = aiService.getRagStats()
    httpResponse(res, req, 200, 'RAG stats', stats)
})

export const sessionHistoryController = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { sessionId } = req.params
        if (!sessionId) return httpError(next, new Error('sessionId is required'), req, 400)
        const history = await aiService.getSessionHistory(sessionId)
        httpResponse(res, req, 200, 'Chat history', history)
    } catch (err) {
        httpError(next, err as Error, req, 500)
    }
})

export const sessionLeadsController = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { sessionId } = req.params
        if (!sessionId) return httpError(next, new Error('sessionId is required'), req, 400)
        const leads = await aiService.getSessionLeads(sessionId)
        httpResponse(res, req, 200, 'Leads history', leads)
    } catch (err) {
        httpError(next, err as Error, req, 500)
    }
})
