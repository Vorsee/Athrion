import { useState, useEffect } from 'react'
import { Segmented } from '../components/ui/index.js'
import Swim from './Swim.jsx'
import Run from './Run.jsx'
import { readCardioSport, rememberCardioSport } from '../lib/cardio.js'

const SPORTS = [['swim', 'Swim'], ['run', 'Run']]

// The Cardio tab (page key `swim`, so /?open=swim and team links still land here): Swim, with
// My swims and Team as before, and Run. A swim intent (invite, team notification) opens Swim.
export default function Cardio({ intent, onIntentDone, isPro, onUpgrade }) {
  const [sport, setSport] = useState(() => (intent ? 'swim' : readCardioSport()))
  const [sub, setSub] = useState(false) // Swim has a full-screen page open
  useEffect(() => { if (intent) setSport('swim') }, [intent])
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
