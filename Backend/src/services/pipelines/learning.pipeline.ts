import { groqChat } from '../tools/groq.tool'
import { runResearcherAgent } from '../agents/researcher.agent'
import { getGroqHistory } from '../ai/session-memory'
import { detectLanguage, getResponseLanguageInstruction } from '../ai/language-detector'
import logger from '../../handlers/logger'

export interface LearningPipelineInput {
    sessionId: string
    query: string
}

// ─── Reference types — all include justification ──────────────────────────────

export interface ArticleReference {
    title: string
    source: string
    link: string
    summary: string
    justification: string
}

export interface VideoReference {
    title: string
    channel: string
    link: string
    summary: string
    thumbnail?: string
    justification: string
}

export interface PaperReference {
    title: string
    authors: string
    link: string
    insights: string       // key academic insights
    explanation: string    // plain-language explanation of what paper covers
    justification: string  // why it's specifically relevant to this query
}

export interface NewsReference {
    headline: string
    source: string
    link: string
    summary: string
    justification: string
}

export interface RequestedRefCounts {
    videos: number
    articles: number
    papers: number
    news: number
}

export interface DeliveredRefCounts {
    videos: number
    articles: number
    papers: number
    news: number
}

export interface LearningResponse {
    query: string
    simpleExplanation: string
    detailedBreakdown: string
    realWorldExamples: string
    advancedInsights: string
    requestedCounts: RequestedRefCounts
    deliveredCounts: DeliveredRefCounts
    notes: string[]   // shortfall reasons, warnings, etc.
    insights?: string[] // Top takeaways for standardized UI
    references: {
        articles: ArticleReference[]
        videos: VideoReference[]
        papers: PaperReference[]
        news: NewsReference[]
    }
    ragContextUsed: boolean
}

// ─── Reference count parser — detects "5 videos, 3 papers" etc. in query ─────

function parseReferenceRequest(query: string): RequestedRefCounts {
    const lower = query.toLowerCase()
    const CAP = 50  // hard ceiling per type

    const num = (regex: RegExp): number => {
        const m = lower.match(regex)
        return m ? Math.min(parseInt(m[1]), CAP) : 0
    }

    const videos   = num(/(\d+)\s*(?:youtube(?:\s*videos?)?|videos?|clips?)/i)
    const articles = num(/(\d+)\s*(?:web\s*)?(?:articles?|blogs?|posts?|websites?)/i)
    const papers   = num(/(\d+)\s*(?:research\s*|academic\s*)?(?:papers?|studies|publications?|journals?)/i)
    const news     = num(/(\d+)\s*(?:news(?:papers?)?s?|headlines?|press)/i)

    const anyExplicit = videos || articles || papers || news

    if (!anyExplicit) {
        // No count specified at all → minimum 3 per category (total 12 ≥ 10)
        return { videos: 3, articles: 4, papers: 3, news: 3 }
    }

    // Some counts specified → unmentioned types get minimum 3 each
    return {
        videos:   videos   || 3,
        articles: articles || 3,
        papers:   papers   || 3,
        news:     news     || 3,
    }
}

// ─── Batch justification + paper enrichment ───────────────────────────────────

interface JustItem {
    idx: number
    type: 'video' | 'article' | 'paper' | 'news'
    title: string
    snippet: string
}

interface JustResult {
    justification: string
    explanation?: string    // papers only
}

async function batchGenerateJustifications(query: string, items: JustItem[]): Promise<JustResult[]> {
    if (items.length === 0) return []

    const list = items
        .map((item, i) => `${i + 1}. [${item.type.toUpperCase()}] "${item.title}"\n   Snippet: ${item.snippet.slice(0, 120)}`)
        .join('\n\n')

    const prompt = `You are evaluating research relevance for the query: "${query}"

For each resource below, write:
- "justification": 1 sentence explaining why it's specifically relevant to the query
- "explanation": (ONLY for PAPER type) 1 sentence in plain language describing what the paper covers

Resources:
${list}

Return ONLY a valid JSON array with exactly ${items.length} objects:
[{"justification": "...", "explanation": "..."}, ...]

For non-paper types, omit "explanation" or set it to "".`

    try {
        const { groqChatUtility } = await import('../tools/groq.tool')
        const message = await groqChatUtility([
            { role: 'system', content: 'You are a research quality evaluator. Respond ONLY with a valid JSON array.' },
            { role: 'user', content: prompt }
        ], { temperature: 0.2, maxTokens: Math.min(items.length * 150 + 100, 3000) })
        
        const raw = message.content
        const match = raw.match(/\[[\s\S]*\]/)
        if (match) {
            const parsed = JSON.parse(match[0]) as JustResult[]
            if (parsed.length === items.length) return parsed
        }
    } catch (err) {
        logger.warn('Batch justification generation failed — using fallbacks', { meta: err })
    }

    return items.map(() => ({ justification: 'Directly relevant to the queried topic.', explanation: '' }))
}

