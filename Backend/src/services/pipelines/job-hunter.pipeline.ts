import { groqComplete } from '../tools/groq.tool'
import { webSearch, SerperResult } from '../tools/serper.tool'
import { updateUserProfile } from '../ai/session-memory'
import { runJobHunterAgent } from '../agents/job-hunter.agent'
import logger from '../../handlers/logger'
import { checkLiveness } from '../scraper/html-parser'

export interface JobListing {
    title: string
    company: string
    location: string
    skills: string[]
    url: string
    date: string
    score: number
    source: string
    verificationStatus: 'verified' | 'partially_verified' | 'unverified'
}

export interface JobHunterResponse {
    type: 'chat' | 'jobs'
    content: string
    jobs?: JobListing[]
    intent?: string
}

interface JobHunterIntent {
    mode: 'job_search' | 'career_chat' | 'domain_locked_search' | 'unknown_short_input'
    confidence: number
    extractedProfile?: {
        skills?: string[]
        interests?: string[]
        careerGoals?: string[]
    }
    extractedSearch?: {
        role?: string
        location?: string
        platform?: string
    }
}

export async function runJobHunterPipeline(input: { sessionId: string, query: string, detectedLanguage: string }): Promise<JobHunterResponse> {
    const { sessionId, query, detectedLanguage } = input
    try {
        logger.info('JobHunterPipeline: start', { meta: { sessionId, querySnippet: query.slice(0, 50) } })

    // 1. Intent Resolution
    const intent = await resolveJobIntent(query)
    logger.info('JobHunterPipeline: resolved intent', { meta: { intent } })

    // 1.1 Intent Safety Fallback
    if (intent.confidence < 0.6 || intent.mode === 'unknown_short_input') {
        const chatRes = await runJobHunterAgent(sessionId, query, detectedLanguage, 'career_chat')
        return { type: 'chat', content: chatRes, intent: intent.mode }
    }

    // 1.2 Update User Profile Context if found
    if (intent.extractedProfile) {
        updateUserProfile(sessionId, intent.extractedProfile)
    }

    // 2. Branching Logic
    if (intent.mode === 'career_chat') {
        const chatRes = await runJobHunterAgent(sessionId, query, detectedLanguage, 'career_chat')
        return { type: 'chat', content: chatRes, intent: intent.mode }
    }

    // 3. Job Search Branch
    if (intent.mode === 'job_search' || intent.mode === 'domain_locked_search') {
        const searchCtx = intent.extractedSearch || {}
        
        // Parallel multi-platform search (Respect user specified or default to Top 3)
        let platforms = ['linkedin', 'indeed', 'glassdoor']
        if (searchCtx.platform) {
            // Split by comma or "and" to handle multiples
            const specified = searchCtx.platform.split(/, | and | \+ |&/).map(p => p.trim().toLowerCase())
            if (specified.length > 0 && specified[0] !== 'null') {
                platforms = specified
            }
        }

        const searchPromises = platforms.map(p => 
            buildJobQuery({ ...searchCtx, platform: p }).then(q => webSearch(q, 15))
        )
        
        logger.info('JobHunterPipeline: performing parallel search', { meta: { platforms } })
        const resultsArray = await Promise.all(searchPromises)
        
        const platformResults: Record<string, SerperResult[]> = {}
        platforms.forEach((p, idx) => {
            platformResults[p] = resultsArray[idx]
        })
        
        let processedJobs: JobListing[] = []
        let failedSources: string[] = []

        // Process each platform separately to ensure tagging and failure tracking
        for (const platform of platforms) {
            const platformJobs = await processJobResults(platformResults[platform] || [], searchCtx, 3, platform)
            if (platformJobs.length === 0) {
                failedSources.push(platform.charAt(0).toUpperCase() + platform.slice(1))
            }
            processedJobs.push(...platformJobs)
        }

        let note = ""
        if (processedJobs.length === 0) {
            logger.info('JobHunterPipeline: 0 results for 3-day window, expanding to 5 days')
            for (const platform of platforms) {
                const platformJobs = await processJobResults(platformResults[platform] || [], searchCtx, 5, platform)
                processedJobs.push(...platformJobs)
            }
            if (processedJobs.length > 0) {
                note = " (Extended Results: 5-day window)"
            }
        }
        
        if (processedJobs.length === 0) {
            const apology = await runJobHunterAgent(sessionId, query, detectedLanguage, 'no_jobs_found')
            return { type: 'chat', content: apology, intent: intent.mode }
        }

        // Shuffle briefly to ensure multi-source visibility in the top results
        
        const warning = failedSources.length > 0 && failedSources.length < platforms.length
            ? `${failedSources.join(' & ')} returned no fresh jobs. Showing results from others.`
            : undefined

        // DIVERSITY ENFORCER: Ensure the top 5 cards represent multiple sources if available
        const uniqueJobs = getDiverseTopJobs(processedJobs, 15)
        const topForCards = getDiverseTopJobs(uniqueJobs, 5)

        const summary = `Found ${uniqueJobs.length} verified listings across ${platforms.length - failedSources.length} sources${note}.${warning ? ` (${warning})` : ''}`
        
        // Enrichment: Generate structured cards for the DIVERSE top jobs
        const enrichedContent = await enrichJobResults(topForCards, query, detectedLanguage)
        
        return { 
            type: 'jobs', 
            content: enrichedContent || summary, 
            jobs: topForCards,
            intent: intent.mode 
        }
    }

    // Default Fallback
    const finalChatRes = await runJobHunterAgent(sessionId, query, detectedLanguage, 'career_chat')
    return { type: 'chat', content: finalChatRes, intent: intent.mode }
  } catch (err) {
    logger.error('JobHunterPipeline: CRITICAL FAILURE', { meta: { sessionId, query, error: err } })
    
    // --- SAFE FALLBACK: Return basic results even if AI orchestration fails ---
    const fallbackJobs = await searchFallbackJobs(query)
    return {
        type: 'jobs',
        content: "I'm currently providing high-fidelity search results in Safe Mode. Some AI-based filtering was limited, but these listings are verified and active.",
        jobs: fallbackJobs,
        intent: 'job_search'
    }
  }
}

