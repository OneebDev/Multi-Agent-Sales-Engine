import axios from 'axios'
import config from '../../config/config'
import logger from '../../handlers/logger'

const BASE_URL = 'https://www.googleapis.com/youtube/v3'

export interface YouTubeVideo {
    id: string
    title: string
    channel: string
    link: string
    thumbnail: string
    description: string
    publishedAt: string
    viewCount?: string
    duration?: string
}

interface YouTubeSearchItem {
    id: { videoId: string }
    snippet: {
        title: string
        channelTitle: string
        description: string
        publishedAt: string
        thumbnails: { medium?: { url: string }; default?: { url: string } }
    }
}

interface YouTubeDetailsItem {
    id: string
    statistics?: { viewCount?: string }
    contentDetails?: { duration?: string }
}

export async function searchYouTube(query: string, maxResults = 15): Promise<YouTubeVideo[]> {
    if (!config.AI.YOUTUBE_API_KEY) {
        logger.warn('YOUTUBE_API_KEY not configured — skipping YouTube search')
        return []
    }

    try {
        const searchRes = await axios.get<{ items: YouTubeSearchItem[] }>(`${BASE_URL}/search`, {
            params: {
                key: config.AI.YOUTUBE_API_KEY,
                q: query,
                part: 'snippet',
                type: 'video',
                maxResults,
                relevanceLanguage: 'en',
                safeSearch: 'moderate'
            },
            timeout: 8000
        })

        const items = searchRes.data.items || []
        if (items.length === 0) return []

        const ids = items.map((i) => i.id.videoId).join(',')

        // Fetch view count + duration in one call
        const detailsRes = await axios.get<{ items: YouTubeDetailsItem[] }>(`${BASE_URL}/videos`, {
            params: {
                key: config.AI.YOUTUBE_API_KEY,
                id: ids,
                part: 'statistics,contentDetails'
            },
            timeout: 8000
        })

        const detailsMap: Record<string, YouTubeDetailsItem> = {}
        for (const d of detailsRes.data.items || []) detailsMap[d.id] = d

        return items.map((item) => {
            const vid = item.id.videoId
            const details = detailsMap[vid]
            return {
                id: vid,
                title: item.snippet.title,
                channel: item.snippet.channelTitle,
                link: `https://www.youtube.com/watch?v=${vid}`,
                thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url || '',
                description: item.snippet.description,
                publishedAt: item.snippet.publishedAt,
                viewCount: details?.statistics?.viewCount,
                duration: details?.contentDetails?.duration
            }
        })
    } catch (err) {
        logger.error('YouTube search failed', { meta: { query, err } })
        return []
    }
}
