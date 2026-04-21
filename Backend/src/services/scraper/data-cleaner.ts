import { ExtractedCompanyData } from './data-extractor'

export function cleanCompanyData(raw: ExtractedCompanyData): ExtractedCompanyData {
    return {
        ...raw,
        companyName: cleanString(raw.companyName),
        emails: deduplicateAndClean(raw.emails, cleanEmail),
        phones: deduplicateAndClean(raw.phones, cleanPhone),
        services: deduplicateAndClean(raw.services, cleanString).filter((s) => s.length > 3),
        techStack: Array.from(new Set(raw.techStack)),
        addresses: deduplicateAndClean(raw.addresses, cleanString),
        description: cleanString(raw.description).slice(0, 300)
    }
}

function deduplicateAndClean<T>(arr: T[], cleaner: (v: T) => T): T[] {
    return Array.from(new Set(arr.map(cleaner))).filter(Boolean)
}

function cleanString(s: string): string {
    return s.replace(/\s+/g, ' ').replace(/[^\w\s.,;:@+\-/()&']/g, '').trim()
}

function cleanEmail(email: string): string {
    return email.toLowerCase().trim()
}

function cleanPhone(phone: string): string {
    const digits = phone.replace(/[^\d+]/g, '')
    if (digits.length < 7 || digits.length > 15) return ''

    // Format international numbers
    if (digits.startsWith('+')) return digits
    if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    return digits
}
