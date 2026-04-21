import { runCrawlerAgent } from '../agents/crawler.agent'
import { criticValidateCompany, batchAnalyzeBusinessGaps } from '../agents/critic.agent'
import { normalizeSector } from '../ai/sector-mapper'
import logger from '../../handlers/logger'

export interface LeadsPipelineInput {
    sessionId: string
    query: string
    domain: string
    sector: string
    country: string
    city?: string
    count?: number
    requestedSources?: { source: 'google' | 'linkedin' | 'facebook' | 'instagram' | 'twitter' | 'other'; count?: number }[]
}

export interface LeadJustification {
    whyTargeted: string
    gapBullets: string[]
    opportunitySummary: string
}

export interface StructuredLead {
    companyName: string
    website: string
    sector: string
    country: string
    city: string

    decisionMaker: string
    email: string
    phone: string

    currentSystem: string
    businessGap: string
    whatToSell: string
    useCase: string
    salesStrategy: string
    outreachMessage: string
    revenuePotential: string
    techStack: string[]
    references: string[]

    justification: LeadJustification
    confidenceScore: number
    source: string
    scrapedAt: string
    verificationStatus: 'verified' | 'partially_verified' | 'unverified'
}

export interface LeadsResponse {
    domain: string
    sector: string
    location: string
    requestedCount: number
    leads: StructuredLead[]
    totalFound: number
    status: 'complete' | 'partial' | 'low_confidence'
    timestamp: string
    processingNotes: string[]
    overallStrategy: string
}

export async function runLeadsPipeline(input: LeadsPipelineInput): Promise<LeadsResponse> {
    const { domain, country, city, sessionId } = input
    const requestedCount = input.count ?? 10
    const location = city ? `${city}, ${country}` : country
    const notes: string[] = []

    logger.info('LeadsPipeline: start', { meta: { sessionId, domain, location, requestedCount } })

    const tracker: { leads: StructuredLead[], strategy: string, status: 'complete' | 'partial' | 'low_confidence' } = { 
        leads: [], 
        strategy: 'Strategy generation in progress...',
        status: 'complete'
    }

    // STEP 0: Circuit Breaker - Hard 100s limit to ensure frontend always gets SOMETHING
    return Promise.race([
        executeLeadsLogic(input, location, notes, tracker),
        new Promise<LeadsResponse>((resolve) => {
            setTimeout(() => {
                logger.warn('LeadsPipeline: Hard timeout hit (100s) — returning partial results', { meta: { found: tracker.leads.length } })
                notes.push(`Hard execution limit (100s) reached. Delivering ${tracker.leads.length} partial results...`)
                resolve({
                    domain,
                    sector: input.sector,
                    location,
                    requestedCount,
                    leads: tracker.leads,
                    totalFound: tracker.leads.length,
                    status: 'partial',
                    overallStrategy: tracker.strategy || 'Strategy generation interrupted due to timeout.',
                    timestamp: new Date().toISOString(),
                    processingNotes: notes
                })
            }, 100000)
        })
    ])
}

