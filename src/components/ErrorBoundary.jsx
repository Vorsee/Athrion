import { Component } from 'react'

const RELOADED = 'athrion_reloaded_after_error'

// After a deploy, a tab still running the old version asks for code files that no longer exist
const isStaleCode = e => /dynamically imported module|Importing a module script failed|error loading dynamically|ChunkLoadError|MIME type/i.test(String(e?.message || e))

// Without this, any crash while rendering leaves an empty page
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error(error)
    // Reload once to pick up the new version; never loop
    let reloaded = true
    try { reloaded = !!sessionStorage.getItem(RELOADED) } catch {}
    if (isStaleCode(error) && !reloaded) {
      try { sessionStorage.setItem(RELOADED, '1') } catch {}
      window.location.reload()
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="min-h-dvh bg-canvas text-ink font-dm flex flex-col items-center justify-center text-center px-6">
        <div className="text-[1.625rem] font-bold tracking-tight">ATHRION</div>
        <div className="font-semibold text-lg mt-6">Something went wrong</div>
        <p className="text-sm text-muted mt-1 max-w-xs">Reload to try again. Your workouts and logs are saved.</p>
        <button type="button" onClick={() => window.location.reload()}
          className="press mt-6 h-12 px-6 rounded-xl bg-neon text-on-neon text-sm font-semibold">
          Reload
        </button>
        <p className="text-xs text-muted mt-6 max-w-sm break-words">{String(this.state.error?.message || this.state.error)}</p>
      </div>
    )
  }
}

// Forget the reload once the app has been running fine for a while
export function clearReloadFlagSoon() {
  setTimeout(() => { try { sessionStorage.removeItem(RELOADED) } catch {} }, 10000)
}
