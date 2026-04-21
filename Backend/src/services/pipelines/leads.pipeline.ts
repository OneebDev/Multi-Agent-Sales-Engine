import { searchCompanies } from '../tools/serper.tool'
import { runCrawlerAgent } from '../agents/crawler.agent'
import { criticValidateCompany, analyzeBusinessGap } from '../agents/critic.agent'
import { groqComplete } from '../tools/groq.tool'
import { normalizeSector, getSectorFallbacks } from '../ai/sector-mapper'
import { ExtractedCompanyData } from '../scraper/data-extractor'
import logger from '../../handlers/logger'

export interface LeadsPipelineInput {
    sessionId: string
    query: string
    domain: string
    sector: string
    country: string
    city?: string
    count?: number  // desired number of leads — default 10
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
    scrapedAt: string
}

export interface LeadsResponse {
    domain: string
    sector: string
    location: string
    requestedCount: number
    leads: StructuredLead[]
    totalFound: number
    timestamp: string
    processingNotes: string[]
    overallStrategy: string
}

export async function runLeadsPipeline(input: LeadsPipelineInput): Promise<LeadsResponse> {
    const { domain, country, city, sessionId } = input
    const requestedCount = input.count ?? 10
    const fetchCount = requestedCount * 3
    const location = city ? `${city}, ${country}` : country
    const notes: string[] = []

    // Normalize sector to a lead-gen friendly name
    const sector = normalizeSector(input.sector)
    if (sector !== input.sector) notes.push(`Sector normalized: "${input.sector}" → "${sector}"`)

    logger.info('LeadsPipeline: start', { meta: { sessionId, domain, sector, location, requestedCount, fetchCount } })

    // STEP 1: Generate overall strategy before searching
    notes.push(`Planning strategy for selling ${domain} to ${sector} in ${location}...`)
    const overallStrategy = await groqComplete(
        'You are a B2B sales strategist.',
        `In 3-4 sentences, describe the best strategy for selling "${domain}" to ${sector} businesses in ${location}. Include: why this market is good, what pain points to target, and best outreach approach.`,
        { temperature: 0.5, maxTokens: 300 }
    ).catch(() => '')

    // STEP 2: Search with fallback logic
    notes.push(`Searching for ${fetchCount} ${sector} companies in ${location}...`)
    let serperResults = await searchCompanies(domain, sector, location, fetchCount)
    notes.push(`Found ${serperResults.length} search results`)

    // If no results, try fallback sectors in order
    if (serperResults.length === 0) {
        const fallbacks = getSectorFallbacks(sector)
        for (const fallbackSector of fallbacks) {
            notes.push(`No results for "${sector}" — trying fallback: "${fallbackSector}"...`)
            serperResults = await searchCompanies(domain, fallbackSector, location, fetchCount)
            if (serperResults.length > 0) {
                notes.push(`Found ${serperResults.length} results using fallback sector "${fallbackSector}"`)
                break
            }
        }
    }

    if (serperResults.length === 0) {
        notes.push('All sectors exhausted — generating AI leads directly...')
        const synth = await generateSyntheticLeads(domain, sector, location, requestedCount, overallStrategy)
        return {
            domain, sector, location, requestedCount,
            leads: synth,
            totalFound: synth.length,
            timestamp: new Date().toISOString(),
            processingNotes: [...notes, `Generated ${synth.length} AI-synthesised leads.`],
            overallStrategy
        }
    }

    // STEP 3 & 4: Crawl companies
    notes.push('Scraping company websites...')
    const crawlerOutput = await runCrawlerAgent({ domain, sector, country, city, serperResults })
    notes.push(`Successfully scraped ${crawlerOutput.successCount}/${crawlerOutput.totalScraped} sites`)

    // STEP 5 & 6: Validate, gap-detect, build structured leads
    notes.push(`Analyzing leads (need ${requestedCount}, analyzing up to ${fetchCount})...`)
    const structuredLeads: StructuredLead[] = []

    const analysisPromises = crawlerOutput.companies
        .filter((c) => c.data !== null)
        .slice(0, fetchCount)
        .map(async (companyResult) => {
            const data = companyResult.data as ExtractedCompanyData

            const verdict = await criticValidateCompany(data, domain)
            if (!verdict.approved) return null

            const analysis = await analyzeBusinessGap(verdict.cleanedData, domain)
            if (analysis.alreadyUsesDomain) return null

            // Build justification block (mandatory per spec)
            const justification: LeadJustification = {
                whyTargeted: `${verdict.cleanedData.companyName} is a ${sector} business in ${location} that does not currently use ${domain} — making them an ideal prospect.`,
                gapBullets: analysis.businessGaps.length > 0
                    ? analysis.businessGaps
                    : [`No ${domain} solution detected`, 'Potential manual processes identified'],
                opportunitySummary: analysis.useCase
            }

            const lead: StructuredLead = {
                companyName: verdict.cleanedData.companyName || extractNameFromUrl(companyResult.url),
                website: cleanUrl(companyResult.url) || companyResult.url,
                sector,
                country,
                city: city || '',

                decisionMaker: analysis.decisionMaker,
                email: verdict.cleanedData.emails[0] || '',
                phone: verdict.cleanedData.phones[0] || '',

                currentSystem: verdict.cleanedData.techStack.join(', ') || 'Unknown',
                businessGap: analysis.businessGaps.join('; '),
                whatToSell: analysis.whatToSell,
                useCase: analysis.useCase,
                salesStrategy: analysis.salesStrategy,
                outreachMessage: analysis.outreachMessage,
                revenuePotential: analysis.revenuePotential,
                techStack: verdict.cleanedData.techStack,
                references: [companyResult.url],
                justification,
                confidenceScore: verdict.confidenceScore,
                scrapedAt: new Date().toISOString()
            }

            return lead
        })

    const results = await Promise.allSettled(analysisPromises)
    for (const r of results) {
        if (r.status === 'fulfilled' && r.value) structuredLeads.push(r.value)
    }

    // Sort by confidence score
    structuredLeads.sort((a, b) => b.confidenceScore - a.confidenceScore)
    let finalLeads = structuredLeads.slice(0, requestedCount)

    // Pad with LLM-synthesised leads if scraping didn't yield enough
    if (finalLeads.length < requestedCount) {
        const needed = requestedCount - finalLeads.length
        notes.push(`Scraping yielded ${finalLeads.length}/${requestedCount} leads — generating ${needed} additional via AI synthesis...`)
        const padded = await generateSyntheticLeads(domain, sector, location, needed, overallStrategy)
        finalLeads = [...finalLeads, ...padded].slice(0, requestedCount)
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

        const raw = await groqComplete(
            'You are a B2B lead generation expert. Respond ONLY with valid JSON.',
            `Generate ${count} realistic ${sector} business leads in ${location} that would benefit from "${domain}".

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
}]`,
            { temperature: 0.7, maxTokens: Math.min(count * 450, 8000) }
        )

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
                scrapedAt: new Date().toISOString()
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
