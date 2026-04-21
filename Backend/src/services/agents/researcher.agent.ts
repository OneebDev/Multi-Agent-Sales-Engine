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

export async function runResearcherAgent(query: string, counts: Partial<ResearchFetchCounts> = {}): Promise<ResearchOutput> {
    const fetchCounts: ResearchFetchCounts = { ...DEFAULT_FETCH_COUNTS, ...counts }

    logger.info('ResearcherAgent: starting', { meta: { query, fetchCounts } })

    // 1. Expand query
    const expandedQueries = await expandQuery(query)
    const allQueries = [query, ...expandedQueries]

    // YouTube API maxResults cap is 50 per call; we make up to 3 calls for large requests
    const ytPerCall = Math.min(50, Math.max(fetchCounts.videos, 6))

    // 2. Parallel fetch — all resource types at requested amount (pipeline slices to exact count)
    const [webResults, newsResults, paperResults, videos, ragCtx] = await Promise.all([
        webSearch(allQueries[0], Math.max(fetchCounts.web, 10)).catch((): SerperResult[] => []),
        newsSearch(allQueries[0], Math.max(fetchCounts.news, 5)).catch((): SerperNewsResult[] => []),
        searchPapers(query, Math.max(fetchCounts.papers, 6)).catch((): SerperResult[] => []),
        searchYouTube(query, ytPerCall).catch((): YouTubeVideo[] => []),
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

    // 4. De-duplicate videos by id
    const seenVids = new Set<string>()
    const uniqueVideos = videos.filter((v) => {
        if (seenVids.has(v.id)) return false
        seenVids.add(v.id)
        return true
    })

    // 5. Index into RAG
    indexSearchResults(uniqueWeb.slice(0, 15).map((r) => ({ title: r.title, snippet: r.snippet, link: r.link })))

    // 6. Internal summary for orchestrator
    const contextForSummary = uniqueWeb
        .slice(0, 6)
        .map((r) => `${r.title}: ${r.snippet}`)
        .join('\n')

    const summary = await groqComplete(
        'You are a research summarizer.',
        `Query: "${query}"\n\nSearch results:\n${contextForSummary}`,
        { temperature: 0.3, maxTokens: 256 }
    ).catch(() => '')

    logger.info('ResearcherAgent: complete', {
        meta: {
            webCount: uniqueWeb.length,
            videoCount: uniqueVideos.length,
            paperCount: paperResults.length,
            newsCount: newsResults.length
        }
    })

    return {
        query,
        expandedQueries,
        webResults: uniqueWeb,
        newsResults,
        paperResults,
        videos: uniqueVideos,
        ragContext: ragCtx.contextText,
        summary
    }
}
