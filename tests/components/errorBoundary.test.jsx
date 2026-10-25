// A crash shows a message and a Reload button instead of an empty page
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from '../../src/components/ErrorBoundary.jsx'

function Boom({ message }) { throw new Error(message) }

describe('ErrorBoundary', () => {
  afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear() })

  it('shows what went wrong and a reload button', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorBoundary><Boom message="Cannot read properties of undefined" /></ErrorBoundary>)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(screen.getByText('Cannot read properties of undefined')).toBeInTheDocument()
  })

  it('reloads once when a deploy replaced the code this tab was using', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reload = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload })
    render(<ErrorBoundary><Boom message="Failed to fetch dynamically imported module: /assets/Plan-abc.js" /></ErrorBoundary>)
    render(<ErrorBoundary><Boom message="Failed to fetch dynamically imported module: /assets/Plan-abc.js" /></ErrorBoundary>)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
