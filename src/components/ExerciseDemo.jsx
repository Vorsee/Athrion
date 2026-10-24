import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import Sheet from './Sheet.jsx'
import { findDemo, findAlternatives, imageUrl, youtubeSearchUrl } from '../lib/exerciseDb.js'

// Plays the ExerciseDB GIF, or alternates the start and end photos so the movement reads as a short loop
function DemoAnimation({ demo }) {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (demo.gif || demo.images.length < 2) return
    const id = setInterval(() => setFrame(f => (f + 1) % demo.images.length), 900)
    return () => clearInterval(id)
  }, [demo])

  if (demo.gif) return (
    // GIFs are square on white, so the frame matches instead of letterboxing
    <div className="w-full max-w-[300px] mx-auto aspect-square bg-white rounded-xl overflow-hidden">
      <img src={demo.gif} alt={`${demo.name} demonstration`} className="w-full h-full object-contain" />
    </div>
  )

  return (
    <div className="relative w-full aspect-[3/2] bg-raised rounded-xl overflow-hidden">
      {demo.images.map((src, i) => (
        <img key={src} src={imageUrl(src)} alt={`${demo.name} ${i ? 'end' : 'start'} position`}
          className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${i === frame ? 'opacity-100' : 'opacity-0'}`} />
      ))}
    </div>
  )
}

function useDemo(name) {
  const [state, setState] = useState({ loading: true, demo: null, error: '' })
  useEffect(() => {
    let alive = true
    findDemo(name)
      .then(demo => alive && setState({ loading: false, demo, error: '' }))
      .catch(e => alive && setState({ loading: false, demo: null, error: e.message }))
    return () => { alive = false }
  }, [name])
  return state
}

// Small "how to" button that opens the demo sheet
export function DemoButton({ name, className = '' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={e => { e.stopPropagation(); setOpen(true) }} aria-label={`How to do ${name}`}
        className={`flex-shrink-0 w-8 h-8 rounded-lg bg-line hover:bg-line-strong flex items-center justify-center text-muted hover:text-neon-ink transition-colors ${className}`}>
        <Icon icon="mdi:play-circle-outline" width={18} />
      </button>
      {open && <ExerciseDemoSheet name={name} onClose={() => setOpen(false)} />}
    </>
  )
}

export function ExerciseDemoSheet({ name, onClose }) {
  const { loading, demo, error } = useDemo(name)

  return (
    <Sheet title="How to" onClose={onClose} footer={
      <a href={youtubeSearchUrl(name)} target="_blank" rel="noreferrer"
        className="w-full flex items-center justify-center gap-2 border border-line-strong text-ink-2 font-semibold py-3 rounded-xl text-xs hover:border-neon-stroke/40 hover:text-neon-ink">
        <Icon icon="mdi:youtube" width={18} /> Watch a video
      </a>
    }>
      <div className="font-semibold text-ink break-words">{name}</div>
      {loading && (
        <div className="space-y-2 animate-pulse">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-3 bg-raised rounded" />)}
        </div>
      )}
      {!loading && demo && (
        <>
          {/* Animation hidden until the ExerciseDB HD licence is in place; turn back on by restoring this block.
          <DemoAnimation demo={demo} />
          {(demo.name.toLowerCase() !== name.toLowerCase() || demo.gif) && (
            <div className="flex justify-between gap-3 text-xs text-muted">
              <span>{demo.name.toLowerCase() !== name.toLowerCase() && `Shown: ${demo.name}`}</span>
              {demo.gif && <span className="flex-shrink-0">Animation: ExerciseDB</span>}
            </div>
          )}
          */}
          {demo.name.toLowerCase() !== name.toLowerCase() && (
            <div className="text-xs text-muted">Steps for: {demo.name}</div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {[...demo.primaryMuscles, ...demo.secondaryMuscles.slice(0, 2)].map((m, i) => (
              <span key={m} className={`text-xs capitalize px-2 py-0.5 rounded-md ${i < demo.primaryMuscles.length ? 'bg-neon/15 text-neon-ink' : 'bg-line text-muted'}`}>{m}</span>
            ))}
            {demo.equipment && <span className="text-xs capitalize px-2 py-0.5 rounded-md bg-line text-muted">{demo.equipment}</span>}
          </div>
          <ol className="space-y-2 pb-2">
            {demo.instructions.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-xs text-muted leading-relaxed">
                <span className="font-bold text-neon-ink text-sm leading-tight w-4 flex-shrink-0">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      {!loading && !demo && (
        <p className="text-xs text-muted pb-2">
          {error ? 'The exercise library could not be loaded right now.' : "We don't have a demo for this one yet."} Tap below for a video.
        </p>
      )}
    </Sheet>
  )
}

// Swap an exercise for its easier/harder version or a similar movement
export function SwapSheet({ exercise, onSwap, onClose }) {
  const [alts, setAlts] = useState(null)
  useEffect(() => {
    findAlternatives(exercise.name).then(setAlts).catch(() => setAlts([]))
  }, [exercise.name])

  const options = [
    exercise.easierVersion && { name: exercise.easierVersion, tag: 'Easier' },
    exercise.harderVersion && { name: exercise.harderVersion, tag: 'Harder' },
    ...(alts ?? []).map(a => ({ name: a.name, tag: a.equipment ? a.equipment : 'Similar' })),
  ].filter(Boolean)

  return (
    <Sheet title="Swap exercise" onClose={onClose}>
      <p className="text-xs text-muted">Replacing <span className="text-ink">{exercise.name}</span>. Sets, reps and rest stay the same.</p>
      <div className="space-y-2 pb-4">
        {options.map(o => (
          <button key={o.tag + o.name} onClick={() => onSwap(o.name)}
            className="w-full flex items-center justify-between gap-3 bg-raised border border-line hover:border-neon-stroke/40 rounded-xl px-3 py-3 text-left">
            <span className="text-sm text-ink break-words">{o.name}</span>
            <span className="text-xs capitalize text-muted flex-shrink-0">{o.tag}</span>
          </button>
        ))}
        {alts === null && <div className="h-12 bg-raised rounded-xl animate-pulse" />}
        {alts !== null && !options.length && <p className="text-xs text-muted">No alternatives found for this exercise.</p>}
      </div>
    </Sheet>
  )
}
