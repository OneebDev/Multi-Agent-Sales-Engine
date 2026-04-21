import { groqComplete, expandQuery } from '../tools/groq.tool'
import { webSearch, newsSearch, searchPapers, SerperResult, SerperNewsResult } from '../tools/serper.tool'
import { searchYouTube, YouTubeVideo } from '../tools/youtube.tool'
import { retrieve, indexSearchResults } from '../rag/rag.service'
import logger from '../../handlers/logger'

export interface ResearchFetchCounts {
    web: number       // articles / general web
    videos: number
    papers: number
    news: number
}

const DEFAULT_FETCH_COUNTS: ResearchFetchCounts = {
    web: 15,
    videos: 9,    // 3x default of 3 videos
    papers: 9,    // 3x default of 3 papers
    news: 9       // 3x default of 3 news
}

export interface ResearchOutput {
    query: string
    expandedQueries: string[]
    webResults: SerperResult[]
    newsResults: SerperNewsResult[]
    paperResults: SerperResult[]
    videos: YouTubeVideo[]
    ragContext: string
    summary: string
}

/**
 * Uses LLM to score results by relevance to the query.
 * Filters out low-scoring items and sorts the rest.
 */
async function filterResultsByRelevance<T extends { title: string; snippet?: string; description?: string }>(
    query: string,
    items: T[]
): Promise<T[]> {
    if (items.length === 0) return []

    // Prepare batch for LLM — use snippet or description
    const batch = items.map((item, idx) => ({
        id: idx,
        text: `${item.title} | ${item.snippet || item.description || ''}`
    }))

    const prompt = `STRICT SEARCH AUDITOR. Query: "${query}"
Rules: 1. Score 0.0 if totally unrelated. 2. Score 1.0 if highly relevant. 
Examples: "Blockchain" vs "DIY" = 0.0. "Blockchain" vs "Crypto" = 1.0.

Data: ${JSON.stringify(batch)}
Return ONLY JSON mapping "id" to "score" (0.0-1.0). Be extremely harsh.`

    try {
        const raw = await groqComplete('You are a search relevance auditor. Respond with ONLY valid JSON.', prompt, { temperature: 0.1, maxTokens: 1024 })
        const match = raw.match(/\{[\s\S]*?\}/)
        if (match) {
            const scores = JSON.parse(match[0]) as Record<string, number>
            return items
                .filter((_, idx) => (scores[String(idx)] || 0) >= 0.7) // High threshold
                .sort((a, b) => {
                    const idxA = items.indexOf(a)
                    const idxB = items.indexOf(b)
                    return (scores[String(idxB)] || 0) - (scores[String(idxA)] || 0)
                })
        }
    } catch (err) {
        logger.error('Relevance filtering failed', { meta: err })
    }

    return items // Fallback to all items if AI fails
}

