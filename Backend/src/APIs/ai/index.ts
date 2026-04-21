import { Application } from 'express'
import { API_ROOT } from '../../constant/application'
import aiRouter from './ai.router'

const registerAIRoutes = (app: Application): void => {
    app.use(`${API_ROOT}/ai`, aiRouter)
}

export default registerAIRoutes
