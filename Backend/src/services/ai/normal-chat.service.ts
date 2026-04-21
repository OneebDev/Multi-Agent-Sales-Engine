import { groqChat, GroqMessage } from '../tools/groq.tool'
import { getGroqHistory, addMessage } from './session-memory'
import { detectLanguage, getResponseLanguageInstruction } from './language-detector'
import logger from '../../handlers/logger'

export interface NormalChatResponse {
    reply: string
    language: string
    timestamp: string
}

const BASE_SYSTEM_PROMPT = `You are a friendly, intelligent person having a natural conversation. Talk like a real human — warm, direct, and genuine.

STRICT RULES:
- NEVER use markdown formatting: no bullet points (- or *), no headers (##), no bold (**text**), no numbered lists, no code blocks
- Write in plain flowing sentences exactly like a real person texting or talking
- For greetings like "hello", "how are you", "hi" — reply in ONE short friendly sentence, nothing more
- For casual small talk — keep it brief and natural, 1-3 sentences max
- For questions that need an explanation — answer clearly in plain paragraphs, no lists
- NEVER start with "Certainly!", "Of course!", "Absolutely!" or similar AI filler phrases
- NEVER say "As an AI..." or "I'm just an AI..."
- Match the user's language (English, Urdu, Roman Urdu, mixed) — respond in the same language they use
- Remember the full conversation and refer back to it naturally`

export async function runNormalChat(sessionId: string, query: string): Promise<NormalChatResponse> {
    logger.info('NormalChat: processing', { meta: { sessionId, querySnippet: query.slice(0, 80) } })

    const lang = detectLanguage(query)
    const langInstruction = getResponseLanguageInstruction(lang)

    const systemPrompt = `${BASE_SYSTEM_PROMPT}\n\nLanguage instruction: ${langInstruction}`

    const history: GroqMessage[] = getGroqHistory(sessionId, systemPrompt)
    history.push({ role: 'user', content: query })

    const res = await groqChat(history, { temperature: 0.8, maxTokens: 2048 })

    addMessage(sessionId, 'assistant', res.content, 'chat')

    return {
        reply: res.content,
        language: lang,
        timestamp: new Date().toISOString()
    }
}