export async function runResearcherAgent(query: string, counts: Partial<ResearchFetchCounts> = {}): Promise<ResearchOutput> {
    const fetchCounts: ResearchFetchCounts = { ...DEFAULT_FETCH_COUNTS, ...counts }

    logger.info('ResearcherAgent: starting', { meta: { query, fetchCounts } })

    // 1. Expand query
    const expandedQueries = await expandQuery(query)
    const allQueries = [query, ...expandedQueries]

    // 2. Parallel fetch — 4x Depth Dynamic Selection
    const fetchDepth = {
        web: fetchCounts.web * 4,
        news: fetchCounts.news * 4,
        papers: fetchCounts.papers * 4,
        videos: fetchCounts.videos * 4
    }

    logger.info(`ResearcherAgent: fetching depth ${JSON.stringify(fetchDepth)}`)

    const [webResults, newsResults, paperResults, videos, ragCtx] = await Promise.all([
        webSearch(allQueries[0], fetchDepth.web).catch((): SerperResult[] => []),
        newsSearch(allQueries[0], fetchDepth.news).catch((): SerperNewsResult[] => []),
        searchPapers(query, fetchDepth.papers).catch((): SerperResult[] => []),
        searchYouTube(query, Math.min(50, fetchDepth.videos)).catch((): YouTubeVideo[] => []),
        Promise.resolve(retrieve(query))
    ])

    // Secondary web searches from expanded queries to get even more results
    const secondarySearches = await Promise.allSettled(
        allQueries.slice(1, 3).map((q) => webSearch(q, Math.ceil(fetchCounts.web / 3)))
    )
    for (const r of secondarySearches) {
        if (r.status === 'fulfilled') webResults.push(...r.value)
    }

    // Extra YouTube searches for expanded queries when large count requested
    if (fetchCounts.videos > 6) {
        const extraCalls = Math.min(2, Math.ceil(fetchCounts.videos / 50))
        for (let i = 0; i < extraCalls; i++) {
            const q2 = expandedQueries[i] || query
            const extra = await searchYouTube(q2, Math.min(50, fetchCounts.videos)).catch((): YouTubeVideo[] => [])
            videos.push(...extra)
        }
    }

    // Extra paper searches
    if (fetchCounts.papers > 6) {
        const extraPapers = await searchPapers(`${query} research`, Math.min(fetchCounts.papers, 10)).catch((): SerperResult[] => [])
        paperResults.push(...extraPapers)
    }

    // Extra news searches
    if (fetchCounts.news > 5) {
        const extraNews = await newsSearch(`${query} latest news`, Math.min(fetchCounts.news, 10)).catch((): SerperNewsResult[] => [])
        newsResults.push(...extraNews)
    }

    // 3. De-duplicate web results by URL
    const seen = new Set<string>()
    const uniqueWeb = webResults.filter((r) => {
        if (seen.has(r.link)) return false
        seen.add(r.link)
        return true
    })

    // 4. Filter & De-duplicate videos by id
    const seenVids = new Set<string>()
    const uniqueVideos = videos.filter((v) => {
        if (seenVids.has(v.id)) return false
        seenVids.add(v.id)
        return true
    })

    // 5. Post-fetch Relevance Filtering (AI-Driven)
    logger.info('ResearcherAgent: filtering results for relevance')
    let [fWeb, fNews, fPapers, fVideos] = await Promise.all([
        filterResultsByRelevance(query, uniqueWeb),
        filterResultsByRelevance(query, newsResults),
        filterResultsByRelevance(query, paperResults),
        filterResultsByRelevance(query, uniqueVideos.filter(v => !v.link.includes('/shorts/'))) // Exclude shorts
    ])

    // 6. Iterative Gap Filling — if we have < 100% of requested after filtering
    const fillGap = async (type: 'web' | 'news' | 'paper' | 'video', current: any[], target: number) => {
        if (current.length >= target) return current
        const needed = target - current.length
        logger.info(`ResearcherAgent: gap detected in ${type} (${needed} missing). Triggering iterative search...`)
        
        const fallbackQuery = expandedQueries[0] || `${query} information`
        let extra: any[] = []
        if (type === 'web') extra = await filterResultsByRelevance(query, await webSearch(fallbackQuery, needed * 4))
        if (type === 'news') extra = await filterResultsByRelevance(query, await newsSearch(fallbackQuery, needed * 4))
        if (type === 'paper') extra = await filterResultsByRelevance(query, await searchPapers(fallbackQuery, needed * 4))
        if (type === 'video') extra = await filterResultsByRelevance(query, await searchYouTube(fallbackQuery, needed * 4))

        return [...current, ...extra].slice(0, target)
    }

    // 6. Batched Iterative Gap Filling (v10 Safe Optimization)
    const gapTasks = [
        { type: 'web' as const, current: fWeb, target: fetchCounts.web },
        { type: 'news' as const, current: fNews, target: fetchCounts.news },
        { type: 'paper' as const, current: fPapers, target: fetchCounts.papers },
        { type: 'video' as const, current: fVideos, target: fetchCounts.videos }
    ]

    const gapResults = await Promise.all(gapTasks.map(task => fillGap(task.type, task.current, task.target)))
    fWeb = gapResults[0]
    fNews = gapResults[1]
    fPapers = gapResults[2]
    fVideos = gapResults[3]

    // 7. Index into RAG
    indexSearchResults(fWeb.slice(0, 15).map((r) => ({ title: r.title, snippet: r.snippet, link: r.link })))

    // 7. Internal summary for orchestrator
    const contextForSummary = fWeb
        .slice(0, 6)
        .map((r: any) => `${r.title}: ${r.snippet}`)
        .join('\n')

    const summary = await groqComplete(
        'You are a research summarizer.',
        `Query: "${query}"\n\nSearch results:\n${contextForSummary}`,
        { temperature: 0.3, maxTokens: 256 }
    ).catch(() => '')

    logger.info('ResearcherAgent: complete', {
        meta: {
            webCount: fWeb.length,
            videoCount: fVideos.length,
            paperCount: fPapers.length,
            newsCount: fNews.length
        }
    })

    return {
        query,
        expandedQueries,
        webResults: fWeb.slice(0, fetchCounts.web),
        newsResults: fNews.slice(0, fetchCounts.news),
        paperResults: fPapers.slice(0, fetchCounts.papers),
        videos: fVideos.slice(0, fetchCounts.videos),
        ragContext: ragCtx.contextText,
        summary
    }
}
