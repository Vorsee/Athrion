import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  try {
    const { base64, mediaType } = await req.json()

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
    return new Response(JSON.stringify(data), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }
})
