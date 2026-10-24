import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import Anthropic from "npm:@anthropic-ai/sdk@1"
import { SYSTEM_PROMPT, buildUserMessage, isValidPlan, applyNutritionTargets, makeFallbackPlan, gatherProgress } from "./plan.ts"

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const AI_MODEL = Deno.env.get('AI_MODEL') ?? 'claude-opus-5-5'

// ── Claude API call ───────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

async function generateWithClaude(fp: any, nt: any, progress: any): Promise<any> {
  // Streaming keeps the long JSON response from hitting HTTP timeouts.
  // PLAN_SCHEMA is too large for output_config.format, so it goes in the prompt
  // and the result is checked by isValidPlan instead.
  const stream = anthropic.beta.messages.stream({
    model: AI_MODEL,
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(fp, nt, progress) }],
  } as any)
  const message = await stream.finalMessage()

  if (message.stop_reason === 'refusal') throw new Error('Claude declined the request')
  if (message.stop_reason === 'max_tokens') throw new Error('Claude response was truncated')

  const text = message.content.find((b: any) => b.type === 'text')?.text ?? ''
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('Claude response contained no JSON')
  return JSON.parse(text.slice(start, end + 1))
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors })
    }

    let body: any
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: cors })
    }

    const { fitnessProfile, nutritionTargets, mode } = body
    if (!fitnessProfile || !nutritionTargets) {
      return new Response(JSON.stringify({ error: 'Missing fitnessProfile or nutritionTargets' }), { status: 400, headers: cors })
    }

    // Authenticate using the user's JWT
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: cors })
    }

    // Plans are a Pro feature; check the server-side subscription, not the app's say-so
    const { data: sub } = await supabase.from('subscriptions').select('status').eq('user_id', user.id).maybeSingle()
    if (sub?.status !== 'pro') {
      return new Response(JSON.stringify({ error: 'Training plans are a Pro feature.' }), { status: 403, headers: cors })
    }

    // Rate limit: one generation per user per minute. The conditional update is atomic,
    // so parallel requests can't all pass the check before any of them saves a plan.
    const cutoff = new Date(Date.now() - 60_000).toISOString()
    const { data: claimed, error: claimError } = await supabase
      .from('fitness_profiles')
      .update({ plan_requested_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .or(`plan_requested_at.is.null,plan_requested_at.lt.${cutoff}`)
      .select('user_id')
    if (claimError) throw new Error(`Rate limit check failed: ${claimError.message}`)
    if (!claimed?.length) {
      // No row claimed: either generating too often, or there's no profile row yet
      const { data: profileRow } = await supabase.from('fitness_profiles').select('user_id').eq('user_id', user.id).maybeSingle()
      if (profileRow) {
        return new Response(JSON.stringify({ error: 'Please wait before generating another plan.' }), { status: 429, headers: cors })
      }
    }

    const { data: currentPlan } = await supabase
      .from('fitness_plans')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const adapting = mode === 'adapt' && !!currentPlan
    const progress = adapting ? await gatherProgress(supabase, currentPlan) : null
    const week = adapting ? (currentPlan.plan_data?.week ?? 1) + 1 : 1

    let plan: any = null
    let usedFallback = false
    const errors: string[] = []

    for (let attempt = 1; attempt <= 2 && !plan; attempt++) {
      try {
        const candidate = await generateWithClaude(fitnessProfile, nutritionTargets, progress)
        if (isValidPlan(candidate)) plan = applyNutritionTargets(candidate, nutritionTargets)
        else errors.push(`attempt ${attempt}: plan failed validation`)
      } catch (e) {
        errors.push(`attempt ${attempt}: ${(e as Error).message}`.slice(0, 500))
      }
    }

    if (!plan) {
      console.error('Claude generation failed:', errors.join(' | '))
      plan = makeFallbackPlan(fitnessProfile, nutritionTargets)
      plan.generationErrors = errors
      plan.adaptation = {
        summary: adapting ? 'Your coach could not adapt the plan this week, so this is a fresh standard plan.' : 'Your starting plan.',
        changes: [],
      }
      usedFallback = true
      console.warn('Using deterministic fallback plan for user:', user.id)
    }

    plan.week = week

    // Archive existing active plans
    await supabase
      .from('fitness_plans')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('status', 'active')

    // Save new plan
    const { data: savedPlan, error: saveError } = await supabase
      .from('fitness_plans')
      .insert({
        user_id: user.id,
        name: plan.summary.planName,
        primary_goal: fitnessProfile.primaryGoal,
        status: 'active',
        duration_weeks: plan.summary.durationWeeks,
        training_days_per_week: fitnessProfile.workoutDaysPerWeek ?? 3,
        ai_model: usedFallback ? 'fallback_v2' : AI_MODEL,
        prompt_version: Number(Deno.env.get('FITNESS_PROMPT_VERSION') ?? 2),
        generation_status: 'completed',
        plan_data: plan,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (saveError) throw new Error(`Save failed: ${saveError.message}`)

    return new Response(JSON.stringify({ plan: savedPlan }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('generate-fitness-plan error:', (e as Error).message)
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
