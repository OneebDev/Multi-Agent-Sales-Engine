import { Queue, Worker, Job } from 'bullmq'
import { scrapeCompany, ScrapeResult } from '../tools/scraper.tool'
import config from '../../config/config'
import logger from '../../handlers/logger'

export interface ScraperJobData {
    url: string
    sessionId?: string
    metadata?: Record<string, unknown>
}

export interface ScraperJobResult {
    result: ScrapeResult
    processedAt: string
}

const CONNECTION = {
    host: config.AI.REDIS.HOST,
    port: config.AI.REDIS.PORT,
    password: config.AI.REDIS.PASSWORD || undefined
}

let _queue: Queue | null = null
let _worker: Worker | null = null

export function getScraperQueue(): Queue {
    if (!_queue) {
        _queue = new Queue<ScraperJobData, ScraperJobResult>('scraper', {
            connection: CONNECTION,
            defaultJobOptions: {
                attempts: config.AI.SCRAPER.MAX_RETRIES,
                backoff: { type: 'exponential', delay: 2000 },
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 50 }
            }
        })
        logger.info('Scraper queue initialized')
    }
    return _queue
}

export function startScraperWorker(): void {
    if (_worker) return

    _worker = new Worker<ScraperJobData, ScraperJobResult>(
        'scraper',
        async (job: Job<ScraperJobData>) => {
            logger.info(`Scraper worker: processing job ${job.id}`, { meta: { url: job.data.url } })
            const result = await scrapeCompany(job.data.url)
            return { result, processedAt: new Date().toISOString() }
        },
        {
            connection: CONNECTION,
            concurrency: config.AI.SCRAPER.CONCURRENCY
        }
    )

    _worker.on('completed', (job) => {
        logger.info(`Scraper job ${job.id} completed`, { meta: { url: job.data.url } })
    })

    _worker.on('failed', (job, err) => {
        logger.error(`Scraper job ${job?.id} failed`, { meta: { url: job?.data.url, err } })
    })

    logger.info('Scraper worker started')
}

export async function enqueueScraperJob(url: string, sessionId?: string, metadata?: Record<string, unknown>): Promise<string> {
    const queue = getScraperQueue()
    const job = await queue.add('scrape', { url, sessionId, metadata })
    return job.id || ''
}

export async function getJobStatus(jobId: string): Promise<{ state: string; result?: ScraperJobResult; error?: string } | null> {
    const queue = getScraperQueue()
    const job = await queue.getJob(jobId)
    if (!job) return null

    const state = await job.getState()
    const result = job.returnvalue as ScraperJobResult | undefined

    return { state, result, error: job.failedReason }
}

export async function closeQueue(): Promise<void> {
    if (_worker) await _worker.close()
    if (_queue) await _queue.close()
}
