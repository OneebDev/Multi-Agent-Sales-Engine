import { Resend } from 'resend'
import config from '../config/config'

function getClient(): Resend {
    if (!config.EMAIL_API_KEY) throw new Error('EMAIL_SERVICE_API_KEY is not configured')
    return new Resend(config.EMAIL_API_KEY)
}

export default {
    sendEmail: async (to: string[], subject: string, text: string) => {
        await getClient().emails.send({
            from: `Coderatory <onboarding@resend.dev>`,
            to,
            subject,
            text
        })
    }
}
