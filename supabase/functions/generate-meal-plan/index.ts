import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import Anthropic from "npm:@anthropic-ai/sdk@1"
import { MEAL_SYSTEM, MEAL_SCHEMA, readMealInput, buildMealMessage, isValidMealPlan, withTotals } from "./meals.ts"

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const AI_MODEL = Deno.env.get('AI_MODEL') ?? 'claude-opus-5-5'
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

async function generateWithClaude(input: any): Promise<any> {
  // Structured output keeps the reply to MEAL_SCHEMA; streaming keeps the long reply from timing out
  const stream = anthropic.beta.messages.stream({
    model: AI_MODEL,
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: MEAL_SCHEMA } },
    system: MEAL_SYSTEM,
    messages: [{ role: 'user', content: buildMealMessage(input) }],
  } as any)
  const message = await stream.finalMessage()
  if (message.stop_reason === 'refusal') throw new Error('Claude declined the request')
  if (message.stop_reason === 'max_tokens') throw new Error('Claude response was truncated')
  const text = message.content.find((b: any) => b.type === 'text')?.text ?? ''
  return JSON.parse(text)
}

// POST { calories, protein, carbs, fat, diet, likes, dislikes, cookTime } → { plan } (Pro only)
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return json({ error: 'Please sign in again.' }, 401)

    // Pro: a Stripe subscription, or a free month won on the leaderboard
    const { data: sub } = await supabase.from('subscriptions').select('*').eq('user_id', user.id).maybeSingle()
    const pro = sub?.status === 'pro' || (sub?.comp_pro_until && new Date(sub.comp_pro_until) > new Date())
    if (!pro) return json({ error: 'The AI meal plan is a Pro feature.' }, 403)

    let body: any
    try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }
    const read = readMealInput(body)
    if ('error' in read) return json({ error: read.error }, 400)

    // One plan a minute per person
    const { data: last } = await supabase.from('meal_plans').select('created_at').eq('user_id', user.id).maybeSingle()
    if (last && Date.now() - new Date(last.created_at).getTime() < 60_000) return json({ error: 'Please wait a minute before building another plan.' }, 429)

    let plan: any = null
    const errors: string[] = []
    for (let attempt = 1; attempt <= 2 && !plan; attempt++) {
      try {
        const candidate = await generateWithClaude(read.input)
        if (isValidMealPlan(candidate)) plan = withTotals(candidate)
        else errors.push(`attempt ${attempt}: failed validation`)
      } catch (e) {
        errors.push(`attempt ${attempt}: ${(e as Error).message}`.slice(0, 300))
      }
    }
    if (!plan) {
      console.error('generate-meal-plan failed:', errors.join(' | '))
      return json({ error: "Couldn't build your meal plan right now. Try again in a minute." }, 502)
    }
    plan.targets = { calories: read.input.calories, protein: read.input.protein }

    const { data: saved, error: saveError } = await supabase.from('meal_plans')
      .upsert({ user_id: user.id, plan, prefs: read.input, created_at: new Date().toISOString() }, { onConflict: 'user_id' })
      .select().single()
    if (saveError) throw new Error(`Save failed: ${saveError.message}`)
    return json({ plan: saved })
  } catch (e) {
    console.error('generate-meal-plan error:', (e as Error).message)
    return json({ error: (e as Error).message }, 500)
  }
})
