import mongoose, { Document, Schema } from 'mongoose'

export interface IChatMessage {
    role: 'user' | 'assistant' | 'system'
    content: string
    mode: 'learning' | 'leads' | 'chat' | 'mixed'
    timestamp: Date
}

export interface IChatSession extends Document {
    sessionId: string
    userId?: string
    messages: IChatMessage[]
    leadsContext?: {
        domain?: string
        sector?: string
        country?: string
        city?: string
    }
    totalMessages: number
    lastActiveAt: Date
    createdAt: Date
    updatedAt: Date
}

const chatMessageSchema = new Schema<IChatMessage>(
    {
        role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
        content: { type: String, required: true },
        mode: { type: String, enum: ['learning', 'leads', 'chat', 'mixed'], default: 'chat' },
        timestamp: { type: Date, default: Date.now }
    },
    { _id: false }
)

const chatSessionSchema = new Schema<IChatSession>(
    {
        sessionId: { type: String, required: true, unique: true, index: true },
        userId: { type: String, default: null },
        messages: { type: [chatMessageSchema], default: [] },
        leadsContext: {
            _id: false,
            domain: { type: String, default: null },
            sector: { type: String, default: null },
            country: { type: String, default: null },
            city: { type: String, default: null }
        },
        totalMessages: { type: Number, default: 0 },
        lastActiveAt: { type: Date, default: Date.now }
    },
    { timestamps: true }
)

// Auto-update lastActiveAt and totalMessages
chatSessionSchema.pre('save', function () {
    this.totalMessages = this.messages.length
    this.lastActiveAt = new Date()
})

// TTL index — auto-delete sessions older than 30 days
chatSessionSchema.index({ lastActiveAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 })

export default mongoose.model<IChatSession>('ChatSession', chatSessionSchema)
