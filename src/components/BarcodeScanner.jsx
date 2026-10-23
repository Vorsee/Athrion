import { useState, useEffect, useRef } from 'react'
import Sheet from './Sheet.jsx'

// Open Food Facts: free, open product database (world.openfoodfacts.org)
async function lookupBarcode(code) {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,nutriments,serving_size,serving_quantity`)
  if (!res.ok) throw new Error('Product lookup failed')
  const data = await res.json()
  if (data.status === 0 || !data.product) return null
  const p = data.product
  const n = p.nutriments ?? {}
  const per100 = {
    kcal: n['energy-kcal_100g'] ?? (n.energy_100g ? n.energy_100g / 4.184 : 0),
    protein: n.proteins_100g ?? 0,
    carbs: n.carbohydrates_100g ?? 0,
    fat: n.fat_100g ?? 0,
  }
  return {
    code,
    name: [p.brands?.split(',')[0], p.product_name].filter(Boolean).join(' ') || `Product ${code}`,
    per100,
    servingGrams: Number(p.serving_quantity) || null,
    servingLabel: p.serving_size || null,
  }
}

// Camera barcode reader: the browser's BarcodeDetector where it exists (Chrome, Android),
// otherwise ZXing (iOS Safari). Calls onCode once with the first barcode read.
function useBarcodeCamera(videoRef, onCode, active) {
  const [error, setError] = useState('')
  useEffect(() => {
    if (!active) return
    let stopped = false
    let stream = null
    let controls = null
    let raf = 0

    async function start() {
      try {
        if ('BarcodeDetector' in window) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
          const video = videoRef.current
          video.srcObject = stream
          await video.play()
          const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
          const tick = async () => {
            if (stopped) return
            try {
              const [hit] = await detector.detect(video)
              if (hit?.rawValue) { stopped = true; onCode(hit.rawValue); return }
            } catch {}
            raf = requestAnimationFrame(tick)
          }
          tick()
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser')
          const reader = new BrowserMultiFormatReader()
          controls = await reader.decodeFromConstraints(
            { video: { facingMode: 'environment' } }, videoRef.current,
            result => { if (result && !stopped) { stopped = true; onCode(result.getText()) } },
          )
        }
      } catch (e) {
        setError(e.name === 'NotAllowedError' ? 'Camera access was denied. Allow it in your browser settings, or type the barcode below.' : 'Could not start the camera. Type the barcode below instead.')
      }
    }
    start()

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      controls?.stop()
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [active])
  return error
}

export default function BarcodeScanner({ defaultMeal, meals, onAdd, onClose }) {
  const videoRef = useRef(null)
  const [stage, setStage] = useState('scan') // scan | loading | found | missing
  const [product, setProduct] = useState(null)
  const [manualCode, setManualCode] = useState('')
  const [grams, setGrams] = useState('')
  const [meal, setMeal] = useState(defaultMeal)
  const [err, setErr] = useState('')

  async function handleCode(code) {
    setStage('loading'); setErr('')
    try {
      const p = await lookupBarcode(code.trim())
      if (!p) { setStage('missing'); return }
      setProduct(p)
      setGrams(String(p.servingGrams ?? 100))
      setStage('found')
    } catch (e) {
      setErr(e.message); setStage('scan')
    }
  }

  const cameraError = useBarcodeCamera(videoRef, handleCode, stage === 'scan')

  const g = Number(grams) || 0
  const macros = product && {
    kcal: Math.round(product.per100.kcal * g / 100),
    protein: Math.round(product.per100.protein * g / 10) / 10,
    carbs: Math.round(product.per100.carbs * g / 10) / 10,
    fat: Math.round(product.per100.fat * g / 10) / 10,
  }

  return (
    <Sheet title="Scan Barcode" onClose={onClose} footer={stage === 'found' && (
      <button onClick={() => onAdd({ name: `${product.name} (${g} g)`, ...macros, meal })} disabled={!g}
        className="w-full bg-neon text-black font-bold py-3.5 rounded-xl text-sm uppercase tracking-widest disabled:opacity-50">
        Add to {meals.find(m => m.id === meal)?.label ?? meal} →
      </button>
    )}>
      {stage === 'scan' && (
        <>
          <div className="relative w-full aspect-[4/3] bg-black rounded-xl overflow-hidden">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-24 border-2 border-neon/70 rounded-lg pointer-events-none" />
          </div>
          <p className="text-xs text-gray-500">Point the camera at the barcode.</p>
          {(cameraError || err) && <p className="text-xs text-red-400">{cameraError || err}</p>}
          <div className="flex gap-2 pb-2">
            <input value={manualCode} onChange={e => setManualCode(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Or type the barcode number"
              className="flex-1 bg-[#1a1a1a] border border-[#262626] rounded-xl px-3 py-2 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-neon/40" />
            <button onClick={() => manualCode && handleCode(manualCode)} disabled={manualCode.length < 8}
              className="px-4 rounded-xl bg-[#222] text-sm text-white disabled:opacity-40">Look up</button>
          </div>
        </>
      )}

      {stage === 'loading' && <div className="py-10 text-center text-sm text-gray-500 animate-pulse">Looking up product...</div>}

      {stage === 'missing' && (
        <div className="py-6 text-center space-y-3">
          <p className="text-sm text-gray-400">This product isn't in the Open Food Facts database yet.</p>
          <button onClick={() => setStage('scan')} className="text-xs text-neon">Scan another</button>
        </div>
      )}

      {stage === 'found' && product && (
        <div className="space-y-4 pb-2">
          <div>
            <div className="font-semibold text-white break-words">{product.name}</div>
            <div className="text-[11px] text-gray-600">
              Per 100 g: {Math.round(product.per100.kcal)} kcal · P {product.per100.protein}g · C {product.per100.carbs}g · F {product.per100.fat}g
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] text-gray-500 uppercase tracking-widest">Amount (g)</span>
              <input type="number" inputMode="decimal" value={grams} onChange={e => setGrams(e.target.value)}
                className="mt-1 w-full bg-[#1a1a1a] border border-[#262626] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-neon/40" />
              {product.servingLabel && <span className="text-[10px] text-gray-600">1 serving = {product.servingLabel}</span>}
            </label>
            <label className="block">
              <span className="text-[10px] text-gray-500 uppercase tracking-widest">Meal</span>
              <select value={meal} onChange={e => setMeal(e.target.value)}
                className="mt-1 w-full bg-[#1a1a1a] border border-[#262626] rounded-xl px-3 py-2 text-sm text-white focus:outline-none">
                {meals.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[['kcal', macros.kcal], ['Protein', `${macros.protein}g`], ['Carbs', `${macros.carbs}g`], ['Fat', `${macros.fat}g`]].map(([l, v]) => (
              <div key={l} className="bg-[#161616] rounded-xl py-2">
                <div className="font-bebas text-xl text-white">{v}</div>
                <div className="text-[10px] text-gray-600 uppercase">{l}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  )
}
