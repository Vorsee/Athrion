// Static security checks over the repo: database policies, Edge Function auth, secrets.
// These run against the files in git; the live database was checked separately.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = join(__dirname, '../..')
const read = p => readFileSync(join(ROOT, p), 'utf8')
const sqlFiles = ['supabase_schema.sql', ...readdirSync(join(ROOT, 'supabase')).filter(f => f.endsWith('.sql')).map(f => `supabase/${f}`)]
const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)

describe('database policies (SQL migrations)', () => {
  it('enables row level security on every table it creates', () => {
    for (const f of sqlFiles) {
      const sql = read(f)
      const tables = [...sql.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)/gi)].map(m => m[1])
      for (const t of tables) expect(sql, `${f}: ${t}`).toMatch(new RegExp(`alter table (?:public\\.)?${t}\\s+enable row level security|'${t}'`, 'i'))
    }
  })

  it('every policy on user data is scoped to auth.uid() or a membership check', () => {
    for (const f of sqlFiles) {
      for (const m of read(f).matchAll(/create policy[\s\S]*?;/gi)) {
        expect(m[0], `${f}: ${m[0].slice(0, 80)}`).toMatch(/auth\.uid\(\)|is_group_participant|team_members/i)
      }
    }
  })

  describe('known bugs', () => {
    // In "WHERE gp.session_id = session_id" the bare session_id resolves to gp.session_id,
    // so the condition is always true: anyone in any group can read every group's sets.
    // The live database has this exact policy on group_sets.
    it.fails('BUG: no policy compares a column with itself', () => {
      for (const f of sqlFiles) {
        const sql = read(f)
        expect(sql, f).not.toMatch(/\b(\w+)\.(\w+)\s*=\s*\2\b(?!\s*\.)/)
      }
    })
  })
})

describe('Edge Functions', () => {
  const fns = readdirSync(join(ROOT, 'supabase/functions'))
  it('the plan function verifies the signed-in user and rate-limits', () => {
    const src = read('supabase/functions/generate-fitness-plan/index.ts')
    expect(src).toMatch(/auth\.getUser\(\)/)
    expect(src).toMatch(/status: 429/)
  })
  it('the reminder function requires the cron secret', () => {
    expect(read('supabase/functions/send-reminders/index.ts')).toMatch(/x-cron-secret/)
  })

  describe('known bugs (security)', () => {
    // analyze-meal forwards any image to Anthropic for anyone holding the public anon key
    // (shipped in the web bundle). Verified live: it answers a request made with only that key.
    it.fails('BUG: every function that calls Anthropic checks who is calling', () => {
      for (const f of fns) {
        const src = read(`supabase/functions/${f}/index.ts`)
        if (/anthropic/i.test(src)) expect(src, f).toMatch(/auth\.getUser\(|x-cron-secret/)
      }
    })
  })
})

describe('secrets and repo hygiene', () => {
  it('no tracked file contains a live-looking secret', () => {
    const patterns = [/sk_live_[0-9a-zA-Z]{10,}/, /sk_test_[0-9a-zA-Z]{20,}/, /whsec_[0-9a-zA-Z]{20,}/, /sk-ant-api\d\d-[\w-]{20,}/, /"role"\s*:\s*"service_role"/, /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJ[\w-]*c2VydmljZV9yb2xl/]
    for (const f of tracked) {
      if (/\.(png|jpg|ico|webp|jar|keystore)$|package-lock\.json$|^(android|ios)\//.test(f)) continue
      let text; try { text = read(f) } catch { continue }
      for (const p of patterns) expect(text, `${f} matches ${p}`).not.toMatch(p)
    }
  })
  it('.env files are ignored', () => {
    const ignore = read('.gitignore')
    expect(ignore).toMatch(/^\.env$/m)
    expect(ignore).toMatch(/^\.env\.local$/m)
    expect(tracked.some(f => /^\.env(\.local)?$/.test(f))).toBe(false)
  })

  describe('known issues', () => {
    // The GitHub repo is public. These expose project IDs, the database host, local paths
    // and an old copy of the source; none are secrets, but they don't belong in a public repo.
    it.fails('BUG: local tool folders and the old bin/ copy are not committed', () => {
      expect(tracked.filter(f => /^(\.vercel|\.claude|supabase\/\.temp|bin)\/|\.DS_Store$/.test(f))).toEqual([])
    })
  })
})