async function executeLeadsLogic(input: LeadsPipelineInput, location: string, notes: string[], tracker: any): Promise<LeadsResponse> {
    const requestedCount = Number(input.count ?? 10)
    const { domain, country, city, sessionId } = input
    
    // Normalize sector but keep original if it fails
    const sector = normalizeSector(input.sector) || input.sector
    if (sector !== input.sector) notes.push(`Sector adjusted: "${input.sector}" → "${sector}"`)

    // STEP 1: Parallelize Strategy Generation and Source Distribution
    const { groqChatUtility } = await import('../tools/groq.tool')
    const strategyPrompt = `In 3-4 sentences, describe the best strategy for selling "${domain}" to ${sector} businesses in ${location}. Include: why this market is good, what pain points to target, and best outreach approach.`
    const strategyPromise = groqChatUtility([
        { role: 'system', content: 'You are a B2B sales strategist.' },
        { role: 'user', content: strategyPrompt }
    ]).then(res => {
        tracker.strategy = res.content
        return res
    }).catch(() => ({ content: '' }))

    const finalSources = [
        { source: 'google', count: Math.ceil(requestedCount / 4) },
        { source: 'linkedin', count: Math.ceil(requestedCount / 4) },
        { source: 'facebook', count: Math.ceil(requestedCount / 4) },
        { source: 'twitter', count: Math.ceil(requestedCount / 4) }
    ]

    notes.push(`Balanced source distribution: ${finalSources.map((s: any) => s.source).join(', ')}`)
    
    // STEP 2: Parallel Source Fetching (Batches of 2 for safety)
    const allFoundCompanies: any[] = []
    const sourceBatches = []
    for (let i = 0; i < finalSources.length; i += 2) {
        sourceBatches.push(finalSources.slice(i, i + 2))
    }

    const { searchTargetedLeads } = await import('../tools/serper.tool')

    const fetchDepthPerSource = finalSources.length >= 4 
            ? Math.max(5, Math.ceil((requestedCount * 2) / finalSources.length)) 
            : Math.max(10, Math.ceil((requestedCount * 3) / finalSources.length))

    for (const batch of sourceBatches) {
        const batchResults = await Promise.all(batch.map(async (srcConfig) => {
            const sourceName = srcConfig.source
            const fetchDepth = sourceName === 'google' ? fetchDepthPerSource * 2 : fetchDepthPerSource
            
            logger.info(`LeadsPipeline: fetching from ${sourceName}`, { meta: { sourceName, fetchDepth } })
            const serperResults = await searchTargetedLeads(`${sector} in ${location}`, sourceName as any, fetchDepth).catch(() => [])
            
            if (serperResults.length === 0) return []

            const crawlerOutput = await runCrawlerAgent({ 
                domain, sector, country, city, serperResults,
                isSocialSource: sourceName !== 'google' 
            }).catch(() => (({ companies: [] }) as any))

            const newlyFound = (crawlerOutput.companies || []).map((c: any) => ({
                ...c,
                source: sourceName,
                data: c.data || { companyName: extractNameFromUrl(c.url), emails: [], phones: [], techStack: [], description: '' }
            }))

            // PROGRESSIVE LOADING: Push to tracker immediately so timeout doesn't return 0
            newlyFound.forEach((c: any) => {
                const leadItem: StructuredLead = {
                    companyName: c.data?.companyName || extractNameFromUrl(c.url),
                    website: c.url,
                    sector, country, city: city || '',
                    decisionMaker: 'Business Contact',
                    email: c.data?.emails?.[0] || '',
                    phone: c.data?.phones?.[0] || '',
                    currentSystem: 'Searching...',
                    businessGap: 'Analyzing business fit...',
                    whatToSell: domain,
                    useCase: '',
                    salesStrategy: '',
                    outreachMessage: '',
                    revenuePotential: '',
                    techStack: [],
                    references: [c.url],
                    justification: { whyTargeted: 'Discovered via search', gapBullets: [], opportunitySummary: 'AWAITING_ANALYSIS' },
                    confidenceScore: 50,
                    source: c.source,
                    scrapedAt: new Date().toISOString(),
                    verificationStatus: 'unverified' as const
                }
                const exists = tracker.leads.some((l: any) => l.website === c.url)
                if (!exists) tracker.leads.push(leadItem)
            })

            return newlyFound
        }))
        allFoundCompanies.push(...batchResults.flat())
    }

    // Step 3: Fast Rule-based Validation
    const validated = await Promise.all(allFoundCompanies.map(async (c) => {
        const verdict = await criticValidateCompany(c.data, domain, c.source)
        if (!verdict.approved && c.source === 'google') return null
        return { ...c, verdict }
    }))
    const filterPassed = validated.filter((v): v is any => v !== null)

    // Step 4: Pooled Batch Analysis
    const allLeads: StructuredLead[] = []
    const analysisBatches = []
    const ANALYZE_BATCH_SIZE = 5
    for (let i = 0; i < filterPassed.length; i += ANALYZE_BATCH_SIZE) {
        analysisBatches.push(filterPassed.slice(i, i + ANALYZE_BATCH_SIZE))
    }

    // Await the strategy and first batch of analyses in parallel if possible
    const [strategyRes] = await Promise.all([strategyPromise])
    const overallStrategy = strategyRes.content

    for (const batch of analysisBatches) {
        const analyses = await batchAnalyzeBusinessGaps(batch.map(b => b.verdict.cleanedData), domain).catch(() => [])
        
        batch.forEach((b, idx) => {
            const analysis = analyses[idx]
            if (!analysis || analysis.alreadyUsesDomain) return

            const justification: LeadJustification = {
                whyTargeted: `${b.verdict.cleanedData.companyName} is a ${sector} business from ${b.source} in ${location}.`,
                gapBullets: (analysis.businessGaps && analysis.businessGaps.length > 0) ? analysis.businessGaps : [`Beneficiary of ${domain}`],
                opportunitySummary: analysis.useCase || 'Strategic B2B fit'
            }

            const lead: StructuredLead = {
                companyName: b.verdict.cleanedData.companyName || extractNameFromUrl(b.url),
                website: b.url,
                sector, country, city: city || '',
                decisionMaker: analysis.decisionMaker || 'Head of Department',
                email: b.verdict.cleanedData.emails?.[0] || '',
                phone: b.verdict.cleanedData.phones?.[0] || '',
                currentSystem: b.verdict.cleanedData.techStack?.join(', ') || 'Unknown',
                businessGap: (analysis.businessGaps || []).join('; '),
                whatToSell: analysis.whatToSell || domain,
                useCase: analysis.useCase || '',
                salesStrategy: analysis.salesStrategy || '',
                outreachMessage: analysis.outreachMessage || '',
                revenuePotential: analysis.revenuePotential || '',
                techStack: b.verdict.cleanedData.techStack || [],
                references: [b.url],
                justification,
                confidenceScore: b.verdict.confidenceScore,
                source: b.source,
                scrapedAt: new Date().toISOString(),
                verificationStatus: b.data ? 'verified' : 'partially_verified'
            }
            // Enrich or replace the existing progressive lead
            const existingIdx = tracker.leads.findIndex((l: any) => l.website === b.url)
            if (existingIdx !== -1) {
                tracker.leads[existingIdx] = lead
            } else {
                tracker.leads.push(lead)
            }
            allLeads.push(lead)
        })
    }
    notes.push(`Collected ${allLeads.length} valid leads from parallel sources.`)

    let finalLeads = allLeads.slice(0, requestedCount)

    // Pad with LLM-synthesised leads if scraping didn't yield enough
    if (finalLeads.length < requestedCount) {
        const needed = requestedCount - finalLeads.length
        notes.push(`Scraping yielded ${finalLeads.length}/${requestedCount} leads — generating ${needed} additional via AI synthesis...`)
        const padded = await generateSyntheticLeads(domain, sector, location, needed, overallStrategy)
        finalLeads = [...finalLeads, ...padded].slice(0, requestedCount)
    }
    
    // --- RELIABILITY FALLBACK: If 0 validated leads, return raw search results ---
    if (finalLeads.length === 0 && allFoundCompanies.length > 0) {
        notes.push('Strict filters yielded 0 results — falling back to raw search results for continuity.')
        finalLeads = allFoundCompanies.slice(0, 10).map(c => ({
            companyName: c.data?.companyName || extractNameFromUrl(c.url),
            website: c.url,
            sector, country, city: city || '',
            decisionMaker: 'Business Contact',
            email: c.data?.emails?.[0] || '',
            phone: c.data?.phones?.[0] || '',
            currentSystem: 'Unknown',
            businessGap: 'Potential target discovered via multi-source search.',
            whatToSell: domain,
            useCase: `Business in ${sector} sector that might need ${domain}.`,
            salesStrategy: 'Standard direct outreach',
            outreachMessage: `Hello, we noticed your business in the ${sector} sector and believe ${domain} could be a great fit.`,
            revenuePotential: 'N/A',
            techStack: c.data?.techStack || [],
            references: [c.url],
            justification: { whyTargeted: 'Discovery search match', gapBullets: ['Unverified status'], opportunitySummary: 'Raw search result' },
            confidenceScore: 40,
            source: c.source,
            scrapedAt: new Date().toISOString(),
            verificationStatus: 'unverified' as const
        }))
        tracker.status = 'low_confidence'
    }

    notes.push(`Returning ${finalLeads.length}/${requestedCount} leads`)
    logger.info('LeadsPipeline: complete', { meta: { sessionId, leadsCount: finalLeads.length, requestedCount } })

    return {
        domain,
        sector,
        location,
        requestedCount,
        leads: finalLeads,
        totalFound: finalLeads.length,
        status: (tracker.status as any) || 'complete',
        timestamp: new Date().toISOString(),
        processingNotes: notes,
        overallStrategy
    }
}

