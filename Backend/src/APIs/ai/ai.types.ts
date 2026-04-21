export interface ChatRequest {
    sessionId: string
    query: string
    mode: 'learning' | 'leads' | 'chat' | 'auto'
    // Leads-specific (optional at first message — orchestrator will ask if missing)
    domain?: string
    sector?: string
    country?: string
    city?: string
    count?: number   // number of leads to return (default 10, system fetches 3x internally)
}

export interface ScrapeJobRequest {
    url: string
    sessionId?: string
}
