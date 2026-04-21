import { scrapeMultiple, ScrapeResult } from '../tools/scraper.tool'
import { searchCompanies, SerperResult } from '../tools/serper.tool'
import { validateUrl } from '../scraper/validator'
import { checkLiveness } from '../scraper/html-parser'
import logger from '../../handlers/logger'

export interface CrawlerInput {
    domain: string
    sector: string
    country: string
    city?: string
    serperResults?: SerperResult[]
    isSocialSource?: boolean
}

export interface CrawlerOutput {
    companies: ScrapeResult[]
    totalScraped: number
    successCount: number
    failureCount: number
}

export async function runCrawlerAgent(input: CrawlerInput): Promise<CrawlerOutput> {
    logger.info('CrawlerAgent: starting', { meta: { domain: input.domain, sector: input.sector } })

    // 1. Get URLs — use provided Serper results or search fresh
    let searchResults = input.serperResults || []
    if (searchResults.length === 0) {
        const location = input.city ? `${input.city}, ${input.country}` : input.country
        searchResults = await searchCompanies(input.domain, input.sector, location)
    }

    // 2. Extract and filter valid URLs
    const initialUrls = searchResults
        .map((r) => r.link)
        .filter(validateUrl)
        .filter((url) => {
            if (input.isSocialSource) return true // Allow if we specifically target social
            const host = new URL(url).hostname.toLowerCase()
            // Exclude aggregators, social, and directories
            const excluded = ['linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com', 'yelp.com', 'yellowpages.com', 'indeed.com', 'glassdoor.com', 'youtube.com', 'vimeo.com']
            return !excluded.some((e) => host.includes(e))
        })
        // Deduplicate by URL for social, or hostname for web
        .filter((url, _, arr) => {
            try {
                if (input.isSocialSource) return arr.indexOf(url) === arr.lastIndexOf(url) || arr.indexOf(url) === arr.indexOf(url) // Basic dedupe
                const host = new URL(url).hostname
                return arr.findIndex((u) => new URL(u).hostname === host) === arr.indexOf(url)
            } catch { return false }
        })
        .slice(0, 100) // 4x Depth: Large pool for candidates

    logger.info('CrawlerAgent: checking liveness of domains', { meta: { initialCount: initialUrls.length } })
    
    // 3. Batch liveness check (Stricter filtering)
    const livenessResults = await Promise.allSettled(initialUrls.map(url => checkLiveness(url, 5000)))
    const liveUrls: string[] = []
    
    for (const res of livenessResults) {
        if (res.status === 'fulfilled' && res.value.live) {
            liveUrls.push(res.value.url)
        }
    }

    // Target a specific number of companies if requested (default 15)
    // We fetch a few extra to account for scraping failures
    const finalUrls = liveUrls.slice(0, 20) 

    logger.info('CrawlerAgent: scraping live domains', { meta: { urlCount: finalUrls.length } })

    // 4. Scrape all URLs concurrently (respects CONCURRENCY config)
    const companiesResults = await scrapeMultiple(finalUrls)
    const validCompanies = companiesResults.filter((c) => c.valid)

    const successCount = validCompanies.length
    const failureCount = companiesResults.length - successCount

    logger.info('CrawlerAgent: complete', { meta: { total: companiesResults.length, success: successCount, failures: failureCount } })

    return {
        companies: validCompanies,
        totalScraped: companiesResults.length,
        successCount,
        failureCount
    }
}
