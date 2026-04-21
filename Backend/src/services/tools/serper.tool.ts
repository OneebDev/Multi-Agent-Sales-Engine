import axios from 'axios'
import config from '../../config/config'
import logger from '../../handlers/logger'

const BASE_URL = 'https://google.serper.dev'

export interface SerperResult {
    title: string
    link: string
    snippet: string
    position?: number
}

export interface SerperNewsResult {
    title: string
    link: string
    snippet: string
    source: string
    date?: string
}

export interface SerperResponse {
    organic: SerperResult[]
    news?: SerperNewsResult[]
    knowledgeGraph?: { title: string; description?: string; attributes?: Record<string, string> }
}

async function serperRequest(endpoint: string, payload: Record<string, unknown>): Promise<SerperResponse> {
    if (!config.AI.SERPER_API_KEY) throw new Error('SERPER_API_KEY is not configured')

    const { data } = await axios.post<SerperResponse>(`${BASE_URL}${endpoint}`, payload, {
        headers: {
            'X-API-KEY': config.AI.SERPER_API_KEY,
            'Content-Type': 'application/json'
        },
        timeout: 10000
    })
    return data
}

export async function webSearch(query: string, num = 10): Promise<SerperResult[]> {
    try {
        const res = await serperRequest('/search', { q: query, num })
        return res.organic || []
    } catch (err) {
        logger.error('Serper web search failed', { meta: { query, err } })
        return []
    }
}

export async function newsSearch(query: string, num = 6): Promise<SerperNewsResult[]> {
    try {
        const res = await serperRequest('/news', { q: query, num })
        return res.news || []
    } catch (err) {
        logger.error('Serper news search failed', { meta: { query, err } })
        return []
    }
}

export async function searchCompanies(domain: string, sector: string, location: string, num = 20): Promise<SerperResult[]> {
    const queries = [
        `${sector} companies in ${location} need ${domain}`,
        `${sector} businesses ${location} site:linkedin.com OR site:crunchbase.com`,
        `top ${sector} companies ${location} ${domain} services`
    ]

    const allResults: SerperResult[] = []
    for (const q of queries) {
        const results = await webSearch(q, num)
        allResults.push(...results)
    }

    // Deduplicate by domain
    const seen = new Set<string>()
    return allResults.filter((r) => {
        try {
            const host = new URL(r.link).hostname
            if (seen.has(host)) return false
            seen.add(host)
            return true
        } catch {
            return false
        }
    })
}

export async function searchPapers(query: string, num = 5): Promise<SerperResult[]> {
    return webSearch(`${query} research paper site:arxiv.org OR site:semanticscholar.org OR site:scholar.google.com`, num)
}