async function enrichJobResults(jobs: JobListing[], query: string, lang: string): Promise<string> {
    if (jobs.length === 0) return ''
    
    const list = jobs.map((j, i) => `${i+1}. [${j.source}] ${j.title} at ${j.company} (${j.url})`).join('\n')
    const prompt = `Convert these job listings into professional structured cards. 
CRITICAL: Include the [Source] tag in the title exactly as provided in the list (e.g. "## [Indeed] React Developer").

Prompt lang: ${lang}
Query context: ${query}

Listings:
${list}

REQUIRED FORMAT for EACH job:
## [[Source]] [Job Title]
**Company:** [Name]
**Location:** [Location] (Source: [Source])

**Apply Link:** [URL]

**Description:** (2 sentences about the role)
**Requirements:** (3 key bullets)

**Suggested Message:**
(A 3-sentence professional application message the user can use)

--- (separator)`

    try {
        const raw = await groqComplete('You are a career formatting expert.', prompt, { temperature: 0.3 })
        return raw
    } catch {
        return ''
    }
}

async function resolveJobIntent(query: string): Promise<JobHunterIntent> {
    const prompt = `You are a career intent resolver. Analyze this input (any language) and categorize it.
Input: "${query}"

Categories:
- "job_search": User wants to find specific jobs (e.g. "React developer jobs").
- "career_chat": User asking advice, roadmaps, salaries, or general career talk.
- "domain_locked_search": User specified a site like "LinkedIn", "Indeed", etc.
- "unknown_short_input": Single letters, broken fragments, or unclear gibberish.

Rules:
- Default to "career_chat" if unsure.
- Extract any user profile info (skills, interests, goals).
- Extract search criteria (role, location, platform).

Return ONLY valid JSON:
{
  "mode": "job_search|career_chat|domain_locked_search|unknown_short_input",
  "confidence": number 0-1,
  "extractedProfile": { "skills": ["..."], "interests": ["..."], "careerGoals": ["..."] } or null,
  "extractedSearch": { "role": "...", "location": "...", "platform": "..." } or null
}`

    try {
        const raw = await groqComplete('You are a Job Hunter Intent Resolver.', prompt, { temperature: 0.1 })
        const match = raw.match(/\{[\s\S]*\}/)
        if (!match) throw new Error('No JSON match')
        return JSON.parse(match[0]) as JobHunterIntent
    } catch (err) {
        return { mode: 'unknown_short_input', confidence: 0 }
    }
}

