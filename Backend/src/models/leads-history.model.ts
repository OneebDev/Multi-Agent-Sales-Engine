import mongoose, { Document, Schema } from 'mongoose'

export interface ILeadRecord {
    companyName: string
    website: string
    sector: string
    country: string
    city: string
    decisionMaker: string
    email: string
    phone: string
    currentSystem: string
    businessGap: string
    whatToSell: string
    useCase: string
    salesStrategy: string
    outreachMessage: string
    revenuePotential: string
    techStack: string[]
    confidenceScore: number
    justification: {
        whyTargeted: string
        gapBullets: string[]
        opportunitySummary: string
    }
    scrapedAt: Date
}

export interface ILeadsJob extends Document {
    sessionId: string
    userId?: string
    domain: string
    sector: string
    location: string
    requestedCount: number
    returnedCount: number
    leads: ILeadRecord[]
    overallStrategy: string
    processingNotes: string[]
    status: 'completed' | 'partial' | 'failed'
    createdAt: Date
    updatedAt: Date
}

const leadRecordSchema = new Schema<ILeadRecord>(
    {
        companyName: { type: String },
        website: { type: String },
        sector: { type: String },
        country: { type: String },
        city: { type: String },
        decisionMaker: { type: String },
        email: { type: String },
        phone: { type: String },
        currentSystem: { type: String },
        businessGap: { type: String },
        whatToSell: { type: String },
        useCase: { type: String },
        salesStrategy: { type: String },
        outreachMessage: { type: String },
        revenuePotential: { type: String },
        techStack: [{ type: String }],
        confidenceScore: { type: Number, default: 0 },
        justification: {
            _id: false,
            whyTargeted: { type: String },
            gapBullets: [{ type: String }],
            opportunitySummary: { type: String }
        },
        scrapedAt: { type: Date, default: Date.now }
    },
    { _id: false }
)

const leadsJobSchema = new Schema<ILeadsJob>(
    {
        sessionId: { type: String, required: true, index: true },
        userId: { type: String, default: null },
        domain: { type: String, required: true },
        sector: { type: String, required: true },
        location: { type: String, required: true },
        requestedCount: { type: Number, required: true },
        returnedCount: { type: Number, default: 0 },
        leads: { type: [leadRecordSchema], default: [] },
        overallStrategy: { type: String, default: '' },
        processingNotes: [{ type: String }],
        status: { type: String, enum: ['completed', 'partial', 'failed'], default: 'completed' }
    },
    { timestamps: true }
)

leadsJobSchema.pre('save', function () {
    this.returnedCount = this.leads.length
})

export default mongoose.model<ILeadsJob>('LeadsJob', leadsJobSchema)
