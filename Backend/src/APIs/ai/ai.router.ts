import { Router } from 'express'
import {
    chatController,
    getSessionController,
    deleteSessionController,
    enqueueScrapeController,
    scrapeJobStatusController,
    ragStatsController,
    sessionHistoryController,
    sessionLeadsController
} from './ai.controller'
import rateLimiter from '../../middlewares/rateLimiter'

const router = Router()

// Core chat endpoint — main entry point for all AI queries
router.post('/chat', rateLimiter, chatController)

// Session management
router.get('/session/:sessionId', getSessionController)
router.delete('/session/:sessionId', deleteSessionController)

// Background scraping job queue
router.post('/scrape/enqueue', rateLimiter, enqueueScrapeController)
router.get('/scrape/job/:jobId', scrapeJobStatusController)

// RAG knowledge base stats
router.get('/rag/stats', ragStatsController)

// Persistent history (MongoDB-backed)
router.get('/session/:sessionId/history', sessionHistoryController)
router.get('/session/:sessionId/leads', sessionLeadsController)

export default router
