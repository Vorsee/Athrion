// Story images (1080 x 1920) of a finished workout or swim, drawn on a canvas, to share to
// Instagram Stories and the like. Three looks: 'overlay' (transparent, white type with a soft
// shadow, to put over your own photo as a sticker), 'dark' (the app's dark background) and
// 'photo' (a picture the person picks, darkened at the bottom so the numbers read).
export const STORY_W = 1080
export const STORY_H = 1920
const NEON = '#C8F135'
const INK = '#F4F2EC'
const FONT = '"DM Sans Variable", "DM Sans", system-ui, sans-serif'

// The ATHRION mark (components/Brand.jsx), as paths on a 456 x 474 box
const MARK_A = 'M0 474 186 0h84l186 474h-96L228 126 96 474z'
const MARK_BARS = [[150, 348, 51, 126], [204, 282, 51, 192], [258, 396, 51, 78]]

/**
 * The text on a card.
 * workout: { kind: 'workout', title, date, minutes, volume, sets, lifts: ['Bench Press 185 lb × 5'], records }
 *   (volume already formatted in the person's unit)
 * swim: { kind: 'swim', title, date, distance, time, pace }
 * @returns { eyebrow, title, stats: [[label, value]], lines: [], highlight }
 */
export function cardContent(a) {
  const date = new Date(`${a.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  if (a.kind === 'swim') return {
    eyebrow: `Swim · ${date}`,
    title: a.title,
    stats: [['Distance', a.distance], ['Time', a.time], ['Pace', a.pace]].filter(([, v]) => v),
    lines: [],
    highlight: a.highlight ?? null,
  }
  return {
    eyebrow: `Workout · ${date}`,
    title: a.title,
    stats: [['Time', `${a.minutes} min`], ['Volume', a.volume], ['Sets', String(a.sets)]].filter(([, v]) => v && !/^0( |$)/.test(v)),
    lines: (a.lifts ?? []).slice(0, 3),
    highlight: a.records > 0 ? `${a.records} new ${a.records === 1 ? 'record' : 'records'}` : null,
  }
}

// Words onto lines no wider than max, at most `rows` lines (the last one ends in …)
function wrap(ctx, text, max, rows = 2) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean)
  const out = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (ctx.measureText(next).width <= max || !line) line = next
    else { out.push(line); line = w }
  }
  if (line) out.push(line)
  if (out.length > rows) {
    out.length = rows
    let last = out[rows - 1]
    while (last.length > 1 && ctx.measureText(`${last}…`).width > max) last = last.slice(0, -1)
    out[rows - 1] = `${last.trimEnd()}…`
  }
  return out
}

function cover(ctx, img) {
  const s = Math.max(STORY_W / img.width, STORY_H / img.height)
  const w = img.width * s, h = img.height * s
  ctx.drawImage(img, (STORY_W - w) / 2, (STORY_H - h) / 2, w, h)
}

function drawMark(ctx, x, y, h, ink) {
  const k = h / 474
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(k, k)
  ctx.fillStyle = ink
  ctx.fill(new Path2D(MARK_A))
  ctx.fillStyle = NEON
  for (const [bx, by, bw, bh] of MARK_BARS) ctx.fillRect(bx, by, bw, bh)
  ctx.beginPath(); ctx.arc(229, 237, 21, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
  return 456 * k
}

/** Draws the card onto a 1080 x 1920 canvas context. photo: an image for the 'photo' look. */
export function drawCard(ctx, content, { look = 'overlay', photo = null } = {}) {
  ctx.clearRect(0, 0, STORY_W, STORY_H)
  if (look === 'dark') {
    ctx.fillStyle = '#0B0B0A'
    ctx.fillRect(0, 0, STORY_W, STORY_H)
  } else if (look === 'photo' && photo) {
    cover(ctx, photo)
    const g = ctx.createLinearGradient(0, STORY_H * 0.35, 0, STORY_H)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.78)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, STORY_W, STORY_H)
  }
  // On a transparent sticker the type carries its own shadow, so it reads on any photo
  const shadow = look !== 'dark'
  const text = (str, x, y, size, { weight = 700, color = INK, align = 'left' } = {}) => {
    ctx.font = `${weight} ${size}px ${FONT}`
    ctx.textAlign = align
    ctx.fillStyle = color
    ctx.shadowColor = shadow ? 'rgba(0,0,0,0.45)' : 'transparent'
    ctx.shadowBlur = shadow ? 18 : 0
    ctx.shadowOffsetY = shadow ? 3 : 0
    ctx.fillText(str, x, y)
  }

  // Overlay: centred, like a sticker. Dark and photo: left aligned, in the lower part of the story.
  const centred = look === 'overlay'
  const x = centred ? STORY_W / 2 : 96
  const align = centred ? 'center' : 'left'
  const maxW = STORY_W - 192
  ctx.textBaseline = 'alphabetic'

  ctx.font = `800 84px ${FONT}`
  const titleLines = wrap(ctx, content.title, maxW, 2)
  const statH = 210
  const blockH = 60 + titleLines.length * 96 + 40 + content.stats.length * statH
    + (content.lines.length ? 30 + content.lines.length * 62 : 0) + (content.highlight ? 90 : 0) + 150
  let y = centred ? (STORY_H - blockH) / 2 + 40 : Math.max(500, STORY_H - 200 - blockH)

  text(content.eyebrow, x, y, 44, { weight: 600, color: NEON, align }); y += 100
  for (const l of titleLines) { text(l, x, y, 84, { weight: 800, align }); y += 96 }
  y += 40
  for (const [label, value] of content.stats) {
    text(label, x, y, 42, { weight: 500, color: 'rgba(244,242,236,0.82)', align }); y += 128
    // A unit after a slash ("1:44 /100 m") is set smaller, like the app does
    const [main, unit] = value.split(' /')
    if (unit) {
      ctx.font = `800 128px ${FONT}`
      const mw = ctx.measureText(main).width
      ctx.font = `700 52px ${FONT}`
      const uw = ctx.measureText(` /${unit}`).width
      const start = centred ? x - (mw + uw) / 2 : x
      text(main, start, y, 128, { weight: 800 })
      text(` /${unit}`, start + mw, y, 52, { weight: 700, color: 'rgba(244,242,236,0.82)' })
    } else text(value, x, y, 128, { weight: 800, align })
    y += statH - 128
  }
  if (content.lines.length) {
    y += 30
    for (const l of content.lines) { text(l, x, y, 44, { weight: 600, align }); y += 62 }
  }
  if (content.highlight) { y += 50; text(content.highlight, x, y, 48, { weight: 700, color: NEON, align }); y += 40 }

  // The brand at the foot of the block
  y += 90
  ctx.shadowColor = 'transparent'
  ctx.font = `italic 900 52px ${FONT}`
  const word = 'ATHRION'
  const markH = 56, gap = 18
  const total = (456 / 474) * markH + gap + ctx.measureText(word).width
  const left = centred ? (STORY_W - total) / 2 : x
  if (shadow) { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 18 }
  const mw = drawMark(ctx, left, y - markH + 4, markH, INK)
  text(word, left + mw + gap, y, 52, { weight: 900, align: 'left' })
}

/** The card as a PNG file, ready for navigator.share or a download. */
export async function renderCardFile(content, opts = {}) {
  try { await document.fonts?.load?.(`800 84px ${FONT}`) } catch { /* the fallback font is fine */ }
  const canvas = document.createElement('canvas')
  canvas.width = STORY_W
  canvas.height = STORY_H
  drawCard(canvas.getContext('2d'), content, opts)
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
  const name = `athrion-${content.eyebrow.split(' ')[0].toLowerCase()}-${Date.now()}.png`
  return new File([blob], name, { type: 'image/png' })
}

/** Share to the phone's share sheet (Instagram Stories is there), or save the image. */
export async function shareOrSave(file) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return 'shared'
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled'
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return 'saved'
}