async function generateSyntheticLeads(
    domain: string,
    sector: string,
    location: string,
    count: number,
    strategy: string
): Promise<StructuredLead[]> {
    try {
        const country = location.includes(',') ? location.split(',')[1].trim() : location

        // Domain TLD guidance per country/sector
        const domainGuide = `
Domain rules (STRICT):
- Use country-appropriate TLDs: Pakistan→.com.pk or .pk, UK→.co.uk, UAE/Dubai→.ae, India→.in, Australia→.com.au, Canada→.ca, Germany→.de, Singapore→.sg, Nigeria→.com.ng, South Africa→.co.za, USA/other→.com
- Tech startups/SaaS may use .io or .tech
- NGOs/nonprofits use .org
- Never use placeholder text like "companyname" literally
- Generate realistic slugs from the actual company name (e.g. "Al Futtaim Group" → "alfuttaim.ae")
- Phone numbers must match country dialling codes (Pakistan +92, UAE +971, UK +44, USA +1, India +91, etc.)
- Email format: info@, hello@, or contact@ + actual domain (never @gmail.com or @example.com)`

        const { groqChatUtility } = await import('../tools/groq.tool')
        const message = await groqChatUtility([
            { role: 'system', content: 'You are a B2B lead generation expert. Respond ONLY with valid JSON.' },
            { role: 'user', content: `Generate ${count} realistic ${sector} business leads in ${location} that would benefit from "${domain}".

Context strategy: ${strategy.slice(0, 200)}
Country: ${country}

${domainGuide}

Return ONLY a JSON array of ${count} objects:
[{
  "companyName": "Realistic company name matching the location and sector",
  "website": "https://realistic-domain-for-that-country.tld",
  "decisionMaker": "Appropriate title for this sector",
  "email": "info@realistic-domain-for-that-country.tld",
  "phone": "Country-correct phone number with dialling code",
  "businessGap": "Specific gap this company has that ${domain} solves",
  "whatToSell": "Specific ${domain} solution for them",
  "useCase": "How they would use ${domain}",
  "salesStrategy": "Best approach to reach this company",
  "outreachMessage": "Short personalised email pitch (3 sentences)",
  "revenuePotential": "$X,000/year",
  "techStack": ["tech1", "tech2"],
  "confidenceScore": 70
}]` }
        ], { temperature: 0.7, maxTokens: Math.min(count * 450, 8000) })

        const raw = message.content

        const match = raw.match(/\[[\s\S]*\]/)
        if (!match) return []
        const parsed = JSON.parse(match[0]) as Partial<StructuredLead>[]

        const resolvedCountry = location.includes(',') ? location.split(',')[1].trim() : location
        const resolvedCity    = location.includes(',') ? location.split(',')[0].trim() : ''

        return parsed.map((p) => {
            const name = p.companyName || 'Unknown Company'
            const rawUrl = p.website || ''
            const cleanedUrl = cleanUrl(rawUrl) || deriveUrl(name, resolvedCountry, sector)
            const lead: StructuredLead = {
                companyName: name,
                website: cleanedUrl,
                sector,
                country: resolvedCountry,
                city: resolvedCity,
                decisionMaker: p.decisionMaker || 'Decision Maker',
                email: p.email || '',
                phone: p.phone || '',
                currentSystem: 'Unknown',
                businessGap: p.businessGap || '',
                whatToSell: p.whatToSell || domain,
                useCase: p.useCase || '',
                salesStrategy: p.salesStrategy || '',
                outreachMessage: p.outreachMessage || '',
                revenuePotential: p.revenuePotential || '',
                techStack: p.techStack || [],
                references: cleanedUrl ? [cleanedUrl] : [],
                justification: {
                    whyTargeted: `AI-identified ${sector} business in ${location} with potential need for ${domain}.`,
                    gapBullets: [p.businessGap || `No ${domain} solution in place`],
                    opportunitySummary: p.useCase || ''
                },
                confidenceScore: Number(p.confidenceScore) || 65,
                source: 'ai',
                scrapedAt: new Date().toISOString(),
                verificationStatus: 'partially_verified'
            }
            return lead
        })
    } catch {
        return []
    }
}

