import { io, Socket } from 'socket.io-client'
import { OrchestratorOutput } from '../types'

let _socket: Socket | null = null

export function getSocket(): Socket {
  if (!_socket) {
    _socket = io('/', { withCredentials: true, transports: ['websocket', 'polling'] })
  }
  return _socket
}

export function disconnectSocket(): void {
  _socket?.disconnect()
  _socket = null
}

export interface SocketChatPayload {
  sessionId: string
  query: string
  mode: 'learning' | 'leads' | 'auto'
  domain?: string
  sector?: string
  country?: string
  city?: string
}

export function socketChat(
  payload: SocketChatPayload,
  callbacks: {
    onStart?: (data: { sessionId: string; timestamp: string }) => void
    onResponse?: (data: OrchestratorOutput) => void
    onDone?: (data: { sessionId: string }) => void
    onError?: (data: { sessionId: string; message: string }) => void
  }
): () => void {
  const socket = getSocket()

  const onStart = callbacks.onStart || (() => {})
  const onResponse = callbacks.onResponse || (() => {})
  const onDone = callbacks.onDone || (() => {})
  const onError = callbacks.onError || (() => {})

  socket.on('ai:start', onStart)
  socket.on('ai:response', onResponse)
  socket.on('ai:done', onDone)
  socket.on('ai:error', onError)

  socket.emit('ai:chat', payload)

  // Return cleanup function
  return () => {
    socket.off('ai:start', onStart)
    socket.off('ai:response', onResponse)
    socket.off('ai:done', onDone)
    socket.off('ai:error', onError)
  }
}
