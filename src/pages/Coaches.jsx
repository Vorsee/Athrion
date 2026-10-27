import { useState } from 'react'
import { PageHeader, Fact } from '../components/ui/index.js'
import Shop from '../components/Shop.jsx'

// The Coaches tab: the coach shop (014) one tap from the bottom bar.
// shopIntent: { product, paid } back from Stripe, or { product } / { coach } from a shared link.
export default function Coaches({ onStartPlanDay, onOpenCoach, shopIntent, onShopIntentDone }) {
  const [deep, setDeep] = useState(false) // a coach or product is open: it shows its own header
  return (
    <div className="space-y-4 py-4 slide-up">
      {!deep && (
        <PageHeader icon="mdi:whistle-outline" title="Coaches"
          facts={<Fact icon="mdi:storefront-outline">Workouts and week plans</Fact>} />
      )}
      <Shop onStartPlanDay={onStartPlanDay} onOpenCoach={onOpenCoach} intent={shopIntent} onIntentDone={onShopIntentDone} onDeepChange={setDeep} />
    </div>
  )
}
