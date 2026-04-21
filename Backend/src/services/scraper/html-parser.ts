import axios from 'axios'
import * as cheerio from 'cheerio'
import config from '../../config/config'
import logger from '../../handlers/logger'

export interface ParsedPage {
    url: string
    title: string
    bodyText: string
    links: string[]
    emails: string[]
    phones: string[]
    metaDescription: string
    rawHtml: string
    success: boolean
    error?: string
}

export interface LivenessResult {
    url: string
    live: boolean
    statusCode?: number
    error?: string
}

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
]

function randomAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

/**
 * High-precision check to see if a URL is reachable and alive.
 * Inspects body for parked domain keywords.
 */
export async function checkLiveness(url: string, timeout = 5000): Promise<LivenessResult> {
    const PARKED_SIGNATURES = [
        'parked domain', 'domain for sale', 'buy this domain', 'godaddy', 'namecheap', 
        'dan.com', 'hugeDomains', 'parking page', 'under construction', '404 not found',
        'site can\'t be reached', 'domain is registered'
    ]

    const EXPIRED_SIGNATURES = [
        'no longer accepting applications',
        'this job has been closed',
        'this job has filled',
        'listing has expired',
        'position is no longer available',
        'job listing you are looking for has expired',
        'posting has expired',
        'this job was closed',
        'the job you are looking for'
    ]

    try {
        const res = await axios.get(url, {
            headers: { 'User-Agent': randomAgent() },
            timeout,
            maxRedirects: 3,
            responseType: 'text',
            validateStatus: (status) => status >= 200 && status < 400
        })

        const body = (res.data as string).toLowerCase()
        const titleMatch = body.match(/<title>([\s\S]*?)<\/title>/i)
        const title = titleMatch ? titleMatch[1] : ''

        // Check if it's a parked page or an expired job
        const isParked = PARKED_SIGNATURES.some(sig => 
            title.toLowerCase().includes(sig) || body.includes(sig)
        )

        const isExpired = EXPIRED_SIGNATURES.some(sig => body.includes(sig))

        // Strict: 429 or 403 are effectively dead for lead/job purposes
        if (isParked || isExpired || res.status === 429 || res.status === 403) {
            const reason = isExpired ? 'Job Expired' : (isParked ? 'Parked Domain' : `Status ${res.status}`)
            return { url, live: false, error: `Inaccessible or ${reason}`, statusCode: res.status }
        }

        return { url, live: true, statusCode: res.status }
    } catch (err: any) {
        return { 
            url, 
            live: false, 
            error: err.message, 
            statusCode: err.response?.status 
        }
    }
}

export async function fetchPage(url: string, retries = config.AI.SCRAPER.MAX_RETRIES): Promise<ParsedPage> {
    let lastError: string = ''

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const { data: rawHtml, status } = await axios.get<string>(url, {
                headers: {
                    'User-Agent': randomAgent(),
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate',
                    Connection: 'keep-alive'
                },
                timeout: config.AI.SCRAPER.TIMEOUT_MS,
                maxRedirects: 5,
                responseType: 'text'
            })

            if (status < 200 || status >= 300) {
                lastError = `HTTP ${status}`
                continue
            }

            return parsePage(url, rawHtml)
        } catch (err: unknown) {
            lastError = err instanceof Error ? err.message : String(err)
            if (attempt < retries) await sleep(1000 * attempt)
        }
    }

    logger.warn(`Failed to fetch ${url}: ${lastError}`)
    return { url, title: '', bodyText: '', links: [], emails: [], phones: [], metaDescription: '', rawHtml: '', success: false, error: lastError }
}

function parsePage(url: string, rawHtml: string): ParsedPage {
    const $ = cheerio.load(rawHtml)

    // Remove noise
    $('script, style, noscript, svg, iframe, nav, footer, header, [class*="cookie"], [class*="popup"], [id*="cookie"]').remove()

    const title = $('title').text().trim() || $('h1').first().text().trim()
    const metaDescription = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || ''

    const bodyText = $('body')
        .text()
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, '\n')
        .trim()
        .slice(0, 8000)

    const links: string[] = []
    $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || ''
        if (href.startsWith('http')) links.push(href)
    })

    // Inline email/phone extraction at parse time
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
    const emails = Array.from(new Set(rawHtml.match(emailRegex) || []))

    const phoneRegex = /(?:\+?[\d\s\-().]{7,15})/g
    const rawPhones = rawHtml.match(phoneRegex) || []
    const phones = Array.from(new Set(rawPhones.map((p) => p.trim()).filter((p) => p.replace(/\D/g, '').length >= 7)))

    return { url, title, bodyText, links: Array.from(new Set(links)).slice(0, 50), emails, phones, metaDescription, rawHtml: rawHtml.slice(0, 50000), success: true }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}
