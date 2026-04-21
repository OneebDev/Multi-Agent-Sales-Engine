import dotenvFlow from 'dotenv-flow'

dotenvFlow.config()

export default {
    // General
    ENV: process.env.ENV,
    PORT: process.env.PORT,
    SERVER_URL: process.env.SERVER_URL,

    // Database
    DATABASE_URL: process.env.DATABASE_URL,

    //Email
    EMAIL_API_KEY: process.env.EMAIL_SERVICE_API_KEY,

    //Tokens
    TOKENS: {
        ACCESS: {
            SECRET: process.env.ACCESS_TOKEN_SECRET as string,
            EXPIRY: 3600
        },
        REFRESH: {
            SECRET: process.env.REFRESH_TOKEN_SECRET as string,
            EXPIRY: 3600 * 24 * 365
        }
    },

    // ─── AI Platform ────────────────────────────────────────────────────────────
    AI: {
        GROQ_API_KEY: process.env.GROQ_API_KEY as string,
        GROQ_API_KEY_2: process.env.GROQ_API_KEY_2 || '',
        GROQ_API_KEY_3: process.env.GROQ_API_KEY_3 || '',
        GROQ_MODEL: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',

        SERPER_API_KEY: process.env.SERPER_API_KEY as string,
        YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY as string,

        REDIS: {
            HOST: process.env.REDIS_HOST || '127.0.0.1',
            PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
            PASSWORD: process.env.REDIS_PASSWORD || ''
        },

        RAG: {
            VECTOR_STORE_PATH: process.env.VECTOR_STORE_PATH || './data/vector-store.json',
            TOP_K: parseInt(process.env.RAG_TOP_K || '5', 10),
            SIMILARITY_THRESHOLD: parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || '0.15')
        },

        SCRAPER: {
            TIMEOUT_MS: parseInt(process.env.SCRAPER_TIMEOUT_MS || '15000', 10),
            MAX_RETRIES: parseInt(process.env.SCRAPER_MAX_RETRIES || '3', 10),
            CONCURRENCY: parseInt(process.env.SCRAPER_CONCURRENCY || '5', 10)
        },

        ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000').split(',')
    }
}
