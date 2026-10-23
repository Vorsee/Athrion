// Stand-ins for the Deno-only imports used by the Edge Functions (wired up in vite.config.js)
import { vi } from 'vitest'

// State lives on globalThis so it survives vi.resetModules() between the test and the function

// npm:@anthropic-ai/sdk — tests set anthropic.result to a message or an Error
export const anthropic = (globalThis.__anthropicStub ??= { result: null, calls: [] })
export default class Anthropic {
  constructor() {
    this.beta = { messages: { stream: params => {
      anthropic.calls.push(params)
      return { finalMessage: async () => { if (anthropic.result instanceof Error) throw anthropic.result; return anthropic.result } }
    } } }
  }
}

// npm:web-push
export const webpush = (globalThis.__webpushStub ??= {
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(async () => ({})),
  generateVAPIDKeys: () => ({ publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' }),
  generateRequestDetails: () => ({ body: new Uint8Array(120) }),
})

// Deno global: env plus a serve() that captures the handler
export function installDeno(env) {
  const deno = { handler: null, env: { get: k => env[k] }, serve: h => { deno.handler = h } }
  globalThis.Deno = deno
  return deno
}