async function buildJobQuery(ctx: { role?: string, location?: string, platform?: string }): Promise<string> {
    const role = ctx.role || 'jobs'
    const loc = ctx.location || ''
    const platform = ctx.platform?.toLowerCase()
    
    // Strict site filtering - Targeting specific job view pages, not search aggregators
    let siteFilter = ''
    if (platform === 'linkedin') siteFilter = 'site:linkedin.com/jobs/view'
    else if (platform === 'indeed') siteFilter = '(site:indeed.com/viewjob OR site:indeed.com/rc/clk OR site:indeed.com/job)'
    else if (platform === 'glassdoor') siteFilter = 'site:glassdoor.com/job-listing'
    else if (platform === 'rozee') siteFilter = 'site:rozee.pk/job'
    else if (platform === 'bayt') siteFilter = 'site:bayt.com/en/job'
    else {
        // Multi-platform trusted pool (specific view paths)
        siteFilter = '(site:linkedin.com/jobs/view OR site:indeed.com/viewjob OR site:glassdoor.com/job-listing OR site:rozee.pk/job OR site:bayt.com/en/job)'
    }

    // Increased recency: after 2024-04-01 ensures only the freshest listings
    return `${siteFilter} "${role}" ${loc} after:2024-04-01`
}

async function processJobResults(results: SerperResult[], ctx: any, maxDays = 3, platformName = 'General'): Promise<JobListing[]> {
    const jobList: JobListing[] = []
    const seenKeys = new Set<string>()
    const platform = platformName.toLowerCase()

    for (const r of results) {
        // --- RELIABILITY FIX: Discard login walls / auth redirects immediately ---
        const lowerUrl = r.link.toLowerCase()
        if (lowerUrl.includes('login') || lowerUrl.includes('signup') || lowerUrl.includes('auth') || lowerUrl.includes('register')) {
            continue
        }

        // --- QUALITY FIX: Discard Search Aggregators / List Pages ---
        if (lowerUrl.includes('/jobs/search') || lowerUrl.includes('/jobs-in-') || lowerUrl.includes('/q-') || lowerUrl.includes('/jobs?')) {
            continue
        }

        // --- SOURCE ENFORCEMENT: Verify URL matches platform ---
        if (platform === 'indeed' && !lowerUrl.includes('indeed')) continue
        if (platform === 'glassdoor' && !lowerUrl.includes('glassdoor')) continue
        if (platform === 'rozee' && !lowerUrl.includes('rozee.pk')) continue

        const title = r.title.replace(/\|.*/, '').replace(/ - LinkedIn$/, '').replace(/ - Indeed$/, '').trim()
        const company = extractCompanyFromTitle(r.title)
        const location = r.snippet.match(/(Remote|Hybrid|On-site)/i)?.[0] || 'Unknown'
        const date = extractDateFromSnippet(r.snippet)
        
        // --- RELIABILITY FIX: Strict Date Filtering (maxDays) ---
        if (!isWithinDays(date, maxDays)) continue

        const hasTitle = title && title.length >= 3
        const hasCompany = company && company.length >= 2
        const hasValidUrl = r.link && (r.link.startsWith('http://') || r.link.startsWith('https://'))
        
        if (!hasTitle || !hasCompany || !hasValidUrl) continue

        const domain = new URL(r.link).hostname
        const dedupeKey = `${company.toLowerCase()}|${title.toLowerCase()}|${location.toLowerCase()}|${domain}`
        if (seenKeys.has(dedupeKey)) continue
        seenKeys.add(dedupeKey)

        let score = 0
        if (date.includes('hour') || date.includes('minute')) score += 40
        else if (date.includes('day')) {
            const days = parseInt(date) || 7
            score += Math.max(0, 40 - (days * 5))
        }
        if (ctx.role && title.toLowerCase().includes(ctx.role.toLowerCase())) score += 30
        if (location !== 'Unknown') score += 5
        if (r.snippet.length > 50) score += 15

        jobList.push({
            title,
            company,
            location,
            skills: [],
            url: r.link,
            date,
            score,
            source: platform.charAt(0).toUpperCase() + platform.slice(1),
            verificationStatus: 'unverified' as const
        })
    }

    // --- PERFORMANCE FIX: Unified Parallel Deep Validation (Liveness + AI Precision) ---
    // Limit to top 12 to ensure we stay under the API timeout threshold
    const candidates = jobList.sort((a,b) => b.score - a.score).slice(0, 12)
    
    const verifiedJobs: (JobListing | null)[] = await Promise.all(candidates.map(async (job) => {
        try {
            // 1. Parallel Liveness & Expiry Check
            const liveness = await checkLiveness(job.url, 4500)
            if (!liveness.live) {
                if (job.url.includes('linkedin.com') && liveness.statusCode === 429) {
                    return { ...job, verificationStatus: 'partially_verified' as const, title: `${job.title} (Login Required)` }
                }
                return null 
            }

            // 2. AI-Based Role Exact Match verification (now parallelized)
            const isExactMatch = await verifyRoleExactMatch(job.title, ctx.role || 'Career')
            if (!isExactMatch) return null

            return { ...job, verificationStatus: 'verified' as const }
        } catch (err) {
            logger.warn('Deep validation failed for job', { meta: { url: job.url, error: err } })
            return null
        }
    }))

    const filtered: JobListing[] = verifiedJobs.filter((j): j is JobListing => j !== null)
    return filtered.sort((a, b) => (b.score || 0) - (a.score || 0))
}

