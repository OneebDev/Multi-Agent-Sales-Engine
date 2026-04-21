export type AppMode = 'chat' | 'learning' | 'leads' | 'auto'

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

// ─── Chat Message ─────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  mode: AppMode
  timestamp: string
  learningData?: LearningResponse
  leadsData?: LeadsResponse
  marketIntelData?: MarketIntelResponse
  needsMoreInfo?: { fields: string[]; message: string }
  isLoading?: boolean
  error?: string
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
  mode: 'learning' | 'leads' | 'chat' | 'market-intel'
  response: LearningResponse | LeadsResponse | NormalChatResponse | MarketIntelResponse
  needsMoreInfo?: { fields: string[]; message: string }
  detectedLanguage?: string
  timestamp: string
}
