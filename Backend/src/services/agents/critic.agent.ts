import { groqComplete } from '../tools/groq.tool'
import { ExtractedCompanyData } from '../scraper/data-extractor'
import { isValidEmail } from '../scraper/validator'
import logger from '../../handlers/logger'

export interface CriticVerdict {
    confidenceScore: number
    hallucinations: string[]
    warnings: string[]
    cleanedData: ExtractedCompanyData
    approved: boolean
}

export interface LeadAnalysis {
    alreadyUsesDomain: boolean
    businessGaps: string[]
    whatToSell: string
    useCase: string
    salesStrategy: string
    outreachMessage: string
    revenuePotential: string
    decisionMaker: string
}

export async function criticValidateCompany(data: ExtractedCompanyData, _domain: string, source: string = 'google'): Promise<CriticVerdict> {
    const hallucinations: string[] = []
    const warnings: string[] = []

    const isSocial = source !== 'google'
    if (isSocial) logger.info('CriticAgent: validating social lead', { meta: { source } })

    // Rule-based validation
    const cleanedEmails = data.emails.filter(isValidEmail)
    if (data.emails.length > 0 && cleanedEmails.length === 0) {
        hallucinations.push('All emails appear invalid')
    }
    if (!data.companyName || data.companyName.length < 2) {
        warnings.push('Company name missing')
    }
    if (data.phones.some((p) => p.replace(/\D/g, '').length < 7)) {
        warnings.push('Some phone numbers are too short')
        data.phones = data.phones.filter((p) => p.replace(/\D/g, '').length >= 7)
    }

    const cleanedData: ExtractedCompanyData = {
        ...data,
        emails: cleanedEmails,
        phones: data.phones.slice(0, 3),
        services: data.services.slice(0, 6)
    }

    const confidenceScore = Math.max(0, 100 - hallucinations.length * 30 - warnings.length * 10)

    return {
        confidenceScore,
        hallucinations,
        warnings,
        cleanedData,
        approved: hallucinations.length === 0 && confidenceScore >= 40
    }
}

export async function analyzeBusinessGap(company: ExtractedCompanyData, domain: string): Promise<LeadAnalysis> {
    const prompt = `You are a business development analyst. Analyze this company and determine if they are a good lead for selling "${domain}" services.

Company: ${company.companyName}
Website: ${company.url}
Description: ${company.description}
Services: ${company.services.join(', ')}
Tech Stack: ${company.techStack.join(', ')}
Has Social Media: ${Object.keys(company.socialLinks).join(', ')}

Task: Provide a complete lead analysis in VALID JSON only. No extra text.

JSON format:
{
  "alreadyUsesDomain": false,
  "businessGaps": ["gap1", "gap2"],
  "whatToSell": "specific service/product to offer",
  "useCase": "specific use case for this company",
  "salesStrategy": "2-3 sentence strategy",
  "outreachMessage": "personalized 3-4 sentence cold outreach email",
  "revenuePotential": "$X,XXX/month estimate",
  "decisionMaker": "likely title e.g. CEO, CTO, Marketing Director"
}`

    try {
        const raw = await groqComplete(
            'You are a business development analyst. Respond with ONLY valid JSON.',
            prompt,
            { temperature: 0.4, maxTokens: 800 }
        )
        const match = raw.match(/\{[\s\S]*\}/)
        if (match) {
            return JSON.parse(match[0]) as LeadAnalysis
        }
    } catch (err) {
        logger.error('CriticAgent: gap analysis failed', { meta: err })
    }

    // Fallback
    return {
        alreadyUsesDomain: false,
        businessGaps: ['Analysis unavailable'],
        whatToSell: domain,
        useCase: `${domain} implementation for ${company.companyName}`,
        salesStrategy: `Reach out to ${company.companyName} about ${domain} solutions.`,
        outreachMessage: `Hi, I noticed ${company.companyName} could benefit from ${domain} services. I'd love to discuss how we can help.`,
        revenuePotential: 'Unknown',
        decisionMaker: 'Decision Maker'
    }
}
export async function batchAnalyzeBusinessGaps(companies: ExtractedCompanyData[], domain: string): Promise<LeadAnalysis[]> {
    if (companies.length === 0) return []

    const companiesList = companies.map((c, i) => `
ID: ${i}
Name: ${c.companyName}
Website: ${c.url}
Description: ${c.description}
Services: ${c.services.join(', ')}
Tech Stack: ${c.techStack.join(', ')}
`).join('\n')

    const prompt = `You are a business development analyst. Analyze these ${companies.length} companies and determine if they are good leads for selling "${domain}" services.

COMPANIES:
${companiesList}

Task: Provide a lead analysis for EACH company in a SINGLE JSON array.
Return ONLY valid JSON array with objects in the same order as IDs.

JSON format:
[
  {
    "alreadyUsesDomain": false,
    "businessGaps": ["gap1", "gap2"],
    "whatToSell": "specific service",
    "useCase": "use case",
    "salesStrategy": "strategy",
    "outreachMessage": "short pitch",
    "revenuePotential": "$X,XXX/mo",
    "decisionMaker": "Likely Title"
  },
  ...
]`

    try {
        const raw = await groqComplete(
            'You are a business development analyst. Respond with ONLY a valid JSON array.',
            prompt,
            { temperature: 0.3, maxTokens: Math.min(companies.length * 600 + 200, 4000) }
        )
        const match = raw.match(/\[[\s\S]*\]/)
        if (match) {
            const results = JSON.parse(match[0]) as LeadAnalysis[]
            if (results.length === companies.length) return results
        }
    } catch (err) {
        logger.error('CriticAgent: batch gap analysis failed', { meta: err })
    }

    // Fallback to individual for robustness or if batch failed
    return Promise.all(companies.map(c => analyzeBusinessGap(c, domain)))
}
