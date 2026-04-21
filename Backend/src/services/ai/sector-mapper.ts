// ─── Sector Normalizer + Fallback Engine ─────────────────────────────────────
// Converts narrow/problematic sector names to lead-gen friendly broader ones,
// provides ordered fallbacks, and auto-maps domains to best sectors.

// ── Normalization map: narrow → broad lead-gen friendly label ─────────────────
const SECTOR_NORMALIZE: Record<string, string> = {
    // Education
    'universities': 'higher education institutions',
    'university': 'higher education institutions',
    'college': 'higher education institutions',
    'colleges': 'higher education institutions',
    'school': 'education sector',
    'schools': 'education sector',
    'edtech': 'online learning platforms',

    // Healthcare
    'hospital': 'hospitals and clinics',
    'clinic': 'hospitals and clinics',
    'doctor': 'healthcare providers',
    'pharma': 'pharmaceutical companies',
    'pharmacy': 'pharmaceutical companies',

    // Tech
    'startup': 'tech startups',
    'saas': 'SaaS companies',
    'software': 'software development companies',
    'agency': 'digital agencies',
    'web agency': 'web development agencies',

    // Finance
    'bank': 'banking and fintech',
    'fintech': 'fintech startups',
    'insurance': 'insurance companies',
    'accounting': 'accounting and finance firms',

    // E-commerce
    'ecommerce': 'e-commerce businesses',
    'e-commerce': 'e-commerce businesses',
    'shopify': 'e-commerce businesses',
    'retail': 'retail businesses',
    'store': 'retail businesses',

    // Real Estate
    'real estate': 'real estate agencies',
    'property': 'real estate agencies',
    'construction': 'construction and engineering firms',

    // Marketing
    'seo': 'digital marketing agencies',
    'marketing': 'marketing and advertising agencies',
    'advertising': 'marketing and advertising agencies',

    // Logistics
    'logistics': 'logistics and supply chain companies',
    'shipping': 'logistics and shipping companies',
    'courier': 'logistics and courier services',

    // Manufacturing
    'factory': 'manufacturing companies',
    'textile': 'textile manufacturing',
    'automotive': 'automotive companies',

    // Local Services
    'plumber': 'local service businesses',
    'electrician': 'local service businesses',
    'cleaning': 'cleaning and maintenance services',

    // Hospitality
    'hotel': 'hotels and hospitality',
    'restaurant': 'restaurants and food service',
    'travel': 'travel and tourism agencies',

    // Energy
    'solar': 'solar and renewable energy companies',
    'energy': 'energy and utilities companies',

    // Agriculture
    'farm': 'agriculture and agritech',
    'agritech': 'agriculture and agritech',

    // Gaming/Entertainment
    'gaming': 'gaming and entertainment companies',
    'media': 'media and entertainment companies',

    // Legal
    'law': 'law firms and legal services',
    'legal': 'law firms and legal services',

    // Fitness
    'gym': 'fitness and wellness centers',
    'fitness': 'fitness and wellness centers',
}

// ── Fallback chains: if sector S fails, try these in order ───────────────────
const SECTOR_FALLBACKS: Record<string, string[]> = {
    'higher education institutions': ['education sector', 'edtech companies', 'training institutes'],
    'education sector': ['online learning platforms', 'training institutes', 'edtech companies'],
    'online learning platforms': ['education sector', 'SaaS companies', 'tech startups'],
    'hospitals and clinics': ['healthcare providers', 'medical services', 'telemedicine platforms'],
    'healthcare providers': ['hospitals and clinics', 'medical equipment suppliers', 'pharmaceutical companies'],
    'pharmaceutical companies': ['healthcare providers', 'biotech companies', 'medical suppliers'],
    'fintech startups': ['banking and fintech', 'SaaS companies', 'financial services'],
    'banking and fintech': ['financial services', 'fintech startups', 'investment firms'],
    'e-commerce businesses': ['retail businesses', 'online stores', 'digital agencies'],
    'real estate agencies': ['property management companies', 'construction firms', 'real estate tech'],
    'digital marketing agencies': ['marketing and advertising agencies', 'SEO agencies', 'creative agencies'],
    'tech startups': ['SaaS companies', 'software development companies', 'IT companies'],
    'SaaS companies': ['tech startups', 'software development companies', 'cloud services'],
    'restaurants and food service': ['food and beverage companies', 'hospitality businesses', 'catering services'],
    'logistics and supply chain companies': ['shipping companies', 'transportation services', 'courier services'],
    'manufacturing companies': ['industrial companies', 'B2B suppliers', 'production companies'],
    'law firms and legal services': ['corporate services', 'consulting firms', 'professional services'],
}

// ── Domain → best sector mapping ─────────────────────────────────────────────
const DOMAIN_TO_SECTOR: Record<string, string> = {
    // AI / ML
    'ai chatbot': 'SaaS companies',
    'ai tool': 'tech startups',
    'machine learning': 'tech startups',
    'nlp': 'SaaS companies',
    'automation': 'SaaS companies',

    // Web/Dev
    'website development': 'web development agencies',
    'web development': 'web development agencies',
    'mobile app': 'software development companies',
    'app development': 'software development companies',

    // Marketing
    'seo': 'digital marketing agencies',
    'seo service': 'digital marketing agencies',
    'social media': 'marketing and advertising agencies',
    'email marketing': 'marketing and advertising agencies',
    'content marketing': 'digital marketing agencies',

    // Finance
    'accounting software': 'accounting and finance firms',
    'invoicing': 'small businesses',
    'payroll': 'HR and payroll services',
    'crm': 'B2B businesses',
    'erp': 'manufacturing companies',

    // E-commerce
    'shopify': 'e-commerce businesses',
    'ecommerce': 'e-commerce businesses',
    'dropshipping': 'e-commerce businesses',

    // Healthcare
    'telemedicine': 'hospitals and clinics',
    'medical software': 'healthcare providers',
    'ehr': 'hospitals and clinics',

    // Education
    'lms': 'education sector',
    'e-learning': 'online learning platforms',
    'edtech': 'education sector',

    // Security
    'cybersecurity': 'IT companies',
    'vpn': 'tech companies',

    // Real estate
    'property management': 'real estate agencies',
    'real estate crm': 'real estate agencies',

    // Logistics
    'fleet management': 'logistics and supply chain companies',
    'delivery software': 'logistics and courier services',

    // Blockchain
    'blockchain': 'fintech startups',
    'crypto': 'fintech startups',
    'nft': 'gaming and entertainment companies',
    'defi': 'fintech startups',
    'smart contract': 'fintech startups',
}

export function normalizeSector(raw: string): string {
    const lower = raw.toLowerCase().trim()
    return SECTOR_NORMALIZE[lower] ?? raw
}

export function getSectorFallbacks(sector: string): string[] {
    const normalized = normalizeSector(sector)
    return SECTOR_FALLBACKS[normalized] ?? SECTOR_FALLBACKS[sector] ?? ['general businesses', 'B2B companies', 'small and medium businesses']
}

export function getDomainSector(domain: string): string | null {
    const lower = domain.toLowerCase()
    for (const [key, sector] of Object.entries(DOMAIN_TO_SECTOR)) {
        if (lower.includes(key)) return sector
    }
    return null
}
