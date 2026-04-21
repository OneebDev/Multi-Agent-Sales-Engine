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

export async function webSearch(query: string, num = 20): Promise<SerperResult[]> {
    try {
        const res = await serperRequest('/search', { q: query, num: Math.min(num, 100) })
        return res.organic || []
    } catch (err) {
        logger.error('Serper web search failed', { meta: { query, err } })
        return []
    }
}

export async function newsSearch(query: string, num = 10): Promise<SerperNewsResult[]> {
    try {
        const res = await serperRequest('/news', { q: query, num: Math.min(num, 100) })
        return res.news || []
    } catch (err) {
        logger.error('Serper news search failed', { meta: { query, err } })
        return []
    }
}

export async function searchTargetedLeads(
    query: string, 
    source: 'google' | 'linkedin' | 'facebook' | 'instagram' | 'twitter' | 'other',
    num = 40
): Promise<SerperResult[]> {
    let siteQuery = query
    
    if (source === 'linkedin') siteQuery = `site:linkedin.com/company ${query}`
    else if (source === 'facebook') siteQuery = `site:facebook.com ${query}`
    else if (source === 'instagram') siteQuery = `site:instagram.com ${query}`
    else if (source === 'twitter') siteQuery = `site:twitter.com ${query}`
    else if (source === 'google') siteQuery = `${query} -site:linkedin.com -site:facebook.com -site:twitter.com -site:instagram.com`

    return webSearch(siteQuery, num)
}

export async function searchCompanies(_domain: string, sector: string, location: string, num = 40): Promise<SerperResult[]> {
    const allResults: SerperResult[] = []
    
    // Mix of general web and specific professional profiles
    const queries = [
        { q: `${sector} companies in ${location}`, src: 'google' as const },
        { q: `${sector} businesses ${location}`, src: 'linkedin' as const },
        { q: `${sector} ${location}`, src: 'facebook' as const }
    ]

    for (const item of queries) {
        const results = await searchTargetedLeads(item.q, item.src, num)
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

export async function searchPapers(query: string, num = 10): Promise<SerperResult[]> {
    const refinedQuery = `"${query}" research papers OR "academic" OR "study" site:arxiv.org OR site:semanticscholar.org OR site:scholar.google.com`
    return webSearch(refinedQuery, Math.min(num, 100))
}
