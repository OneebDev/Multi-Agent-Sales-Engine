import { httpServer } from '../app'
import { bootstrap } from '../bootstrap'
import config from '../config/config'
import logger from '../handlers/logger'

const server = httpServer.listen(config.PORT)

void (async () => {
    try {
        await bootstrap()
        logger.info(`Application started on port ${config.PORT}`, {
            meta: { SERVER_URL: config.SERVER_URL }
        })
    } catch (error) {
        logger.error(`Error starting server:`, { meta: error })
        server.close((err) => {
            if (err) logger.error(`error`, { meta: error })
            process.exit(1)
        })
    }
})()
