import React from 'react'
import { ExternalLink, MapPin, Building2, Calendar, Brain } from 'lucide-react'
import { JobListing } from '../../types'

interface JobCardProps {
  job: JobListing
}

export const JobCard: React.FC<JobCardProps> = ({ job }) => {
  return (
    <div className="bg-gray-800/50 border border-gray-700 p-4 rounded-xl hover:border-brand-500/50 transition-all group">
      <div className="flex justify-between items-start gap-3">
        <h3 className="font-semibold text-white group-hover:text-brand-400 transition-colors leading-tight">
          {job.title}
        </h3>
        <a 
          href={job.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-gray-500 hover:text-white transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
      
      <div className="mt-2 flex flex-wrap gap-y-1 gap-x-4 text-xs text-gray-400">
        <div className="flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5" />
          {job.company}
        </div>
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" />
          {job.location}
        </div>
        {job.date && (
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            {job.date}
          </div>
        )}
      </div>

      {job.skills && job.skills.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <Brain className="w-3.5 h-3.5 text-brand-400" />
          <div className="flex flex-wrap gap-1">
            {job.skills.map((skill, idx) => (
              <span key={idx} className="bg-brand-500/10 text-brand-400 px-2 py-0.5 rounded-md text-[10px] font-medium border border-brand-500/20">
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <div className="w-16 h-1 rounded-full bg-gray-700 overflow-hidden">
             <div 
               className="h-full bg-brand-500" 
               style={{ width: `${job.score}%` }}
             />
          </div>
          <span className="text-[10px] text-gray-500 font-medium">Rank {job.score}%</span>
        </div>
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-semibold text-brand-400 hover:text-brand-300 uppercase tracking-wider"
        >
          View Listing
        </a>
      </div>
    </div>
  )
}
