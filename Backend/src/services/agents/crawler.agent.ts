import { scrapeMultiple, ScrapeResult } from '../tools/scraper.tool'
import { searchCompanies, SerperResult } from '../tools/serper.tool'
import { validateUrl } from '../scraper/validator'
import logger from '../../handlers/logger'

export interface CrawlerInput {
    domain: string
    sector: string
    country: string
    city?: string
    serperResults?: SerperResult[]
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
    const urls = searchResults
        .map((r) => r.link)
        .filter(validateUrl)
        .filter((url) => {
            const host = new URL(url).hostname.toLowerCase()
            // Exclude aggregators, social, and directories
            const excluded = ['linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com', 'yelp.com', 'yellowpages.com', 'indeed.com', 'glassdoor.com']
            return !excluded.some((e) => host.includes(e))
        })
        // Deduplicate by hostname
        .filter((url, _, arr) => {
            const host = new URL(url).hostname
            return arr.findIndex((u) => new URL(u).hostname === host) === arr.indexOf(url)
        })
        .slice(0, 30)

    logger.info('CrawlerAgent: scraping', { meta: { urlCount: urls.length } })

    // 3. Scrape all URLs concurrently (respects CONCURRENCY config)
    const companies = await scrapeMultiple(urls)

    const successCount = companies.filter((c) => c.valid).length
    const failureCount = companies.length - successCount

    logger.info('CrawlerAgent: complete', { meta: { total: companies.length, success: successCount, failures: failureCount } })

    return {
        companies: companies.filter((c) => c.valid),
        totalScraped: companies.length,
        successCount,
        failureCount
    }
}
