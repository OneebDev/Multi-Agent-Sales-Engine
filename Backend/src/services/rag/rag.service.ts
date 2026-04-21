import { v4 as uuid } from 'uuid'
import { upsertDocument, queryStore, VectorDocument } from './vector-store'
import logger from '../../handlers/logger'

export interface RAGContext {
    chunks: string[]
    sources: Array<{ id: string; metadata: Record<string, unknown> }>
    contextText: string
}

export function indexText(text: string, metadata: Record<string, unknown> = {}): string {
    const id = uuid()
    upsertDocument(id, text, metadata)
    return id
}

export function indexBatch(items: Array<{ text: string; metadata?: Record<string, unknown> }>): string[] {
    return items.map(({ text, metadata }) => indexText(text, metadata || {}))
}

export function retrieve(query: string, topK?: number): RAGContext {
    try {
        const docs: VectorDocument[] = queryStore(query, topK)

        const chunks = docs.map((d) => d.text)
        const sources = docs.map((d) => ({ id: d.id, metadata: d.metadata }))
        const contextText = chunks.length > 0 ? chunks.map((c, i) => `[Context ${i + 1}]: ${c}`).join('\n\n') : ''

        return { chunks, sources, contextText }
    } catch (err) {
        logger.error('RAG retrieval failed', { meta: err })
        return { chunks: [], sources: [], contextText: '' }
    }
}

export function indexSearchResults(results: Array<{ title: string; snippet: string; link: string }>): void {
    const items = results.map((r) => ({
        text: `${r.title}. ${r.snippet}`,
        metadata: { title: r.title, url: r.link, type: 'search-result' }
    }))
    indexBatch(items)
}

export function indexScrapedContent(url: string, content: string, companyName?: string): void {
    // Chunk large content into 500-char segments
    const chunkSize = 500
    const chunks: string[] = []
    for (let i = 0; i < content.length; i += chunkSize) {
        chunks.push(content.slice(i, i + chunkSize))
    }
    chunks.forEach((chunk) =>
        indexText(chunk, { url, companyName: companyName || '', type: 'scraped-content' })
    )
}
