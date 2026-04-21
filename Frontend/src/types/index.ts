export type AppMode = 'chat' | 'learning' | 'leads' | 'auto' | 'job-hunter'

// ─── Learning Types ───────────────────────────────────────────────────────────
export interface ArticleRef {
  title: string
  source: string
  link: string
  summary: string
  justification: string
}

export interface VideoRef {
  title: string
  channel: string
  link: string
  summary: string
  thumbnail?: string
  justification: string
}

export interface PaperRef {
  title: string
  authors: string
  link: string
  insights: string
  explanation: string
  justification: string
}

export interface NewsRef {
  headline: string
  source: string
  link: string
  summary: string
  justification: string
}

export interface RequestedRefCounts {
  videos: number
  articles: number
  papers: number
  news: number
}

export interface DeliveredRefCounts {
  videos: number
  articles: number
  papers: number
  news: number
}

export interface LearningResponse {
  query: string
  simpleExplanation: string
  detailedBreakdown: string
  realWorldExamples: string
  advancedInsights: string
  requestedCounts: RequestedRefCounts
  deliveredCounts: DeliveredRefCounts
  notes: string[]
  references: {
    articles: ArticleRef[]
    videos: VideoRef[]
    papers: PaperRef[]
    news: NewsRef[]
  }
  ragContextUsed: boolean
}

// ─── Market Intelligence Types ────────────────────────────────────────────────
export interface MarketIntelReference {
  title: string
  source: string
  link: string
  summary: string
  justification: string
}

export interface SectorIntel {
  rank: number
  name: string
  demandLevel: 'Very High' | 'High' | 'Medium' | 'Low'
  reasoning: string
  topCompanyTypes: string[]
}

export interface ServiceIntel {
  rank: number
  name: string
  demandLevel: 'Very High' | 'High' | 'Medium' | 'Low'
  reasoning: string
  targetSectors: string[]
  avgDealSize: string
}

export interface LocationIntel {
  rank: number
  name: string
  opportunity: 'Very High' | 'High' | 'Medium' | 'Low'
  reasoning: string
  topCities: string[]
}

export interface MarketIntelResponse {
  query: string
  topic: string
  bestSectors: SectorIntel[]
  bestServices: ServiceIntel[]
  bestCountries: LocationIntel[]
  bestCities: LocationIntel[]
  keyInsights: string[]
  justification: string
  recommendation: string
  wantsList: boolean
  references: MarketIntelReference[]
  language: string
  timestamp: string
}

// ─── Leads Types ─────────────────────────────────────────────────────────────
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
  verificationStatus: 'verified' | 'partially_verified' | 'unverified'
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

// ─── Job Hunter Types ──────────────────────────────────────────────────────────
export interface JobListing {
  title: string
  company: string
  location: string
  skills: string[]
  url: string
  date: string
  score: number
  verificationStatus: 'verified' | 'partially_verified' | 'unverified'
}

export interface JobHunterResponse {
  type: 'chat' | 'jobs'
  content: string
  jobs?: JobListing[]
  intent?: string
}

// ─── Chat Message ─────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  mode: AppMode
  timestamp: string
  metadata?: {
    intent?: string
    confidence?: number
    reasoning?: string
    routed_to?: AppMode
    isActiveVersion?: boolean
    category?: string // New categorisation (Career & Jobs, Market Intelligence, etc.)
  }
  learningData?: LearningResponse
  leadsData?: LeadsResponse
  marketIntelData?: MarketIntelResponse
  jobHunterData?: JobHunterResponse
  needsMoreInfo?: { fields: string[]; message: string }
  isLoading?: boolean
  error?: string
  
  // Standardised Data Wrapper
  success?: boolean
  category?: string
  language?: 'en' | 'ur' | 'roman-ur'
  insights?: string[]
  data?: any
  
  // ─── Versioning & Parallelism ──────────────────────────────────────────────
  parentMessageId?: string  // For edited user prompts
  versionIndex?: number    // 1-based index
  totalVersions?: number
}

// ─── Normal Chat ──────────────────────────────────────────────────────────────
export interface NormalChatResponse {
  reply: string
  language: string
  timestamp: string
}

// ─── Leads justification ──────────────────────────────────────────────────────
export interface LeadJustification {
  whyTargeted: string
  gapBullets: string[]
  opportunitySummary: string
}

// ─── API Response Wrapper ─────────────────────────────────────────────────────
export interface ApiResponse<T> {
  success: boolean
  statusCode: number
  message: string
  data: T
}

export interface OrchestratorOutput {
  sessionId: string
  mode: AppMode | 'market-intel'
  success: boolean
  category: string
  language: 'en' | 'ur' | 'roman-ur'
  response: LearningResponse | LeadsResponse | NormalChatResponse | MarketIntelResponse | JobHunterResponse | string
  data?: any
  insights?: string[]
  needsMoreInfo?: { fields: string[]; message: string }
  detectedLanguage?: string
  timestamp: string
  metadata?: {
    intent?: string
    confidence?: number
    reasoning?: string
    routed_to?: AppMode
    isActiveVersion?: boolean
  }
}

export interface UserProfile {
  skills: string[]
  interests: string[]
  goals: string[]
  preferences: Record<string, any>
  behavior_summary: string
  intent_patterns: string[]
  usage_frequency: Record<string, number>
}
