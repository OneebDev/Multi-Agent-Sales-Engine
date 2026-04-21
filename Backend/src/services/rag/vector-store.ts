import fs from 'fs'
import path from 'path'
import { generateEmbedding, cosineSimilarity } from './embeddings'
import config from '../../config/config'
import logger from '../../handlers/logger'

export interface VectorDocument {
    id: string
    text: string
    metadata: Record<string, unknown>
    embedding: number[]
    createdAt: string
}

interface VectorStore {
    documents: VectorDocument[]
    version: number
}

const storePath = path.resolve(config.AI.RAG.VECTOR_STORE_PATH)

function loadStore(): VectorStore {
    try {
        if (fs.existsSync(storePath)) {
            const raw = fs.readFileSync(storePath, 'utf-8')
            return JSON.parse(raw) as VectorStore
        }
    } catch {
        logger.warn('Vector store corrupted — starting fresh')
    }
    return { documents: [], version: 1 }
}

function saveStore(store: VectorStore): void {
    try {
        const dir = path.dirname(storePath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8')
    } catch (err) {
        logger.error('Failed to persist vector store', { meta: err })
    }
}

// In-memory cache — loaded once at startup
let _store: VectorStore | null = null

function getStore(): VectorStore {
    if (!_store) _store = loadStore()
    return _store
}

export function upsertDocument(id: string, text: string, metadata: Record<string, unknown> = {}): void {
    const store = getStore()
    const existing = store.documents.findIndex((d) => d.id === id)
    const doc: VectorDocument = {
        id,
        text,
        metadata,
        embedding: generateEmbedding(text),
        createdAt: new Date().toISOString()
    }
    if (existing >= 0) {
        store.documents[existing] = doc
    } else {
        store.documents.push(doc)
    }
    saveStore(store)
}

export function queryStore(query: string, topK = config.AI.RAG.TOP_K, threshold = config.AI.RAG.SIMILARITY_THRESHOLD): VectorDocument[] {
    const store = getStore()
    if (store.documents.length === 0) return []

    const qEmb = generateEmbedding(query)

    return store.documents
        .map((doc) => ({ doc, score: cosineSimilarity(qEmb, doc.embedding) }))
        .filter(({ score }) => score >= threshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(({ doc }) => doc)
}

export function deleteDocument(id: string): void {
    const store = getStore()
    store.documents = store.documents.filter((d) => d.id !== id)
    saveStore(store)
}

export function getDocumentCount(): number {
    return getStore().documents.length
}
