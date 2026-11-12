import { Icon } from '@iconify/react'
import { Button, Sheet } from './ui/index.js'

// After a fast join from a room link (R5): the body stats were left for later. Asked once a
// day, never in a room; Later closes it until tomorrow.
const KEY = 'athrion_stats_reminded'

export function statsReminderDue(today) {
  try { return localStorage.getItem(KEY) !== today } catch { return true }
}
export function statsReminded(today) {
  try { localStorage.setItem(KEY, today) } catch {}
}

export default function FinishProfileSheet({ onFinish, onLater }) {
  const items = [
    ['mdi:food-apple-outline', 'Calorie and protein targets that fit you'],
    ['mdi:clipboard-text-outline', 'A training plan built around you'],
    ['mdi:scale-bathroom', 'Weight progress on your goal'],
  ]
  return (
    <Sheet title="Finish your profile" onClose={onLater}
      footer={<div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 8rem), 1fr))' }}>
        <Button variant="secondary" onClick={onLater}>Later</Button>
        <Button icon="mdi:arrow-right" onClick={onFinish}>Add my stats</Button>
      </div>}>
      <p className="text-sm text-ink-2">Nice work getting in the room. Add your sex, height and weight (about 30 seconds) and the rest of ATHRION fits you:</p>
      <ul className="space-y-2">
        {items.map(([icon, text], i) => (
          <li key={text} className="rise flex items-center gap-3 bg-raised rounded-xl px-3 py-3" style={{ '--i': i }}>
            <Icon icon={icon} width={22} className="text-neon-ink flex-shrink-0" aria-hidden="true" />
            <span className="text-sm text-ink">{text}</span>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
