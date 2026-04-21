/**
 * TF-IDF based local embeddings — no external API required.
 * Produces a fixed-length dense vector via term frequency scoring
 * and vocabulary projection so cosine similarity is meaningful.
 */

const VOCAB_SIZE = 512

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 1)
}

function hashToken(token: string): number {
    let h = 5381
    for (let i = 0; i < token.length; i++) {
        h = ((h << 5) + h) ^ token.charCodeAt(i)
        h = h >>> 0
    }
    return h % VOCAB_SIZE
}

export function generateEmbedding(text: string): number[] {
    const tokens = tokenize(text)
    const vec = new Array<number>(VOCAB_SIZE).fill(0)
    const freq: Record<number, number> = {}

    for (const token of tokens) {
        const idx = hashToken(token)
        freq[idx] = (freq[idx] || 0) + 1
    }

    for (const [idx, count] of Object.entries(freq)) {
        vec[parseInt(idx)] = count / tokens.length
    }

    // L2 normalise
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1
    return vec.map((v) => v / norm)
}

export function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
    return dot // both vectors are already L2-normalised
}
