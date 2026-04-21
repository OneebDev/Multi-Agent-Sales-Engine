import { ExtractedCompanyData } from './data-extractor'

export interface ValidationResult {
    valid: boolean
    score: number
    issues: string[]
}

const DISPOSABLE_DOMAINS = ['mailinator.com', 'tempmail.com', 'guerrillamail.com', 'throwaway.email']

export function validateCompanyData(data: ExtractedCompanyData): ValidationResult {
    const issues: string[] = []
    let score = 0

    if (data.companyName && data.companyName.length > 2) score += 20
    else issues.push('Missing or invalid company name')

    if (data.emails.length > 0) {
        const validEmails = data.emails.filter(isValidEmail)
        if (validEmails.length > 0) score += 30
        else issues.push('No valid email addresses found')
    } else {
        issues.push('No email addresses found')
    }

    if (data.phones.length > 0) score += 15
    if (data.services.length > 0) score += 15
    if (data.description && data.description.length > 30) score += 10
    if (data.techStack.length > 0) score += 10

    return {
        valid: score >= 30,
        score,
        issues
    }
}

export function isValidEmail(email: string): boolean {
    const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/
    if (!emailRegex.test(email)) return false
    const domain = email.split('@')[1]
    if (DISPOSABLE_DOMAINS.some((d) => domain.includes(d))) return false
    if (/\.(png|jpg|gif|css|js|svg)$/i.test(email)) return false
    return true
}

export function validateUrl(url: string): boolean {
    try {
        const parsed = new URL(url)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
        return false
    }
}
