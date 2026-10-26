import React from 'react'
import ReactDOM from 'react-dom/client'
import { addCollection } from '@iconify/react'
import App from './App.jsx'
import ErrorBoundary, { clearReloadFlagSoon } from './components/ErrorBoundary.jsx'
import icons from './lib/icons.json'
// Served from our own domain, so visitors' browsers never contact Google Fonts
import '@fontsource-variable/dm-sans/opsz.css'
import './index.css'

// Icons ship with the app (see scripts/build-icons.mjs) instead of loading from the Iconify API
addCollection(icons)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
clearReloadFlagSoon()

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
