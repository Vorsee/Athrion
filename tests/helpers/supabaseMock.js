// A stand-in for the Supabase client. Every query is recorded with its chained calls
// (select, eq, order, …) and resolves to whatever the test set for that table.
import { vi } from 'vitest'

export const USER = { id: 'user-1', email: 'sam@example.com', user_metadata: { full_name: 'Sam' } }

function createMock() {
  const state = { queries: [], results: {}, user: USER }

  function query(table) {
    const q = { table, ops: [] }
    state.queries.push(q)
    const chain = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') {
          const r = state.results[table]
          const value = typeof r === 'function' ? r(q) : (r ?? { data: null, error: null })
          return (res, rej) => Promise.resolve(value).then(res, rej)
        }
        return (...args) => { q.ops.push([prop, ...args]); return chain }
      },
    })
    return chain
  }

  const bucket = {
    upload: vi.fn(async () => ({ error: null })),
    remove: vi.fn(async () => ({ error: null })),
    createSignedUrls: vi.fn(async paths => ({ data: paths.map(p => ({ signedUrl: `https://signed/${p}` })) })),
  }
  const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) }

  const supabase = {
    from: vi.fn(query),
    auth: {
      getUser: vi.fn(async () => ({ data: { user: state.user } })),
      getSession: vi.fn(async () => ({ data: { session: state.user ? { access_token: 'jwt-token', user: state.user } : null } })),
      refreshSession: vi.fn(async () => ({ data: { session: state.user ? { access_token: 'fresh-token', user: state.user } : null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn(async () => ({ error: null })),
      signUp: vi.fn(async () => ({ data: {}, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      resetPasswordForEmail: vi.fn(async () => ({ error: null })),
    },
    storage: { from: vi.fn(() => bucket) },
    rpc: vi.fn(async () => ({ data: null, error: null })),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  }

  return {
    supabase, bucket, channel, state,
    // result for every query on a table: an object, or (query) => object
    set(table, result) { state.results[table] = result },
    queriesFor(table) { return state.queries.filter(q => q.table === table) },
    op(q, name) { return q.ops.find(o => o[0] === name)?.slice(1) },
    reset() {
      state.queries.length = 0
      state.results = {}
      state.user = USER
      vi.clearAllMocks()
    },
  }
}

export const sb = createMock()
