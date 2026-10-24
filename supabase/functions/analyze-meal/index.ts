import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
// Anthropic accepts images up to 5 MB; base64 is 4/3 of the byte size
const MAX_BASE64_LENGTH = Math.ceil((5 * 1024 * 1024 * 4) / 3)

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  try {
    // Only signed-in Pro users may spend AI credits
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: { message: 'Unauthorized' } }, 401)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return json({ error: { message: 'Please sign in again.' } }, 401)

    const { data: sub } = await supabase.from('subscriptions').select('status').eq('user_id', user.id).maybeSingle()
    if (sub?.status !== 'pro') return json({ error: { message: 'The AI food scanner is a Pro feature.' } }, 403)

    let body: any
    try { body = await req.json() } catch { return json({ error: { message: 'Invalid JSON body' } }, 400) }
    const { base64, mediaType } = body ?? {}
    if (typeof base64 !== 'string' || !base64) return json({ error: { message: 'Missing image' } }, 400)
    if (!MEDIA_TYPES.has(mediaType)) return json({ error: { message: 'Use a JPEG, PNG, WebP or GIF photo.' } }, 400)
    if (base64.length > MAX_BASE64_LENGTH) return json({ error: { message: 'Photo is too large (5 MB max).' } }, 413)

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: 'Analyze this meal photo. Identify every visible food item and estimate nutritional content. Respond ONLY with a JSON object like this (no markdown, no explanation):\n{"foods":[{"name":"Food Name","kcal":300,"protein":20,"carbs":30,"fat":10,"portion":"1 cup"}],"total":{"kcal":300,"protein":20,"carbs":30,"fat":10},"confidence":"high"}' }
          ]
        }]
      })
    })

    const data = await resp.json()
    return json(data, resp.ok ? 200 : 502)
  } catch (e) {
    return json({ error: { message: (e as Error).message } }, 500)
  }
})
