// Colour tokens for inline styles and SVG. The values are CSS variables defined in
// src/index.css, so they follow the light and dark themes automatically.
// tok('warn') -> rgb(var(--warn)); tok('warn', 0.12) -> rgb(var(--warn) / 0.12)
export const tok = (name, alpha) => alpha == null ? `rgb(var(--${name}))` : `rgb(var(--${name}) / ${alpha})`
