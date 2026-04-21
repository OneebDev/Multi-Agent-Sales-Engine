import xss from 'xss'

/**
 * Production-grade input sanitization layer.
 * Blocks malicious payloads and prevents XSS.
 */
export function sanitizeInput(input: string): string {
    if (!input || typeof input !== 'string') return ''
    
    try {
        // 1. Basic trimming
        let cleaned = input.trim()
        
        // 2. XSS Filtering
        cleaned = xss(cleaned)
        
        // 3. Block excessively large inputs (DoS protection)
        if (cleaned.length > 5000) {
            cleaned = cleaned.slice(0, 5000)
        }
        
        return cleaned
    } catch (err) {
        return ''
    }
}

/**
 * Strict URL validation for Jobs/Leads.
 */
export function isValidUrl(url: string): boolean {
    if (!url) return false
    try {
        const parsed = new URL(url)
        return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname.includes('.')
    } catch {
        return false
    }
}
