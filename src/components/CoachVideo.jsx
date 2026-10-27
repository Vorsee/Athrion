import { useState } from 'react'
import { Icon } from '@iconify/react'
import { videoUrl } from '../lib/coachApi.js'

// A coach's how-to clip from private storage. The signed link is only fetched on tap,
// so a list of exercises doesn't download every video.
export default function CoachVideo({ path, label = 'Watch how to do it' }) {
  const [src, setSrc] = useState(null)
  const [state, setState] = useState('idle') // idle | loading | error
  async function load() {
    setState('loading')
    try { setSrc(await videoUrl(path)); setState('idle') } catch { setState('error') }
  }
  if (src) return (
    <video src={src} controls playsInline autoPlay className="w-full rounded-xl bg-inset aspect-video" aria-label={label} />
  )
  return (
    <button type="button" onClick={load} disabled={state === 'loading'}
      className="press w-full min-h-[44px] rounded-xl bg-raised border border-line text-sm font-semibold text-ink-2 hover:text-ink flex items-center justify-center gap-2">
      <Icon icon="mdi:play-circle-outline" width={20} className="text-neon-ink" aria-hidden="true" />
      {state === 'loading' ? 'Loading video…' : state === 'error' ? "Couldn't load the video. Tap to retry" : label}
    </button>
  )
}

// The coach's tip and video for one exercise, shown while training it
export function CoachNote({ tip, video }) {
  if (!tip && !video) return null
  return (
    <div className="bg-neon-tint border border-neon-stroke/20 rounded-2xl p-4 space-y-3">
      <div className="text-xs font-semibold text-neon-ink inline-flex items-center gap-1.5">
        <Icon icon="mdi:whistle-outline" width={16} aria-hidden="true" />Coach's tip
      </div>
      {tip && <p className="text-sm text-ink-2 whitespace-pre-line">{tip}</p>}
      {video && <CoachVideo path={video} />}
    </div>
  )
}