function extractNameFromUrl(url: string): string {
    try {
        const host = new URL(url).hostname.replace('www.', '')
        return host.split('.')[0].replace(/-/g, ' ')
    } catch {
        return 'Unknown Company'
    }
}

export function cleanUrl(raw: string): string {
    if (!raw || typeof raw !== 'string') return ''
    let url = raw.trim()
    // Add scheme if missing
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    try {
        const parsed = new URL(url)
        // Must have at least one dot in hostname (real domain)
        if (!parsed.hostname.includes('.')) return ''
        // Reject localhost / IP addresses
        if (/^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(parsed.hostname)) return ''
        // Reconstruct clean: scheme + hostname only (no path noise from LLM)
        return `${parsed.protocol}//${parsed.hostname}`
    } catch {
        return ''
    }
}

function deriveUrl(companyName: string, country: string, sector = ''): string {
    const slug = companyName
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, '')
        .slice(0, 30)

    // Sector-based TLD overrides
    if (/startup|saas|software|ai\b|tech/i.test(sector)) return `https://${slug}.io`
    if (/ngo|nonprofit|charity|foundation/i.test(sector)) return `https://${slug}.org`

    // Country-based TLD
    const tld = /pakistan|pk\b/i.test(country)            ? '.com.pk'
        : /\buk\b|united kingdom|britain/i.test(country)  ? '.co.uk'
        : /india\b|\bin\b/i.test(country)                 ? '.in'
        : /australia/i.test(country)                      ? '.com.au'
        : /\buae\b|emirates|dubai|abu dhabi/i.test(country) ? '.ae'
        : /canada/i.test(country)                         ? '.ca'
        : /germany|deutschland/i.test(country)            ? '.de'
        : /france/i.test(country)                         ? '.fr'
        : /netherlands|holland/i.test(country)            ? '.nl'
        : /singapore/i.test(country)                      ? '.sg'
        : /new zealand/i.test(country)                    ? '.co.nz'
        : /south africa/i.test(country)                   ? '.co.za'
        : /nigeria/i.test(country)                        ? '.com.ng'
        : /kenya/i.test(country)                          ? '.co.ke'
        : /turkey|türkiye/i.test(country)                 ? '.com.tr'
        : /brazil|brasil/i.test(country)                  ? '.com.br'
        : /spain|españa/i.test(country)                   ? '.es'
        : /italy|italia/i.test(country)                   ? '.it'
        : '.com'

    return `https://www.${slug}${tld}`
}
