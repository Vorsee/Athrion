import { useEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import Sheet from './Sheet.jsx'
import { Button, Segmented } from './ui/index.js'
import { STORY_W, STORY_H, drawCard, renderCardFile, shareOrSave } from '../lib/shareCard.js'

const LOOKS = [['overlay', 'Overlay'], ['dark', 'Dark'], ['photo', 'Your photo']]

// Share a finished workout or swim as a story image. content: cardContent() from lib/shareCard.js
export default function ShareSheet({ content, onClose }) {
  const canvas = useRef(null)
  const fileInput = useRef(null)
  const [look, setLook] = useState('overlay')
  const [photo, setPhoto] = useState(null)
  const [state, setState] = useState('idle') // idle | working | saved | shared
  const [err, setErr] = useState('')

  // The preview is the real card, drawn at full size and shown scaled down
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    let live = true
    document.fonts?.ready?.then(() => { if (live) drawCard(c.getContext('2d'), content, { look, photo }) })
    drawCard(c.getContext('2d'), content, { look, photo })
    return () => { live = false }
  }, [content, look, photo])

  function pickPhoto(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const img = new Image()
    img.onload = () => { setPhoto(img); setLook('photo') }
    img.onerror = () => setErr("That photo couldn't be opened")
    img.src = URL.createObjectURL(f)
  }

  async function share() {
    setErr(''); setState('working')
    try {
      const file = await renderCardFile(content, { look, photo })
      const how = await shareOrSave(file)
      setState(how === 'cancelled' ? 'idle' : how)
    } catch (x) { setErr(x.message || "Couldn't make the image"); setState('idle') }
  }

  const choose = v => {
    if (v === 'photo' && !photo) return fileInput.current?.click()
    setLook(v)
  }

  return (
    <Sheet title="Share to your story" onClose={onClose} footer={
      <div className="space-y-2">
        {err && <p role="alert" className="text-xs text-danger">{err}</p>}
        <Button full icon="mdi:share-variant-outline" onClick={share} disabled={state === 'working'}>
          {state === 'working' ? 'Making the image…' : state === 'saved' ? 'Saved. Share again' : 'Share'}
        </Button>
        <p className="text-xs text-muted text-center">
          {look === 'overlay'
            ? 'In Instagram, open your story, add your photo, then add this image from your gallery as a sticker.'
            : 'Pick Instagram, then Story, in the share menu.'}
        </p>
      </div>
    }>
      <Segmented options={LOOKS} value={look} onChange={choose} label="Look" kind="choice" />
      <input ref={fileInput} type="file" accept="image/*" onChange={pickPhoto} className="hidden" aria-label="Choose a photo" />
      {/* Checkerboard behind the transparent overlay, so its edges are visible */}
      <div className="mx-auto rounded-2xl overflow-hidden border border-line"
        style={{ width: 'min(100%, 15rem)', aspectRatio: `${STORY_W} / ${STORY_H}`,
          background: look === 'overlay' ? 'repeating-conic-gradient(rgb(var(--raised)) 0% 25%, rgb(var(--inset)) 0% 50%) 50% / 24px 24px' : 'rgb(var(--inset))' }}>
        <canvas ref={canvas} width={STORY_W} height={STORY_H} className="w-full h-full" role="img" aria-label={`${content.eyebrow}: ${content.title}`} />
      </div>
      {look === 'photo' && (
        <button type="button" onClick={() => fileInput.current?.click()} className="press mx-auto flex items-center gap-1.5 text-sm font-semibold text-neon-ink min-h-[40px]">
          <Icon icon="mdi:image-outline" width={18} aria-hidden="true" />Change photo
        </button>
      )}
    </Sheet>
  )
}
