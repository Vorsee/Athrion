import { useState } from 'react'
import Sheet from './Sheet.jsx'
import { Button } from './ui/index.js'
import { supabase } from '../lib/supabase.js'

// Opened from the password reset email: Supabase has signed them in, now they pick a new password
export default function NewPasswordSheet({ onClose }) {
  const [password, setPassword] = useState('')
  const [state, setState] = useState('idle') // idle | saving | done
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    if (password.length < 6) return setError('Password must be at least 6 characters.')
    setState('saving'); setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setState('idle') } else setState('done')
  }

  return (
    <Sheet title="Set a new password" onClose={onClose}>
      {state === 'done' ? (
        <>
          <p role="status" className="text-sm text-ink-2">Your password is updated. You're signed in.</p>
          <Button full onClick={onClose}>Continue</Button>
        </>
      ) : (
        <form onSubmit={save} className="space-y-3" noValidate>
          <input type="password" name="password" autoComplete="new-password" aria-label="New password"
            placeholder="New password" value={password} onChange={e => { setPassword(e.target.value); setError('') }}
            className="w-full bg-raised border border-line focus:border-neon-stroke text-ink placeholder:text-placeholder rounded-xl px-4 py-3 text-sm outline-none transition-colors" />
          {error && <p role="alert" className="text-danger text-xs">{error}</p>}
          <Button full type="submit" disabled={state === 'saving'}>{state === 'saving' ? 'Saving…' : 'Save password'}</Button>
        </form>
      )}
    </Sheet>
  )
}
