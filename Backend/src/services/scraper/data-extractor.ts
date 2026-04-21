import * as cheerio from 'cheerio'
import { ParsedPage } from './html-parser'

export interface ExtractedCompanyData {
    url: string
    companyName: string
    emails: string[]
    phones: string[]
    services: string[]
    techStack: string[]
    socialLinks: Record<string, string>
    addresses: string[]
    description: string
    hasContactPage: boolean
}

const TECH_KEYWORDS: Record<string, string[]> = {
    WordPress: ['wp-content', 'wp-includes', 'wordpress'],
    Shopify: ['cdn.shopify.com', 'myshopify.com'],
    Wix: ['wix.com', 'wixsite.com'],
    React: ['react', 'reactjs', '__REACT'],
    Angular: ['ng-version', 'angular'],
    Vue: ['vue.js', 'vuejs', '__vue'],
    Bootstrap: ['bootstrap.css', 'bootstrap.min.css'],
    Tailwind: ['tailwind', 'tailwindcss'],
    jQuery: ['jquery.js', 'jquery.min.js'],
    PHP: ['.php', 'php'],
    Laravel: ['laravel'],
    'Next.js': ['_next/', '__NEXT'],
    Webflow: ['webflow.com'],
    Squarespace: ['squarespace.com'],
    HubSpot: ['hs-analytics', 'hubspot'],
    'Google Analytics': ['google-analytics.com', 'gtag/js', 'ga.js'],
    Stripe: ['stripe.com', 'stripe.js'],
    Salesforce: ['salesforce.com', 'force.com'],
    Mailchimp: ['mailchimp.com', 'mc.js']
}

const SOCIAL_PATTERNS: Record<string, RegExp> = {
    linkedin: /linkedin\.com\/(?:company|in)\//,
    twitter: /twitter\.com\/|x\.com\//,
    facebook: /facebook\.com\//,
    instagram: /instagram\.com\//,
    youtube: /youtube\.com\//
}

export function extractCompanyData(page: ParsedPage): ExtractedCompanyData {
    const $ = cheerio.load(page.rawHtml || '')

    const companyName = extractCompanyName($, page.title, page.url)
    const emails = filterEmails(page.emails)
    const phones = page.phones.slice(0, 5)
    const techStack = detectTechStack(page.rawHtml)
    const socialLinks = extractSocialLinks(page.links)
    const services = extractServices($, page.bodyText)
    const addresses = extractAddresses(page.bodyText)
    const description = extractDescription($, page.metaDescription, page.bodyText)
    const hasContactPage = page.links.some((l) => /contact|about|reach/.test(l.toLowerCase()))

    return { url: page.url, companyName, emails, phones, services, techStack, socialLinks, addresses, description, hasContactPage }
}

function extractCompanyName($: cheerio.CheerioAPI, title: string, url: string): string {
    const ogSite = $('meta[property="og:site_name"]').attr('content')
    if (ogSite) return ogSite.trim()

    const schemaName = $('[itemtype*="Organization"] [itemprop="name"]').first().text()
    if (schemaName) return schemaName.trim()

    if (title) {
        const parts = title.split(/[-|–—]/)[0].trim()
        if (parts.length > 2) return parts
    }

    try {
        const host = new URL(url).hostname.replace('www.', '')
        return host.split('.')[0].replace(/-/g, ' ')
    } catch {
        return ''
    }
}

function filterEmails(emails: string[]): string[] {
    const blocked = ['example.com', 'sentry.io', 'w3.org', 'schema.org', 'test.com']
    return emails.filter((e) => !blocked.some((b) => e.includes(b))).slice(0, 5)
}

function detectTechStack(html: string): string[] {
    const lower = html.toLowerCase()
    const detected: string[] = []
    for (const [tech, patterns] of Object.entries(TECH_KEYWORDS)) {
        if (patterns.some((p) => lower.includes(p.toLowerCase()))) {
            detected.push(tech)
        }
    }
    return detected
}

function extractSocialLinks(links: string[]): Record<string, string> {
    const social: Record<string, string> = {}
    for (const link of links) {
        for (const [platform, pattern] of Object.entries(SOCIAL_PATTERNS)) {
            if (pattern.test(link) && !social[platform]) {
                social[platform] = link
            }
        }
    }
    return social
}

function extractServices($: cheerio.CheerioAPI, _bodyText: string): string[] {
    const serviceKeywords: string[] = []

    $('h2, h3').each((_, el) => {
        const text = $(el).text().trim()
        if (text.length > 3 && text.length < 80) serviceKeywords.push(text)
    })

    $('[class*="service"], [class*="product"], [class*="offer"]').each((_, el) => {
        const text = $(el).text().trim().slice(0, 60)
        if (text.length > 5) serviceKeywords.push(text)
    })

    return Array.from(new Set(serviceKeywords)).slice(0, 8)
}

function extractAddresses(bodyText: string): string[] {
    const addressRegex = /\d{1,5}\s+[\w\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|way|court|ct)[,\s]+[\w\s]+,?\s*[A-Z]{2}\s+\d{5}/gi
    return Array.from(new Set(bodyText.match(addressRegex) || [])).slice(0, 3)
}

function extractDescription($: cheerio.CheerioAPI, meta: string, bodyText: string): string {
    if (meta && meta.length > 20) return meta.slice(0, 300)
    const aboutSection = $('[class*="about"], [id*="about"]').first().text().trim()
    if (aboutSection && aboutSection.length > 30) return aboutSection.slice(0, 300)
    return bodyText.slice(0, 250)
}
