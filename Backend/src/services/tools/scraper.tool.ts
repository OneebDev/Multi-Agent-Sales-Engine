import { fetchPage } from '../scraper/html-parser'
import { extractCompanyData, ExtractedCompanyData } from '../scraper/data-extractor'
import { cleanCompanyData } from '../scraper/data-cleaner'
import { validateCompanyData, validateUrl } from '../scraper/validator'
import { indexScrapedContent } from '../rag/rag.service'
import logger from '../../handlers/logger'
import config from '../../config/config'

export interface ScrapeResult {
    url: string
    data: ExtractedCompanyData | null
    validationScore: number
    valid: boolean
    error?: string
}

export async function scrapeCompany(url: string): Promise<ScrapeResult> {
    if (!validateUrl(url)) {
        return { url, data: null, validationScore: 0, valid: false, error: 'Invalid URL' }
    }

    const page = await fetchPage(url)
    if (!page.success) {
        return { url, data: null, validationScore: 0, valid: false, error: page.error }
    }

    const raw = extractCompanyData(page)
    const cleaned = cleanCompanyData(raw)
    const { valid, score } = validateCompanyData(cleaned)

    // Index into RAG for future context retrieval
    if (page.bodyText) {
        indexScrapedContent(url, page.bodyText, cleaned.companyName)
    }

    return { url, data: cleaned, validationScore: score, valid }
}

export async function scrapeMultiple(urls: string[]): Promise<ScrapeResult[]> {
    const concurrency = config.AI.SCRAPER.CONCURRENCY
    const results: ScrapeResult[] = []

    for (let i = 0; i < urls.length; i += concurrency) {
        const batch = urls.slice(i, i + concurrency)
        const batchResults = await Promise.allSettled(batch.map((url) => scrapeCompany(url)))

        for (const r of batchResults) {
            if (r.status === 'fulfilled') {
                results.push(r.value)
            } else {
                logger.error('Scrape batch item failed', { meta: r.reason })
            }
        }

        // Polite delay between batches
        if (i + concurrency < urls.length) {
            await sleep(500)
        }
    }

    return results
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}
