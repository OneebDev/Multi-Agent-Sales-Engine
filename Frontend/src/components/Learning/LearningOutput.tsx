import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { BookOpen, Lightbulb, Globe, TrendingUp, Video, FileText, Newspaper, BookMarked, Quote, AlertTriangle } from 'lucide-react'
import { LearningResponse, ArticleRef, VideoRef, PaperRef, NewsRef } from '../../types'

interface Props {
  data: LearningResponse
}

export function LearningOutput({ data }: Props) {
  if (!data) return null
  
  const { 
    references: refs = { articles: [], videos: [], papers: [], news: [] }, 
    requestedCounts = {} as NonNullable<LearningResponse['requestedCounts']>, 
    notes = [] 
  } = data
  
  return (
    <div className="space-y-6 text-sm">
      {/* Shortfall / info notes */}
      {notes && notes.length > 0 && (
        <div className="rounded-xl border border-yellow-700/40 bg-yellow-900/10 px-4 py-3 space-y-1">
          {notes.map((n, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <p className="text-yellow-300/80 text-xs leading-relaxed">{n}</p>
            </div>
          ))}
        </div>
      )}

      {/* Simple Explanation */}
      <Section icon={<Lightbulb className="w-4 h-4 text-yellow-400" />} title="Simple Explanation">
        <p className="text-gray-200 leading-relaxed">{data.simpleExplanation}</p>
      </Section>

      {/* Detailed Breakdown */}
      {data.detailedBreakdown && (
        <Section icon={<BookOpen className="w-4 h-4 text-blue-400" />} title="Detailed Breakdown">
          <div className="prose prose-invert prose-sm max-w-none text-gray-300">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.detailedBreakdown}</ReactMarkdown>
          </div>
        </Section>
      )}

      {/* Real World Examples */}
      {data.realWorldExamples && (
        <Section icon={<Globe className="w-4 h-4 text-green-400" />} title="Real-World Examples">
          <div className="prose prose-invert prose-sm max-w-none text-gray-300">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.realWorldExamples}</ReactMarkdown>
          </div>
        </Section>
      )}

      {/* Advanced Insights */}
      {data.advancedInsights && (
        <Section icon={<TrendingUp className="w-4 h-4 text-purple-400" />} title="Advanced Insights">
          <div className="prose prose-invert prose-sm max-w-none text-gray-300">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.advancedInsights}</ReactMarkdown>
          </div>
        </Section>
      )}

      {/* References */}
      <div className="space-y-4">
        {refs.videos && refs.videos.length > 0 && (
          <RefSection
            icon={<Video className="w-4 h-4 text-red-400" />}
            title="Videos"
            count={refs.videos.length}
            requested={requestedCounts?.videos}
          >
            {refs.videos.map((v, i) => <VideoCard key={i} video={v} />)}
          </RefSection>
        )}
        {refs.articles && refs.articles.length > 0 && (
          <RefSection
            icon={<FileText className="w-4 h-4 text-blue-400" />}
            title="Articles"
            count={refs.articles.length}
            requested={requestedCounts?.articles}
          >
            {refs.articles.map((a, i) => <ArticleCard key={i} article={a} />)}
          </RefSection>
        )}
        {refs.papers && refs.papers.length > 0 && (
          <RefSection
            icon={<BookMarked className="w-4 h-4 text-purple-400" />}
            title="Research Papers"
            count={refs.papers.length}
            requested={requestedCounts?.papers}
          >
            {refs.papers.map((p, i) => <PaperCard key={i} paper={p} />)}
          </RefSection>
        )}
        {refs.news && refs.news.length > 0 && (
          <RefSection
            icon={<Newspaper className="w-4 h-4 text-green-400" />}
            title="News"
            count={refs.news.length}
            requested={requestedCounts?.news}
          >
            {refs.news.map((n, i) => <NewsCard key={i} news={n} />)}
          </RefSection>
        )}
      </div>

      {data.ragContextUsed && (
        <p className="text-xs text-gray-600 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 inline-block" />
          Enhanced with knowledge base context
        </p>
      )}
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="font-semibold text-white text-sm">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function RefSection({
  icon, title, count, requested, children
}: {
  icon: React.ReactNode; title: string; count: number; requested?: number; children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h4 className="font-medium text-gray-400 text-xs uppercase tracking-wider">{title}</h4>
        <span className="text-xs text-gray-600">
          {count}{requested !== undefined && requested !== count ? `/${requested}` : ''}
        </span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function JustificationChip({ text }: { text: string }) {
  if (!text) return null
  return (
    <div className="flex items-start gap-1.5 mt-2 px-2 py-1.5 rounded-md bg-brand-900/20 border border-brand-800/30">
      <Quote className="w-3 h-3 text-brand-500 flex-shrink-0 mt-0.5" />
      <p className="text-brand-400/80 text-xs leading-relaxed">{text}</p>
    </div>
  )
}

function VideoCard({ video }: { video: VideoRef }) {
  return (
    <a href={video.link} target="_blank" rel="noopener noreferrer"
      className="flex gap-3 p-3 rounded-lg bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-brand-600 transition-all group">
      {video.thumbnail && (
        <img src={video.thumbnail} alt={video.title} className="w-20 h-14 object-cover rounded flex-shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-white text-xs font-medium group-hover:text-brand-400 transition-colors line-clamp-2">{video.title}</p>
        <p className="text-gray-500 text-xs mt-1">{video.channel}</p>
        <p className="text-gray-600 text-xs mt-1 line-clamp-2">{video.summary}</p>
        <JustificationChip text={video.justification} />
      </div>
    </a>
  )
}

function ArticleCard({ article }: { article: ArticleRef }) {
  return (
    <a href={article.link} target="_blank" rel="noopener noreferrer"
      className="block p-3 rounded-lg bg-gray-800 border border-gray-700 hover:border-brand-600 transition-all group">
      <p className="text-white text-xs font-medium group-hover:text-brand-400 transition-colors">{article.title}</p>
      <p className="text-brand-500 text-xs mt-0.5">{article.source}</p>
      <p className="text-gray-500 text-xs mt-1 line-clamp-2">{article.summary}</p>
      <JustificationChip text={article.justification} />
    </a>
  )
}

function PaperCard({ paper }: { paper: PaperRef }) {
  return (
    <a href={paper.link} target="_blank" rel="noopener noreferrer"
      className="block p-3 rounded-lg bg-gray-800 border border-gray-700 hover:border-brand-600 transition-all group">
      <p className="text-white text-xs font-medium group-hover:text-brand-400 transition-colors">{paper.title}</p>
      <p className="text-gray-500 text-xs mt-0.5">{paper.authors}</p>
      {paper.insights && (
        <p className="text-gray-400 text-xs mt-2 line-clamp-3 leading-relaxed">{paper.insights}</p>
      )}
      {paper.explanation && (
        <p className="text-blue-400/70 text-xs mt-1.5 leading-relaxed italic">{paper.explanation}</p>
      )}
      <JustificationChip text={paper.justification} />
    </a>
  )
}

function NewsCard({ news }: { news: NewsRef }) {
  return (
    <a href={news.link} target="_blank" rel="noopener noreferrer"
      className="block p-3 rounded-lg bg-gray-800 border border-gray-700 hover:border-brand-600 transition-all group">
      <p className="text-white text-xs font-medium group-hover:text-brand-400 transition-colors">{news.headline}</p>
      <p className="text-brand-500 text-xs mt-0.5">{news.source}</p>
      <p className="text-gray-500 text-xs mt-1 line-clamp-2">{news.summary}</p>
      <JustificationChip text={news.justification} />
    </a>
  )
}
