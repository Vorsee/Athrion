import { useState, useEffect } from 'react'
import { Segmented } from '../components/ui/index.js'
import Swim from './Swim.jsx'
import Run from './Run.jsx'
import { readCardioSport, rememberCardioSport, firstSport } from '../lib/cardio.js'
import { fetchFitnessProfile } from '../lib/fitnessApi.js'
import { fetchCardio } from '../lib/progressApi.js'

const SPORTS = [['swim', 'Swim'], ['run', 'Run']]

// The Cardio tab (page key `swim`, so /?open=swim and team links still land here): Swim, with
// My swims and Team as before, and Run. A swim intent (invite, team notification) opens Swim.
// The first time on this device it opens Run, unless swimming is a goal or they only swim.
export default function Cardio({ intent, onIntentDone, isPro, onUpgrade }) {
  const [sport, setSport] = useState(() => (intent ? 'swim' : readCardioSport() ?? 'run'))
  const [sub, setSub] = useState(false) // Swim has a full-screen page open
  useEffect(() => { if (intent) setSport('swim') }, [intent])
  useEffect(() => {
    if (intent || readCardioSport()) return
    let alive = true
    Promise.all([fetchFitnessProfile().catch(() => null), fetchCardio(50).catch(() => [])]).then(([fp, logs]) => {
      if (!alive || readCardioSport()) return
      const s = firstSport({ goals: [fp?.primary_goal, ...(fp?.secondary_goals ?? [])].filter(Boolean), logs })
      setSport(s)
      rememberCardioSport(s)
    })
    return () => { alive = false }
  }, [intent])
  function pick(s) {
    setSport(s)
    rememberCardioSport(s)
  }

  return (
    <div className={sub ? '' : 'space-y-4 py-4 slide-up'}>
      {!sub && <h1 className="font-bold text-xl text-ink">Cardio</h1>}
      {!sub && <Segmented options={SPORTS} value={sport} onChange={pick} label="Cardio" />}
      {sport === 'swim'
        ? <Swim embedded onSubScreen={setSub} intent={intent} onIntentDone={onIntentDone} isPro={isPro} onUpgrade={onUpgrade} />
        : <Run />}
    </div>
  )
}
