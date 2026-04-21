import { webSearch, newsSearch } from '../tools/serper.tool'
import { searchYouTube } from '../tools/youtube.tool'
import { scrapeCompany } from '../tools/scraper.tool'
import { retrieve } from '../rag/rag.service'
import { groqComplete } from '../tools/groq.tool'
import logger from '../../handlers/logger'

export type ToolName = 'serper' | 'youtube' | 'scraper' | 'rag' | 'groq' | 'news'

export interface ToolCall {
    tool: ToolName
    input: Record<string, unknown>
}

export interface ToolResult {
    tool: ToolName
    output: unknown
    success: boolean
    error?: string
}

export async function executeToolCall(call: ToolCall): Promise<ToolResult> {
    try {
        let output: unknown

        switch (call.tool) {
            case 'serper':
                output = await webSearch(call.input.query as string, (call.input.num as number) || 10)
                break
            case 'news':
                output = await newsSearch(call.input.query as string, (call.input.num as number) || 5)
                break
            case 'youtube':
                output = await searchYouTube(call.input.query as string, (call.input.maxResults as number) || 5)
                break
            case 'scraper':
                output = await scrapeCompany(call.input.url as string)
                break
            case 'rag':
                output = retrieve(call.input.query as string, (call.input.topK as number) || 5)
                break
            case 'groq':
                output = await groqComplete(call.input.system as string, call.input.user as string, {
                    temperature: (call.input.temperature as number) || 0.7,
                    maxTokens: (call.input.maxTokens as number) || 2048
                })
                break
            default:
                throw new Error(`Unknown tool: ${call.tool as string}`)
        }

        return { tool: call.tool, output, success: true }
    } catch (err) {
        logger.error(`Tool ${call.tool} failed`, { meta: err })
        return { tool: call.tool, output: null, success: false, error: err instanceof Error ? err.message : String(err) }
    }
}

export async function executeParallel(calls: ToolCall[]): Promise<ToolResult[]> {
    return Promise.all(calls.map(executeToolCall))
}