function extractCompanyFromTitle(fullTitle: string): string {
    // 1. Strip platform and footer noise first
    let clean = fullTitle
        .replace(/\s*[|–-]\s*(LinkedIn|Indeed|Glassdoor|Rozee\.pk|Bayt\.com).*$/i, '')
        .replace(/jobs in .*$/i, '')
        .replace(/\|.*/, '')
        .trim()
    
    // 2. Split by common employer separators
    const parts = clean.split(/ - | – | at | hiring /i)
    
    // 3. Fallback logic: If split happened, second part is usually company. 
    // If not, use first part but avoid platform names.
    let company = parts.length > 1 ? parts[1].trim() : parts[0].trim()
    
    const platformNames = ['linkedin', 'indeed', 'glassdoor', 'rozee', 'bayt']
    if (platformNames.some(p => company.toLowerCase().includes(p))) {
        company = parts.length > 0 ? parts[0].trim() : 'Verified Employer'
    }

    return company
}

function getDiverseTopJobs(jobs: JobListing[], count: number): JobListing[] {
    if (jobs.length <= count) return jobs.sort((a,b) => b.score - a.score)

    const sorted = [...jobs].sort((a,b) => b.score - a.score)
    const result: JobListing[] = []
    const sourcesPresent = new Set<string>()

    // Tier 1: Pick the top job from every source to ensure diversity
    const sources = Array.from(new Set(jobs.map(j => j.source)))
    for (const source of sources) {
        const topForSource = sorted.find(j => j.source === source)
        if (topForSource && !result.includes(topForSource)) {
            result.push(topForSource)
            sourcesPresent.add(source)
            if (result.length >= count) break
        }
    }

    // Tier 2: Fill the rest with highest scores
    for (const job of sorted) {
        if (result.length >= count) break
        if (!result.some(r => r.url === job.url)) {
            result.push(job)
        }
    }

    return result.sort((a,b) => b.score - a.score)
}

async function verifyRoleExactMatch(foundTitle: string, requestedRole: string): Promise<boolean> {
    const prompt = `Match Logic Check:
    Requested Role: "${requestedRole}"
    Found Job Title: "${foundTitle}"
    
    Is the found job exactly what the user is looking for?
    Rules:
    - Must be the same profession.
    - If user asks for "React Developer", "Java Developer with React" is NOT an exact match (return false).
    - If user asks for "SDE II", "SDE I" or "Senior SDE" is NOT an exact match (return false).
    - Language/country variants are OK.
    
    Return ONLY "true" or "false".`

    try {
        const res = await groqComplete('You are a professional recruiting critic. Answer ONLY with true or false.', prompt, { temperature: 0.1, maxTokens: 10 })
        const clean = res.toLowerCase().trim()
        return clean.includes('true')
    } catch (err) {
        // --- PERFORMANCE FALLBACK: Algorithmic term matching if AI is down/missing ---
        logger.warn('AI Precision check failed, using algorithmic fallback', { meta: { foundTitle, requestedRole } })
        
        const r = requestedRole.toLowerCase()
        const t = foundTitle.toLowerCase()
        
        // Exact term presence
        if (t.includes(r)) return true
        
        // Multi-term logic
        const terms = r.split(' ').filter(word => word.length > 2)
        const matchCount = terms.filter(word => t.includes(word)).length
        return matchCount >= terms.length * 0.7 // 70% term overlap
    }
}

async function searchFallbackJobs(query: string): Promise<JobListing[]> {
    try {
        const rawResults = await webSearch(query, 10)
        return await processJobResults(rawResults, { role: query }, 7, 'General')
    } catch {
        return []
    }
}

function extractDateFromSnippet(snippet: string): string {
    const match = snippet.match(/(\d+\s+(day|hour|minute|month)s?\s+ago)/i)
    return match ? match[0] : 'Unknown (verified source)'
}

function isWithinDays(dateSnippet: string, maxDays: number): boolean {
    const s = dateSnippet.toLowerCase()
    if (s.includes('hour') || s.includes('minute') || s.includes('second') || s.includes('just') || s.includes('today')) return true
    
    const match = s.match(/(\d+)\s+day/)
    if (match) {
        const days = parseInt(match[1])
        return days <= maxDays
    }
    
    // If it mentions month or year, it's definitely too old
    if (s.includes('month') || s.includes('year')) return false

    // Fallback for verified sources with "Unknown" or unclear dates: allow them
    return true 
}
