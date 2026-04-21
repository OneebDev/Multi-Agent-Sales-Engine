import { groqChat, GroqMessage } from '../tools/groq.tool'
import { getGroqHistory } from '../ai/session-memory'
import { getResponseLanguageInstruction } from '../ai/language-detector'
import logger from '../../handlers/logger'

const BASE_CAREER_PROMPT = `You are a Career Advisor AI specializing in high-precision job matching.

STRICT RULES:
- USE MARKDOWN: Use bolding, headers, and bullet points to make listings readable.
- STRUCTURE: Always provide clear job listings with Titles, Companies, and Links.
- SUGGESTED MESSAGE: For every job search, include a "Suggested Application Message" that the user can use to apply.
- GREETINGS: Maintain a professional, helpful tone.
- ISOLATION: Focus ONLY on careers/jobs.
- ROBUSTNESS: If user input is short, ask clarifying questions about their domain.`

export async function runJobHunterAgent(
    sessionId: string, 
    query: string, 
    language: string, 
    scenario: 'career_chat' | 'no_jobs_found'
): Promise<string> {
    logger.info('JobHunterAgent: generating response', { meta: { sessionId, scenario } })

    const langInstruction = getResponseLanguageInstruction(language as any)
    let scenarioPrompt = ''
    
    if (scenario === 'no_jobs_found') {
        scenarioPrompt = 'The user tried to search for jobs, but we found nothing matching. Apologize warmly and suggest related roles or ask for a different location.'
    }

    const systemPrompt = `${BASE_CAREER_PROMPT}\n\n${scenarioPrompt}\n\nLanguage instruction: ${langInstruction}`

    // USES SEGMENTED AND FILTERED HISTORY
    const history: GroqMessage[] = getGroqHistory(sessionId, systemPrompt, 'job-hunter')
    
    // Add current query if not already in history (usually it's not and we want it there for the completion)
    history.push({ role: 'user', content: query })

    try {
        const res = await groqChat(history, { temperature: 0.8, maxTokens: 1024 })
        
        // Return only the text
        return res.content
    } catch (err) {
        logger.error('JobHunterAgent: groq failed', { meta: { err } })
        return "I'm having a little trouble connecting right now. Could you please send that again?"
    }
}
