import axios, { AxiosError } from 'axios'
import { ApiResponse, OrchestratorOutput } from '../types'

const api = axios.create({
  baseURL: '/v1',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true
})

// Extract a human-readable message from API errors
api.interceptors.response.use(
  (res) => res,
  (err: AxiosError<ApiResponse<unknown>>) => {
    const serverMsg = err.response?.data?.message
    if (serverMsg) {
      throw new Error(serverMsg)
    }
    if (err.response?.status === 429) {
      throw new Error('AI rate limit reached — please wait a few minutes and try again.')
    }
    throw err
  }
)

export interface ChatPayload {
  sessionId: string
  query: string
  mode: 'chat' | 'learning' | 'leads' | 'auto'
  domain?: string
  sector?: string
  country?: string
  city?: string
}

export async function sendChat(payload: ChatPayload): Promise<OrchestratorOutput> {
  const { data } = await api.post<ApiResponse<OrchestratorOutput>>('/ai/chat', payload)
  return data.data
}

export async function clearSession(sessionId: string): Promise<void> {
  await api.delete(`/ai/session/${sessionId}`)
}

export async function getHealth(): Promise<{ status: string }> {
  const { data } = await api.get<ApiResponse<{ status: string }>>('/health')
  return data.data
}