// ─── System prompt ────────────────────────────────────────────────────────────

const LEARNING_SYSTEM_PROMPT = `You are an expert research assistant and educator. Your role is to:
1. Provide clear, accurate explanations without hallucination
2. Always cite evidence from provided search context
3. Structure responses with clear sections
4. Never invent facts — if uncertain, say so
5. Tailor depth to question complexity
6. Support all languages: English, Urdu, Roman Urdu, and mixed — always match the user's language`

// ─── Main pipeline ────────────────────────────────────────────────────────────

export async function runLearningPipeline(input: LearningPipelineInput): Promise<LearningResponse> {
    const { sessionId, query } = input

    logger.info('LearningPipeline: start', { meta: { sessionId, query: query.slice(0, 80) } })

    // 1. Parse what the user specifically wants
    const requestedCounts = parseReferenceRequest(query)

    // 2. Language detection
    const lang = detectLanguage(query)
    const langInstruction = getResponseLanguageInstruction(lang)

    // 3. Researcher agent fetches 3x each type
    const research = await runResearcherAgent(query, {
        web: requestedCounts.articles * 3,
        videos: requestedCounts.videos * 3,
        papers: requestedCounts.papers * 3,
        news: requestedCounts.news * 3
    })

    // 4. Build LLM context
    const webContext = research.webResults
        .slice(0, 8)
        .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\nURL: ${r.link}`)
        .join('\n\n')

    const newsContext = research.newsResults
        .slice(0, 4)
        .map((n) => `• ${n.title} (${n.source || 'Unknown'}): ${n.snippet}`)
        .join('\n')

    const ragContext = research.ragContext ? `\n\n[From Knowledge Base]:\n${research.ragContext}` : ''
    const fullContext = `Search Results:\n${webContext}\n\nNews:\n${newsContext}${ragContext}`

    const history = getGroqHistory(sessionId, LEARNING_SYSTEM_PROMPT)

    // 5. Generate 4-section explanation
    const synthesisPrompt = `Answer the user's query with four clearly structured sections.

USER QUERY: "${query}"
LANGUAGE INSTRUCTION: ${langInstruction}

CONTEXT:
${fullContext}

Respond with EXACTLY this JSON structure (no extra text). Write ALL text in the user's language:
{
  "simpleExplanation": "2-3 sentence plain answer for a beginner",
  "detailedBreakdown": "Thorough explanation with key concepts, mechanisms, and facts (300-500 words)",
  "realWorldExamples": "3-4 concrete real-world examples or use cases",
  "advancedInsights": "Expert-level nuances, recent developments, limitations, future outlook (200-300 words)"
}`

    // 5. Parallel Processing: Synthesis (70b) + Justifications (8b Utility)
    const synthesisPromise = (async () => {
        history.push({ role: 'user', content: synthesisPrompt })
        // Proactive jitter delay to avoid burst rate limits on 70b synthesis
        await new Promise(r => setTimeout(r, 500 + Math.random() * 500))
        try {
            const res = await groqChat(history, { temperature: 0.6, maxTokens: 3000 })
            const match = res.content.match(/\{[\s\S]*\}/)
            if (match) {
                const parsed = JSON.parse(match[0]) as Record<string, string>
                return {
                    simpleExplanation: parsed.simpleExplanation || '',
                    detailedBreakdown: parsed.detailedBreakdown || '',
                    realWorldExamples: parsed.realWorldExamples || '',
                    advancedInsights: parsed.advancedInsights || ''
                }
            }
            return { simpleExplanation: res.content.slice(0, 400), detailedBreakdown: '', realWorldExamples: '', advancedInsights: '' }
        } catch (err) {
            logger.error('LearningPipeline: LLM synthesis failed', { meta: err })
            const msg = err instanceof Error ? err.message : ''
            if (msg.includes('rate limit') || msg.includes('rate_limit')) throw err
            return { simpleExplanation: 'I encountered an error generating a response. Please try again.', detailedBreakdown: '', realWorldExamples: '', advancedInsights: '' }
        }
    })()

    // 6. Select candidates for justifications
    const rawArticles = research.webResults
        .filter((r) => !r.link.includes('youtube.com') && !r.link.includes('arxiv.org'))
        .slice(0, requestedCounts.articles * 3)
    const rawVideos = research.videos.slice(0, requestedCounts.videos * 3)
    const rawPapers = research.paperResults.slice(0, requestedCounts.papers * 3)
    const rawNews = research.newsResults.slice(0, requestedCounts.news * 3)

    const justItems: JustItem[] = [
        ...rawArticles.slice(0, requestedCounts.articles).map((r, i) => ({
            idx: i, type: 'article' as const, title: r.title, snippet: r.snippet
        })),
        ...rawVideos.slice(0, requestedCounts.videos).map((v, i) => ({
            idx: i, type: 'video' as const, title: v.title, snippet: v.description.slice(0, 120)
        })),
        ...rawPapers.slice(0, requestedCounts.papers).map((p, i) => ({
            idx: i, type: 'paper' as const, title: p.title, snippet: p.snippet
        })),
        ...rawNews.slice(0, requestedCounts.news).map((n, i) => ({
            idx: i, type: 'news' as const, title: n.title, snippet: n.snippet
        }))
    ]

    const justificationPromise = batchGenerateJustifications(query, justItems)

    // Execute both in parallel
    const [synRes, justResults] = await Promise.all([synthesisPromise, justificationPromise])

    const { simpleExplanation, detailedBreakdown, realWorldExamples, advancedInsights } = synRes

    // Split justifications back per type
    let jIdx = 0
    const articleJust = rawArticles.slice(0, requestedCounts.articles).map(() => justResults[jIdx++] || { justification: '', explanation: '' })
    const videoJust = rawVideos.slice(0, requestedCounts.videos).map(() => justResults[jIdx++] || { justification: '', explanation: '' })
    const paperJust = rawPapers.slice(0, requestedCounts.papers).map(() => justResults[jIdx++] || { justification: '', explanation: '' })
    const newsJust = rawNews.slice(0, requestedCounts.news).map(() => justResults[jIdx++] || { justification: '', explanation: '' })

    // 8. Assemble final references — EXACT N of each type
    const articles: ArticleReference[] = rawArticles.slice(0, requestedCounts.articles).map((r, i) => ({
        title: r.title,
        source: extractDomain(r.link),
        link: r.link,
        summary: r.snippet,
        justification: articleJust[i]?.justification || ''
    }))

    const videos: VideoReference[] = rawVideos.slice(0, requestedCounts.videos).map((v, i) => ({
        title: v.title,
        channel: v.channel,
        link: v.link,
        summary: v.description.slice(0, 200),
        thumbnail: v.thumbnail,
        justification: videoJust[i]?.justification || ''
    }))

    const papers: PaperReference[] = rawPapers.slice(0, requestedCounts.papers).map((p, i) => ({
        title: p.title,
        authors: 'See paper',
        link: p.link,
        insights: p.snippet,
        explanation: paperJust[i]?.explanation || '',
        justification: paperJust[i]?.justification || ''
    }))

    const news: NewsReference[] = rawNews.slice(0, requestedCounts.news).map((n, i) => ({
        headline: n.title,
        source: n.source || extractDomain(n.link),
        link: n.link,
        summary: n.snippet,
        justification: newsJust[i]?.justification || ''
    }))

    const deliveredCounts: DeliveredRefCounts = {
        videos: videos.length,
        articles: articles.length,
        papers: papers.length,
        news: news.length
    }

    // Build shortfall notes so the user knows exactly why counts differ
    const notes: string[] = []
    const typeLabels: Array<[keyof RequestedRefCounts, keyof DeliveredRefCounts, string]> = [
        ['videos',   'videos',   'YouTube videos'],
        ['articles', 'articles', 'articles'],
        ['papers',   'papers',   'research papers'],
        ['news',     'news',     'news articles'],
    ]
    for (const [rKey, dKey, label] of typeLabels) {
        const req = requestedCounts[rKey]
        const got = deliveredCounts[dKey]
        if (req > 0 && got < req) {
            notes.push(`Requested ${req} ${label}, delivered ${got} — the search API returned fewer results than requested for this topic. Try a broader query for more results.`)
        }
    }

    logger.info('LearningPipeline: complete', {
        meta: {
            sessionId,
            delivered: deliveredCounts,
            requested: requestedCounts,
            shortfalls: notes.length
        }
    })

    // Final enrichment: Extract 3 key takeaways for the standardized UI
    const insights = advancedInsights
        .split('\n')
        .filter(line => line.trim().length > 10)
        .slice(0, 3)
        .map(s => s.replace(/^[•\-\*\d\.\s]+/, '').trim())

    return {
        query,
        simpleExplanation,
        detailedBreakdown,
        realWorldExamples,
        advancedInsights,
        requestedCounts,
        deliveredCounts,
        notes,
        insights: insights.length > 0 ? insights : ['Deep dive into research topics', 'Verified academic and web sources', 'Comprehensive detailed breakdown'],
        references: { articles, videos, papers, news },
        ragContextUsed: !!research.ragContext
    }
}

function extractDomain(url: string): string {
    try {
        return new URL(url).hostname.replace('www.', '')
    } catch {
        return url
    }
}
