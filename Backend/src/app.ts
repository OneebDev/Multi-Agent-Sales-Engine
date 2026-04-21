import express, { Application } from 'express'
import http from 'http'
import path from 'path'
import { Server as SocketServer } from 'socket.io'
import router from './APIs'
import errorHandler from './middlewares/errorHandler'
import notFound from './handlers/notFound'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import config from './config/config'
import { getOrCreateSession } from './services/ai/session-memory'
import { orchestrate } from './services/ai/orchestrator'
import logger from './handlers/logger'

const app: Application = express()
export const httpServer = http.createServer(app)

// ─── Middlewares ─────────────────────────────────────────────────────────────
app.use(helmet())
app.use(cookieParser())
app.use(
    cors({
        methods: ['GET', 'POST', 'DELETE', 'OPTIONS', 'HEAD', 'PUT', 'PATCH'],
        origin: config.AI.ALLOWED_ORIGINS,
        credentials: true
    })
)
app.use(express.json())
app.use(express.static(path.join(__dirname, '../', 'public')))

// ─── HTTP Routes ─────────────────────────────────────────────────────────────
router(app)

// ─── 404 + Error Handlers ────────────────────────────────────────────────────
app.use(notFound)
app.use(errorHandler)

// ─── Socket.IO — streaming AI responses ─────────────────────────────────────
export const io = new SocketServer(httpServer, {
    cors: {
        origin: config.AI.ALLOWED_ORIGINS,
        methods: ['GET', 'POST'],
        credentials: true
    }
})

io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`)

    socket.on('ai:chat', async (payload: { sessionId: string; query: string; mode: 'learning' | 'leads' | 'auto'; domain?: string; sector?: string; country?: string; city?: string }) => {
        const { sessionId } = payload

        try {
            socket.emit('ai:start', { sessionId, timestamp: new Date().toISOString() })
            getOrCreateSession(sessionId)

            const result = await orchestrate(payload)

            socket.emit('ai:response', result)
            socket.emit('ai:done', { sessionId })
        } catch (err) {
            logger.error('Socket AI error', { meta: err })
            socket.emit('ai:error', {
                sessionId,
                message: err instanceof Error ? err.message : 'Unknown error'
            })
        }
    })

    socket.on('disconnect', () => {
        logger.info(`Socket disconnected: ${socket.id}`)
    })
})

export default app
